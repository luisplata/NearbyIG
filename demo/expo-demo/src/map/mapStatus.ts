/**
 * Fase del basemap real, como reductor puro y table-driven.
 *
 * `idle` → `loading` → `ready` | `failed`. `failed` **no** se revive con eventos
 * del mapa: sólo `RETRY`, que es el usuario pidiéndolo desde el chip. Un tile
 * lento, un símbolo roto o una fuente ausente **no** llegan acá: una vez que el
 * estilo cargó, esos errores se ignoran (ver `MapBasemap`), porque el mapa sigue
 * sirviendo y antes cualquier `error` lo apagaba hasta recargar.
 *
 * Sólo `ready` hace visible el canvas y habilita la atribución del proveedor; en
 * cualquier otro estado manda el mapa ilustrado.
 */

export const MAP_PHASES = ['idle', 'loading', 'ready', 'failed'] as const;
export type MapPhase = (typeof MAP_PHASES)[number];

export type MapEvent = 'LOAD' | 'READY' | 'FAIL' | 'RETRY';

const TRANSITIONS: Record<MapPhase, Record<MapEvent, MapPhase>> = {
  idle: { LOAD: 'loading', READY: 'idle', FAIL: 'failed', RETRY: 'idle' },
  loading: { LOAD: 'loading', READY: 'ready', FAIL: 'failed', RETRY: 'idle' },
  ready: { LOAD: 'ready', READY: 'ready', FAIL: 'failed', RETRY: 'ready' },
  failed: { LOAD: 'failed', READY: 'failed', FAIL: 'failed', RETRY: 'idle' },
};

export function reduceMapStatus(phase: MapPhase, event: MapEvent): MapPhase {
  return TRANSITIONS[phase][event];
}

/** El canvas real (y la atribución del proveedor) sólo existen con tiles. */
export function showsRealTiles(phase: MapPhase): boolean {
  return phase === 'ready';
}

/** El usuario puede reintentar sólo cuando el basemap se cayó. */
export function canRetryMap(phase: MapPhase): boolean {
  return phase === 'failed';
}
