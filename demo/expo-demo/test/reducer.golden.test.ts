import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { datasetId, schemaVersion } from '../src/generated/dataset';
import { ACTION_TYPES, actionFromJson, type DemoAction } from '../src/state/actions';
import { DIGEST_LENGTH, projectState } from '../src/state/projection';
import { initialState, reduce } from '../src/state/reducer';
import type { DemoActionType } from '../src/state/actions';
import type { DemoEffectKind, DemoState } from '../src/state/types';

type GoldenStep = { n: number; action: Record<string, unknown>; note?: string };
type GoldenDigest = { n: number; digest: string };
type GoldenFile = {
  datasetId: string;
  digestLength: number;
  projectionVersion: number;
  schemaVersion: number;
  steps: GoldenDigest[];
};

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(new URL(`./golden/${name}`, import.meta.url), 'utf8')) as T;
}

const stepsFile = readJson<{ projectionVersion: number; steps: GoldenStep[] }>('steps.json');
const steps = stepsFile.steps;
/** El fixture que consume este test: `npm run sync` copia `shared/golden/` acá. */
let expected = readJson<GoldenFile>('expected.json');

/** Fuente única: el writer escribe acá, no en la copia sincronizada. */
const sharedGolden = fileURLToPath(new URL('../../shared/golden/expected.json', import.meta.url));

/** Sólo `npm run golden:update` (que exporta la variable) escribe el fixture. */
const update = process.env.UPDATE_GOLDEN === '1';

/**
 * Archivo cuyo formato valida el test: en modo grabación es el que el writer acaba
 * de escribir; si validáramos la copia sincronizada, estaríamos leyendo bytes viejos
 * (la copia recién se actualiza en el `npm run sync` siguiente).
 */
const goldenPath = update
  ? sharedGolden
  : fileURLToPath(new URL('./golden/expected.json', import.meta.url));

/**
 * `sha256(projection)[0..12]` sobre la proyección canónica de `state-machine.md` §8.
 * Es el digest que congela `expected.json` paso a paso.
 */
function digestOf(state: DemoState): string {
  return createHash('sha256').update(projectState(state), 'utf8').digest('hex').slice(0, DIGEST_LENGTH);
}

function expectedByNumber(n: number): string {
  const entry = expected.steps.find((step) => step.n === n);
  if (entry === undefined) {
    throw new Error(`expected.json no tiene el paso ${n}`);
  }
  return entry.digest;
}

function applySteps(): { state: DemoState; byNumber: Map<number, string> } {
  let state = initialState();
  const byNumber = new Map<number, string>();
  for (const step of steps) {
    const action: DemoAction = actionFromJson(step.action);
    state = reduce(state, action).state;
    byNumber.set(step.n, digestOf(state));
  }
  return { state, byNumber };
}

/**
 * Formato del golden: UTF-8 sin BOM, LF, dos espacios de indentación y salto
 * final. Es `JSON.stringify(value, null, 2)` tal cual, sin formatter de por
 * medio: cualquier otra herramienta podría mover bytes y el fixture es
 * byte-comparado. El orden de las claves es el del literal que arma
 * `recompute()`.
 */
function serializeGolden(file: GoldenFile): string {
  return JSON.stringify(file, null, 2) + '\n';
}

function recompute(): GoldenFile {
  let state = initialState();
  const digests: GoldenDigest[] = [];
  for (const step of steps) {
    state = reduce(state, actionFromJson(step.action)).state;
    digests.push({ n: step.n, digest: digestOf(state) });
  }
  return {
    datasetId,
    digestLength: DIGEST_LENGTH,
    projectionVersion: stepsFile.projectionVersion,
    schemaVersion,
    steps: digests,
  };
}

