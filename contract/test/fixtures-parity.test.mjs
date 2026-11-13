/**
 * Paridad del catálogo de perfiles con `demo/shared/fixtures.json`.
 *
 * La regla no es "el catálogo tiene los campos": es que cada valor mapeado sea
 * **idéntico** al del dataset. Un test de existencia deja pasar `distanceM: 240`
 * contra `2400`; éste compara el valor y, cuando difieren, falla nombrando
 * perfil, campo y ambos valores.
 *
 * El mapping es **dato**, no código suelto: una tabla de `fixture → profile` con
 * su transformación. Así el test detecta dos errores opuestos:
 *
 *  - un campo nuevo en `fixtures.json` sin entrada en la tabla (el catálogo se
 *    quedaría sin ese dato y nadie lo notaría);
 *  - un campo agregado al catálogo que no es ni del dataset ni de los tres que
 *    el contrato suma (`regionKey`, `demoSlot`, `sourceType`).
 *
 * `mx` es derivado: `profiles.mx.json[i]` corresponde a `fixtures.profiles[i]`,
 * con `id → profileId` prefijado por región y el resto 1:1. `co` es autorado: no
 * se compara valor a valor (no hay contra qué), pero sí cumple el mismo shape,
 * las mismas reglas de identidad y cobertura, y no comparte `profileId` con `mx`.
 *
 * La paridad es del **seed**, no de las respuestas: en runtime `distanceM` y
 * `bearingDeg` los calcula el server de S2. Por eso el test compara archivos.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { loadSpec } from '../scripts/lib/spec.mjs';

const fixtures = JSON.parse(readFileSync(new URL('../../demo/shared/fixtures.json', import.meta.url), 'utf8'));
const mx = JSON.parse(readFileSync(new URL('../catalog/profiles.mx.json', import.meta.url), 'utf8'));
const co = JSON.parse(readFileSync(new URL('../catalog/profiles.co.json', import.meta.url), 'utf8'));
const spec = loadSpec().spec;

/**
 * Tabla de mapping: lo único que el catálogo puede cambiar del dataset es el
 * nombre de `id` y el prefijo de región. Todo lo demás viaja tal cual.
 */
const MAPPING = [
  { fixture: 'id', profile: 'profileId', transform: (id) => `mx-${id}` },
  { fixture: 'nickname', profile: 'nickname' },
  { fixture: 'initials', profile: 'initials' },
  { fixture: 'intention', profile: 'intention' },
  { fixture: 'gender', profile: 'gender' },
  { fixture: 'verified', profile: 'verified' },
  { fixture: 'online', profile: 'online' },
  { fixture: 'distanceM', profile: 'distanceM' },
  { fixture: 'bearingDeg', profile: 'bearingDeg' },
  { fixture: 'photoId', profile: 'photoId' },
  { fixture: 'instagramHandle', profile: 'instagramHandle' },
  { fixture: 'statusKey', profile: 'statusKey' },
  { fixture: 'bioKey', profile: 'bioKey' },
];

/** Los tres campos que el contrato agrega; no existen en el dataset. */
const CATALOG_ONLY = ['demoSlot', 'regionKey', 'sourceType'];

/**
 * Campos que sólo existen en la **respuesta**: son estado de runtime, no seed.
 * `inUse` (v0.2) dice si hay una sesión viva en el slot; no puede vivir en
 * `catalog/*.json` porque el catálogo es data congelada y esto es estado.
 */
const RESPONSE_ONLY = ['inUse'];

const PROFILE_FIELDS = [...MAPPING.map((entry) => entry.profile), ...CATALOG_ONLY].sort();
const REGIONS = { mx, co };
const INTENTIONS = ['activities', 'friendship', 'networking'];
const GENDERS = ['female', 'male', 'nonbinary'];

/** Nombre legible del perfil, para que el fallo diga cuál es. */
const nameOf = (profile) => profile.profileId ?? '<sin profileId>';

test('cada perfil mx es idéntico al de fixtures posición por posición (fixtures gana)', () => {
  assert.equal(fixtures.schemaVersion, 2, 'schemaVersion del dataset cambió: el catálogo asume 2');
  assert.equal(mx.length, fixtures.profiles.length, 'una fila del catálogo por perfil del dataset');

  for (const [index, profile] of mx.entries()) {
    const source = fixtures.profiles[index];
    assert.ok(source, `fixtures.profiles[${index}] no existe`);

    for (const { fixture, profile: field, transform } of MAPPING) {
      const expected = transform ? transform(source[fixture]) : source[fixture];
      assert.equal(
        profile[field],
        expected,
        `perfil ${nameOf(profile)} (posición ${index}): ${field} — catálogo ${JSON.stringify(profile[field])} ≠ fixtures ${JSON.stringify(expected)}`,
      );
    }
  }
});

test('fixtures.json no trae ningún campo sin entrada en el mapping', () => {
  const mapped = new Set(MAPPING.map((entry) => entry.fixture));
  const unmapped = [];

  for (const profile of fixtures.profiles) {
    for (const field of Object.keys(profile)) {
      if (!mapped.has(field)) unmapped.push(`${profile.id}.${field}`);
    }
  }

  assert.deepEqual(
    unmapped,
    [],
    `campos del dataset sin mapping: ${unmapped.join(', ')} — agregalos a MAPPING en este test o explicá por qué no viajan`,
  );

  for (const { fixture } of MAPPING) {
    assert.ok(
      Object.hasOwn(fixtures.profiles[0], fixture),
      `el mapping nombra "${fixture}", que no existe en fixtures.profiles[]`,
    );
  }
});

