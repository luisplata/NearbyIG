import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  VersionGuardError,
  compareVersions,
  nextVersion,
  parseCommits,
  toVersionCode,
} from './version.mjs';

/**
 * Tabla de casos del cálculo de versión.
 *
 * Es el contrato del release: cada fila es una ventana de commits real o un
 * tag que ya existe. Si una fila se pone roja, el workflow publicaría un
 * `versionCode` que Play rechaza —o peor, uno que ya subió.
 */

/** La ventana real del primer release: 166 commits pre-publicación, varios con `!`. */
const FIRST_RELEASE_WINDOW = Array.from(
  { length: 166 },
  (_, index) => `feat(api)!: cambio ${index}`,
);

const PARSE_CASES = [
  { name: 'ventana vacía', messages: [], expected: 'none' },
  { name: 'sólo docs', messages: ['docs(readme): tabla'], expected: 'none' },
  { name: 'sólo chore', messages: ['chore: ordenar'], expected: 'none' },
  { name: 'sólo ci', messages: ['ci: cachear npm'], expected: 'none' },
  { name: 'sólo build', messages: ['build(android): firmar'], expected: 'none' },
  { name: 'sólo style', messages: ['style: comillas'], expected: 'none' },
  { name: 'sólo test', messages: ['test: cubrir el gate'], expected: 'none' },
  { name: 'sólo revert', messages: ['revert: "feat: mapa"'], expected: 'none' },
  { name: 'fix', messages: ['fix(radar): el marcador se congela'], expected: 'patch' },
  { name: 'perf', messages: ['perf: memoizar la lista'], expected: 'patch' },
  { name: 'refactor', messages: ['refactor(store): partir el reducer'], expected: 'patch' },
  { name: 'feat', messages: ['feat: pull to refresh'], expected: 'minor' },
  { name: 'feat con scope', messages: ['feat(map): clustering'], expected: 'minor' },
  { name: 'feat gana sobre fix', messages: ['fix: a', 'feat: b'], expected: 'minor' },
  { name: 'feat(api)!', messages: ['feat(api)!: romper el contrato'], expected: 'major' },
  { name: 'fix(x)!', messages: ['fix(x)!: cambio incompatible'], expected: 'major' },
  { name: 'feat! sin scope', messages: ['feat!: adiós'], expected: 'major' },
  {
    name: 'footer BREAKING CHANGE',
    messages: ['feat(api): nuevo contrato\n\nel body explica el porqué\n\nBREAKING CHANGE: `id` pasa a string'],
    expected: 'major',
  },
  {
    name: 'footer BREAKING-CHANGE',
    messages: ['fix: borde\n\nBREAKING-CHANGE: se va la opción `legacy`'],
    expected: 'major',
  },
  {
    name: 'footer en medio del body',
    messages: ['feat: algo\n\nBREAKING CHANGE: primera línea\nresto del body'],
    expected: 'major',
  },
  { name: 'merge de PR', messages: ['Merge pull request #71 from luisplata/docs'], expected: 'none' },
  { name: 'merge de branch', messages: ['Merge branch "main"'], expected: 'none' },
  { name: 'mensaje sin convención', messages: ['actualizar cosas'], expected: 'none' },
  { name: 'sin espacio después de los dos puntos', messages: ['feat:sin espacio'], expected: 'none' },
  { name: 'tipo en mayúsculas', messages: ['FEAT: x'], expected: 'none' },
  {
    name: '20 mensajes mixtos, gana el mayor',
    messages: [
      ...Array.from({ length: 8 }, (_, index) => `docs: doc ${index}`),
      ...Array.from({ length: 6 }, (_, index) => `fix: arreglo ${index}`),
      ...Array.from({ length: 5 }, (_, index) => `feat: feature ${index}`),
      'chore: limpieza',
    ],
    expected: 'minor',
  },
  { name: '166 commits con ! (pre-publicación)', messages: FIRST_RELEASE_WINDOW, expected: 'major' },
];

