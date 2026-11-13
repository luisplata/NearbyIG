#!/usr/bin/env node
/**
 * Deriva `contract/event/sample-log.json` del catálogo.
 *
 * El log no es un fixture suelto: es el catálogo proyectado en eventos. Cada
 * entrada referencia un perfil real de `catalog/profiles.*.json` y copia sus
 * valores (`distanceM`/`bearingDeg` para `profile.moved`, `online` para
 * `profile.presence`). Si el catálogo cambia, el log cambia; y como el archivo se
 * commitea, `events-contract.test.mjs` compara bytes y falla hasta que se
 * regenere. Ese es el `event-log.mjs` de la task 5.6 que quedó pendiente en PR3.
 *
 * El **seed fijo** es la agenda, no un PRNG:
 *  - `TRACK` fija cuántos eventos emite cada región (la asimetría es deliberada:
 *    mx y co no tienen el mismo volumen y el replay no puede asumir que empatan);
 *  - el perfil de la posición `n` es `profiles[(n - 1) % 10]`, siempre en el orden
 *    natural del seed (`regionKey`, `demoSlot`);
 *  - el tipo sale del `demoSlot` (3, 6, 9 → `profile.presence`), así que la
 *    mezcla también se deriva del dato y no de una lista escrita a mano;
 *  - `occurredAt` arranca en una constante y avanza un segundo por evento, salvo
 *    el quinto de `mx`, que va **10 s antes**: el fixture prueba que el reloj no
 *    ordena (el orden lo da `seq`).
 *
 * Lo que se congela a propósito, porque el contrato de eventos de PR3 lo exige:
 *  - 40 entradas en total;
 *  - un duplicado **exacto** de `mx:000000000007`, en la posición siguiente;
 *  - 39 `seq` únicos (24 de mx + 15 de co).
 *
 * Modos:
 *   (sin flags)   escribe `contract/event/sample-log.json`
 *   --check       compara lo derivado con lo commiteado          → exit 1 si hay drift
 *   --dry-run     imprime la tabla sin escribir nada             → exit 0
 *   --out <dir>   escribe en otro directorio (tests)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { formatEventId } from './lib/events.mjs';
import { CONTRACT_ROOT, loadSpec } from './lib/spec.mjs';

export const LOG_PATH = 'event/sample-log.json';
export const LOG_VERSION = 1;

/** Base de `occurredAt`. Constante: el log no depende del reloj de la máquina. */
export const BASE_TIME = '2026-11-12T18:00:00.000Z';
const BASE_EPOCH_MS = Date.parse(BASE_TIME);

/**
 * Agenda por región, en el orden en que viaja al archivo. `mx` va primero porque
 * el fixture de PR3 abre con `mx:000000000001`; el orden no se ordena como el del
 * seed porque esto es un log (secuencia), no un catálogo (tabla). mx duplica el
 * volumen de co a propósito.
 */
export const TRACK = [
  { events: 24, regionKey: 'mx' },
  { events: 15, regionKey: 'co' },
];

/** El evento que `mx` entrega dos veces (el server puede reentregar). */
export const DUPLICATE_ID = 'mx:000000000007';

/** El evento con `occurredAt` anterior al de su predecesor: el reloj no ordena. */
export const INVERTED_ID = 'mx:000000000005';

/** Perfiles del catálogo para una región, en orden natural (`demoSlot`). */
function profilesOf(regionKey, root) {
  const rows = JSON.parse(readFileSync(join(root, `catalog/profiles.${regionKey}.json`), 'utf8'));
  return [...rows].sort((left, right) => left.demoSlot - right.demoSlot);
}

/** `profile.presence` para los slots múltiplos de 3; el resto, `profile.moved`. */
const typeFor = (profile) => (profile.demoSlot % 3 === 0 ? 'profile.presence' : 'profile.moved');

