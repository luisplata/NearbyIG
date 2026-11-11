import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * Gates de limpieza del contrato (schema 2):
 *  - la intención retirada y su etiqueta no pueden aparecer en `demo/` ni en `scripts/`;
 *  - ningún fixture, tipo o catálogo de copy puede declarar intereses, hobbies ni tags.
 *
 * Los patrones se arman por partes para que este archivo no se auto-detecte. Se
 * excluyen directorios de build y dependencias: lo que se audita es el código y el
 * contrato que producen el artefacto, no la salida de una compilación anterior.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const REMOVED_VALUE = ['da', 'ting'].join('');
const REMOVED_LABEL = ['Ci', 'tas'].join('');
const FORBIDDEN_INTENTION = new RegExp(`${REMOVED_VALUE}|${REMOVED_LABEL}`);

const SCANNED_ROOTS = ['demo', 'scripts'];
const SKIPPED_DIRECTORIES = new Set([
  'node_modules',
  'build',
  'dist',
  '.dart_tool',
  '.vitest-cache',
  '.git',
]);
const TEXT_EXTENSIONS = new Set([
  '.json',
  '.md',
  '.mjs',
  '.js',
  '.ts',
  '.tsx',
  '.dart',
  '.html',
  '.css',
  '.yml',
  '.yaml',
  '.txt',
]);

const SELF = fileURLToPath(import.meta.url);

function* walkFiles(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
      yield* walkFiles(absolute);
      continue;
    }
    if (!entry.isFile()) continue;
    const dot = entry.name.lastIndexOf('.');
    if (dot < 0 || !TEXT_EXTENSIONS.has(entry.name.slice(dot))) continue;
    yield absolute;
  }
}

/** Archivos de contrato y código que producen el artefacto de las demos. */
function contractFiles() {
  const files = [];
  for (const scanned of SCANNED_ROOTS) {
    const root = join(ROOT, scanned);
    if (!statSync(root).isDirectory()) continue;
    for (const absolute of walkFiles(root)) {
      if (resolve(absolute) === resolve(SELF)) continue;
      files.push(absolute);
    }
  }
  return files;
}

function displayPath(absolute) {
  return relative(ROOT, absolute).split('\\').join('/');
}

test('la intención retirada no aparece en demo/ ni en scripts/', () => {
  const offenders = [];
  for (const file of contractFiles()) {
    const text = readFileSync(file, 'utf8');
    if (!FORBIDDEN_INTENTION.test(text)) continue;
    const line = text.split(/\r?\n/).findIndex((candidate) => FORBIDDEN_INTENTION.test(candidate));
    offenders.push(`${displayPath(file)}:${line + 1}`);
  }

  assert.deepEqual(offenders, [], `la intención retirada sigue presente en: ${offenders.join(', ')}`);
});

test('el contrato vigente declara exactamente 3 intenciones', () => {
  const fixtures = JSON.parse(readFileSync(join(ROOT, 'demo', 'shared', 'fixtures.json'), 'utf8'));
  assert.deepEqual(fixtures.filters.intentions, ['networking', 'friendship', 'activities']);
  assert.equal(fixtures.schemaVersion, 2);

  const counts = new Map(fixtures.filters.intentions.map((value) => [value, 0]));
  for (const profile of fixtures.profiles) {
    counts.set(profile.intention, (counts.get(profile.intention) ?? 0) + 1);
  }
  for (const [intention, count] of counts) {
    assert.ok(count >= 2, `la intención "${intention}" sólo la usa ${count} perfil(es)`);
  }
});

test('los fixtures no declaran intereses, hobbies ni tags', () => {
  const fixtures = JSON.parse(readFileSync(join(ROOT, 'demo', 'shared', 'fixtures.json'), 'utf8'));
  const forbidden = new Set(['interests', 'hobbies', 'tags']);
  const offenders = [];

  const inspect = (value, path) => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => inspect(item, `${path}[${index}]`));
      return;
    }
    if (value === null || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      const childPath = path ? `${path}.${key}` : key;
      if (forbidden.has(key)) offenders.push(childPath);
      inspect(child, childPath);
    }
  };

  inspect({ self: fixtures.self, profiles: fixtures.profiles, filters: fixtures.filters }, '');
  assert.deepEqual(offenders, [], `campos prohibidos en fixtures.json: ${offenders.join(', ')}`);
});

test('el catálogo de copy no abre espacios de intereses', () => {
  const copy = JSON.parse(readFileSync(join(ROOT, 'demo', 'shared', 'copy.json'), 'utf8'));
  const forbidden = new Set(['interests', 'hobbies', 'tags']);
  const offenders = Object.keys(copy).filter((key) => forbidden.has(key.split('.')[0]));
  assert.deepEqual(offenders, [], `claves de copy prohibidas: ${offenders.join(', ')}`);
});
