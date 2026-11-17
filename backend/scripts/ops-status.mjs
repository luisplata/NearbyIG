#!/usr/bin/env node
/**
 * ops:status — la demo en una pantalla.
 *
 *   npm run ops:status
 *
 * Qué mira, en orden:
 *
 *   1. contenedores   `docker ps`: api, db y dozzle (estado + health).
 *   2. salud          `GET /health` y `GET /health/ready` con latencia real.
 *   3. datos          `docker compose exec -T db psql`: regiones, zonas,
 *                     perfiles, sesiones/presencias vivas, bots, pings
 *                     pendientes, matches y mensajes.
 *   4. errores        últimas 20 líneas con error|warn|exception del log de la
 *                     API (o "sin errores").
 *   5. túnel          si hay un `cloudflared` corriendo y, si aparece en un log,
 *                     la URL trycloudflare.
 *
 * Sale 0 si todo está verde y 1 si algo está caído: health distinto de 200,
 * contenedor esperado ausente o contenedor con healthcheck no-healthy. Sirve
 * igual para mirar a ojo que para un gate de CI.
 *
 * Sin dependencias: `node:child_process`, `node:fs` y `fetch` nativo. Todos los
 * comandos externos tienen timeout (10 s) para que el resumen no se cuelgue si
 * el daemon de Docker está pensando. Nada de `grep`, `rm` ni rutas Unix
 * hardcodeadas: funciona en Windows (Git Bash/PowerShell) y en Linux/macOS.
 *
 * Variables opcionales:
 *
 *   API_BASE_URL      default http://localhost:3000
 *   DOZZLE_PORT       default 9999 (sólo se informa el puerto en el resumen)
 *   CLOUDFLARED_LOG   ruta a un log de cloudflared para extraer la URL
 */

import { spawn } from 'node:child_process';
import { closeSync, existsSync, openSync, readSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BACKEND_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = resolve(BACKEND_DIR, '..');
const API_BASE = (process.env.API_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const COMMAND_TIMEOUT_MS = 10_000;
const HEALTH_TIMEOUT_MS = 5_000;
const DOZZLE_PORT = process.env.DOZZLE_PORT ?? '9999';

const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const paint = (code) => (text) => (useColor ? `\x1b[${code}m${text}\x1b[0m` : text);
const green = paint('32');
const red = paint('31');
const yellow = paint('33');
const dim = paint('2');
const bold = paint('1');

const problems = [];

/** Corre un comando sin shell, con timeout. Nunca rechaza: devuelve el resultado. */
function run(command, args, { cwd = BACKEND_DIR } = {}) {
  return new Promise((resolvePromise) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;

    let child;
    try {
      child = spawn(command, args, { cwd, windowsHide: true, shell: false });
    } catch (error) {
      resolvePromise({ ok: false, code: null, stdout, stderr: String(error), timedOut: false });
      return;
    }

    const finish = (code, spawnError) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise({
        ok: !timedOut && !spawnError && code === 0,
        code,
        stdout,
        stderr: spawnError ? `${stderr}${spawnError.message}` : stderr,
        timedOut,
      });
    };

    // El timer mata el proceso: un `docker` colgado no puede colgar el resumen.
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, COMMAND_TIMEOUT_MS);
    timer.unref?.();

    child.stdout?.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => finish(null, error));
    child.on('close', (code) => finish(code, null));
  });
}

/** Quita secuencias ANSI: los logs de Nest en dev vienen con color. */
function stripAnsi(text) {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '');
}

/** Archivos de compose que existen, en el orden en que se combinan. */
function composeFiles() {
  const files = ['compose.yml', 'compose.dev.yml', 'compose.ops.yml']
    .map((name) => join(BACKEND_DIR, name))
    .filter((path) => existsSync(path));
  return files.flatMap((path) => ['-f', path]);
}

const compose = (args) => run('docker', ['compose', ...composeFiles(), ...args]);

