import { describe, expect, it } from 'vitest';

import {
  NATIVE_TIMEOUT_MS,
  requestNativePoint,
  type GeoResult,
  type NativeLocationLike,
} from '../src/live/geolocation';

/**
 * La lectura real de ubicación del device, sin device ni `expo-location`.
 *
 * `geolocation.ts` recibe la librería por parámetro (design A1): vitest corre
 * con `environment: 'node'` y sin preset de React Native, así que **no
 * resuelve** `requestPoint.native.ts`. Con la lib inyectada, cada final se
 * prueba con un fake y el módulo nativo queda reducido a cablear el adapter.
 */
const NO_PERMISSION = { requestForegroundPermissionsAsync: async () => ({ granted: true }) };

const GRANTED: NativeLocationLike = {
  ...NO_PERMISSION,
  getCurrentPositionAsync: async () => ({
    coords: { latitude: 19.432608123456, longitude: -99.133209987654, accuracy: 34.7 },
  }),
};

describe('requestNativePoint', () => {
  it('con permiso devuelve el punto redondeado y la precisión', async () => {
    await expect(requestNativePoint(GRANTED)).resolves.toEqual({
      status: 'ok',
      point: { lat: 19.432608, lng: -99.13321 },
      // 34.7 m se informa como 30 m: la precisión se redondea a 10, el punto a 6 decimales.
      accuracyM: 30,
    });
  });

  it('permiso denegado es `denied`, nunca `unsupported`', async () => {
    const denied: NativeLocationLike = {
      requestForegroundPermissionsAsync: async () => ({ granted: false }),
      getCurrentPositionAsync: async () => {
        throw new Error('no debería llamarse sin permiso');
      },
    };
    await expect(requestNativePoint(denied)).resolves.toEqual({ status: 'denied' });
  });

  it('un permiso que no dice `granted` tampoco se asume concedido', async () => {
    const vague: NativeLocationLike = {
      requestForegroundPermissionsAsync: async () => null,
      getCurrentPositionAsync: async () => {
        throw new Error('no debería llamarse sin permiso');
      },
    };
    await expect(requestNativePoint(vague)).resolves.toEqual({ status: 'denied' });
  });

  it('si pedir el permiso explota, el final es `unavailable`', async () => {
    const broken: NativeLocationLike = {
      requestForegroundPermissionsAsync: async () => {
        throw new Error('sin servicio de ubicación');
      },
      getCurrentPositionAsync: async () => {
        throw new Error('no debería llamarse');
      },
    };
    await expect(requestNativePoint(broken)).resolves.toEqual({ status: 'unavailable' });
  });

  it('si la lectura se rechaza, el final es `unavailable`', async () => {
    const noSignal: NativeLocationLike = {
      ...NO_PERMISSION,
      getCurrentPositionAsync: async () => {
        throw new Error('sin señal');
      },
    };
    await expect(requestNativePoint(noSignal)).resolves.toEqual({ status: 'unavailable' });
  });

  it('un proveedor que nunca responde cierra por `timeout`', async () => {
    const hangs: NativeLocationLike = {
      ...NO_PERMISSION,
      // Promesa que jamás se resuelve: es el caso del GPS buscando satélites.
      getCurrentPositionAsync: () => new Promise<never>(() => undefined),
    };
    await expect(requestNativePoint(hangs, { timeoutMs: 5 })).resolves.toEqual({
      status: 'timeout',
    });
  });

  it('sin librería el resultado es `unsupported`', async () => {
    await expect(requestNativePoint(null)).resolves.toEqual({ status: 'unsupported' });
  });

  it('nunca devuelve `insecure`: el adapter nativo no consulta `secureContext`', async () => {
    const results: GeoResult[] = await Promise.all([
      requestNativePoint(GRANTED),
      requestNativePoint(null),
      requestNativePoint({
        ...NO_PERMISSION,
        getCurrentPositionAsync: async () => {
          throw new Error('sin señal');
        },
      }),
      requestNativePoint(
        { ...NO_PERMISSION, getCurrentPositionAsync: () => new Promise<never>(() => undefined) },
        { timeoutMs: 5 },
      ),
    ]);
    for (const result of results) {
      expect(result.status).not.toBe('insecure');
    }
  });

  it('descarta la lectura que llega después del timeout y no deja una promesa rechazada', async () => {
    let late: (() => void) | null = null;
    const slow: NativeLocationLike = {
      ...NO_PERMISSION,
      getCurrentPositionAsync: () =>
        new Promise((_resolve, reject) => {
          // Llega tarde y **rechaza**: sin el `.catch` del adapter esto sería un
          // unhandled rejection, y en React Native eso revienta el proceso.
          late = () => reject(new Error('tarde'));
        }),
    };
    await expect(requestNativePoint(slow, { timeoutMs: 5 })).resolves.toEqual({
      status: 'timeout',
    });
    expect(late).not.toBeNull();
    // Nadie conserva ni publica ese punto: la lectura abandonada sólo se descarta.
    (late as unknown as () => void)();
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

  it('pide la precisión que recibe por parámetro', async () => {
    const seen: (number | undefined)[] = [];
    const spy: NativeLocationLike = {
      ...NO_PERMISSION,
      getCurrentPositionAsync: async (options) => {
        seen.push(options?.accuracy);
        return { coords: { latitude: 0, longitude: 0, accuracy: 5 } };
      },
    };
    await requestNativePoint(spy, { accuracy: 4 });
    expect(seen).toEqual([4]);
  });

  it('el timeout por defecto es el mismo de la lectura web (8 s)', () => {
    expect(NATIVE_TIMEOUT_MS).toBe(8000);
  });
});
