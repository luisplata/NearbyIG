import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { ZONE_CENTERS } from '../src/map/basemap';
import {
  DEMO_REGIONS,
  defaultZoneFor,
  isDemoZoneKey,
  mapCenterFor,
  regionForZone,
} from '../src/live/regions';
import { DEMO_ZONE_POLYGONS, zoneForPoint } from '../src/live/zones';

/**
 * El puente zona ↔ región ↔ geografía, verificado contra el catálogo congelado.
 *
 * Es el módulo que reemplaza al fallback silencioso: si `zoneForPoint` miente, el
 * cliente abre una sesión en la región equivocada y el backend contesta
 * `fallbackRequired` — exactamente el defecto que mandaba a CDMX a un usuario de
 * Bogotá. Por eso el mirror no se confía de sí mismo: se compara vértice a
 * vértice con `contract/catalog/zones.json`.
 */
type CatalogZone = {
  zoneKey: string;
  regionKey: string;
  polygon: [number, number][][];
};

type CatalogRegion = { regionKey: string; defaultZoneKey: string };

const ZONES = JSON.parse(
  readFileSync(new URL('../../../contract/catalog/zones.json', import.meta.url), 'utf8'),
) as CatalogZone[];

const REGIONS = JSON.parse(
  readFileSync(new URL('../../../contract/catalog/regions.json', import.meta.url), 'utf8'),
) as CatalogRegion[];

describe('mirror del catálogo', () => {
  it('están todas las zonas del catálogo y ninguna inventada', () => {
    expect(DEMO_ZONE_POLYGONS.map((zone) => zone.zoneKey).sort()).toEqual(
      ZONES.map((zone) => zone.zoneKey).sort(),
    );
  });

  it('cada polígono es el del catálogo, vértice a vértice', () => {
    for (const zone of ZONES) {
      const mirror = DEMO_ZONE_POLYGONS.find((candidate) => candidate.zoneKey === zone.zoneKey);
      expect(mirror, `falta el polígono de ${zone.zoneKey}`).toBeDefined();
      expect(mirror?.ring, zone.zoneKey).toEqual(zone.polygon[0]);
    }
  });

  it('las regiones demo son las del catálogo', () => {
    expect([...DEMO_REGIONS].sort()).toEqual(REGIONS.map((region) => region.regionKey).sort());
  });
});

describe('zona → región', () => {
  it('cada zona del catálogo resuelve a su región', () => {
    for (const zone of ZONES) {
      expect(regionForZone(zone.zoneKey), zone.zoneKey).toBe(zone.regionKey);
    }
  });

  it('sin zona o con una zona desconocida no hay región: no se adivina', () => {
    expect(regionForZone(null)).toBeNull();
    expect(regionForZone(undefined)).toBeNull();
    expect(regionForZone('')).toBeNull();
    expect(regionForZone('buenos-aires')).toBeNull();
    expect(isDemoZoneKey('cdmx')).toBe(true);
    expect(isDemoZoneKey('buenos-aires')).toBe(false);
  });

  it('la zona por defecto de cada región es la del catálogo, y es recíproca', () => {
    for (const region of REGIONS) {
      expect(defaultZoneFor(region.regionKey), region.regionKey).toBe(region.defaultZoneKey);
      expect(regionForZone(region.defaultZoneKey)).toBe(region.regionKey);
    }
    expect(defaultZoneFor('ar')).toBeNull();
  });
});

describe('punto → zona', () => {
  it('el centroide de cada zona cae dentro de su propio polígono', () => {
    for (const zone of ZONES) {
      const center = ZONE_CENTERS[zone.zoneKey];
      expect(center, `falta el centro de ${zone.zoneKey}`).toBeDefined();
      expect(zoneForPoint({ lat: center.lat, lng: center.lon }), zone.zoneKey).toBe(zone.zoneKey);
    }
  });

  it('un punto de Bogotá no cae en CDMX, ni al revés', () => {
    expect(zoneForPoint({ lat: 4.6832, lng: -74.0974 })).toBe('bogota');
    expect(zoneForPoint({ lat: 19.4062, lng: -99.124 })).toBe('cdmx');
  });

  it('fuera de México y Colombia no hay zona: se pide la elección', () => {
    // Palermo, el centro del guion: está en el dataset, no en el catálogo.
    expect(zoneForPoint({ lat: -34.5889, lng: -58.4306 })).toBeNull();
    expect(zoneForPoint({ lat: 0, lng: 0 })).toBeNull();
  });

  it('justo afuera del anillo tampoco, aunque esté cerca', () => {
    // Al oeste del vértice más occidental de CDMX.
    expect(zoneForPoint({ lat: 19.4062, lng: -99.3 })).toBeNull();
  });

  it('un punto con NaN no explota: no hay zona', () => {
    expect(zoneForPoint({ lat: Number.NaN, lng: -99.124 })).toBeNull();
    expect(zoneForPoint({ lat: 19.4062, lng: Number.POSITIVE_INFINITY })).toBeNull();
  });
});

describe('centro del mapa', () => {
  it('con punto del GPS el mapa se centra en el punto, no en el centroide', () => {
    // Un punto dentro de Bogotá pero lejos del centroide de la zona.
    const point = { lat: 4.75, lng: -74.05 };
    expect(mapCenterFor(point, 'co')).toEqual({ lon: -74.05, lat: 4.75 });
    expect(regionForZone(zoneForPoint(point))).toBe('co');
  });

  it('sin punto manda el centroide de la zona de la región', () => {
    expect(mapCenterFor(null, 'mx')).toEqual(ZONE_CENTERS['cdmx']);
    expect(mapCenterFor(undefined, 'co')).toEqual(ZONE_CENTERS['bogota']);
  });

  it('sin punto ni región, el centro de la demo (nunca una ciudad elegida sola)', () => {
    const demo = mapCenterFor(null, null);
    expect(demo.lon).toBeCloseTo(-58.4306, 4);
    expect(demo.lat).toBeCloseTo(-34.5889, 4);
  });
});