/** Cuenta filas de la base sin depender de psql en el host. */
async function readCounts() {
  const sql = [
    "SELECT 'regiones', count(*)::text FROM regions",
    "UNION ALL SELECT 'zonas', count(*)::text FROM zones",
    "UNION ALL SELECT 'perfiles', count(*)::text FROM profiles",
    "UNION ALL SELECT 'sesiones vivas', count(*)::text FROM sessions WHERE revoked_at IS NULL AND expires_at > now()",
    "UNION ALL SELECT 'presencias vivas', count(*)::text FROM presence WHERE expires_at > now()",
    "UNION ALL SELECT 'bots', count(*)::text FROM bots",
    "UNION ALL SELECT 'pings pendientes', count(*)::text FROM pings WHERE status = 'pending'",
    "UNION ALL SELECT 'matches', count(*)::text FROM matches",
    "UNION ALL SELECT 'mensajes', count(*)::text FROM messages",
  ].join(' ');

  // `sh -c` dentro del contenedor: usa POSTGRES_USER/POSTGRES_DB del servicio db
  // (las mismas variables con las que se inicializó) y evita parsear el .env.
  const result = await compose([
    'exec',
    '-T',
    'db',
    'sh',
    '-c',
    'psql -t -A -F "|" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "$1"',
    'sh',
    sql,
  ]);

  if (!result.ok) {
    return { ok: false, error: firstLine(result) };
  }

  const counts = new Map();
  for (const line of result.stdout.split(/\r?\n/)) {
    const [label, value] = line.split('|');
    if (!label || value === undefined) continue;
    counts.set(label.trim(), value.trim());
  }
  return { ok: counts.size > 0, counts };
}

function firstLine(result) {
  const text = (result.timedOut ? 'timeout' : result.stderr || result.stdout || '').trim();
  return text.split(/\r?\n/).find(Boolean) ?? 'sin detalle';
}

async function probe(path) {
  const startedAt = performance.now();
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    const latency = Math.round(performance.now() - startedAt);
    let body = null;
    try {
      body = await response.json();
    } catch {
      // Un health que no es JSON ya es una señal; no hace falta el texto.
    }
    return { status: response.status, latency, body };
  } catch (error) {
    return {
      status: null,
      latency: Math.round(performance.now() - startedAt),
      error: error?.name === 'TimeoutError' ? 'timeout' : 'sin respuesta',
    };
  }
}

function parseContainerStatus(status) {
  const lower = status.toLowerCase();
  const up = lower.startsWith('up');
  let health = 'none';
  if (lower.includes('(unhealthy)')) health = 'unhealthy';
  else if (lower.includes('(health: starting)')) health = 'starting';
  else if (lower.includes('(healthy)')) health = 'healthy';
  return { up, health };
}

function readTail(file, maxBytes = 128 * 1024) {
  const size = statSync(file).size;
  const start = Math.max(0, size - maxBytes);
  const length = size - start;
  const buffer = Buffer.alloc(length);
  const fd = openSync(file, 'r');
  try {
    readSync(fd, buffer, 0, length, start);
  } finally {
    closeSync(fd);
  }
  return buffer.toString('utf8');
}

function findTunnelUrl(text) {
  const matches = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/gi) ?? [];
  return matches.at(-1) ?? null;
}

