/**
 * Configuración del modo live.
 *
 * **Base de la API: build + runtime.** `EXPO_PUBLIC_API_URL` se inlinea al
 * compilar, pero un túnel (ngrok) cambia de URL en cada sesión y no puede exigir
 * un rebuild. Por eso hay dos overrides en runtime, en este orden:
 *
 *   1. `?api=https://...` en la URL de la **página** (el caso del túnel);
 *   2. `localStorage['nearbyig.api']`, que guarda el último `?api=` válido para
 *      que la siguiente visita al mismo túnel no dependa de la query;
 *   3. `EXPO_PUBLIC_API_URL` del build.
 *
 * Un override sólo vale si es `http(s)://host[:port]` con path opcional. Basura
 * (`javascript:`, `ftp://`, espacios, un string vacío) se descarta en silencio y
 * se sigue con la fuente siguiente: nunca se arma un `fetch` con algo que no sea
 * una URL.
 *
 * **CORS.** El origen que el backend tiene que permitir es el de la **página**
 * (de dónde sale el JS), no el de la API: el navegador compara el `Origin` de la
 * página contra lo que la API declare. Un túnel de la app se resuelve en la
 * allowlist del backend, no acá.
 *
 * La región no tiene selector en la UI: sale de `EXPO_PUBLIC_DEMO_REGION` y cae
 * en `mx`, que es la región del dataset por defecto. `RegionKey` del contrato es
 * ISO 3166-1 alpha-2 en minúsculas, así que se valida esa forma.
 */

/** Región por defecto: la del dataset (`fixtures.profiles` es MX). */
export const DEFAULT_DEMO_REGION = 'mx';

/** Clave del override persistido. Sólo guarda la base: nunca una coordenada. */
export const API_STORAGE_KEY = 'nearbyig.api';

export type LiveSettings = {
  /** Base de la API sin barra final. Puede ser relativa (mismo origen). */
  baseUrl: string;
  /** `RegionKey` del contrato. */
  region: string;
};

/** De dónde salió la base que se está usando. */
export type ApiBaseOrigin = 'query' | 'storage' | 'env';

export type ApiBaseResolution = {
  /** Valor crudo; `readLiveSettings` lo normaliza igual que el del build. */
  raw: string;
  origin: ApiBaseOrigin;
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

/**
 * Un override de runtime tiene que ser absoluto y `http(s)`: la página se sirve
 * desde un origen y el navegador necesita una URL completa para hablar con otro.
 * Una base relativa (`/api`) sigue siendo válida desde el build, pero no como
 * override: en un túnel no significa nada.
 */
export function isHttpBaseUrl(raw: string | null | undefined): boolean {
  if (raw === null || raw === undefined) {
    return false;
  }
  const trimmed = raw.trim();
  if (trimmed === '' || /\s/.test(trimmed)) {
    return false;
  }
  return /^https?:\/\/[^/?#]+(?:[/?#].*)?$/i.test(trimmed) && normalizeBaseUrl(trimmed) !== null;
}

/**
 * Precedencia `query > storage > env`. Puro: los tres valores entran por
 * parámetro, así el test cubre la regla sin `window` ni `localStorage`.
 */
export function resolveApiBase(
  envUrl: string | undefined,
  queryUrl: string | null | undefined,
  storedUrl: string | null | undefined,
): ApiBaseResolution | null {
  if (isHttpBaseUrl(queryUrl)) {
    return { raw: (queryUrl as string).trim(), origin: 'query' };
  }
  if (isHttpBaseUrl(storedUrl)) {
    return { raw: (storedUrl as string).trim(), origin: 'storage' };
  }
  const fromEnv = normalizeBaseUrl(envUrl);
  return fromEnv === null ? null : { raw: fromEnv, origin: 'env' };
}

export function normalizeRegion(raw: string | undefined): string {
  if (raw === undefined) {
    return DEFAULT_DEMO_REGION;
  }
  const trimmed = raw.trim().toLowerCase();
  return REGION_KEY.test(trimmed) ? trimmed : DEFAULT_DEMO_REGION;
}

/** `null` = modo live no configurado en este build (ni por override). */
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

/** `?api=...` de la URL actual, o `null` si no hay (o no hay `window`). */
export function readQueryApi(search: string | null): string | null {
  if (search === null || search === '') {
    return null;
  }
  try {
    const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
    return params.get('api');
  } catch {
    return null;
  }
}

function storage(): Storage | null {
  try {
    if (typeof window === 'undefined') {
      return null;
    }
    return window.localStorage ?? null;
  } catch {
    // Modo privado o storage bloqueado: la demo funciona igual, sin override.
    return null;
  }
}

export function readStoredApi(): string | null {
  try {
    return storage()?.getItem(API_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

export function writeStoredApi(value: string): void {
  try {
    storage()?.setItem(API_STORAGE_KEY, value);
  } catch {
    // Sin storage el override vive lo que dura esta carga: no es un error.
  }
}

export function clearStoredApi(): void {
  try {
    storage()?.removeItem(API_STORAGE_KEY);
  } catch {
    // Igual que arriba: no hay nada que limpiar si no hay storage.
  }
}

/**
 * `?api=off` borra el override guardado y vuelve a la base del build. Sin esto,
 * un túnel viejo quedaría pegado en `localStorage` y la próxima visita seguiría
 * apuntando a una URL muerta sin forma de salir desde la UI.
 */
export function isClearApiCommand(raw: string | null | undefined): boolean {
  return raw !== null && raw !== undefined && raw.trim().toLowerCase() === 'off';
}

/**
 * Base de la API efectiva para este arranque. Un `?api=` válido se persiste para
 * la próxima visita; uno inválido se ignora (y no pisa lo guardado); `?api=off`
 * borra lo guardado.
 *
 * Sólo toca `window`/`localStorage` cuando existen: en el export web y en
 * `expo start` sí, en un runtime sin DOM devuelve la del build.
 */
export function readRuntimeApiBase(envUrl: string | undefined): ApiBaseResolution | null {
  const search = typeof window === 'undefined' ? null : window.location.search;
  const query = readQueryApi(search);
  if (isClearApiCommand(query)) {
    clearStoredApi();
    return resolveApiBase(envUrl, null, null);
  }
  const resolved = resolveApiBase(envUrl, query, readStoredApi());
  if (resolved !== null && resolved.origin === 'query') {
    writeStoredApi(resolved.raw);
  }
  return resolved;
}

/** Settings del arranque: build + overrides de runtime ya resueltos. */
export function readRuntimeLiveSettings(
  envUrl: string | undefined,
  demoRegion: string | undefined,
): LiveSettings | null {
  const resolved = readRuntimeApiBase(envUrl);
  return readLiveSettings(resolved?.raw, demoRegion);
}
