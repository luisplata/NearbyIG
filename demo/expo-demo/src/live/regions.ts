/**
 * Zona demo y región: el único puente entre las dos.
 *
 * Es un espejo de `contract/catalog/regions.json` (`defaultZoneKey`) y de
 * `contract/catalog/zones.json` (`zoneKey` → `regionKey`), no una invención: la
 * zona tiene que existir en el catálogo o `PUT /presence` responde 422
 * `ZONE_UNKNOWN`.
 *
 * **La zona manda.** La región de la sesión sale de la zona elegida (o de la
 * zona en la que cae el punto del GPS): `cdmx → mx`, `bogota → co`. No hay
 * región por defecto ni variable de build que pueda mandar a alguien a una
 * ciudad que no eligió — ese era el defecto que mandaba a CDMX a un usuario de
 * Bogotá.
 *
 * ¿Por qué una constante y no `GET /demo/regions`? La operation está declarada
 * en el contrato desde Sprint 2, pero el backend no la implementa: hoy responde
 * 404. Se sigue el espíritu del contrato (la sesión no elige país; arranca en la
 * zona de su región) con el dato congelado, y se reporta como desvío. Cuando el
 * endpoint exista, este archivo se borra.
 */

import { centerForZone, type LngLat } from '../map/basemap';

export const DEMO_REGIONS = ['mx', 'co'] as const;

/** `zoneKey` → `regionKey`, espejo de `zones.json`. Única tabla de la verdad. */
const REGION_BY_ZONE: Readonly<Record<string, string>> = {
  cdmx: 'mx',
  bogota: 'co',
};

/** Inverso derivado: una sola zona por región, así que el default es el inverso. */
const DEFAULT_ZONE_BY_REGION: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(REGION_BY_ZONE).map(([zoneKey, regionKey]) => [regionKey, zoneKey]),
);

/** `null` si la zona no está en el catálogo: no se inventa una región. */
export function regionForZone(zoneKey: string | null | undefined): string | null {
  if (zoneKey === null || zoneKey === undefined) {
    return null;
  }
  return REGION_BY_ZONE[zoneKey] ?? null;
}

/** `null` si la región no está en el catálogo: no se inventa una zona. */
export function defaultZoneFor(regionKey: string): string | null {
  return DEFAULT_ZONE_BY_REGION[regionKey] ?? null;
}

/** Zona del catálogo (`cdmx`/`bogota`), no cualquier string con forma de clave. */
export function isDemoZoneKey(zoneKey: string | null | undefined): zoneKey is string {
  return regionForZone(zoneKey) !== null;
}

/**
 * Centro del basemap de una región: la zona por defecto de esa región.
 *
 * Es el único puente `regionKey → geografía`. El mapa no elige ciudad por su
 * cuenta ni por el punto del GPS: si la sesión es `mx`, la zona demo es `cdmx`
 * y el basemap muestra CDMX. Sin región (dataset del build o antes de elegir
 * zona) cae en el centro de la demo, que es Buenos Aires.
 */
export function centerForRegion(regionKey: string | null | undefined): LngLat {
  return centerForZone(
    regionKey === null || regionKey === undefined ? null : defaultZoneFor(regionKey),
  );
}

/**
 * Centro del basemap: el punto del GPS si lo hay, si no la zona de la región.
 *
 * El punto llega desde el estado en memoria (`LiveState.point`) y **sólo** sirve
 * para centrar: no se persiste y no se manda a ningún request nuevo. Sin punto,
 * manda el centroide de la zona — nunca una ciudad elegida por el código.
 */
export function mapCenterFor(
  point: { readonly lat: number; readonly lng: number } | null | undefined,
  regionKey: string | null | undefined,
): LngLat {
  if (point === null || point === undefined) {
    return centerForRegion(regionKey);
  }
  return { lon: point.lng, lat: point.lat };
}

export function isDemoRegion(regionKey: string): boolean {
  return DEMO_REGIONS.includes(regionKey as (typeof DEMO_REGIONS)[number]);
}
