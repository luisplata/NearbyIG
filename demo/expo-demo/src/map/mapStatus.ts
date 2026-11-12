/**
 * Fase del basemap real, como reductor puro y table-driven.
 *
 * `idle` → `loading` → `ready` | `failed`; `failed` es terminal dentro del
 * montaje (no hay reintentos automáticos). Sólo `ready` hace visible el canvas
 * y habilita la atribución del proveedor; en cualquier otro estado manda el
 * mapa ilustrado.
 */

export const MAP_PHASES = ['idle', 'loading', 'ready', 'failed'] as const;
export type MapPhase = (typeof MAP_PHASES)[number];

export type MapEvent = 'LOAD' | 'READY' | 'FAIL';

const TRANSITIONS: Record<MapPhase, Record<MapEvent, MapPhase>> = {
  idle: { LOAD: 'loading', READY: 'idle', FAIL: 'failed' },
  loading: { LOAD: 'loading', READY: 'ready', FAIL: 'failed' },
  ready: { LOAD: 'ready', READY: 'ready', FAIL: 'failed' },
  failed: { LOAD: 'failed', READY: 'failed', FAIL: 'failed' },
};

export function reduceMapStatus(phase: MapPhase, event: MapEvent): MapPhase {
  return TRANSITIONS[phase][event];
}

/** El canvas real (y la atribución del proveedor) sólo existen con tiles. */
export function showsRealTiles(phase: MapPhase): boolean {
  return phase === 'ready';
}
