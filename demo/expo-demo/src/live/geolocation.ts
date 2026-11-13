/**
 * Geolocalización del navegador, en un solo lugar.
 *
 * **Para qué.** En el modo live, el `PUT /presence` acepta un `point` privado:
 * es la única entrada del contrato que lleva coordenadas y la única forma de que
 * las distancias del radar sean las reales. Si el usuario no da permiso, el
 * navegador no expone la API o el contexto no es seguro, se cae a `demoZoneKey`
 * (la zona demo de la región) sin romper nada.
 *
 * **Qué NO hace.** No sigue la ubicación en el tiempo (un solo pedido), no
 * guarda el punto (ni storage ni cookie: lo que dure la sesión en memoria), no
 * lo manda a ningún lado más que al `PUT /presence`, y no lo lee de IP ni de
 * ningún servicio.
 *
 * **Contexto seguro.** `getCurrentPosition` sólo existe en HTTPS o `localhost`.
 * En una IP de la LAN por HTTP plano el navegador devuelve `undefined` o falla, así que se
 * reporta `insecure` sin abrir un prompt que el navegador va a ignorar: para
 * probar desde el móvil con GPS real hace falta un túnel HTTPS.
 */

export type GeoPoint = { readonly lat: number; readonly lng: number };

export type GeoResult =
  | { readonly status: 'ok'; readonly point: GeoPoint }
  | { readonly status: 'denied' }
  | { readonly status: 'unavailable' }
  | { readonly status: 'unsupported' }
  | { readonly status: 'insecure' };

/** Lo mínimo de `Geolocation` que se usa (así el test no necesita el DOM). */
export type GeolocationLike = {
  getCurrentPosition(
    success: (position: { coords: { latitude: number; longitude: number } }) => void,
    error?: (error: { code?: number }) => void,
    options?: { enableHighAccuracy?: boolean; timeout?: number; maximumAge?: number },
  ): void;
};

export type GeoEnvironment = {
  geolocation?: GeolocationLike | null;
  /** `window.isSecureContext`; `undefined` se trata como seguro (no hay evidencia). */
  secureContext?: boolean;
};

/** `PERMISSION_DENIED` del DOM. Los otros dos códigos son "no se pudo". */
const PERMISSION_DENIED = 1;

const TIMEOUT_MS = 8000;

/** El navegador puede mandar 15 decimales: se recortan a 6, como el contrato. */
export function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/** `ok` sólo con un punto numérico y dentro de rango; si no, `null`. */
export function pointFromPosition(
  position: { coords?: { latitude?: unknown; longitude?: unknown } } | null | undefined,
): GeoPoint | null {
  const lat = position?.coords?.latitude;
  const lng = position?.coords?.longitude;
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return null;
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return null;
  }
  return { lat: round6(lat), lng: round6(lng) };
}

/**
 * Pide el punto una sola vez. Nunca rechaza: cada final posible es un `status`
 * que el controlador sabe manejar (con `ok` se manda el punto; con cualquier
 * otro se usa la zona demo).
 */
export function requestPoint(environment: GeoEnvironment): Promise<GeoResult> {
  const geolocation = environment.geolocation ?? null;
  if (environment.secureContext === false) {
    return Promise.resolve({ status: 'insecure' });
  }
  if (geolocation === null || typeof geolocation.getCurrentPosition !== 'function') {
    return Promise.resolve({ status: 'unsupported' });
  }
  return new Promise<GeoResult>((resolve) => {
    let settled = false;
    const settle = (result: GeoResult): void => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    try {
      geolocation.getCurrentPosition(
        (position) => {
          const point = pointFromPosition(position);
          settle(point === null ? { status: 'unavailable' } : { status: 'ok', point });
        },
        (error) => {
          settle(
            error?.code === PERMISSION_DENIED ? { status: 'denied' } : { status: 'unavailable' },
          );
        },
        { enableHighAccuracy: false, timeout: TIMEOUT_MS, maximumAge: 0 },
      );
    } catch {
      settle({ status: 'unavailable' });
    }
  });
}

/** Entorno real del navegador, leído sólo cuando este módulo corre en web. */
export function browserGeoEnvironment(): GeoEnvironment {
  if (typeof navigator === 'undefined') {
    return { geolocation: null };
  }
  return {
    geolocation: (navigator as { geolocation?: GeolocationLike }).geolocation ?? null,
    secureContext: typeof window === 'undefined' ? undefined : window.isSecureContext,
  };
}

export function requestBrowserPoint(): Promise<GeoResult> {
  return requestPoint(browserGeoEnvironment());
}
