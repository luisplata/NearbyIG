import { describe, expect, it } from 'vitest';

import {
  MAP_PHASES,
  canRetryMap,
  reduceMapStatus,
  showsRealTiles,
  type MapEvent,
  type MapPhase,
} from '../src/map/mapStatus';

/**
 * Reductor puro de la fase del basemap. La tabla es el contrato: un intento por
 * montaje, `failed` sólo se revive con `RETRY` (el chip del usuario) y `ready`
 * es la única fase con tiles reales.
 */
const EVENTS: MapEvent[] = ['LOAD', 'READY', 'FAIL', 'RETRY'];

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

  it('failed no se revive solo: LOG/READY/FAIL lo dejan igual', () => {
    for (const event of ['LOAD', 'READY', 'FAIL'] as const) {
      expect(reduceMapStatus('failed', event), event).toBe('failed');
    }
  });

  it('RETRY es la única salida de failed y vuelve a idle para remontar', () => {
    expect(reduceMapStatus('failed', 'RETRY')).toBe('idle');
    // Un RETRY con el mapa sano no lo apaga: no hay nada que reintentar.
    expect(reduceMapStatus('ready', 'RETRY')).toBe('ready');
    expect(reduceMapStatus('loading', 'RETRY')).toBe('idle');
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

describe('canRetryMap', () => {
  it('el reintento existe sólo con el basemap caído', () => {
    expect(MAP_PHASES.filter(canRetryMap)).toEqual(['failed']);
  });
});
