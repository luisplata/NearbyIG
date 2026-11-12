/**
 * Constantes puras del basemap de la demo: centro fijo, timeout y derivación de
 * zoom. Nada de DOM, red ni estado: todo se puede testear en Node.
 *
 * Privacidad: `DEMO_CENTER` es una constante de código (el mismo viewport para
 * todos los visitantes). No se lee geolocalización, permisos, IP, cookies ni
 * ningún otro dato del usuario. La prohibición de `lat`/`lng` del validador
 * aplica a `demo/shared/*.json`, no a este módulo.
 */

/** Plaza Serrano, Palermo: coherente con las etiquetas y distancias del guion. */
export const DEMO_CENTER = { lon: -58.4306, lat: -34.5889 } as const;

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

export function metersPerPixel(zoom: number, lat: number = DEMO_CENTER.lat): number {
  const world = TILE_SIZE * 2 ** zoom;
  return (EARTH_CIRCUMFERENCE_M * Math.cos((lat * Math.PI) / 180)) / world;
}

/**
 * Zoom que hace que `radiusM` ocupe el radio útil de un cuadrado de `sidePx`.
 * Puro, monótono no creciente en el radio y con clamp; `sidePx` 0 no divide.
 */
export function zoomForRadius(radiusM: number, sidePx: number): number {
  if (!Number.isFinite(radiusM) || radiusM <= 0) return MAP_ZOOM_RANGE.max;
  if (!Number.isFinite(sidePx) || sidePx <= 0) return MAP_ZOOM_RANGE.min;

  const radiusPx = sidePx * RADAR_RADIUS_RATIO;
  const tangent = (EARTH_CIRCUMFERENCE_M * Math.cos((DEMO_CENTER.lat * Math.PI) / 180)) / TILE_SIZE;
  const zoom = Math.log2((tangent * radiusPx) / radiusM);
  return Math.min(MAP_ZOOM_RANGE.max, Math.max(MAP_ZOOM_RANGE.min, zoom));
}

/** Centro en el orden que espera MapLibre: `[lng, lat]`. */
export function centerLngLat(): [number, number] {
  return [DEMO_CENTER.lon, DEMO_CENTER.lat];
}
