import { describe, expect, it } from 'vitest';

import { MAP_PHASES, reduceMapStatus, showsRealTiles, type MapEvent, type MapPhase } from '../src/map/mapStatus';

/**
 * Reductor puro de la fase del basemap. La tabla es el contrato: un solo
 * intento, `failed` terminal y `ready` la única fase con tiles reales.
 */
const EVENTS: MapEvent[] = ['LOAD', 'READY', 'FAIL'];

describe('reduceMapStatus', () => {
  it('idle → loading → ready', () => {
    const loading = reduceMapStatus('idle', 'LOAD');
    expect(loading).toBe('loading');
    expect(reduceMapStatus(loading, 'READY')).toBe('ready');
  });

  it('READY en idle se ignora', () => {
    expect(reduceMapStatus('idle', 'READY')).toBe('idle');
  });

  it('FAIL desde loading y desde ready cae en failed', () => {
    expect(reduceMapStatus('loading', 'FAIL')).toBe('failed');
    expect(reduceMapStatus('ready', 'FAIL')).toBe('failed');
  });

  it('failed es terminal: ningún evento lo revive', () => {
    for (const event of EVENTS) {
      expect(reduceMapStatus('failed', event)).toBe('failed');
    }
  });

  it('ready no vuelve a loading ni pierde el canvas con LOAD duplicado', () => {
    expect(reduceMapStatus('ready', 'LOAD')).toBe('ready');
    expect(reduceMapStatus('ready', 'READY')).toBe('ready');
  });

  it('todas las fases × eventos están definidas', () => {
    for (const phase of MAP_PHASES) {
      for (const event of EVENTS) {
        expect(MAP_PHASES).toContain(reduceMapStatus(phase, event));
      }
    }
  });
});

describe('showsRealTiles', () => {
  it('sólo ready muestra los tiles reales (y la atribución)', () => {
    expect(MAP_PHASES.map((phase: MapPhase) => showsRealTiles(phase))).toEqual([
      false,
      false,
      true,
      false,
    ]);
  });
});
