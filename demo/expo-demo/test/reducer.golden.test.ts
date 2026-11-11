import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { datasetId, schemaVersion } from '../src/generated/dataset';
import { ACTION_TYPES, actionFromJson, type DemoAction } from '../src/state/actions';
import { DIGEST_LENGTH, projectState } from '../src/state/projection';
import { initialState, reduce } from '../src/state/reducer';
import type { DemoActionType } from '../src/state/actions';
import type { DemoEffectKind, DemoState } from '../src/state/types';

type GoldenStep = { n: number; action: Record<string, unknown>; note?: string };
type GoldenDigest = { n: number; digest: string };

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(new URL(`./golden/${name}`, import.meta.url), 'utf8')) as T;
}

const steps = readJson<{ steps: GoldenStep[] }>('steps.json').steps;
const expected = readJson<{ datasetId: string; digestLength: number; steps: GoldenDigest[] }>(
  'expected.json',
);

/** `sha256(projection)[0..12]`, igual que `digestOf` en la app Flutter. */
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

describe('golden de paridad', () => {
  it('expected.json pertenece al dataset sincronizado', () => {
    expect(expected.datasetId).toBe(datasetId);
    expect(schemaVersion).toBe(1);
    expect(expected.digestLength).toBe(DIGEST_LENGTH);
  });

  it('la secuencia ejercita las 26 acciones y los 4 timers del guion', () => {
    const actions = steps.map((step) => actionFromJson(step.action));
    const types = new Set<DemoActionType>(actions.map((action) => action.type));
    expect([...types].sort()).toEqual([...ACTION_TYPES].sort());
    expect(types.size).toBe(26);

    const timerKinds = new Set<DemoEffectKind>(
      actions.flatMap((action) => (action.type === 'TIMER_FIRED' ? [action.kind] : [])),
    );
    expect([...timerKinds].sort()).toEqual(['incomingPing', 'match', 'reveal', 'typing']);
    expect(actions.some((action) => action.type === 'DISMISS_TOAST')).toBe(true);
  });

  it('el digest de cada paso coincide con el Dart de expected.json', () => {
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
    // 17: segundo ping al mismo perfil; 28: mensaje con typing activo;
    // 38: ping en modo fantasma.
    expect(byNumber.get(17)).toBe(byNumber.get(16));
    expect(byNumber.get(28)).toBe(byNumber.get(27));
    expect(byNumber.get(38)).toBe(byNumber.get(37));
  });

  it('RESET vuelve al estado inicial sin efectos pendientes', () => {
    const result = reduce(initialState(), { type: 'RESET' });
    expect(result.effects).toEqual([]);
    expect(projectState(result.state)).toBe(projectState(initialState()));
  });
});