async function detectTunnel(runningContainers) {
  const evidence = [];

  if (process.platform === 'win32') {
    const list = await run('tasklist', ['/FI', 'IMAGENAME eq cloudflared.exe', '/NH']);
    if (list.ok && /cloudflared\.exe/i.test(list.stdout)) evidence.push('proceso cloudflared.exe');
  } else {
    const list = await run('ps', ['-A', '-o', 'comm=,args=']);
    if (list.ok && /cloudflared/i.test(list.stdout)) evidence.push('proceso cloudflared');
  }

  const tunnelContainer = runningContainers.find((name) => name.toLowerCase().includes('cloudflared'));
  if (tunnelContainer) evidence.push(`contenedor ${tunnelContainer}`);

  let logText = '';
  if (tunnelContainer) {
    const logs = await run('docker', ['logs', '--tail', '200', tunnelContainer]);
    if (logs.ok) logText += logs.stdout + logs.stderr;
  }

  const candidates = [
    process.env.CLOUDFLARED_LOG,
    join(REPO_ROOT, 'cloudflared.log'),
    join(BACKEND_DIR, 'cloudflared.log'),
    join(REPO_ROOT, 'docs', 'cloudflared.log'),
    join(tmpdir(), 'cloudflared.log'),
  ].filter(Boolean);

  for (const file of candidates) {
    try {
      if (!existsSync(file)) continue;
      logText += readTail(file);
    } catch {
      // Un log ilegible no invalida la detección del proceso.
    }
  }

  return { detected: evidence.length > 0, evidence, url: findTunnelUrl(logText) };
}

function tag(ok, text) {
  return ok ? green(text) : red(text);
}

function section(title) {
  console.log(`\n${bold(title)}`);
}

