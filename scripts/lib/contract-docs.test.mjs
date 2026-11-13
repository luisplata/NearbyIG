import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';

import { canonicalContractId, loadSpec } from '../../contract/scripts/lib/spec.mjs';

/**
 * El contrato se publica en `/contract/` como **un único HTML autocontenido**.
 *
 * Dos niveles de prueba:
 *  - el generador real (`npm run contract:docs`) produce ese HTML con el
 *    contrato vigente adentro y sin telemetría;
 *  - el ensamblado lo audita y **cierra**: si falta el contrato cuando el
 *    artefacto es el de publicación (`--strict`), si el doc carga un subrecurso,
 *    si publica otro contrato o si trae hermanos, exit 1.
 *
 * Los fixtures se arman en un directorio temporal dentro del repo porque el
 * ensamblado sólo acepta rutas de salida adentro del workspace.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ASSEMBLE = join(ROOT, 'scripts', 'assemble-site.mjs');
const GENERATOR = join(ROOT, 'scripts', 'build-contract-docs.mjs');

const TMP = mkdtempSync(join(ROOT, '.tmp-contract-docs-'));
after(() => rmSync(TMP, { recursive: true, force: true }));

const CONTRACT_ID = canonicalContractId(loadSpec().spec);

/** Generación real, una sola vez: es la que corre en CI y en local. */
const DOCS_DIR = join(TMP, 'docs');
const generation = spawnSync(process.execPath, [GENERATOR, DOCS_DIR], { cwd: ROOT, encoding: 'utf8' });
const GENERATED = join(DOCS_DIR, 'index.html');

