#!/usr/bin/env node
/**
 * Imprime la versión a publicar, calculada desde los tags y los commits.
 *
 * Formato de salida: `key=value`, una por línea (version, version_code, release,
 * last_tag, reason). Es el formato nativo de `$GITHUB_OUTPUT` y se lee a ojo en
 * el log del run; un JSON obligaría a `jq` en el runner para lo mismo.
 *
 * Uso: node scripts/version.mjs [--print] [--release-type=auto|patch|minor|major]
 *                               [--baseline=0.1.0]
 *
 * Códigos de salida (el workflow los distingue):
 *   0  hay versión y se puede publicar
 *   1  error de uso o del entorno (git, origen)
 *   2  no hay nada que publicar: el job de release no debe compilar
 *   3  guarda de versión: tag ya publicado, componente desbordado, tag no plano
 *
 * Por qué no hay dependencias: este script corre en el paso 8 del workflow,
 * antes de `npm ci`. Si necesitara un paquete, un fallo de instalación se
 * confundiría con un fallo de versionado.
 */

import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { VersionGuardError, nextVersion, parseCommits } from './lib/version.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const RELEASE_TYPES = ['auto', 'patch', 'minor', 'major'];

/** Record separator: separa commits en `git log`, no líneas. */
const RECORD_SEPARATOR = '\x1e';

class UsageError extends Error {}

function parseArgs(argv) {
  const options = { print: false, releaseType: 'auto', baseline: '0.1.0' };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];

    if (arg === '--print') {
      options.print = true;
      continue;
    }

    const flag = /^--(release-type|baseline)(?:=(.*))?$/.exec(arg);
    if (!flag) throw new UsageError(`opción desconocida: ${arg}`);

    const [, name, inline] = flag;
    const value = inline ?? argv[++index];
    if (value === undefined || value === '') {
      throw new UsageError(`--${name} necesita un valor`);
    }

    if (name === 'release-type') options.releaseType = value;
    else options.baseline = value;
  }

  if (!RELEASE_TYPES.includes(options.releaseType)) {
    throw new UsageError(
      `--release-type inválido: ${options.releaseType}; esperaba ${RELEASE_TYPES.join('|')}`,
    );
  }

  return options;
}

function git(args) {
  return execFileSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    // stderr a pipe: un fallo de git no debe ensuciar la salida `key=value`.
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

/** Último tag `v*` alcanzable desde HEAD, o `null` si no hay ninguno. */
function lastTag() {
  // `--merged HEAD` evita un tag de una rama sin mergear: `git log tag..HEAD`
  // fallaría con "unknown revision" o restaría commits que nunca van a publicarse.
  const tags = git(['tag', '--list', 'v*', '--merged', 'HEAD', '--sort=-v:refname']);
  return tags.split('\n')[0]?.trim() || null;
}

/**
 * Mensajes de los commits de la ventana.
 *
 * `%s%n%b%x1e` es obligatorio: sin el separador, el body de un commit se pega al
 * subject del siguiente y la ventana entera se parsea como UN mensaje —con lo
 * que un solo `docs:` al final tapa un `feat:` del medio.
 */
function windowMessages(tag) {
  if (!tag) return [];

  const log = git([
    'log',
    `${tag}..HEAD`,
    '--no-merges',
    `--pretty=format:%s%n%b%x1e`,
  ]);

  return log
    .split(RECORD_SEPARATOR)
    .map((message) => message.trim())
    .filter(Boolean);
}

/** ¿Ya existe `refs/tags/<tag>` en origin? `--exit-code` da 2 cuando no está. */
function remoteTagExists(tag) {
  try {
    execFileSync('git', ['ls-remote', '--exit-code', '--tags', 'origin', `refs/tags/${tag}`], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return true;
  } catch (error) {
    // 2 = no hay refs que matcheen. Cualquier otro código es red/origen, y eso
    // no es una guarda de versión: que falle como error de entorno.
    if (error.status === 2) return false;
    throw error;
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const tag = lastTag();
  const bump = parseCommits(windowMessages(tag));
  const result = nextVersion({
    lastTag: tag,
    bump,
    baseline: options.baseline,
    releaseType: options.releaseType,
  });

  if (result.release && remoteTagExists(`v${result.version}`)) {
    // El tag ya está publicado: subir el mismo versionCode otra vez no aporta
    // nada y el Release quedaría duplicado.
    throw new VersionGuardError(
      `el tag v${result.version} ya existe en origin: no se republica la misma versión`,
    );
  }

  const lines = [
    `version=${result.version}`,
    `version_code=${result.versionCode}`,
    `release=${result.release}`,
    `last_tag=${tag ?? ''}`,
    `reason=${result.reason}`,
  ];

  console.log(lines.join('\n'));

  // `--print` es para la terminal: no ensucia el `$GITHUB_OUTPUT` de un run.
  if (!options.print && process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`);
  }

  return result.release ? 0 : 2;
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(`[version] ${error.message}`);
  // Guarda de versión ≠ bug: el workflow lo distingue para no compilar ni publicar.
  process.exitCode = error instanceof VersionGuardError ? 3 : 1;
}
