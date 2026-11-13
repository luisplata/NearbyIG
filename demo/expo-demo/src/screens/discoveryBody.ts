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

/**
 * Qué se pinta en el cuerpo de descubrimiento con `profileCount` perfiles
 * visibles.
 *
 * El estado vacío es de la **lista**, no del radar: el radar sin puntos sigue
 * diciendo algo (los anillos, el barrido, el mapa de la zona y el radio elegido
 * son la respuesta "no hay nadie a 2 km"), y taparlo con un cartel convierte una
 * vista en un error. El contador del encabezado ya comunica el 0.
 *
 * Función pura a propósito: la demo no monta componentes en tests (no hay
 * renderer en el proyecto), así que la regla que se puede romper se testea acá y
 * la pantalla sólo la dibuja.
 */
export type DiscoveryLayout = 'radarMap' | 'list' | 'emptyList';

export function discoveryLayout(view: DemoView, profileCount: number): DiscoveryLayout {
  if (bodyFor(view) === 'radarMap') {
    return 'radarMap';
  }
  return profileCount === 0 ? 'emptyList' : 'list';
}
