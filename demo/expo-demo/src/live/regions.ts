/**
 * Zona demo por defecto de cada región.
 *
 * Es un espejo de `contract/catalog/regions.json` (`defaultZoneKey`), no una
 * invención: la zona tiene que existir en `contract/catalog/zones.json` o
 * `PUT /presence` responde 422 `ZONE_UNKNOWN`.
 *
 * ¿Por qué una constante y no `GET /demo/regions`? La operation está declarada
 * en el contrato desde Sprint 2, pero el backend no la implementa: hoy responde
 * 404 `PROFILE_NOT_FOUND`. Se sigue el espíritu del contrato (la sesión no elige
 * país; arranca en la zona por defecto de su región) con el dato congelado, y se
 * reporta como desvío. Cuando el endpoint exista, este archivo se borra.
 */

import { centerForZone, type LngLat } from '../map/basemap';

export const DEMO_REGIONS = ['mx', 'co'] as const;

const DEFAULT_ZONE_BY_REGION: Record<string, string> = {
  mx: 'cdmx',
  co: 'bogota',
};

/** `null` si la región no está en el catálogo: no se inventa una zona. */
export function defaultZoneFor(regionKey: string): string | null {
  return DEFAULT_ZONE_BY_REGION[regionKey] ?? null;
}

/**
 * Centro del basemap de una región: la zona por defecto de esa región.
 *
 * Es el único puente `regionKey → geografía`. El mapa no elige ciudad por su
 * cuenta ni por el punto del GPS: si la sesión es `mx`, la zona demo es `cdmx`
 * y el basemap muestra CDMX. Sin región (dataset del build) cae en el centro de
 * la demo, que es Buenos Aires.
 */
export function centerForRegion(regionKey: string | null | undefined): LngLat {
  return centerForZone(regionKey === null || regionKey === undefined ? null : defaultZoneFor(regionKey));
}

export function isDemoRegion(regionKey: string): boolean {
  return DEMO_REGIONS.includes(regionKey as (typeof DEMO_REGIONS)[number]);
}
