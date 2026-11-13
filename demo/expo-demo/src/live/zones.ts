/**
 * Polígonos de las zonas demo, espejo de `contract/catalog/zones.json`.
 *
 * **Para qué.** El backend deriva la región de la **sesión**, nunca del punto:
 * `PUT /presence` con un punto de Bogotá sobre una sesión `mx` responde
 * `fallbackRequired` y no muda nada. Por eso el cliente necesita saber en qué
 * zona cae el punto **antes** de abrir sesión: si no, la única salida sería
 * adivinar la región, que es exactamente el defecto que este módulo elimina
 * (abrir en CDMX a alguien que está en Bogotá).
 *
 * **Por qué una copia y no leer el catálogo.** El bundle de Expo no sale de
 * `demo/expo-demo`: el contrato no está empaquetado. La copia es de 7 vértices
 * por zona y `zones.test.ts` la compara vértice a vértice contra el catálogo
 * congelado, igual que `basemap.test.ts` verifica los centroides. Si el catálogo
 * cambia, el test falla antes que la demo.
 *
 * **Qué NO hace.** No decide regiones (eso es `regions.ts`), no pide ubicación,
 * no guarda nada y no reemplaza la autoridad del server: si el mirror se
 * desvía, el `fallbackRequired` del `PUT /presence` sigue siendo la red.
 *
 * Orden de coordenadas: `[lng, lat]`, el mismo del catálogo (GeoJSON).
 */
export type GeoPointInput = { readonly lat: number; readonly lng: number };

export type DemoZonePolygon = {
  readonly zoneKey: string;
  /** Anillo cerrado del polígono, `[lng, lat]`. */
  readonly ring: readonly (readonly [number, number])[];
};

/** Copia literal de `contract/catalog/zones.json` (v0.2). */
export const DEMO_ZONE_POLYGONS: readonly DemoZonePolygon[] = [
  {
    zoneKey: 'bogota',
    ring: [
      [-74.185, 4.64],
      [-74.16, 4.76],
      [-74.09, 4.82],
      [-74.01, 4.74],
      [-74.025, 4.61],
      [-74.105, 4.56],
      [-74.17, 4.59],
      [-74.185, 4.64],
    ],
  },
  {
    zoneKey: 'cdmx',
    ring: [
      [-99.1915, 19.405],
      [-99.165, 19.485],
      [-99.09, 19.475],
      [-99.055, 19.395],
      [-99.085, 19.33],
      [-99.155, 19.335],
      [-99.1915, 19.405],
    ],
  },
];

/** Ray casting por anillo: el polígono demo es simple (sin agujeros). */
function insideRing(lng: number, lat: number, ring: DemoZonePolygon['ring']): boolean {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [xi, yi] = ring[index];
    const [xj, yj] = ring[previous];
    // Semirrecta hacia la derecha: cuenta los cruces de arista con la latitud del punto.
    const crosses = yi > lat !== yj > lat;
    if (crosses && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Zona demo que contiene el punto, o `null` si no cae en ninguna.
 *
 * `null` **no** es "usá la zona por defecto": es "no podemos ubicarte en una
 * ciudad del catálogo" y el llamador tiene que pedir la zona a mano. Un punto en
 * Buenos Aires cae acá, y así la app no manda coordenadas que el backend va a
 * rechazar.
 */
export function zoneForPoint(point: GeoPointInput): string | null {
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) {
    return null;
  }
  for (const zone of DEMO_ZONE_POLYGONS) {
    if (insideRing(point.lng, point.lat, zone.ring)) {
      return zone.zoneKey;
    }
  }
  return null;
}
