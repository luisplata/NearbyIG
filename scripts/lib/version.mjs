/**
 * Cálculo de la versión de release a partir de los conventional commits.
 *
 * Puro por contrato: sin `node:` imports, sin fs, sin `process`. Ese es el que
 * hace que el cálculo se pueda probar con una tabla de casos (y que el workflow
 * no dependa de instalar nada para saber qué número publicar).
 *
 * La versión no se escribe a mano en ningún lado: si se escribe, tarde o
 * temprano dos runs publican el mismo `versionCode` y Play rechaza el segundo
 * después de 30 minutos de compilar.
 */

/** @typedef {'none'|'patch'|'minor'|'major'} Bump */

/**
 * Error de guarda: el CLI lo mapea a exit 3 para que el workflow corte antes de
 * compilar. Cualquier otro error es un bug o un problema de entorno (exit 1).
 */
export class VersionGuardError extends Error {
  constructor(message) {
    super(message);
    this.name = 'VersionGuardError';
  }
}

/**
 * Subject convencional, case-sensitive a propósito: `FEAT: x` no es un `feat`.
 * El `[a-z0-9._-]` del scope sale del regex de esta casa, así que un scope raro
 * (`feat(API)!:`) tampoco bumpea.
 */
const SUBJECT =
  /^(build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)(\([a-z0-9._-]+\))?(!)?: .+/;

/** Footer de breaking change: git lo admite con espacio o con guion. */
const BREAKING_FOOTER = /^BREAKING[ -]CHANGE:/;

const PLAIN_TAG = /^v(\d+)\.(\d+)\.(\d+)$/;
const PLAIN_VERSION = /^(\d+)\.(\d+)\.(\d+)$/;

/** Orden de severidad: `maxBump` compara por índice. */
const BUMPS = /** @type {Bump[]} */ (['none', 'patch', 'minor', 'major']);

const RELEASE_TYPES = ['auto', 'patch', 'minor', 'major'];

const COMPONENTS = ['major', 'minor', 'patch'];

/**
 * Bump que corresponde a una ventana de commits.
 *
 * Gana el mayor: un `feat` no importa si en la misma ventana hay un `!`. Los
 * `Merge …`, los mensajes sin forma convencional y los tipos que no publican
 * (docs, chore, ci, build, style, test, revert) quedan en `none`.
 *
 * @param {readonly string[]} messages
 * @returns {Bump}
 */
export function parseCommits(messages) {
  let bump = /** @type {Bump} */ ('none');

  for (const message of messages ?? []) {
    if (typeof message !== 'string') continue;

    const [subject = '', ...body] = message.split(/\r?\n/);
    const parsed = SUBJECT.exec(subject.trim());

    // Mensaje no convencional o merge: no dice nada sobre la versión. El footer
    // sólo cuenta dentro de un commit convencional (Conventional Commits v1.0).
    if (!parsed) continue;

    /** @type {Bump} */
    let current = 'none';

    if (parsed[3] === '!') current = 'major';
    else if (parsed[1] === 'feat') current = 'minor';
    else if (parsed[1] === 'fix' || parsed[1] === 'perf' || parsed[1] === 'refactor') {
      current = 'patch';
    }

    // El footer puede caer en cualquier línea del body, no sólo en la última.
    if (body.some((line) => BREAKING_FOOTER.test(line))) current = 'major';

    bump = BUMPS.indexOf(current) > BUMPS.indexOf(bump) ? current : bump;
  }

  return bump;
}

