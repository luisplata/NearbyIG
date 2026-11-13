/**
 * Configuración del modo live, resuelta en build time.
 *
 * `EXPO_PUBLIC_API_URL` es la **única** fuente de la base de la API: no hay
 * default y no hay valor de producción escrito en el código. Si falta, el modo
 * live queda deshabilitado y la demo sigue con el dataset del build, que es el
 * comportamiento de siempre.
 *
 * El valor se lee como miembro estático de `process.env` (`EXPO_PUBLIC_*` se
 * inlinea al compilar); pasar el objeto `process.env` entero no funcionaría en
 * el bundle web.
 *
 * La región no tiene selector en la UI: sale de `EXPO_PUBLIC_DEMO_REGION` y cae
 * en `mx`, que es la región del dataset por defecto. `RegionKey` del contrato es
 * ISO 3166-1 alpha-2 en minúsculas, así que se valida esa forma.
 */

/** Región por defecto: la del dataset (`fixtures.profiles` es MX). */
export const DEFAULT_DEMO_REGION = 'mx';

export type LiveSettings = {
  /** Base de la API sin barra final. Puede ser relativa (mismo origen). */
  baseUrl: string;
  /** `RegionKey` del contrato. */
  region: string;
};

const REGION_KEY = /^[a-z]{2}$/;

/**
 * Normaliza la base: sin espacios y sin barras finales, porque los paths se
 * concatenan con una barra inicial (`/discovery`).
 */
export function normalizeBaseUrl(raw: string | undefined): string | null {
  if (raw === undefined) {
    return null;
  }
  const trimmed = raw.trim();
  if (trimmed === '' || /\s/.test(trimmed)) {
    return null;
  }
  const withoutSlash = trimmed.replace(/\/+$/, '');
  return withoutSlash === '' ? null : withoutSlash;
}

export function normalizeRegion(raw: string | undefined): string {
  if (raw === undefined) {
    return DEFAULT_DEMO_REGION;
  }
  const trimmed = raw.trim().toLowerCase();
  return REGION_KEY.test(trimmed) ? trimmed : DEFAULT_DEMO_REGION;
}

/** `null` = modo live no configurado en este build. */
export function readLiveSettings(
  apiUrl: string | undefined,
  demoRegion: string | undefined,
): LiveSettings | null {
  const baseUrl = normalizeBaseUrl(apiUrl);
  if (baseUrl === null) {
    return null;
  }
  return { baseUrl, region: normalizeRegion(demoRegion) };
}
