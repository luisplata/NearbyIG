/**
 * Geolocalización, en un solo lugar.
 *
 * Dos backends, un contrato: `requestBrowserPoint` habla con
 * `navigator.geolocation` y `requestNativePoint` con el proveedor del device
 * (`expo-location`, inyectado). El resultado es el mismo `GeoResult` en las dos
 * plataformas, así el controlador no sabe en qué app corre.
 *
 * **Para qué.** En el modo live, el `PUT /presence` acepta un `point` privado:
 * es la única entrada del contrato que lleva coordenadas y la única forma de que
 * las distancias del radar sean las reales.
 *
 * **Sólo con gesto.** `requestPoint` no se llama al abrir la app ni al abrir la
 * sesión: lo llama el controlador desde el botón "Usar mi ubicación". En móvil
 * (iOS/Safari) un `getCurrentPosition` sin gesto se rechaza o se ignora, y el
 * usuario ve un error que no llegó a leer. El gesto es el permiso, no un
 * detalle de UX.
 *
 * **Qué NO hace.** No guarda el punto (ni storage ni cookie: lo que dure la
 * sesión en memoria), no lo manda a ningún lado más que al `PUT /presence`, y no
 * lo lee de IP ni de ningún servicio.
 *
 * **Gestos y seguimiento.** Dos juegos de opciones, no dos módulos: el gesto
 * pide una lectura fresca (`maximumAge: 0`) porque el usuario acaba de tocar
 * "Usar mi ubicación" y espera su posición de ahora; el seguimiento periódico
 * (`TRACK_OPTIONS`) tolera una lectura de hasta 5 s y espera hasta 15 s, porque
 * corre solo y no puede quedar colgado de un proveedor lento. En ninguno de los
 * dos se pide alta precisión: la demo muestra distancias a nivel radar y el GPS
 * fino calienta la radio del teléfono sin cambiar la experiencia.
 *
 * **Contexto seguro.** `getCurrentPosition` sólo existe en HTTPS o `localhost`.
 * En una IP de la LAN por HTTP plano el navegador devuelve `undefined` o falla, así que se
 * reporta `insecure` sin abrir un prompt que el navegador va a ignorar: para
 * probar desde el móvil con GPS real hace falta un túnel HTTPS.
 */

export type GeoPoint = { readonly lat: number; readonly lng: number };

export type GeoResult =
  | {
      readonly status: 'ok';
      readonly point: GeoPoint;
      /** Precisión que reportó el navegador, redondeada a 10 m. Nunca el punto. */
      readonly accuracyM: number | null;
    }
  | { readonly status: 'denied' }
  /** `POSITION_UNAVAILABLE`: sin señal, sin GPS o el proveedor falló. */
  | { readonly status: 'unavailable' }
  /** `TIMEOUT`: el navegador no contestó en `TIMEOUT_MS`. */
  | { readonly status: 'timeout' }
  | { readonly status: 'unsupported' }
  | { readonly status: 'insecure' };

/** Lo mínimo de `Geolocation` que se usa (así el test no necesita el DOM). */
export type GeolocationLike = {
  getCurrentPosition(
    success: (position: {
      coords: { latitude: number; longitude: number; accuracy?: number };
    }) => void,
    error?: (error: { code?: number }) => void,
    options?: GeoRequestOptions,
  ): void;
};

/** Opciones de `getCurrentPosition`, con los tres campos que importan. */
export type GeoRequestOptions = {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
};

export type GeoEnvironment = {
  geolocation?: GeolocationLike | null;
  /** `window.isSecureContext`; `undefined` se trata como seguro (no hay evidencia). */
  secureContext?: boolean;
};

/** Códigos del DOM: `PERMISSION_DENIED`, `POSITION_UNAVAILABLE`, `TIMEOUT`. */
const PERMISSION_DENIED = 1;
const TIMEOUT = 3;

const TIMEOUT_MS = 8000;

/**
 * Opciones del gesto: una sola lectura y **sin caché**. El usuario pidió su
 * posición ahora; devolver una de hace un minuto sería mentirle.
 */
export const POINT_OPTIONS: GeoRequestOptions = {
  enableHighAccuracy: false,
  timeout: TIMEOUT_MS,
  maximumAge: 0,
};

/**
 * Opciones del seguimiento (una lectura cada 10 s). `maximumAge: 5000` deja que
 * el navegador reuse una lectura reciente en vez de encender el proveedor; un
 * `timeout` de 15 s es más largo que el intervalo de lectura a propósito: si el
 * proveedor tarda, la vuelta se saltea en vez de encimar dos pedidos.
 */
export const TRACK_OPTIONS: GeoRequestOptions = {
  enableHighAccuracy: false,
  timeout: 15_000,
  maximumAge: 5_000,
};


/** El navegador puede mandar 15 decimales: se recortan a 6, como el contrato. */
export function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/**
 * Precisión en metros, redondeada a 10. Sirve para el debug ("precisión 30 m")
 * y no revela nada del punto: un radio de error no es una coordenada.
 */