for (const { name, messages, expected } of PARSE_CASES) {
  test(`parseCommits: ${name} → ${expected}`, () => {
    assert.equal(parseCommits(messages), expected);
  });
}

const VERSION_CODE_CASES = [
  { version: '0.1.0', expected: 1000 },
  { version: '0.1.1', expected: 1001 },
  { version: '0.2.0', expected: 2000 },
  { version: '1.0.0', expected: 1_000_000 },
  // El major no se empaqueta en 3 dígitos: 2099 es válido para la fórmula y el
  // techo (2100) lo aplica nextVersion.
  { version: '2099.999.999', expected: 2_099_999_999 },
];

for (const { version, expected } of VERSION_CODE_CASES) {
  test(`toVersionCode: ${version} → ${expected}`, () => {
    assert.equal(toVersionCode(version), expected);
  });
}

test('toVersionCode: formato inválido es guarda, no NaN', () => {
  // `NaN` en el manifest es un .aab que Play rechaza; mejor romper antes.
  assert.throws(() => toVersionCode('1.2'), VersionGuardError);
  assert.throws(() => toVersionCode('1.2.3.4'), VersionGuardError);
  assert.throws(() => toVersionCode(undefined), VersionGuardError);
});

const NEXT_VERSION_CASES = [
  {
    name: 'sin tag y 166 commits con ! (auto) → el baseline gana',
    options: { lastTag: null, bump: 'major', releaseType: 'auto' },
    expected: { version: '0.1.0', versionCode: 1000, release: true },
  },
  {
    name: 'sin tag y releaseType=major → 1.0.0',
    options: { lastTag: null, bump: 'major', releaseType: 'major' },
    expected: { version: '1.0.0', versionCode: 1_000_000, release: true },
  },
  {
    name: 'sin tag y releaseType=minor → 0.2.0',
    options: { lastTag: null, bump: 'none', releaseType: 'minor' },
    expected: { version: '0.2.0', versionCode: 2000, release: true },
  },
  {
    name: 'v0.1.0 sin commits publicables → no hay release',
    options: { lastTag: 'v0.1.0', bump: 'none', releaseType: 'auto' },
    expected: { version: '0.1.0', versionCode: 1000, release: false },
  },
  {
    name: 'v0.1.0 + patch → 0.1.1',
    options: { lastTag: 'v0.1.0', bump: 'patch', releaseType: 'auto' },
    expected: { version: '0.1.1', versionCode: 1001, release: true },
  },
  {
    name: 'v0.1.0 + minor → 0.2.0',
    options: { lastTag: 'v0.1.0', bump: 'minor', releaseType: 'auto' },
    expected: { version: '0.2.0', versionCode: 2000, release: true },
  },
  {
    name: 'v1.2.3 + major → 2.0.0',
    options: { lastTag: 'v1.2.3', bump: 'major', releaseType: 'auto' },
    expected: { version: '2.0.0', versionCode: 2_000_000, release: true },
  },
  {
    name: 'v1.2.3 sin commits y releaseType=major → 2.0.0',
    options: { lastTag: 'v1.2.3', bump: 'none', releaseType: 'major' },
    expected: { version: '2.0.0', versionCode: 2_000_000, release: true },
  },
  {
    name: 'v1.2.3 derivado major pero releaseType=patch → 1.2.4 (el forzado gana)',
    options: { lastTag: 'v1.2.3', bump: 'major', releaseType: 'patch' },
    expected: { version: '1.2.4', versionCode: 1_002_004, release: true },
  },
  {
    name: 'v1.2.3 + patch con baseline distinto → el baseline no toca el tag',
    options: { lastTag: 'v1.2.3', bump: 'patch', releaseType: 'auto', baseline: '9.9.9' },
    expected: { version: '1.2.4', versionCode: 1_002_004, release: true },
  },
];

for (const { name, options, expected } of NEXT_VERSION_CASES) {
  test(`nextVersion: ${name}`, () => {
    const result = nextVersion(options);

    assert.equal(result.version, expected.version);
    assert.equal(result.versionCode, expected.versionCode);
    assert.equal(result.release, expected.release);
    // El reason va al log y al summary del run: nunca vacío.
    assert.equal(typeof result.reason, 'string');
    assert.ok(result.reason.length > 0);
  });
}

