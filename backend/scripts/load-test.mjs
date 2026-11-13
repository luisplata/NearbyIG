#!/usr/bin/env node
/**
 * Load test de la demo — 10 humanos + 20 bots por región, sin dependencias.
 *
 *   node scripts/load-test.mjs                         # 10 humanos/región, 60 s
 *   node scripts/load-test.mjs --humans=2 --duration=20 # versión reducida
 *   node scripts/load-test.mjs --regions=mx --pings=0   # sólo lectura
 *
 * Qué carga genera, por humano:
 *
 *   * `PUT /presence` cada 2,5 s (el intervalo del cliente, PR-6);
 *   * `GET /discovery` cada 3 s (lo que mira una pestaña abierta);
 *   * un `GET /events` con ticket al empezar, leído hasta el final;
 *   * un ping a su bot y dos mensajes al match, una sola vez (calentamiento).
 *
 * Los **bots no los crea el script**: el servidor siembra 2 por humano vivo
 * (`BotsService`), así que con 10 humanos por región la densidad es la del plan
 * (10 humanos + 20 bots). El reporte cuenta cuántos bots vio cada observador.
 *
 * Mide latencia de pared (incluye red local) por endpoint y reporta p50/p95/p99,
 * status y errores. Un `5xx` o una tasa de error por encima del umbral hace que
 * el proceso salga con código 1: sirve para un gate manual, no sólo para mirar.
 *
 * No hay `npm install` ni cliente HTTP nuevo: `fetch` y `node:perf_hooks`.
 * Corre contra `API_BASE_URL` (default `http://localhost:3000`).
 */

const BASE = (process.env.API_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

function parseArgs(argv) {
  const options = {
    humans: 10,
    regions: ['mx', 'co'],
    durationSeconds: 60,
    presenceMs: 2_500,
    discoveryMs: 3_000,
    pings: 1,
    messages: 2,
    errorBudget: 0.02,
    warmupMs: 3_500,
  };
  for (const arg of argv.slice(2)) {
    const [flag, raw] = arg.replace(/^--/, '').split('=');
    if (flag === 'humans') options.humans = Number(raw);
    else if (flag === 'regions') options.regions = raw.split(',').filter(Boolean);
    else if (flag === 'duration') options.durationSeconds = Number(raw);
    else if (flag === 'presence-ms') options.presenceMs = Number(raw);
    else if (flag === 'discovery-ms') options.discoveryMs = Number(raw);
    else if (flag === 'pings') options.pings = Number(raw);
    else if (flag === 'messages') options.messages = Number(raw);
    else if (flag === 'error-budget') options.errorBudget = Number(raw);
    else if (flag === 'help' || flag === 'h') {
      console.log('uso: node scripts/load-test.mjs [--humans=10] [--regions=mx,co] [--duration=60]');
      process.exit(0);
    } else {
      console.error(`flag desconocida: --${flag}`);
      process.exit(2);
    }
  }
  return options;
}

const options = parseArgs(process.argv);
const latencies = new Map();
const statuses = new Map();
const errors = [];
const botsSeen = new Set();
let streamEvents = 0;
let streamConnections = 0;
const streamsOpened = [];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function record(name, ms, status) {
  if (!latencies.has(name)) latencies.set(name, []);
  latencies.get(name).push(ms);
  const key = `${name} ${status}`;
  statuses.set(key, (statuses.get(key) ?? 0) + 1);
}

function noteError(sample) {
  if (errors.length < 25) errors.push(sample);
}

async function request(name, path, { method = 'GET', token, body } = {}) {
  const started = performance.now();
  try {
    const headers = {};
    if (token !== undefined) headers.authorization = `Bearer ${token}`;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const response = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let parsed = null;
    try {
      parsed = text === '' ? null : JSON.parse(text);
    } catch {
      parsed = text;
    }
    record(name, performance.now() - started, response.status);
    if (response.status >= 400) {
      noteError({
        name,
        path,
        status: response.status,
        code: parsed?.code ?? null,
        at: new Date().toISOString(),
      });
    }
    return { status: response.status, body: parsed };
  } catch (error) {
    record(name, performance.now() - started, 'ERR');
    noteError({ name, path, status: 'ERR', code: String(error), at: new Date().toISOString() });
    return { status: 0, body: null };
  }
}

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

const round = (value) => Math.round(value * 10) / 10;

/** Loops con `await` y sin solaparse: la latencia no se mide con 4 en vuelo. */
function startLoop(everyMs, task) {
  let stopped = false;
  const run = async () => {
    while (!stopped) {
      await task();
      if (stopped) return;
      await sleep(everyMs);
    }
  };
  void run();
  return () => {
    stopped = true;
  };
}

/** Un humano de la demo: sesión, presencia, discovery y stream. */
async function startHuman(regionKey, index) {
  const session = await request('session', '/auth/demo-session', {
    method: 'POST',
    body: { regionKey },
  });
  if (session.status !== 201 && session.status !== 200) return null;

  const { token, profileId, demoSlot } = session.body;
  const human = { regionKey, index, token, profileId, demoSlot, stop: [] };

  const presenceBody = { demoZoneKey: regionKey === 'mx' ? 'cdmx' : 'bogota' };
  human.stop.push(
    startLoop(options.presenceMs, () => request('presence', '/presence', { method: 'PUT', token, body: presenceBody })),
  );
  human.stop.push(
    startLoop(options.discoveryMs, async () => {
      const response = await request('discovery', '/discovery?radiusM=5000', { token });
      for (const row of response.body?.results ?? []) {
        if (row.profileId.endsWith('-b1') || row.profileId.endsWith('-b2')) botsSeen.add(row.profileId);
      }
    }),
  );

  // Stream SSE: ticket de un uso y lectura hasta que el test termina.
  void (async () => {
    const ticket = await request('ticket', '/auth/stream-ticket', { method: 'POST', token });
    if (ticket.status !== 201) return;
    const controller = new AbortController();
    streamsOpened.push(controller);
    const started = performance.now();
    try {
      const response = await fetch(`${BASE}/events?ticket=${encodeURIComponent(ticket.body.ticket)}`, {
        headers: { accept: 'text/event-stream' },
        signal: controller.signal,
      });
      record('stream', performance.now() - started, response.status);
      if (response.status !== 200 || response.body === null) return;
      streamConnections += 1;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // Cada evento termina en una línea `data: {...}`; los keepalive empiezan con `:`.
        const matches = buffer.match(/^data: /gm);
        if (matches !== null) {
          streamEvents += matches.length;
          buffer = buffer.slice(buffer.lastIndexOf('data: '));
        }
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      noteError({ name: 'stream', path: '/events', status: 'ERR', code: String(error), at: new Date().toISOString() });
    }
  })();

  return human;
}

/** Ping al bot propio + mensajes del calentamiento, midiendo cada request. */
async function warmUpChat(human) {
  if (options.pings <= 0) return;
  const target = `${human.profileId}-b1`;

  // El bot existe recién cuando el ticker lo sembró (≤ 2 s). Un 404 acá no es
  // un error del sistema: se reintenta sin contarlo como fallo de la API.
  let ping = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const response = await request('ping', '/pings', {
      method: 'POST',
      token: human.token,
      body: { targetProfileId: target },
    });
    if (response.status === 201) {
      ping = response.body;
      break;
    }
    if (response.status === 404 || response.status === 409) {
      await sleep(500);
      continue;
    }
    return;
  }
  if (ping?.matchId === undefined || ping?.matchId === null) return;

  for (let index = 0; index < options.messages; index += 1) {
    await request('message', `/matches/${ping.matchId}/messages`, {
      method: 'POST',
      token: human.token,
      body: { clientMessageId: `load-${human.profileId}-${index}`, body: `carga ${index}` },
    });
  }
}

