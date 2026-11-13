import { describe, expect, it } from 'vitest';

import {
  pointFromPosition,
  requestPoint,
  round6,
  type GeoEnvironment,
  type GeoResult,
  type GeolocationLike,
} from '../src/live/geolocation';

/**
 * La geolocalización del modo live, sin navegador: el entorno entra por
 * parámetro, así el test cubre cada final (ok, negado, no soportado, inseguro)
 * sin abrir un prompt real.
 */
function stubGeo(
  behave: (success: Parameters<GeolocationLike['getCurrentPosition']>[0], fail?: (error: { code?: number }) => void) => void,
): GeolocationLike {
  return {
    getCurrentPosition: (success, error) => behave(success, error),
  };
}

const OK = { coords: { latitude: 19.432608123456, longitude: -99.133209987654 } };

describe('punto del navegador', () => {
  it('recorta a 6 decimales, como el contrato', () => {
    expect(round6(19.432608123456)).toBe(19.432608);
    expect(pointFromPosition(OK)).toEqual({ lat: 19.432608, lng: -99.13321 });
  });

  it('un punto raro no se manda: `null` en vez de una coordenada inventada', () => {
    expect(pointFromPosition(null)).toBeNull();
    expect(pointFromPosition({})).toBeNull();
    expect(pointFromPosition({ coords: { latitude: Number.NaN, longitude: 0 } })).toBeNull();
    expect(pointFromPosition({ coords: { latitude: 91, longitude: 0 } })).toBeNull();
    expect(pointFromPosition({ coords: { latitude: 0, longitude: 181 } })).toBeNull();
    expect(pointFromPosition({ coords: { latitude: '19.4', longitude: '-99.1' } })).toBeNull();
  });
});

describe('requestPoint', () => {
  it('con permiso devuelve el punto', async () => {
    const environment: GeoEnvironment = {
      secureContext: true,
      geolocation: stubGeo((success) => success(OK)),
    };
    await expect(requestPoint(environment)).resolves.toEqual({
      status: 'ok',
      point: { lat: 19.432608, lng: -99.13321 },
      accuracyM: null,
    });
  });

  it('permiso negado se informa como `denied`, no como excepción', async () => {
    const environment: GeoEnvironment = {
      secureContext: true,
      geolocation: stubGeo((_success, fail) => fail?.({ code: 1 })),
    };
    await expect(requestPoint(environment)).resolves.toEqual({ status: 'denied' });
  });

  it('cada código del DOM tiene su propio final: el usuario necesita saber cuál', async () => {
    const cases: { code: number | undefined; status: GeoResult['status'] }[] = [
      { code: 2, status: 'unavailable' },
      { code: 3, status: 'timeout' },
      { code: undefined, status: 'unavailable' },
    ];
    for (const { code, status } of cases) {
      const environment: GeoEnvironment = {
        secureContext: true,
        geolocation: stubGeo((_success, fail) => fail?.({ code })),
      };
      await expect(requestPoint(environment), `code ${String(code)}`).resolves.toEqual({ status });
    }
  });

  it('sin API de geolocalización es `unsupported`', async () => {
    await expect(requestPoint({ geolocation: null })).resolves.toEqual({ status: 'unsupported' });
  });

  it('contexto inseguro no abre un prompt que el navegador va a ignorar', async () => {
    let called = false;
    const environment: GeoEnvironment = {
      secureContext: false,
      geolocation: stubGeo((success) => {
        called = true;
        success(OK);
      }),
    };
    await expect(requestPoint(environment)).resolves.toEqual({ status: 'insecure' });
    expect(called).toBe(false);
  });

  it('un error de la API no cuelga la sesión', async () => {
    const environment: GeoEnvironment = {
      secureContext: true,
      geolocation: {
        getCurrentPosition: () => {
          throw new Error('boom');
        },
      },
    };
    await expect(requestPoint(environment)).resolves.toEqual({ status: 'unavailable' });
  });
});
