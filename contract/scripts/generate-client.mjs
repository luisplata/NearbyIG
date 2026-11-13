#!/usr/bin/env node
/**
 * Genera el cliente TypeScript del contrato, byte a byte determinista.
 *
 * `contract/generated/api.ts` se **commitea**: es lo que S3 importa y lo que el
 * reviewer lee en el diff. Si el archivo se generara on-build no habría drift que
 * detectar nunca, así que el gate no sería un gate.
 *
 * Reglas de la salida:
 *  - header fijo, con la versión **instalada** de `openapi-typescript` (la que fija
 *    `package.json` de forma exacta) y el `x-contract-id` del spec;
 *  - LF, sin timestamps, sin rutas absolutas y sin nada que dependa de la máquina;
 *  - type-only: el archivo no importa nada ni ejecuta nada en runtime.
 *
 * Modos:
 *   (sin flags)   escribe `contract/generated/api.ts`
 *   --check       regenera en memoria y compara **bytes** con el commiteado
 *
 * `--check` es el gate primario. `git diff --exit-code` sigue en `contract:check`
 * como red secundaria: es el idioma que ya habla el repo.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import openapiTS, { astToString } from 'openapi-typescript';

import { CONTRACT_ROOT, SPEC_FILE, readYaml } from './lib/spec.mjs';

/** Salida, relativa a `contract/`. */
export const OUTPUT_PATH = 'generated/api.ts';
export const OUTPUT_FILE = resolve(CONTRACT_ROOT, OUTPUT_PATH);

/** Versión real del generador instalado; el header no puede mentir. */
export function generatorVersion() {
  const packageFile = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    'node_modules',
    'openapi-typescript',
    'package.json',
  );
  return JSON.parse(readFileSync(packageFile, 'utf8')).version;
}

/** Header fijo: mismo texto en toda máquina, sin fecha ni ruta absoluta. */
export function clientHeader({ version, contractId }) {
  return [
    '/**',
    ' * GENERATED FILE — do not edit.',
    ' *',
    ' * Source: contract/openapi.yaml',
    ` * Generator: openapi-typescript ${version} (pinned exact in package.json)`,
    ` * Contract: x-contract-id ${contractId}`,
    ' *',
    ' * Type-only client: no runtime code and no imports. Regenerate with',
    ' * `npm run contract:generate`. The drift gate is `npm run contract:generate:check`.',
    ' */',
    '',
    '',
  ].join('\n');
}

/** Texto completo del archivo generado, sin tocar disco. */
export async function generateClient() {
  const contractId = readYaml(SPEC_FILE).info?.['x-contract-id'];
  if (typeof contractId !== 'string' || contractId === '') {
    throw new Error('el contrato no declara info.x-contract-id');
  }

  const ast = await openapiTS(pathToFileURL(SPEC_FILE));
  const body = astToString(ast).replace(/\r\n/g, '\n');
  return clientHeader({ version: generatorVersion(), contractId }) + body;
}

/** Comprime el diff: primera línea distinta entre dos textos. */
function firstDifference(expected, actual) {
  const left = expected.split('\n');
  const right = actual.split('\n');
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    if (left[index] !== right[index]) {
      return { line: index + 1, expected: left[index] ?? '<fin>', actual: right[index] ?? '<fin>' };
    }
  }
  return null;
}

async function main() {
  const check = process.argv.slice(2).includes('--check');
  const text = await generateClient();
  const kib = (text.length / 1024).toFixed(1);

  if (!check) {
    mkdirSync(dirname(OUTPUT_FILE), { recursive: true });
    writeFileSync(OUTPUT_FILE, text, 'utf8');
    console.log(
      `✓ contract:generate — ${OUTPUT_PATH} · ${text.split('\n').length} líneas · ${kib} KiB · ` +
        `openapi-typescript ${generatorVersion()}`,
    );
    return;
  }

  let current;
  try {
    current = readFileSync(OUTPUT_FILE, 'utf8').replace(/\r\n/g, '\n');
  } catch {
    console.error(`✗ contract:generate:check — falta ${OUTPUT_PATH}. Corré \`npm run contract:generate\`.`);
    process.exit(1);
  }

  if (current === text) {
    console.log(`✓ contract:generate:check — ${OUTPUT_PATH} es byte-idéntico al regenerado (${kib} KiB).`);
    return;
  }

  const difference = firstDifference(text, current);
  console.error(`✗ contract:generate:check — ${OUTPUT_PATH} difiere del contrato.`);
  if (difference) {
    console.error(`  primera diferencia en la línea ${difference.line}:`);
    console.error(`    esperado: ${difference.expected.slice(0, 160)}`);
    console.error(`    en disco: ${difference.actual.slice(0, 160)}`);
  }
  console.error('  corré `npm run contract:generate` y commiteá el resultado (nunca edites el generado a mano)');
  process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  await main();
}
