import { describe, expect, it } from 'vitest';

import {
  DEMO_CENTER,
  MAP_TIMEOUT_MS,
  MAP_ZOOM_RANGE,
  centerLngLat,
  metersPerPixel,
  zoomForRadius,
} from '../src/map/basemap';

/**
 * Derivación de zoom: pura (sin DOM ni red), monótona y con clamp.
 *
 * `zoomForRadius` usa la proyección real de MapLibre (`worldSize = 512 * 2^z`).
 * Ojo con la fórmula clásica de tiles de 256 px: devuelve **un nivel más** y el
 * mapa terminaría mostrando la mitad del radio que declara el radar. Por eso el
 * invariante que fija este test es físico —"el radio útil del cuadrado son
 * `radiusM` metros"— y no una banda de zoom copiada de una tabla.
 */
const RADAR_RADIUS_RATIO = 0.46;
const SIDE = 400;

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

describe('constantes del basemap', () => {
  it('hay un único centro de demo, en orden [lng, lat]', () => {
    expect(centerLngLat()).toEqual([DEMO_CENTER.lon, DEMO_CENTER.lat]);
    expect(DEMO_CENTER.lon).toBeLessThan(DEMO_CENTER.lat);
    expect(DEMO_CENTER.lon).toBeCloseTo(-58.4306, 4);
    expect(DEMO_CENTER.lat).toBeCloseTo(-34.5889, 4);
  });

  it('el timeout es 8 s', () => {
    expect(MAP_TIMEOUT_MS).toBe(8000);
  });
});
