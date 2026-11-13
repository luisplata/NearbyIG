import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * El deploy es un contrato: un solo workflow **de Pages**, base path resuelto antes
 * de los builds, gate antes del upload y permisos de Pages sólo en el job de deploy.
 * Estos checks son estáticos: no reemplazan la corrida real en Actions.
 *
 * Otros workflows están permitidos mientras no publiquen Pages. `contract.yml`, por
 * ejemplo, sólo corre el gate del contrato: leer el directorio entero no dice nada
 * sobre quién deploya, así que la regla se expresa sobre lo que el workflow hace.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const WORKFLOWS = join(ROOT, '.github', 'workflows');
const PAGES_WORKFLOW = 'pages.yml';
const source = readFileSync(join(WORKFLOWS, PAGES_WORKFLOW), 'utf8');
const workflowFiles = () => readdirSync(WORKFLOWS).filter((file) => /\.ya?ml$/.test(file));

/**
 * Marcadores de un workflow que publica Pages: desplegar, subir el artefacto, pedir
 * el permiso o declarar el environment del deploy. `pages: read` también cuenta:
 * un workflow que lee Pages es un workflow de Pages, y acá hay uno solo.
 */
const PAGES_MARKERS = [
  { pattern: /uses:\s*actions\/deploy-pages@/, label: 'usa actions/deploy-pages' },
  { pattern: /uses:\s*actions\/upload-pages-artifact@/, label: 'usa actions/upload-pages-artifact' },
  { pattern: /^\s+pages:\s*(read|write)\s*$/m, label: 'declara permisos de Pages' },
  {
    pattern: /^\s+environment:\s*\n\s+name:\s*github-pages\s*$/m,
    label: 'declara el environment github-pages',
  },
];

/** Devuelve el bloque de un job (desde su clave hasta el próximo job de nivel 2). */
function job(name) {
  const start = source.indexOf(`\n  ${name}:`);
  assert.ok(start >= 0, `falta el job ${name}`);
  const rest = source.slice(start + 1);
  const next = rest.search(/\n  [a-z-]+:\n/);
  return next === -1 ? rest : rest.slice(0, next);
}

test('pages.yml es el workflow que publica Pages y no habilita el sitio', () => {
  assert.ok(workflowFiles().includes(PAGES_WORKFLOW), `falta ${PAGES_WORKFLOW}`);
  // El guard no puede ser vacío: el dueño del deploy tiene que deployar de verdad.
  assert.match(source, /actions\/deploy-pages@v4/, 'pages.yml debe desplegar con actions/deploy-pages');
  assert.ok(!/enablement:\s*true/.test(source), 'el workflow no debe habilitar Pages');
  assert.ok(!/enable-pages|create-pages-site|POST \/repos\/.*\/pages/.test(source), 'sin pasos que creen el sitio');
});

test('ningún otro workflow publica Pages ni pide sus permisos', () => {
  for (const file of workflowFiles().filter((name) => name !== PAGES_WORKFLOW)) {
    const content = readFileSync(join(WORKFLOWS, file), 'utf8');
    for (const { pattern, label } of PAGES_MARKERS) {
      assert.ok(!pattern.test(content), `${file} ${label}: el deploy de Pages es sólo de ${PAGES_WORKFLOW}`);
    }
  }
});

test('el gate del contrato corre en su propio workflow, con el Node de Pages', () => {
  const contract = readFileSync(join(WORKFLOWS, 'contract.yml'), 'utf8');
  const pagesNode = /node-version:\s*([0-9.]+)/.exec(source)?.[1];
  assert.ok(pagesNode, 'pages.yml debe fijar node-version');

  for (const command of ['npm ci', 'npm run contract:check', 'npm run test:scripts']) {
    assert.ok(contract.includes(command), `contract.yml no corre "${command}"`);
  }
  assert.match(contract, /permissions:\n {2}contents: read\n/, 'contract.yml sólo necesita leer el repo');
  assert.match(contract, /concurrency:\n {2}group: /, 'contract.yml debe cancelar runs viejos del mismo ref');
  assert.ok(
    contract.includes(`node-version: ${pagesNode}`),
    `contract.yml debe usar Node ${pagesNode}, el mismo que pages.yml`,
  );
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

  // `checks` no construye nada: no necesita leer el sitio de Pages.
  assert.ok(!job('checks').includes('configure-pages'), 'checks no debe resolver el base path');
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
  assert.ok(build.includes('path: site'), 'el upload debe apuntar al artefacto site/');
  assert.ok(!build.includes('include-hidden-files'), 'no usar inputs no soportados por upload-pages-artifact@v4');
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

test('el nivel workflow concede pages: read para configure-pages', () => {
  const permissions = source.slice(source.indexOf('\npermissions:'), source.indexOf('\nconcurrency:'));
  assert.match(permissions, /contents: read/);
  assert.match(permissions, /pages: read/);
  assert.ok(!/pages: write/.test(permissions), 'pages: write no debe estar a nivel workflow');
  assert.equal((source.match(/^\s+pages: read$/gm) ?? []).length, 1, 'pages: read se declara una sola vez');
});