test('el catálogo sólo agrega regionKey, demoSlot y sourceType', () => {
  for (const [regionKey, rows] of Object.entries(REGIONS)) {
    for (const profile of rows) {
      assert.deepEqual(
        Object.keys(profile).sort(),
        PROFILE_FIELDS,
        `${nameOf(profile)}: las claves no son las 13 del dataset más los 3 campos del contrato`,
      );
      assert.equal(profile.regionKey, regionKey, `${nameOf(profile)}: regionKey no coincide con el archivo`);
      assert.equal(profile.sourceType, 'human', `${nameOf(profile)}: las 20 filas del catálogo son human`);
    }
  }
});

test('hay 10 perfiles por región con demoSlot 1..10 único', () => {
  for (const [regionKey, rows] of Object.entries(REGIONS)) {
    assert.equal(rows.length, 10, `${regionKey}: el catálogo tiene 10 perfiles por región`);

    assert.deepEqual(
      rows.map((profile) => profile.demoSlot),
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      `${regionKey}: demoSlot es 1..10 en el orden del archivo (no "únicos y listo")`,
    );

    const ids = rows.map((profile) => profile.profileId);
    assert.equal(new Set(ids).size, ids.length, `${regionKey}: profileId repetido`);
    for (const id of ids) {
      assert.match(id, new RegExp(`^${regionKey}-p\\d{2}$`), `${id}: profileId fuera del formato <region>-pNN`);
    }
  }

  const shared = mx.map((profile) => profile.profileId).filter((id) => co.some((other) => other.profileId === id));
  assert.deepEqual(shared, [], `mx y co comparten profileId: ${shared.join(', ')}`);
  assert.equal(new Set([...mx, ...co].map((profile) => profile.profileId)).size, 20, 'los 20 profileId son únicos');
});

test('cada región cubre las 3 intenciones (≥2 perfiles) y los 3 géneros', () => {
  for (const [regionKey, rows] of Object.entries(REGIONS)) {
    const byIntention = new Map(INTENTIONS.map((intention) => [intention, 0]));
    for (const profile of rows) {
      assert.ok(byIntention.has(profile.intention), `${nameOf(profile)}: intención "${profile.intention}" fuera del enum`);
      byIntention.set(profile.intention, byIntention.get(profile.intention) + 1);
    }
    for (const [intention, count] of byIntention) {
      assert.ok(count >= 2, `${regionKey}: ${intention} tiene ${count} perfil(es); cada intención necesita ≥2`);
    }

    const genders = new Set(rows.map((profile) => profile.gender));
    assert.deepEqual([...genders].sort(), GENDERS, `${regionKey}: tienen que aparecer los 3 géneros`);
  }
});

test('el schema público declara exactamente esos campos, cerrado y obligatorio', () => {
  const summary = spec.components.schemas.ProfileSummary;
  const responseFields = [...PROFILE_FIELDS, ...RESPONSE_ONLY].sort();

  assert.ok(summary, 'falta components.schemas.ProfileSummary (¿se montó schemas/profile.yaml?)');
  assert.deepEqual(
    Object.keys(summary.properties ?? {}).sort(),
    responseFields,
    'ProfileSummary declara las 16 claves del catálogo más `inUse`, y ninguna otra',
  );
  assert.deepEqual(
    [...(summary.required ?? [])].sort(),
    responseFields,
    'los 17 campos de la respuesta son obligatorios (incluido inUse)',
  );
  assert.equal(summary.additionalProperties, false, 'ProfileSummary cierra con additionalProperties: false');

  // `inUse` es estado, no seed: si aparece en el catálogo, alguien congeló una
  // ocupación en un archivo y el `--check` la va a pelear en cada reset.
  for (const [regionKey, rows] of Object.entries(REGIONS)) {
    for (const profile of rows) {
      assert.equal(
        Object.hasOwn(profile, 'inUse'),
        false,
        `${regionKey}/${nameOf(profile)}: inUse es de respuesta, no del seed`,
      );
    }
  }

  // Los enums del vocabulario no se copian: se referencian. Si alguna vez se
  // duplican, el próximo valor nuevo se agrega en un solo lugar y el otro miente.
  assert.deepEqual(
    [...summary.properties.intention.enum].sort(),
    INTENTIONS,
    'ProfileSummary.intention tiene que ser el enum Intention de common.yaml',
  );
  assert.deepEqual(
    [...summary.properties.gender.enum].sort(),
    GENDERS,
    'ProfileSummary.gender tiene que ser el enum Gender de common.yaml',
  );

  // El avatar no es un objeto: es un id que el cliente resuelve en el bundle.
  assert.equal(
    Object.hasOwn(summary.properties, 'avatar'),
    false,
    'ProfileSummary no declara `avatar`: la foto se resuelve por photoId',
  );

  const list = spec.components.schemas.ProfileList;
  assert.deepEqual(Object.keys(list.properties ?? {}), ['profiles'], 'ProfileList es { profiles }');
  assert.equal(list.properties.profiles.items.properties.profileId.type, 'string', 'la lista proyecta ProfileSummary');
});
