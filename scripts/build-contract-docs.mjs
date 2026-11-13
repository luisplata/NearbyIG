#!/usr/bin/env node
/**
 * Genera la documentación HTML del contrato con `@redocly/cli build-docs`:
 *
 *   contract/dist/index.html   un único archivo autocontenido
 *
 * Lo que la invocación cruda de la CLI no te da y acá sí:
 *
 *  - `--inlineBundle` mete el bundle standalone de Redoc **dentro** del HTML.
 *    Sin eso el doc baja `redoc.standalone.js` de `cdn.redocly.com` en runtime y
 *    el artefacto publicado deja de ser autocontenido.
 *  - `REDOCLY_TELEMETRY=off` apaga la telemetría que Redoc deja prendida por
 *    default (`disableTelemetry: false` en el HTML). Sin esto el doc publicado
 *    manda trazas a `otel.cloud.redocly.com`.
 *  - `--openapi.router=hash` deja el ruteo explícito: los deep links son
 *    `#/operation/...`, así el mismo HTML funciona en `/` (sitio de usuario) y
 *    en `/NearbyIG/contract/` (sitio de proyecto) sin tocar ningún asset.
 *
 * El CLI se resuelve del `node_modules` local (devDependency pinneada): no hay
 * `npx` ni descarga en el camino. El resultado no se commitea (`dist/` está
 * ignorado): se publica copiándolo a `site/contract/` en el ensamblado.
 *
 * Uso:
 *   node scripts/build-contract-docs.mjs             # escribe contract/dist/
 *   node scripts/build-contract-docs.mjs otro-dir    # escribe otro-dir/index.html
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SPEC = join(ROOT, 'contract', 'openapi.yaml');
const DEFAULT_OUT = join(ROOT, 'contract', 'dist');

const positional = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const outDir = positional[0] ? resolve(ROOT, positional[0]) : DEFAULT_OUT;
const outFile = join(outDir, 'index.html');

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

/** Entry point real del CLI instalado, sin pasar por `npx`. */
function cliBin() {
  const packageDir = join(ROOT, 'node_modules', '@redocly', 'cli');
  const manifest = join(packageDir, 'package.json');
  if (!existsSync(manifest)) {
    fail('falta @redocly/cli: corré `npm ci` en la raíz del repo');
  }
  const { bin } = JSON.parse(readFileSync(manifest, 'utf8'));
  const entry = typeof bin === 'string' ? bin : bin.redocly;
  if (typeof entry !== 'string') fail('@redocly/cli no declara el binario `redocly`');
  return join(packageDir, entry);
}

function displayPath(absolute) {
  return relative(ROOT, absolute).split(sep).join('/');
}

function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

if (!existsSync(SPEC)) fail(`falta el contrato: ${displayPath(SPEC)}`);

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const result = spawnSync(
  process.execPath,
  [cliBin(), 'build-docs', SPEC, '-o', outFile, '--inlineBundle', '--openapi.router=hash'],
  {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, REDOCLY_TELEMETRY: 'off' },
  },
);

if (result.error) fail(`no se pudo ejecutar @redocly/cli: ${result.error.message}`);
if (result.status !== 0) fail(`@redocly/cli build-docs terminó con código ${result.status}`);
if (!existsSync(outFile)) fail(`build-docs no escribió ${displayPath(outFile)}`);

console.log(`doc del contrato: ${displayPath(outFile)} (${humanSize(statSync(outFile).size)})`);
