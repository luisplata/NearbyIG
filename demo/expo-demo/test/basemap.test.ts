import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  DEMO_CENTER,
  MAP_TIMEOUT_MS,
  MAP_ZOOM_RANGE,
  ZONE_CENTERS,
  centerForZone,
  centerLngLat,
  metersPerPixel,
  zoomForRadius,
} from '../src/map/basemap';
import { centerForRegion } from '../src/live/regions';

/**
 * Derivación de zoom: pura (sin DOM ni red), monótona y con clamp.
 *
 * `zoomForRadius` usa la proyección real de MapLibre (`worldSize = 512 * 2^z`).
 * Ojo con la fórmula clásica de tiles de 256 px: devuelve **un nivel más** y el
 * mapa terminaría mostrando la mitad del radio que declara el radar. Por eso el
 * invariante que fija este test es físico —"el radio útil del cuadrado son
 * `radiusM` metros"— y no una banda de zoom copiada de una tabla.
 *
 * **Latitud.** El invariante se verifica en dos ciudades: CDMX (19°) y Buenos
 * Aires (-34°). Si el cos(lat) se comiera el centro y quedara fijo, uno de los
 * dos fallaría por varios metros.
 */
const RADAR_RADIUS_RATIO = 0.46;
const SIDE = 400;

const CDMX = ZONE_CENTERS['cdmx'];
const BOGOTA = ZONE_CENTERS['bogota'];

describe('zoomForRadius', () => {
  it('5 km sobre 400 px cae en la banda esperada', () => {
    const zoom = zoomForRadius(5000, SIDE);
    expect(zoom).toBeCloseTo(11.21, 1);
  });

  it('500 m sobre 400 px cae en la banda esperada', () => {
    const zoom = zoomForRadius(500, SIDE);
    expect(zoom).toBeCloseTo(14.53, 1);
  });

  it('5000 m sobre 320 px y sobre 800 px son monótonos en el lado', () => {
    expect(zoomForRadius(5000, 320)).toBeCloseTo(10.89, 1);
    // Más lado, más zoom para el mismo radio.
    expect(zoomForRadius(5000, 800)).toBeGreaterThan(zoomForRadius(5000, 320));
  });

  it('es monótona no creciente en el radio', () => {
    const radii = [200, 500, 1000, 2000, 5000];
    const zooms = radii.map((radius) => zoomForRadius(radius, SIDE));
    for (let index = 1; index < zooms.length; index += 1) {
      expect(zooms[index]).toBeLessThanOrEqual(zooms[index - 1]);
    }
  });

  it('el radio útil del cuadrado son exactamente radiusM metros', () => {
    for (const radius of [200, 500, 2000, 5000]) {
      for (const side of [320, 400, 768]) {
        const zoom = zoomForRadius(radius, side);
        // Sólo vale donde el zoom no está clampeado.
        if (zoom === MAP_ZOOM_RANGE.min || zoom === MAP_ZOOM_RANGE.max) continue;
        const meters = metersPerPixel(zoom) * side * RADAR_RADIUS_RATIO;
        expect(meters).toBeCloseTo(radius, 0);
      }
    }
  });

  it('respeta el clamp y no divide por cero', () => {
    expect(zoomForRadius(50, SIDE)).toBe(MAP_ZOOM_RANGE.max);
    expect(zoomForRadius(5000, 0)).toBe(MAP_ZOOM_RANGE.min);
    expect(zoomForRadius(5000, Number.NaN)).toBe(MAP_ZOOM_RANGE.min);
    expect(zoomForRadius(0, SIDE)).toBe(MAP_ZOOM_RANGE.max);
    expect(zoomForRadius(-100, SIDE)).toBe(MAP_ZOOM_RANGE.max);
    for (const zoom of [zoomForRadius(200, 1440), zoomForRadius(5000, 100)]) {
      expect(zoom).toBeGreaterThanOrEqual(MAP_ZOOM_RANGE.min);
      expect(zoom).toBeLessThanOrEqual(MAP_ZOOM_RANGE.max);
      expect(Number.isFinite(zoom)).toBe(true);
    }
  });

  it('es determinista: mismo input, mismo output', () => {
    expect(zoomForRadius(2000, SIDE)).toBe(zoomForRadius(2000, SIDE));
  });
});

