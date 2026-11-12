import { describe, expect, it } from 'vitest';

import { mapPalette, mapStyle } from '../src/map/style';

/**
 * El estilo es local y determinista, y **todas** sus URLs apuntan al único host
 * pedible. Si alguien agrega un sprite, un raster o un estilo remoto, este test
 * (y `assemble-site --strict`) lo bloquean.
 */
const ALLOWED_HOST = 'tiles.openfreemap.org';

type UnknownRecord = Record<string, unknown>;

function strings(value: unknown, path = ''): Array<{ path: string; value: string }> {
  if (typeof value === 'string') return [{ path, value }];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => strings(item, `${path}[${index}]`));
  }
  if (value !== null && typeof value === 'object') {
    return Object.entries(value as UnknownRecord).flatMap(([key, child]) =>
      strings(child, path ? `${path}.${key}` : key),
    );
  }
  return [];
}

function urls(style: UnknownRecord): string[] {
  return strings(style)
    .filter((entry) => /^https?:\/\//i.test(entry.value))
    .map((entry) => entry.value);
}

describe('mapStyle', () => {
  it('es puro y determinista', () => {
    expect(mapStyle()).toEqual(mapStyle());
  });

  it('declara un único source vectorial y glifos del mismo host', () => {
    const style = mapStyle() as unknown as UnknownRecord;
    const sources = Object.keys(style.sources as UnknownRecord);
    expect(sources).toEqual(['openmaptiles']);
    const glyphs = String(style.glyphs);
    expect(new URL(glyphs.replace('{fontstack}', 'Noto Sans Regular').replace('{range}', '0-255')).host).toBe(
      ALLOWED_HOST,
    );
  });

  it('no declara sprite (ni imágenes externas)', () => {
    const style = mapStyle() as unknown as UnknownRecord;
    expect('sprite' in style).toBe(false);
    expect(strings(style).some((entry) => /sprite/i.test(entry.path))).toBe(false);
  });

  it('todas las URLs del estilo viven en el host permitido', () => {
    const style = mapStyle() as unknown as UnknownRecord;
    const found = urls(style);
    expect(found.length).toBeGreaterThanOrEqual(2);
    for (const value of found) {
      const href = value.replace('{fontstack}', 'Noto Sans Regular').replace('{range}', '0-255');
      expect(new URL(href).host).toBe(ALLOWED_HOST);
    }
  });

  it('usa el esquema de OpenMapTiles en capas conocidas', () => {
    const style = mapStyle() as unknown as UnknownRecord;
    const layers = style.layers as Array<UnknownRecord>;
    expect(layers.length).toBeGreaterThanOrEqual(12);
    const sourceLayers = new Set(layers.map((layer) => layer['source-layer']).filter(Boolean));
    for (const expected of ['water', 'transportation', 'transportation_name', 'place', 'building']) {
      expect(sourceLayers.has(expected)).toBe(true);
    }
    expect(layers[0].type).toBe('background');
  });

  it('la paleta es oscura y está anclada a los tokens', () => {
    expect(mapPalette.background).toBe('#09090B');
    expect(mapPalette.label).toBe('#F4F4F5');
    for (const value of Object.values(mapPalette)) {
      expect(value).toMatch(/^#[0-9A-F]{6}$/);
    }
  });
});
