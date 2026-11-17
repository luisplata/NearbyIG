import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * `demo/CONTRACT.md` es vinculante: lo que promete (y lo que deja de prometer)
 * tiene que moverse con el código, no después.
 *
 * Este test fija las tres cosas que el cambio de geolocalización nativa podría
 * romper en silencio:
 *  - el port se sigue llamando `requestPoint` (una sola puerta, no un módulo
 *    nuevo por plataforma);
 *  - §8 admite la diferencia de proveedor (navegador vs binario) sin abrir la
 *    puerta a diferencias funcionales;
 *  - el contrato **no** promete seguimiento continuo: `watchPosition` sigue
 *    prohibido, y el documento no puede insinuar lo contrario.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CONTRACT = join(ROOT, 'demo', 'CONTRACT.md');

const TEXT = readFileSync(CONTRACT, 'utf8');

/** Recorta una sección de nivel 2 (`## n.`) hasta la próxima. */
function section(heading) {
  const start = TEXT.indexOf(`\n## ${heading}`);
  assert.notEqual(start, -1, `CONTRACT.md perdió la sección ${heading}`);
  const next = TEXT.indexOf('\n## ', start + 1);
  return TEXT.slice(start, next === -1 ? TEXT.length : next);
}

test('el contrato nombra la puerta única de geolocalización', () => {
  assert.match(TEXT, /`requestPoint`/, 'el port se llama `requestPoint` y el contrato tiene que decirlo');
  assert.match(
    TEXT.slice(0, TEXT.indexOf('\n---')),
    /`requestPoint`/,
    'la puerta única se declara en el alcance, no sólo en la tabla de diferencias',
  );
});

test('§8 admite el proveedor nativo con el mismo port y el mismo resultado', () => {
  const differences = section('8.');
  assert.match(differences, /navigator\.geolocation/, 'la fila de proveedor tiene que nombrar el camino web');
  assert.match(differences, /expo-location/, 'la fila de proveedor tiene que nombrar el camino nativo');
  assert.match(differences, /requestPoint/, 'ambos caminos pasan por el mismo port');
  assert.match(
    differences,
    /mismo contrato de resultado/i,
    'la fila tiene que dejar claro que el resultado no cambia entre plataformas',
  );
});

test('el alcance acota la falta de geolocalización a la demo web', () => {
  const scope = TEXT.slice(0, TEXT.indexOf('\n---'));
  assert.match(scope, /una sola puerta/i, 'el alcance no puede volver a decir "cero geolocalización"');
  assert.match(scope, /sólo HTTPS o `localhost`/, 'en web la lectura sigue dependiendo del contexto seguro');
  assert.match(scope, /expo-location/, 'el alcance tiene que documentar la lectura nativa con permiso');
  assert.match(scope, /nadie guarda el punto/i, 'la promesa de no persistir sigue vigente');
});

test('el contrato no promete seguimiento continuo de la ubicación', () => {
  for (const forbidden of ['clearWatch', 'getCurrentPositionAsync']) {
    assert.ok(
      !TEXT.includes(forbidden),
      `CONTRACT.md no puede nombrar ${forbidden}: el seguimiento es una lectura puntual por gesto`,
    );
  }
  // `watchPosition` puede aparecer **una sola vez y negado** ("sin `watchPosition`"):
  // es la promesa de que no hay canal continuo. Cualquier otro uso es una promesa al revés.
  const mentions = [...TEXT.matchAll(/watchPosition/g)];
  assert.equal(mentions.length, 1, 'el seguimiento continuo se nombra una vez, como prohibición');
  const before = TEXT.slice(Math.max(0, mentions[0].index - 8), mentions[0].index);
  assert.match(before, /sin\s+`?$/i, 'la única mención de `watchPosition` tiene que estar negada');
});

test('§11 deja claro que el punto del usuario no mueve el viewport', () => {
  const demoCenter = section('11.');
  assert.match(demoCenter, /no mueve el viewport/i, 'DEMO_CENTER sigue siendo el centro para todos');
  assert.match(demoCenter, /DEMO_CENTER/, 'la constante del centro se sigue nombrando');
});

test('§14 fija el invariante: una puerta, sin watchPosition ni punto persistido', () => {
  const evidence = section('14.');
  assert.match(
    evidence,
    /una sola puerta de geolocalización, sin `watchPosition` ni persistencia del punto/,
    'la fila 14 es la evidencia automatizada del invariante de privacidad',
  );
  assert.ok(
    !/cero storage\/geolocation/.test(evidence),
    'la fila 14 no puede volver a decir "cero storage/geolocation": ya hay una puerta declarada',
  );
});