async function main() {
  console.log(`${bold('NearbyIG · ops status')} ${dim(new Date().toISOString())}`);
  console.log(dim(`API ${API_BASE} · Dozzle http://localhost:${DOZZLE_PORT}`));

  // ── Contenedores ────────────────────────────────────────────────────────
  section('Contenedores');

  const ps = await run('docker', ['ps', '--format', '{{.Names}}\t{{.Status}}']);
  if (!ps.ok) {
    problems.push(`docker ps: ${firstLine(ps)}`);
    console.log(`  ${tag(false, 'FALLÓ')} docker ps — ${firstLine(ps)}`);
  }

  const containers = new Map();
  for (const line of ps.stdout.split(/\r?\n/)) {
    const [name, ...rest] = line.split('\t');
    if (name) containers.set(name.trim(), rest.join('\t').trim());
  }

  const expected = [
    {
      label: 'api',
      expectedName: 'nearbyig-api-1',
      match: (name) => /(^|-)api-1$/.test(name),
      needsHealthy: true,
    },
    {
      label: 'db',
      expectedName: 'nearbyig-db-1',
      match: (name) => /(^|-)db-1$/.test(name),
      needsHealthy: true,
    },
    {
      label: 'dozzle',
      expectedName: 'nearbyig-dozzle-1',
      match: (name) => name.toLowerCase().includes('dozzle'),
      needsHealthy: false,
    },
  ];

  for (const { label, expectedName, match, needsHealthy } of expected) {
    // El nombre exacto del proyecto manda: si hay otro `*-api-1` en la máquina,
    // no queremos resumir el contenedor equivocado.
    const names = [...containers.keys()];
    const name = names.includes(expectedName) ? expectedName : names.find(match);
    if (!name) {
      problems.push(`${label} no está corriendo`);
      console.log(`  ${tag(false, 'FALTA')} ${expectedName.padEnd(24)} ${red('no está corriendo')}`);
      continue;
    }
    const status = containers.get(name);
    const { up, health } = parseContainerStatus(status);
    const healthy = up && (needsHealthy ? health === 'healthy' : true);
    if (!healthy) problems.push(`${name} ${up ? health : 'detenido'}`);
    const detail = health === 'none' ? (up ? 'sin healthcheck' : status) : status;
    console.log(`  ${tag(healthy, healthy ? ' OK  ' : 'FALLÓ')} ${name.padEnd(24)} ${detail}`);
  }

  // ── Salud ───────────────────────────────────────────────────────────────
  section('Salud');

  const liveness = await probe('/health');
  const readiness = await probe('/health/ready');

  const renderProbe = (path, probeResult) => {
    const ok = probeResult.status === 200;
    if (!ok) problems.push(`${path} ${probeResult.status ?? probeResult.error}`);
    const label = probeResult.status === null ? (probeResult.error ?? 'sin respuesta') : String(probeResult.status);
    let extra = '';
    const db = probeResult.body?.checks?.db;
    if (db) {
      const latency = db.latencyMs === null ? '' : ` (${Math.round(db.latencyMs)} ms)`;
      extra = dim(` · db ${db.status}${latency}`);
    }
    console.log(`  ${tag(ok, ok ? ' OK  ' : 'FALLÓ')} ${path.padEnd(18)} ${label.padEnd(4)} ${String(probeResult.latency).padStart(4)} ms${extra}`);
  };

  renderProbe('/health', liveness);
  renderProbe('/health/ready', readiness);

  // ── Datos ───────────────────────────────────────────────────────────────
  section('Datos');

  const counts = await readCounts();
  if (!counts.ok) {
    console.log(`  ${yellow('sin datos')} ${dim(counts.error)}`);
  } else {
    const get = (key) => counts.counts.get(key) ?? '?';
    console.log(
      `  regiones ${get('regiones')} · zonas ${get('zonas')} · perfiles ${get('perfiles')}`,
    );
    console.log(
      `  sesiones vivas ${get('sesiones vivas')} · presencias vivas ${get('presencias vivas')} · bots ${get('bots')}`,
    );
    console.log(
      `  pings pendientes ${get('pings pendientes')} · matches ${get('matches')} · mensajes ${get('mensajes')}`,
    );
  }

  // ── Errores recientes ───────────────────────────────────────────────────
  section('Errores recientes (API)');

  const apiLogs = await compose(['logs', '--no-color', '--tail', '200', 'api']);
  if (!apiLogs.ok) {
    console.log(`  ${dim(`sin log de la API: ${firstLine(apiLogs)}`)}`);
  } else {
    const noisy = stripAnsi(apiLogs.stdout + apiLogs.stderr)
      .split(/\r?\n/)
      .map((line) => line.trim())
      // `tsc -w` imprime "Found 0 errors" en cada rebuild: no es un error, es
      // el resumen del compilador. Un "Found 3 errors." sí entra (y además
      // entran sus líneas de detalle).
      .filter((line) => !/\bFound 0 errors?\b/.test(line))
      .filter((line) => /\b(error|warn|exception)/i.test(line));
    if (noisy.length === 0) {
      console.log(`  ${green('sin errores')} ${dim('(últimas 200 líneas del log)')}`);
    } else {
      for (const line of noisy.slice(-20)) {
        const clipped = line.length > 220 ? `${line.slice(0, 217)}...` : line;
        console.log(`  ${yellow('·')} ${clipped}`);
      }
      console.log(dim(`  ${noisy.length} línea(s) con error|warn|exception en las últimas 200`));
    }
  }

  // ── Túnel ───────────────────────────────────────────────────────────────
  section('Túnel');

  const tunnel = await detectTunnel([...containers.keys()]);
  if (!tunnel.detected) {
    console.log(`  ${dim('cloudflared no detectado — la demo corre sin túnel')}`);
  } else {
    console.log(`  ${green(' OK ')} cloudflared corriendo ${dim(`(${tunnel.evidence.join(', ')})`)}`);
    if (tunnel.url) {
      console.log(`       ${tunnel.url}`);
    } else {
      console.log(`       ${dim('sin URL trycloudflare en los logs (pasá --logfile o CLOUDFLARED_LOG)')}`);
    }
  }

  // ── Resultado ───────────────────────────────────────────────────────────
  console.log('');
  if (problems.length === 0) {
    console.log(green('Resultado: OK — todo verde.'));
    process.exitCode = 0;
  } else {
    console.log(red(`Resultado: FALLÓ — ${problems.length} problema(s).`));
    for (const problem of problems) console.log(red(`  · ${problem}`));
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(red(`ops:status falló: ${error?.stack ?? error}`));
  process.exitCode = 1;
});
