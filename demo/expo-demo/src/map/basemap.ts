/**
 * Constantes puras del basemap de la demo: centros, timeout y derivación de zoom.
 * Nada de DOM, red ni estado: todo se puede testear en Node.
 *
 * **Centro = geografía de la región activa.** El basemap tiene que mostrar la
 * zona de la que hablan las distancias del radar: si la sesión es `mx` el mapa
 * es CDMX, si es `co` es Bogotá, y sin región (o en el dataset del build) es la
 * zona del guion, Buenos Aires. Un zoom con el cos(lat) de otra ciudad miente en
 * la escala, así que el centro viaja junto al cálculo y no como adorno.
 *
 * Privacidad: `DEMO_CENTER` y `ZONE_CENTERS` son constantes de código (el mismo
 * viewport para todos los visitantes). La ubicación real del usuario —cuando la
 * pide el modo live— sólo viaja al `PUT /presence`; acá no se lee ni se guarda.
 * La prohibición de `lat`/`lng` del validador aplica a `demo/shared/*.json`, no a
 * este módulo.
 */

/** Punto en grados decimales, con nombre. MapLibre lo quiere como `[lng, lat]`. */
export type LngLat = { readonly lon: number; readonly lat: number };

/** Plaza Serrano, Palermo: coherente con las etiquetas y distancias del guion. */
export const DEMO_CENTER: LngLat = { lon: -58.4306, lat: -34.5889 };

/**
 * Centro de cada zona demo, espejo de `contract/catalog/zones.json`.
 *
 * Es el centroide del polígono de la zona (shoelace sobre los vértices del
 * catálogo, redondeado a 4 decimales). No es un punto inventado ni el de una
 * dirección famosa: si el polígono cambia, este número cambia con él, y
 * `basemap.test.ts` verifica que cada centro caiga **dentro** de su polígono
 * leyendo el catálogo. `live/regions.ts` traduce `regionKey → zoneKey`.
 */
export const ZONE_CENTERS: Readonly<Record<string, LngLat>> = {
  cdmx: { lon: -99.124, lat: 19.4062 },
  bogota: { lon: -74.0974, lat: 4.6832 },
};

/** Zona desconocida o ausente: el centro del dataset del build, no un default mudo. */
export function centerForZone(zoneKey: string | null | undefined): LngLat {
  if (zoneKey === null || zoneKey === undefined) {
    return DEMO_CENTER;
  }
  return ZONE_CENTERS[zoneKey] ?? DEMO_CENTER;
}

/** Un solo intento por montaje: pasado este tiempo se abandona y queda el SVG. */
export const MAP_TIMEOUT_MS = 8000;

/** Rango de zoom del basemap (clamp de la función pura). */
export const MAP_ZOOM_RANGE = { min: 10, max: 16.5 } as const;

/**
 * Radio útil del radar: los anillos y los puntos usan el 46 % del lado
 * (`RadarSvg` RADIUS = 46, `ProfileDotLayer` factor 92). El basemap tiene que
 * mostrar exactamente ese radio para que el filtro y el mapa hablen de lo mismo.
 */
const RADAR_RADIUS_RATIO = 0.46;

/**
 * MapLibre proyecta el mundo con `worldSize = 512 * 2^zoom` (tileSize 512, ver
 * `tileSize*jt(zoom)` en `maplibre-gl.mjs`). Ojo: la fórmula clásica de tiles
 * (256) devuelve **un nivel de zoom más** y haría que el mapa muestre la mitad
 * del radio que declara el radar.
 */
const TILE_SIZE = 512;
const EARTH_CIRCUMFERENCE_M = 40075016.686;

/** Metros por píxel a ese zoom **en esa latitud** (el cos(lat) no es decorativo). */
export function metersPerPixel(zoom: number, center: LngLat = DEMO_CENTER): number {
  const world = TILE_SIZE * 2 ** zoom;
  return (EARTH_CIRCUMFERENCE_M * Math.cos((center.lat * Math.PI) / 180)) / world;
}

/**
 * Zoom que hace que `radiusM` ocupe el radio útil de un cuadrado de `sidePx`.
 * Puro, monótono no creciente en el radio y con clamp; `sidePx` 0 no divide.
 *
 * El cos(lat) del centro entra en la fórmula: a 19° (CDMX) el mismo radio ocupa
 * menos metros por píxel que a 34° (Buenos Aires), así que el zoom sube. Usar la
 * latitud de otra ciudad desalinearía anillos y cuadras.
 */
export function zoomForRadius(
  radiusM: number,
  sidePx: number,
  center: LngLat = DEMO_CENTER,
): number {
  if (!Number.isFinite(radiusM) || radiusM <= 0) return MAP_ZOOM_RANGE.max;
  if (!Number.isFinite(sidePx) || sidePx <= 0) return MAP_ZOOM_RANGE.min;

  const radiusPx = sidePx * RADAR_RADIUS_RATIO;
  const tangent = (EARTH_CIRCUMFERENCE_M * Math.cos((center.lat * Math.PI) / 180)) / TILE_SIZE;
  const zoom = Math.log2((tangent * radiusPx) / radiusM);
  return Math.min(MAP_ZOOM_RANGE.max, Math.max(MAP_ZOOM_RANGE.min, zoom));
}

/** Centro en el orden que espera MapLibre: `[lng, lat]`. */
export function centerLngLat(center: LngLat = DEMO_CENTER): [number, number] {
  return [center.lon, center.lat];
}