async function main() {
  console.log(`[load] ${BASE} · ${options.humans} humanos/región (${options.regions.join(', ')}) · ${options.durationSeconds}s`);
  const health = await request('health', '/health/ready');
  if (health.status !== 200) {
    console.error(`[load] /health/ready respondió ${health.status}: no hay demo para cargar`);
    process.exit(1);
  }

  const humans = [];
  for (const regionKey of options.regions) {
    for (let index = 0; index < options.humans; index += 1) {
      const human = await startHuman(regionKey, index);
      if (human !== null) humans.push(human);
    }
  }
  if (humans.length === 0) {
    console.error('[load] no se pudo abrir ninguna sesión (¿slots ocupados sin reset?)');
    process.exit(1);
  }
  console.log(`[load] sesiones abiertas: ${humans.length}`);

  // Presencia primero para que el ticker siembre los bots; después el chat.
  await sleep(options.warmupMs);
  await Promise.all(humans.map((human) => warmUpChat(human)));

  const startedAt = performance.now();
  await sleep(options.durationSeconds * 1_000);
  const elapsedSeconds = (performance.now() - startedAt) / 1_000;

  for (const human of humans) for (const stop of human.stop) stop();
  for (const controller of streamsOpened) controller.abort();
  await sleep(250);

  const rows = [...latencies.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const totalRequests = rows.reduce((sum, [, values]) => sum + values.length, 0);
  const totalErrors = [...statuses.entries()]
    .filter(([key]) => !key.endsWith(' 2') && !key.endsWith(' 201') && !key.endsWith(' 200') && !key.endsWith(' 204'))
    .reduce((sum, [, count]) => sum + count, 0);
  const serverErrors = [...statuses.entries()]
    .filter(([key]) => / 5\d\d$/.test(key) || key.endsWith(' ERR'))
    .reduce((sum, [, count]) => sum + count, 0);

  console.log('\n## Resultado\n');
  console.log(`Duración medida: ${elapsedSeconds.toFixed(1)} s · humanos: ${humans.length} · bots vistos: ${botsSeen.size} únicos`);
  console.log(`Streams: ${streamConnections} conectados · ${streamEvents} eventos recibidos`);
  console.log(`Requests: ${totalRequests} · no-2xx: ${totalErrors} · 5xx/red: ${serverErrors} · ~${(totalRequests / elapsedSeconds).toFixed(1)} req/s\n`);

  console.log('| Endpoint | n | p50 ms | p95 ms | p99 ms | máx ms |');
  console.log('|---|---:|---:|---:|---:|---:|');
  for (const [name, values] of rows) {
    console.log(
      `| ${name} | ${values.length} | ${round(percentile(values, 50))} | ${round(percentile(values, 95))} | ${round(percentile(values, 99))} | ${round(Math.max(...values))} |`,
    );
  }

  console.log('\nStatus:');
  for (const [key, count] of [...statuses.entries()].sort()) console.log(`- ${key}: ${count}`);

  if (errors.length > 0) {
    console.log('\nPrimeros errores:');
    for (const error of errors) console.log(`- ${JSON.stringify(error)}`);
  }

  const errorRate = totalRequests === 0 ? 1 : totalErrors / totalRequests;
  const budgetOk = errorRate <= options.errorBudget && serverErrors === 0;
  console.log(
    `\nVeredicto: ${budgetOk ? 'PASS' : 'FAIL'} (no-2xx ${(errorRate * 100).toFixed(2)}%, presupuesto ${(options.errorBudget * 100).toFixed(0)}%, 5xx/red ${serverErrors})`,
  );
  process.exit(budgetOk ? 0 : 1);
}

main().catch((error) => {
  console.error('[load] falló', error);
  process.exit(1);
});