describe('el zoom depende de la latitud del centro', () => {
  it('el mismo radio da más zoom cerca del ecuador', () => {
    const cdmx = zoomForRadius(2000, SIDE, CDMX);
    const bogota = zoomForRadius(2000, SIDE, BOGOTA);
    const buenosAires = zoomForRadius(2000, SIDE);
    // cos(4.7°) > cos(19.4°) > cos(-34.6°): cuanto más cerca del ecuador, más
    // metros por píxel a igual zoom, así que para el mismo radio hace falta más.
    expect(bogota).toBeGreaterThan(cdmx);
    expect(cdmx).toBeGreaterThan(buenosAires);
    expect(zoomForRadius(2000, SIDE, CDMX)).not.toBeCloseTo(buenosAires, 3);
  });

  it('la diferencia de zoom es exactamente la del cos(lat) entre las dos ciudades', () => {
    // log2(cos(latA) / cos(latB)) es la distancia en niveles de zoom que mete la
    // latitud. Si el centro se ignorara (cos fijo), el delta sería 0.
    const expected = Math.log2(
      Math.cos((BOGOTA.lat * Math.PI) / 180) / Math.cos((DEMO_CENTER.lat * Math.PI) / 180),
    );
    const delta = zoomForRadius(2000, SIDE, BOGOTA) - zoomForRadius(2000, SIDE);
    expect(delta).toBeCloseTo(expected, 6);
    expect(delta).toBeGreaterThan(0.2);
  });

  it('el invariante físico se cumple en las dos latitudes', () => {
    for (const center of [DEMO_CENTER, CDMX, BOGOTA]) {
      for (const radius of [500, 2000, 5000]) {
        const zoom = zoomForRadius(radius, SIDE, center);
        if (zoom === MAP_ZOOM_RANGE.min || zoom === MAP_ZOOM_RANGE.max) continue;
        const meters = metersPerPixel(zoom, center) * SIDE * RADAR_RADIUS_RATIO;
        expect(meters).toBeCloseTo(radius, 0);
      }
    }
  });

  it('metersPerPixel crece cerca del ecuador (Mercator estira la escala)', () => {
    expect(metersPerPixel(12, BOGOTA)).toBeGreaterThan(metersPerPixel(12, CDMX));
    expect(metersPerPixel(12, CDMX)).toBeGreaterThan(metersPerPixel(12, DEMO_CENTER));
    expect(metersPerPixel(12)).toBeCloseTo(15.7316, 3);
  });
});

describe('centro por región', () => {
  it('hay un único centro de demo, en orden [lng, lat]', () => {
    expect(centerLngLat()).toEqual([DEMO_CENTER.lon, DEMO_CENTER.lat]);
    expect(DEMO_CENTER.lon).toBeLessThan(DEMO_CENTER.lat);
    expect(DEMO_CENTER.lon).toBeCloseTo(-58.4306, 4);
    expect(DEMO_CENTER.lat).toBeCloseTo(-34.5889, 4);
  });

  it('mx → CDMX y co → Bogotá, no Buenos Aires', () => {
    expect(centerForRegion('mx')).toEqual(CDMX);
    expect(centerForRegion('co')).toEqual(BOGOTA);
    expect(centerLngLat(centerForRegion('mx'))).toEqual([-99.124, 19.4062]);
    expect(centerLngLat(centerForRegion('co'))).toEqual([-74.0974, 4.6832]);
    expect(centerForRegion('mx')).not.toEqual(DEMO_CENTER);
    expect(centerForRegion('co')).not.toEqual(DEMO_CENTER);
  });

  it('sin región, región desconocida o zona desconocida cae en el centro del build', () => {
    expect(centerForRegion(null)).toEqual(DEMO_CENTER);
    expect(centerForRegion(undefined)).toEqual(DEMO_CENTER);
    expect(centerForRegion('zz')).toEqual(DEMO_CENTER);
    expect(centerForZone('lima')).toEqual(DEMO_CENTER);
    expect(centerForZone(null)).toEqual(DEMO_CENTER);
  });

  /**
   * Verificación real de la geografía: el centro de cada zona tiene que caer
   * dentro del polígono que el catálogo congelado define para esa zona (el mismo
   * con el que el backend resuelve `PUT /presence`). Si alguien escribe una
   * coordenada a mano, este test la caza.
   */
  it('cada centro cae dentro del polígono de su zona en el catálogo', () => {
    const catalog = JSON.parse(
      readFileSync(new URL('../../../contract/catalog/zones.json', import.meta.url), 'utf8'),
    ) as { zoneKey: string; polygon: [number, number][][] }[];

    const zones = catalog.map((zone) => zone.zoneKey).sort();
    expect(zones).toEqual(Object.keys(ZONE_CENTERS).sort());

    for (const zone of catalog) {
      const center = ZONE_CENTERS[zone.zoneKey];
      expect(center, `falta el centro de ${zone.zoneKey}`).toBeDefined();
      expect(insidePolygon(center, zone.polygon[0]), `${zone.zoneKey} fuera de su polígono`).toBe(true);
    }
  });

  it('el timeout es 8 s', () => {
    expect(MAP_TIMEOUT_MS).toBe(8000);
  });
});

/** Ray casting: `[lng, lat]` contra el anillo exterior del catálogo. */
function insidePolygon(point: { lon: number; lat: number }, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const crosses = yi > point.lat !== yj > point.lat;
    if (crosses && point.lon < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}
