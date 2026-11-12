import type { DemoView } from '../state/types';

/**
 * Mapeo puro vista → cuerpo de descubrimiento. `radar` y el reservado `map`
 * comparten la misma composición; nunca existe un cuerpo sólo-mapa.
 */
export type DiscoveryBody = 'radarMap' | 'list';

export function bodyFor(view: DemoView): DiscoveryBody {
  return view === 'list' ? 'list' : 'radarMap';
}

/** `map` sigue siendo un valor interno del contrato, fuera de la navegación. */
export function isReservedMapView(view: DemoView): boolean {
  return view === 'map';
}
