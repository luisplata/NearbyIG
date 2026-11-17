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
 * **Dos vacíos, no uno.** Sin filtros activos, la lista vacía significa "no hay
 * nadie en el radio": no hay nada que limpiar, así que el cartel no puede
 * ofrecer "Limpiar filtros". Con filtros activos sí: el CTA arregla lo que el
 * usuario puede arreglar. `filtered` viaja explícito para que la pantalla no
 * repita la regla de qué cuenta como filtro.
 *
 * Función pura a propósito: la demo no monta componentes en tests (no hay
 * renderer en el proyecto), así que la regla que se puede romper se testea acá y
 * la pantalla sólo la dibuja.
 */
export type DiscoveryLayout = 'radarMap' | 'list' | 'emptyList' | 'emptyDensity';

export function discoveryLayout(
  view: DemoView,
  profileCount: number,
  filtered: boolean,
): DiscoveryLayout {
  if (bodyFor(view) === 'radarMap') {
    return 'radarMap';
  }
  if (profileCount > 0) {
    return 'list';
  }
  return filtered ? 'emptyList' : 'emptyDensity';
}