/** Payload mínimo con el que la demo pinta el evento, tomado del perfil. */
function payloadFor(profile, type) {
  return type === 'profile.moved'
    ? { bearingDeg: profile.bearingDeg, distanceM: profile.distanceM, profileId: profile.profileId }
    : { online: profile.online, profileId: profile.profileId };
}

/** El log completo, sin tocar disco (salvo leer el catálogo de `root`). */
export function computeEventLog({ root = CONTRACT_ROOT } = {}) {
  const { spec } = loadSpec();
  const contractId = spec.info?.['x-contract-id'];
  if (typeof contractId !== 'string' || contractId === '') {
    throw new Error('computeEventLog necesita el x-contract-id del contrato');
  }

  // Orden natural de las regiones: el mismo que usa el seed: no aplica acá,
  // el log es una secuencia y su orden lo fija `TRACK`.
  const log = [];
  let offset = 0;

  for (const { events, regionKey } of TRACK) {
    const profiles = profilesOf(regionKey, root);
    if (profiles.length === 0) {
      throw new Error(`${regionKey}: el catálogo no tiene perfiles`);
    }

    for (let seq = 1; seq <= events; seq += 1) {
      const profile = profiles[(seq - 1) % profiles.length];
      const type = typeFor(profile);
      const id = formatEventId(regionKey, seq);
      const seconds = id === INVERTED_ID ? -10 : offset;
      const event = {
        id,
        occurredAt: new Date(BASE_EPOCH_MS + seconds * 1000).toISOString(),
        payload: payloadFor(profile, type),
        type,
      };

      log.push(event);
      if (id === DUPLICATE_ID) log.push(structuredClone(event));
      offset += 1;
    }
  }

  const text = `[\n${log.map((event) => JSON.stringify(event)).join(',\n')}\n]\n`;
  return { contractId, log, text };
}

/** Escribe el log bajo `root` (por default, `contract/`). */
export function writeEventLog(result, root = CONTRACT_ROOT) {
  const file = join(root, LOG_PATH);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, result.text, 'utf8');
  return file;
}

/** Compara lo derivado con lo commiteado: `sin cambios` | `drift` | `nuevo`. */
export function compareWithDisk(result, root = CONTRACT_ROOT) {
  const file = join(root, LOG_PATH);
  const current = existsSync(file) ? readFileSync(file, 'utf8').replace(/\r\n/g, '\n') : null;
  const status = current === null ? 'nuevo' : current === result.text ? 'sin cambios' : 'drift';
  return [{ path: LOG_PATH, rows: result.log.length, status }];
}

function main() {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const dryRun = args.includes('--dry-run');
  const outIndex = args.indexOf('--out');
  const outRoot = outIndex === -1 ? CONTRACT_ROOT : resolve(args[outIndex + 1] ?? '');

  if (check && dryRun) {
    console.error('✗ contract:event-log — --check y --dry-run no se combinan');
    process.exit(1);
  }

  const result = computeEventLog();
  const rows = compareWithDisk(result).map((row) => ({ ...row, path: row.path.padEnd(21) }));
  const table = rows.map((row) => `  ${row.path}  ${String(row.rows).padStart(2)}  ${row.status}`).join('\n');
  const header = `▶ event log v${LOG_VERSION} · contrato ${result.contractId}`;

  if (dryRun) {
    console.log(`${header} (dry-run: no se escribe nada)`);
    console.log(table);
    return;
  }

  if (check) {
    console.log(header);
    console.log(table);
    if (rows.some((row) => row.status !== 'sin cambios')) {
      console.error('\n✗ contract:event-log:check — el log commiteado no es el derivado del catálogo.');
      console.error('  corré `npm run contract:event-log` y commiteá el resultado');
      process.exit(1);
    }
    console.log('\n✓ el log commiteado es el derivado del catálogo.');
    return;
  }

  const target = relative(CONTRACT_ROOT, outRoot).split('\\').join('/') || '.';
  console.log(`${header} → ${target}`);
  console.log(table);
  writeEventLog(result, outRoot);
  console.log('\n✓ contract:event-log verde: el log se regeneró desde el catálogo.');
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
