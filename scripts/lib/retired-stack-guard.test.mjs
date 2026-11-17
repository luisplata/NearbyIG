import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * Guard de no reintroducción del stack retirado.
 *
 * El cambio que retiró la app de referencia borró la app, sus emisores de código y
 * su lugar en el deploy. Este test es la cerca: si el framework o el lenguaje vuelven a
 * `.github/`, `scripts/` o `demo/`, el PR no pasa. Cubre texto propio, así que también
 * atrapa un comentario, un host en una allowlist o un target de sync que se cuele de
 * nuevo.
 *
 * Cuatro decisiones que hacen al guard auditable y no decorativo:
 *
 *  1. Las agujas se arman por fragmentos: este archivo no contiene la palabra prohibida,
 *     así que no necesita excusarse a sí mismo para pasar. Aun así su propia ruta queda
 *     excluida (`SELF`): el guard no se escanea. El nombre del archivo tampoco la
 *     contiene, por eso se llama `retired-stack-guard`: `git ls-files | grep -i <stack>`
 *     tiene que volver vacío, y un test con el nombre viejo lo rompía.
 *  2. La allowlist histórica son seis rutas de `docs/` **fuera** de las raíces
 *     vigiladas. Se declara acá, a la vista, y tiene su propio test de existencia: una
 *     entrada muerta falla, porque una allowlist que no apunta a nada ya no documenta
 *     nada y sólo espera a que alguien la use para tapar un offender nuevo. Es
 *     documentación, no un filtro: el escaneo no la consulta, porque su segundo
 *     self-check garantiza que ningún entry puede caer dentro de lo vigilado.
 *  3. Ninguna entrada de la allowlist puede vivir dentro de una raíz vigilada. Si alguien
 *     agrega `demo/CONTRACT.md` "porque es doc", este test lo rechaza antes que el guard.
 *     Esa garantía es lo que permite que el escaneo no tenga un `if` de excepción por
 *     archivo: sin entradas alcanzables, no hay nada que perdonar.
 *  4. Se saltean directorios de build y dependencias: lo que se audita es el código y el
 *     contrato que producen el artefacto, no la salida de una compilación anterior.
 *     `.expo` y `.vitest-cache` entran por el mismo motivo: son cachés de herramienta,
 *     no fuentes, y un test que falla por un archivo temporal es un test que se ignora.
 *
 * El mensaje de falla nombra archivo y línea (`ruta:línea: texto`), que es lo único que
 * hace accionable un guard de texto.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SELF = resolve(fileURLToPath(import.meta.url));

/** Raíces que producen el sitio: el stack retirado no puede reaparecer acá. */
const SCANNED_ROOTS = ['.github', 'scripts', 'demo'];

/** Registro histórico: documentos de una etapa anterior, que se conservan como se escribieron. */
const HISTORICAL_ALLOWLIST = [
  'docs/changes',
  'docs/plan-sprints-backend-demo.md',
  'docs/plan-sprints-mvp.md',
  'docs/costos-operacion.md',
  'docs/checklist-piloto.md',
  'docs/security-review.md',
];

const RETIRED_FRAMEWORK = ['flu', 'tter'].join('');
const RETIRED_LANGUAGE = ['da', 'rt'].join('');
const RETIRED = new RegExp(`${RETIRED_FRAMEWORK}|${RETIRED_LANGUAGE}`, 'i');

const SKIPPED_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  'site',
  '.git',
  '.expo',
  '.vitest-cache',
  'android',
  'ios',
  'build',
  ['.', RETIRED_LANGUAGE, '_tool'].join(''),
]);

const TEXT_EXTENSIONS = new Set([
  '.json',
  '.md',
  '.mjs',
  '.js',
  '.ts',
  '.tsx',
  '.html',
  '.css',
  '.yml',
  '.yaml',
  '.txt',
]);

function toRepoPath(absolute) {
  return relative(ROOT, absolute).split(sep).join('/');
}

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

/** Referencias al stack retirado dentro de las raíces vigiladas, como `ruta:línea: texto`. */
function offenders() {
  const hits = [];
  for (const scanned of SCANNED_ROOTS) {
    const root = join(ROOT, scanned);
    if (!existsSync(root) || !statSync(root).isDirectory()) continue;
    for (const absolute of walkFiles(root)) {
      if (resolve(absolute) === SELF) continue;
      const repoPath = toRepoPath(absolute);
      const lines = readFileSync(absolute, 'utf8').split(/\r?\n/);
      lines.forEach((line, index) => {
        if (RETIRED.test(line)) hits.push(`${repoPath}:${index + 1}: ${line.trim().slice(0, 90)}`);
      });
    }
  }
  return hits;
}

test('el stack retirado no vuelve a .github, scripts ni demo', () => {
  const hits = offenders();
  assert.deepEqual(
    hits,
    [],
    `${hits.length} referencia(s) al stack retirado (corregí el archivo o justificá la decisión):\n${hits
      .map((hit) => `  ${hit}`)
      .join('\n')}`,
  );
});

test('la allowlist histórica existe: una entrada muerta falla', () => {
  const stale = HISTORICAL_ALLOWLIST.filter((entry) => !existsSync(join(ROOT, entry)));
  assert.deepEqual(
    stale,
    [],
    `la allowlist histórica nombra rutas que ya no existen: ${stale.join(', ')}`,
  );
});

test('la allowlist histórica no vive dentro de una raíz vigilada', () => {
  const inside = HISTORICAL_ALLOWLIST.filter((entry) =>
    SCANNED_ROOTS.some((root) => entry === root || entry.startsWith(`${root}/`)),
  );
  assert.deepEqual(
    inside,
    [],
    `la allowlist no puede ser una excepción dentro de lo vigilado: ${inside.join(', ')}`,
  );
});

test('el guard detecta una reintroducción con ruta:línea', () => {
  // El nombre de la sonda lleva el PID: dos runners en paralelo (o un run que murió
  // sin `finally`) escribían el mismo archivo y se veían entre sí. Único por proceso,
  // el test sólo puede fallar por el guard.
  const probe = join(ROOT, 'scripts', `guard-probe-${process.pid}.md`);
  const probePath = toRepoPath(probe);
  rmSync(probe, { force: true });
  try {
    writeFileSync(
      probe,
      ['# Sonda del guard', `${RETIRED_FRAMEWORK} reintroducido a propósito`, ''].join('\n'),
      'utf8',
    );
    const hits = offenders();
    assert.ok(
      hits.some((hit) => hit.startsWith(`${probePath}:2:`)),
      `el guard no señaló la sonda: ${probePath}`,
    );
  } finally {
    rmSync(probe, { force: true });
  }
  assert.deepEqual(offenders(), [], 'el guard no volvió a verde al borrar la sonda');
});