test('nextVersion: el baseline por defecto es 0.1.0', () => {
  assert.equal(nextVersion({ lastTag: null }).version, '0.1.0');
  assert.equal(nextVersion({}).version, '0.1.0');
});

test('nextVersion: el reason nombra la decisión, no sólo el número', () => {
  assert.match(
    nextVersion({ lastTag: null, bump: 'major' }).reason,
    /baseline 0\.1\.0/,
  );
  assert.match(nextVersion({ lastTag: 'v1.2.3', bump: 'minor' }).reason, /minor .*v1\.2\.3/);
  assert.match(
    nextVersion({ lastTag: 'v1.2.3', bump: 'none' }).reason,
    /no tiene commits publicables/,
  );
});

test('guarda: v1.2.999 + patch desborda el componente', () => {
  // 1.2.1000 codificaría 1000 en el campo de 3 dígitos → colisión con 1.3.0.
  assert.throws(
    () => nextVersion({ lastTag: 'v1.2.999', bump: 'patch' }),
    (error) => error instanceof VersionGuardError && /supera 999/.test(error.message),
  );
});

test('guarda: v1.999.999 + minor desborda el componente minor', () => {
  // 1.1000.0 codifica 1000 en tres dígitos → colisiona con 2.0.0.144.
  assert.throws(
    () => nextVersion({ lastTag: 'v1.999.999', bump: 'minor' }),
    (error) => error instanceof VersionGuardError && /supera 999/.test(error.message),
  );
});

test('guarda: v2099.0.0 + major llega al techo de Play', () => {
  assert.throws(
    () => nextVersion({ lastTag: 'v2099.0.0', bump: 'major' }),
    (error) => error instanceof VersionGuardError && /2100000000/.test(error.message),
  );
});

test('guarda: un tag con pre-release no es base', () => {
  // `--sort=-v:refname` pone v1.2.3-rc.1 arriba de v1.2.3: heredar ese número
  // publicaría una versión que no sucede a nada.
  for (const lastTag of ['v1.2.3-rc.1', 'v1.2', 'release-1.2.3', 'v1.2.3.4']) {
    assert.throws(
      () => nextVersion({ lastTag, bump: 'patch' }),
      (error) => error instanceof VersionGuardError && /plano/.test(error.message),
      `debería rechazar ${lastTag}`,
    );
  }
});

test('guarda: un bump inválido no se ignora en silencio', () => {
  assert.throws(() => nextVersion({ lastTag: 'v1.2.3', bump: 'minorish' }), VersionGuardError);
  assert.throws(() => nextVersion({ lastTag: 'v1.2.3', releaseType: 'yolo' }), VersionGuardError);
});

test('guarda: el baseline inválido también rompe', () => {
  assert.throws(() => nextVersion({ lastTag: null, baseline: '1.0' }), VersionGuardError);
});

test('compareVersions ordena por cada componente', () => {
  assert.equal(compareVersions('1.2.3', '1.2.3'), 0);
  assert.equal(compareVersions('1.2.3', '1.2.4'), -1);
  assert.equal(compareVersions('1.3.0', '1.2.9'), 1);
  assert.equal(compareVersions('2.0.0', '1.99.99'), 1);
  assert.throws(() => compareVersions('1.2', '1.2.3'), VersionGuardError);
});

test('el cálculo es monótono sobre la fórmula del versionCode', () => {
  // Toda versión que avanza tiene que producir un código mayor, o Play rechaza
  // el upload por "version code already used".
  let previous = 0;
  for (const version of ['0.1.0', '0.1.1', '0.1.99', '0.2.0', '0.9.9', '1.0.0', '1.2.3', '2.0.0']) {
    const code = toVersionCode(version);
    assert.ok(code > previous, `${version} (${code}) debería superar el código anterior`);
    previous = code;
  }
});