/** Reglas que `assemble-site` aplica al doc publicado (mismas, a propósito). */
const SUBRESOURCES = [
  /<(?:script|link|img|iframe|source|embed|object|video|audio|track)\b[^>]*?\b(?:src|href|srcset)\s*=/i,
  /url\(\s*["']?https?:/i,
  /@import\s+(?:url\()?["']?https?:/i,
];

let counter = 0;

/** Sitio mínimo pero completo: las tres demos y el doc del contrato. */
function buildSite({ contract = contractDoc() } = {}) {
  counter += 1;
  const dir = join(TMP, `site-${counter}`);
  cpSync(join(ROOT, 'demo', 'landing'), dir, { recursive: true });

  mkdirSync(join(dir, 'flutter'), { recursive: true });
  writeFileSync(
    join(dir, 'flutter', 'index.html'),
    '<!doctype html><html><head><base href="/flutter/"></head><body></body></html>',
  );

  mkdirSync(join(dir, 'expo', '_expo', 'static', 'js', 'web'), { recursive: true });
  writeFileSync(
    join(dir, 'expo', 'index.html'),
    '<!doctype html><html lang="es"><head></head><body><noscript>Esta demo necesita JavaScript</noscript></body></html>',
  );
  writeFileSync(join(dir, 'expo', 'maplibre-gl-worker.js'), '// worker de MapLibre\n');
  writeFileSync(
    join(dir, 'expo', '_expo', 'static', 'js', 'web', 'maplibre-gl-abc123.js'),
    'fetch("https://tiles.openfreemap.org/planet/tiles.json");\n',
  );

  if (contract !== null) writeContractDoc(dir, contract);
  return dir;
}

/** Doc del contrato con las marcas que el ensamblado exige, listo para romper. */
function contractDoc({
  disableTelemetry = 'true',
  contractId = CONTRACT_ID,
  body = '',
} = {}) {
  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf8" /><title>NearbyIG API</title></head>
  <body>
    <div id="redoc">${body}</div>
    <script type="module">
      const __redoc_options = {"router":"hash","skipBundle":true,"disableTelemetry":${disableTelemetry}};
      // x-contract-id ${contractId}
    </script>
  </body>
</html>
`;
}

function writeContractDoc(dir, html) {
  mkdirSync(join(dir, 'contract'), { recursive: true });
  writeFileSync(join(dir, 'contract', 'index.html'), html);
}

function audit(dir, ...flags) {
  const env = { ...process.env };
  delete env.PAGES_BASE_PATH;
  const result = spawnSync(
    process.execPath,
    [ASSEMBLE, '--check-only', ...flags, dir],
    { cwd: ROOT, encoding: 'utf8', env },
  );
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

test('contract:docs genera con el CLI pinneado, inline y sin telemetría', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['contract:docs'], 'node scripts/build-contract-docs.mjs');

  const source = readFileSync(GENERATOR, 'utf8');
  assert.ok(source.includes("'--inlineBundle'"), 'el doc tiene que inlinear el bundle de Redoc');
  assert.ok(source.includes("'--openapi.router=hash'"), 'el ruteo va por hash para no depender del base path');
  assert.ok(source.includes('REDOCLY_TELEMETRY: \'off\''), 'sin telemetría apagada el doc publicado manda trazas');
  assert.ok(source.includes("'@redocly', 'cli'"), 'el CLI se resuelve del node_modules local, no de npx');
});

test('el doc generado es autocontenido y publica el contrato vigente', () => {
  assert.equal(generation.status, 0, `build-contract-docs falló: ${generation.stderr ?? ''}`);
  assert.ok(statSync(GENERATED).size > 1024 * 1024, 'un doc autocontenido pesa más que un HTML con el CDN');

  const html = readFileSync(GENERATED, 'utf8');
  for (const pattern of SUBRESOURCES) {
    assert.ok(!pattern.test(html), `el doc referencia un subrecurso: ${pattern}`);
  }
  assert.ok(html.includes('"disableTelemetry":true'), 'la telemetría de Redoc tiene que estar apagada');
  assert.ok(html.includes(CONTRACT_ID), `el doc no contiene el x-contract-id vigente (${CONTRACT_ID})`);
});

test('el ensamblado publica el contrato en /contract/ y lo audita', () => {
  const dir = buildSite({ contract: readFileSync(GENERATED, 'utf8') });
  const { status, stdout, stderr } = audit(dir, '--strict');

  assert.equal(status, 0, `el artefacto completo tiene que publicarse: ${stderr}`);
  assert.match(stdout, /contract\/index\.html/);
  assert.match(stdout, new RegExp(CONTRACT_ID));
});

test('--strict falla si falta /contract/index.html', () => {
  const dir = buildSite({ contract: null });
  const { status, stderr } = audit(dir, '--strict');

  assert.equal(status, 1, 'la publicación no puede quedar incompleta');
  assert.match(stderr, /falta contract\/index\.html/);
});

test('sin --strict el contrato ausente queda pendiente, no es un fallo', () => {
  const dir = buildSite({ contract: null });
  const { status, stdout } = audit(dir);

  assert.equal(status, 0);
  assert.match(stdout, /pending/);
  assert.match(stdout, /contract \(falta contract\/dist: npm run contract:docs\)/);
});

test('el guard sigue cerrando: falta una demo, exit 1', () => {
  const dir = buildSite();
  rmSync(join(dir, 'expo'), { recursive: true, force: true });
  const { status, stderr } = audit(dir, '--strict');

  assert.equal(status, 1);
  assert.match(stderr, /expo/);
});

test('el doc no puede cargar subrecursos externos', () => {
  const dir = buildSite({
    contract: contractDoc({ body: '' }).replace(
      '<div id="redoc"></div>',
      '<div id="redoc"></div><script src="https://cdn.example.com/redoc.js"></script>',
    ),
  });
  const { status, stderr } = audit(dir, '--strict');

  assert.equal(status, 1);
  assert.match(stderr, /no puede cargar subrecursos/);
});

test('el doc se publica como un único archivo', () => {
  const dir = buildSite();
  writeFileSync(join(dir, 'contract', 'openapi.yaml'), 'openapi: 3.1.0\n');
  const { status, stderr } = audit(dir, '--strict');

  assert.equal(status, 1);
  assert.match(stderr, /único index\.html/);
});

test('el doc tiene que ser el del contrato vigente y sin telemetría', () => {
  const stale = buildSite({ contract: contractDoc({ contractId: '000000000000' }) });
  const staleRun = audit(stale, '--strict');
  assert.equal(staleRun.status, 1);
  assert.match(staleRun.stderr, /no corresponde al contrato vigente/);

  const telemetry = buildSite({ contract: contractDoc({ disableTelemetry: 'false' }) });
  const telemetryRun = audit(telemetry, '--strict');
  assert.equal(telemetryRun.status, 1);
  assert.match(telemetryRun.stderr, /telemetría/);
});