export function roundAccuracy(value: number | undefined | null): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return Math.round(value / 10) * 10;
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
 * Pide el punto una sola vez, desde un gesto. Nunca rechaza: cada final posible
 * es un `status` que el controlador sabe explicar (con `ok` se manda el punto;
 * con cualquier otro se pide la zona demo y se muestra el motivo).
 */
export function requestPoint(
  environment: GeoEnvironment,
  options: GeoRequestOptions = POINT_OPTIONS,
): Promise<GeoResult> {
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
          settle(
            point === null
              ? { status: 'unavailable' }
              : { status: 'ok', point, accuracyM: roundAccuracy(position?.coords?.accuracy) },
          );
        },
        (error) => {
          settle(
            error?.code === PERMISSION_DENIED
              ? { status: 'denied' }
              : error?.code === TIMEOUT
                ? { status: 'timeout' }
                : { status: 'unavailable' },
          );
        },
        options,
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

export function requestBrowserPoint(options?: GeoRequestOptions): Promise<GeoResult> {
  return requestPoint(browserGeoEnvironment(), options);
}

/**
 * Lectura del device en el binario nativo (Android/iOS).
 *
 * **Por qué la librería entra por parámetro.** `expo-location` no existe en el
 * bundle web ni en el runtime de vitest (`environment: 'node'`, sin preset de
 * React Native: `.native.ts` no se resuelve). Con la lib inyectada, la lógica
 * de permisos, timeout y mapeo se prueba con un fake y el módulo `.native` queda
 * de 18 líneas cableando el adapter.
 *
 * **Qué NO hace.** No mira `secureContext` (en nativo no existe: el binario
 * habla con el proveedor del sistema, no con un origen HTTP), no abre un canal
 * continuo de posiciones ni usa la última posición conocida, y no guarda nada.
 * Una lectura por gesto, como la web.
 */
export type NativeLocationLike = {
  requestForegroundPermissionsAsync(): Promise<{ granted?: boolean } | null | undefined>;
  getCurrentPositionAsync(options?: { accuracy?: number }): Promise<{
    coords?: { latitude?: unknown; longitude?: unknown; accuracy?: number | null };
  }>;
};

export type NativePointOptions = {
  timeoutMs?: number;
  /** `Location.Accuracy.*` del adapter; se propaga tal cual. */
  accuracy?: number;
};

/** El mismo techo que el gesto web: 8 s dejan lugar a un GPS frío sin colgar la UI. */
export const NATIVE_TIMEOUT_MS = TIMEOUT_MS;

/**
 * `getCurrentPositionAsync` **no acepta timeout ni cancelación**. Se corre una
 * carrera contra un timer y se deja la lectura abandonada con su `catch`
 * adjunto: si llega tarde (o rechaza tarde) nadie la escucha, el resultado ya
 * está decidido y no hay unhandled rejection que tumbe el proceso en RN.
 */
export function requestNativePoint(
  lib: NativeLocationLike | null,
  options: NativePointOptions = {},
): Promise<GeoResult> {
  if (
    lib === null ||
    typeof lib.requestForegroundPermissionsAsync !== 'function' ||
    typeof lib.getCurrentPositionAsync !== 'function'
  ) {
    return Promise.resolve({ status: 'unsupported' });
  }
  const timeoutMs = options.timeoutMs ?? NATIVE_TIMEOUT_MS;
  const accuracy = options.accuracy;

  return new Promise<GeoResult>((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const settle = (result: GeoResult): void => {
      if (settled) return;
      settled = true;
      if (timer !== null) clearTimeout(timer);
      resolve(result);
    };

    timer = setTimeout(() => settle({ status: 'timeout' }), timeoutMs);

    const read = async (): Promise<void> => {
      let permission: { granted?: boolean } | null | undefined;
      try {
        permission = await lib.requestForegroundPermissionsAsync();
      } catch {
        // El permiso puede explotar si el servicio no está: eso no es "denegado".
        settle({ status: 'unavailable' });
        return;
      }
      // Sólo `granted === true` habilita la lectura: un `undefined` de una versión
      // nueva de la lib no se interpreta como permiso tácito.
      if (permission?.granted !== true) {
        settle({ status: 'denied' });
        return;
      }
      let position: Awaited<ReturnType<NativeLocationLike['getCurrentPositionAsync']>>;
      try {
        position = await lib.getCurrentPositionAsync(
          accuracy === undefined ? undefined : { accuracy },
        );
      } catch {
        settle({ status: 'unavailable' });
        return;
      }
      const point = pointFromPosition(position);
      settle(
        point === null
          ? { status: 'unavailable' }
          : { status: 'ok', point, accuracyM: roundAccuracy(position?.coords?.accuracy) },
      );
    };

    // `.catch` adjunto a propósito: el `settle` ya es idempotente, pero una
    // promesa sin manejar (lectura tardía) sigue siendo un crash en RN.
    void read().catch(() => settle({ status: 'unavailable' }));
  });
}