if (update) {
  const next = recompute();
  mkdirSync(dirname(sharedGolden), { recursive: true });
  writeFileSync(sharedGolden, serializeGolden(next), 'utf8');
  // Una escritura CRLF en Windows cambiaría el archivo sin mover un solo digest:
  // se valida el archivo RELAIDO, nunca los bytes que quedaron en memoria. Si el
  // writer pasara a `os.EOL` u otra indentación, la reserialización de lo leído no
  // coincidiría con lo leído y el fallo apuntaría al writer, no al `git diff` del CI.
  const written = readFileSync(sharedGolden, 'utf8');
  if (written !== JSON.stringify(JSON.parse(written), null, 2) + '\n') {
    throw new Error('expected.json no quedó byte-estable (¿fin de línea CRLF?)');
  }
  if (JSON.stringify(JSON.parse(written)) !== JSON.stringify(next)) {
    throw new Error('expected.json en disco no coincide con el golden recalculado');
  }
  // Los asserts de abajo corren contra lo recién escrito: el run que regenera es el
  // único lugar donde todavía se verifican las 27 acciones, los guards y el RESET.
  expected = next;
  console.log(`[golden] actualizado: ${sharedGolden}`);
}

describe('golden de regresión del reducer Expo', () => {
  it('expected.json pertenece al dataset sincronizado', () => {
    expect(expected.datasetId).toBe(datasetId);
    expect(schemaVersion).toBe(2);
    expect(expected.digestLength).toBe(DIGEST_LENGTH);
    expect(expected.projectionVersion).toBe(stepsFile.projectionVersion);
  });

  it('expected.json es byte-estable: LF, dos espacios y salto final', () => {
    // Se relee de disco acá, después del bloque de grabación: el pin de formato tiene
    // que mirar el archivo que quedó, no una foto tomada antes de escribir. El assert
    // compara los bytes del disco contra su propia reserialización, así que un
    // `os.EOL` que se cuele en el writer mueve la aguja de verdad.
    const goldenRaw = readFileSync(goldenPath, 'utf8');
    expect(goldenRaw).not.toContain('\r');
    expect(goldenRaw).toBe(JSON.stringify(JSON.parse(goldenRaw), null, 2) + '\n');
  });

  it('la secuencia ejercita las 27 acciones y los 4 timers del guion', () => {
    const actions = steps.map((step) => actionFromJson(step.action));
    const types = new Set<DemoActionType>(actions.map((action) => action.type));
    expect([...types].sort()).toEqual([...ACTION_TYPES].sort());
    expect(types.size).toBe(27);

    const timerKinds = new Set<DemoEffectKind>(
      actions.flatMap((action) => (action.type === 'TIMER_FIRED' ? [action.kind] : [])),
    );
    expect([...timerKinds].sort()).toEqual(['incomingPing', 'match', 'reveal', 'typing']);
    expect(actions.some((action) => action.type === 'DISMISS_TOAST')).toBe(true);
  });

  it('el digest de cada paso coincide con expected.json', () => {
    expect(expected.steps.length).toBe(steps.length);
    let state = initialState();
    for (const step of steps) {
      state = reduce(state, actionFromJson(step.action)).state;
      expect(digestOf(state), `paso ${step.n}: ${step.note ?? ''}`).toBe(expectedByNumber(step.n));
    }
    expect(projectState(state)).toBe(projectState(initialState()));
  });

  it('los guards del guion son no-op (mismo digest que el paso anterior)', () => {
    const { byNumber } = applySteps();
    // 17: segundo ping al mismo perfil; 29: mensaje con typing activo;
    // 39: ping en modo fantasma.
    expect(byNumber.get(17)).toBe(byNumber.get(16));
    expect(byNumber.get(29)).toBe(byNumber.get(28));
    expect(byNumber.get(39)).toBe(byNumber.get(38));
  });

  it('abrir el centro marca todo leído y es idempotente', () => {
    let state = initialState();
    state = reduce(state, { type: 'TIMER_FIRED', kind: 'incomingPing', id: 'p07' }).state;
    state = reduce(state, { type: 'OPEN_OVERLAY', overlay: 'notifications' }).state;
    expect(state.notifications.every((notification) => !notification.read)).toBe(true);

    state = reduce(state, { type: 'MARK_NOTIFICATIONS_READ' }).state;
    expect(state.notifications.length).toBeGreaterThan(0);
    expect(state.notifications.every((notification) => notification.read)).toBe(true);

    const again = reduce(state, { type: 'MARK_NOTIFICATIONS_READ' });
    expect(again.effects).toEqual([]);
    expect(projectState(again.state)).toBe(projectState(state));
  });

  it('RESET vuelve al estado inicial sin efectos pendientes', () => {
    const result = reduce(initialState(), { type: 'RESET' });
    expect(result.effects).toEqual([]);
    expect(projectState(result.state)).toBe(projectState(initialState()));
  });
});
