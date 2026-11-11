import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * El deploy es un contrato: un solo workflow, base path resuelto antes de los
 * builds, gate antes del upload y permisos de Pages sólo en el job de deploy.
 * Estos checks son estáticos: no reemplazan la corrida real en Actions.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const WORKFLOWS = join(ROOT, '.github', 'workflows');
const source = readFileSync(join(WORKFLOWS, 'pages.yml'), 'utf8');

/** Devuelve el bloque de un job (desde su clave hasta el próximo job de nivel 2). */
function job(name) {
  const start = source.indexOf(`\n  ${name}:`);
  assert.ok(start >= 0, `falta el job ${name}`);
  const rest = source.slice(start + 1);
  const next = rest.search(/\n  [a-z-]+:\n/);
  return next === -1 ? rest : rest.slice(0, next);
}

test('hay un único workflow de Pages y no habilita el sitio', () => {
  const files = readdirSync(WORKFLOWS).filter((file) => /\.ya?ml$/.test(file));
  assert.deepEqual(files, ['pages.yml'], 'debe existir un solo workflow de Pages');
  assert.ok(!/enablement:\s*true/.test(source), 'el workflow no debe habilitar Pages');
  assert.ok(!/enable-pages|create-pages-site|POST \/repos\/.*\/pages/.test(source), 'sin pasos que creen el sitio');
});

test('dispara en push a main, PR y ejecución manual', () => {
  assert.match(source, /on:\n  push:\n    branches: \[main\]/);
  assert.match(source, /  pull_request:\n/);
  assert.match(source, /  workflow_dispatch:\n/);
});

test('checks corre validación, drift, tests y builds de verificación', () => {
  const checks = job('checks');
  for (const command of [
    'node scripts/validate-fixtures.mjs',
    'node scripts/sync-demo-assets.mjs --check',
    'npm run test:scripts',
    'npm --prefix demo/expo-demo ci',
    'npm --prefix demo/expo-demo run typecheck',
    'npm --prefix demo/expo-demo run test',
    'flutter analyze',
    'flutter test',
  ]) {
    assert.ok(checks.includes(command), `checks no ejecuta "${command}"`);
  }
  assert.ok(!checks.includes('upload-pages-artifact'), 'checks no debe subir artefactos');
});

test('configure-pages resuelve el base path antes de cualquier build', () => {
  const build = job('build');
  const firstUses = [...build.matchAll(/uses: (\S+)/g)].map((match) => match[1]);
  assert.equal(firstUses[0], 'actions/checkout@v4');
  assert.equal(firstUses[1], 'actions/configure-pages@v5', 'configure-pages debe ser la primera action después del checkout');

  const configureAt = build.indexOf('configure-pages@v5');
  for (const marker of ['Expo export', 'Flutter build', 'assemble-site.mjs']) {
    assert.ok(configureAt < build.indexOf(marker), `configure-pages debe preceder a "${marker}"`);
  }
});

test('los builds consumen el base path resuelto, sin hardcodear /NearbyIG', () => {
  const build = job('build');
  assert.ok(build.includes('EXPO_BASE_URL: ${{ steps.pages.outputs.base_path }}/expo'));
  assert.ok(build.includes('FLUTTER_BASE_HREF: ${{ steps.pages.outputs.base_path }}/flutter/'));
  assert.ok(!/\/NearbyIG/.test(source), 'el workflow no debe hardcodear el nombre del repo');
  assert.equal((build.match(/PAGES_BASE_PATH: \$\{\{ steps\.pages\.outputs\.base_path \}\}/g) ?? []).length, 1);
});

test('fija Node 22 y Flutter 3.41.2', () => {
  assert.equal((source.match(/node-version: 22/g) ?? []).length, 2);
  assert.equal((source.match(/flutter-version: 3\.41\.2/g) ?? []).length, 2);
  assert.ok(source.includes('channel: stable'));
});

test('audita el artefacto antes de subirlo', () => {
  const build = job('build');
  const assembleAt = build.indexOf('node scripts/assemble-site.mjs --strict site');
  const uploadAt = build.indexOf('actions/upload-pages-artifact@v4');
  assert.ok(assembleAt >= 0, 'build debe ensamblar y auditar site/');
  assert.ok(uploadAt > assembleAt, 'la auditoría debe correr antes del upload');
  assert.ok(build.includes('include-hidden-files: true'), 'el artefacto debe conservar .nojekyll');
});

test('publica con permisos de Pages sólo en el job de deploy', () => {
  const deploy = job('deploy');
  assert.match(deploy, /pages: write/);
  assert.match(deploy, /id-token: write/);
  assert.match(deploy, /environment:\n      name: github-pages/);
  assert.ok(deploy.includes('actions/deploy-pages@v4'));

  for (const name of ['checks', 'build']) {
    const block = job(name);
    assert.ok(!/pages: write/.test(block), `${name} no debe tener pages: write`);
    assert.ok(!/id-token: write/.test(block), `${name} no debe tener id-token: write`);
  }
});