/** @returns {{major: number, minor: number, patch: number}} */
function splitVersion(value, label) {
  const match = typeof value === 'string' ? PLAIN_VERSION.exec(value) : null;

  if (!match) {
    throw new VersionGuardError(`${label} no tiene la forma X.Y.Z: ${JSON.stringify(value)}`);
  }

  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

/**
 * `v1.2.3` → `1.2.3`.
 *
 * Un tag que no sea plano (`v1.2.3-rc.1`) no es un error pelotudo del usuario:
 * `--sort=-v:refname` lo ordena arriba de `v1.2.3`, así que tomarlo como base
 * publicaría una versión que no es sucesora de nada.
 */
function plainTag(tag) {
  const match = typeof tag === 'string' ? PLAIN_TAG.exec(tag) : null;

  if (!match) {
    throw new VersionGuardError(
      `el último tag no es X.Y.Z plano: ${JSON.stringify(tag)}; ` +
        'un pre-release se resuelve a mano, no heredando su número',
    );
  }

  return `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}`;
}

function assertComponent(name, value, version) {
  if (!Number.isInteger(value) || value > 999) {
    throw new VersionGuardError(
      `el componente ${name} de ${version} supera 999: el versionCode los empaqueta en 3 dígitos`,
    );
  }
}

/** -1 | 0 | 1 sobre `X.Y.Z`. */
export function compareVersions(a, b) {
  const left = splitVersion(a, 'la versión');
  const right = splitVersion(b, 'la versión');

  for (const key of COMPONENTS) {
    if (left[key] !== right[key]) return left[key] < right[key] ? -1 : 1;
  }

  return 0;
}

/**
 * `major*1e6 + minor*1e3 + patch`.
 *
 * Aditivo y monótono: `0.2.0` (2000) siempre le gana a `0.1.99` (1099), que es
 * lo que Play exige para aceptar un upload. Sólo `minor` y `patch` se validan
 * acá: son los que se empaquetan en 3 dígitos (un 1000 se leería como el major
 * siguiente). El techo del major es decisión de `nextVersion`, no de la fórmula.
 */
export function toVersionCode(version) {
  const parts = splitVersion(version, 'la versión');
  for (const key of ['minor', 'patch']) assertComponent(key, parts[key], version);

  return parts.major * 1e6 + parts.minor * 1e3 + parts.patch;
}

/**
 * Versión a publicar.
 *
 * `version0 = lastTag ?? baseline` y
 * `bumpEfectivo = releaseType !== 'auto' ? releaseType : (lastTag ? bump : 'none')`.
 *
 * Sin tag no se bumpea nunca por `auto`: las 166 commits previas a la primera
 * publicación arrastran `!` y convertirían el debut en un `1.0.0` que nadie
 * decidió. Un `releaseType` explícito sí gana, incluso hacia abajo del derivado:
 * es la única señal humana del run.
 *
 * @param {{lastTag?: string|null, bump?: Bump, baseline?: string, releaseType?: string}} [options]
 * @returns {{version: string, versionCode: number, release: boolean, reason: string}}
 */
export function nextVersion({
  lastTag = null,
  bump = 'none',
  baseline = '0.1.0',
  releaseType = 'auto',
} = {}) {
  if (!BUMPS.includes(bump)) {
    throw new VersionGuardError(`bump inválido: ${JSON.stringify(bump)}`);
  }
  if (!RELEASE_TYPES.includes(releaseType)) {
    throw new VersionGuardError(
      `releaseType inválido: ${JSON.stringify(releaseType)}; esperaba ${RELEASE_TYPES.join('|')}`,
    );
  }

  const hasTag = lastTag !== null && lastTag !== undefined && lastTag !== '';
  const startVersion = hasTag ? plainTag(lastTag) : baseline;
  const start = splitVersion(startVersion, 'la versión base');

  const effective =
    releaseType !== 'auto' ? releaseType : hasTag ? bump : /** @type {Bump} */ ('none');

  if (effective === 'none') {
    return {
      version: startVersion,
      versionCode: toVersionCode(startVersion),
      // Sin tag siempre hay algo que publicar: el baseline es la primera subida.
      release: !hasTag,
      reason: hasTag
        ? `la ventana ${lastTag}..HEAD no tiene commits publicables`
        : `sin tag: primera publicación en el baseline ${baseline}`,
    };
  }

  const next = { ...start };
  if (effective === 'major') {
    next.major += 1;
    next.minor = 0;
    next.patch = 0;
  } else if (effective === 'minor') {
    next.minor += 1;
    next.patch = 0;
  } else {
    next.patch += 1;
  }

  const version = `${next.major}.${next.minor}.${next.patch}`;

  // 2100.0.0 es el techo de Play: 2100 * 1e6 = 2100000000, el versionCode máximo.
  if (next.major >= 2100) {
    throw new VersionGuardError(
      `la versión ${version} supera el versionCode máximo de Play (2100.0.0 = 2100000000)`,
    );
  }
  for (const key of COMPONENTS) assertComponent(key, next[key], version);

  // Post-condición: un release tiene que avanzar. Si no, el tag del run anterior
  // apunta a la misma versión y Play lo rechaza con el `.aab` ya compilado.
  if (hasTag && compareVersions(version, startVersion) <= 0) {
    throw new VersionGuardError(
      `la versión calculada ${version} no es mayor que el último tag ${lastTag}`,
    );
  }

  return {
    version,
    versionCode: toVersionCode(version),
    release: true,
    reason: `${effective} desde ${hasTag ? lastTag : `el baseline ${baseline}`}`,
  };
}
