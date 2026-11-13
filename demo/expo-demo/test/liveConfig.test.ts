import { afterEach, describe, expect, it } from 'vitest';

import {
  isClearApiCommand,
  isClearZoneCommand,
  isHttpBaseUrl,
  normalizeBaseUrl,
  normalizeZoneKey,
  readLiveSettings,
  readQueryApi,
  readQueryZone,
  readRuntimeZone,
  readStoredZone,
  resolveApiBase,
  resolveZone,
  writeStoredZone,
} from '../src/live/config';

describe('base de la API', () => {
  it('sin variable no hay modo live (no hay default ni valor de producción)', () => {
    expect(readLiveSettings(undefined)).toBeNull();
    expect(readLiveSettings('')).toBeNull();
    expect(readLiveSettings('   ')).toBeNull();
  });

  it('recorta espacios y barras finales para concatenar paths con barra inicial', () => {
    expect(normalizeBaseUrl('  http://host:3000/  ')).toBe('http://host:3000');
    expect(normalizeBaseUrl('http://host:3000//')).toBe('http://host:3000');
    expect(normalizeBaseUrl('/api')).toBe('/api');
  });

  it('rechaza un valor con espacios internos', () => {
    expect(normalizeBaseUrl('http://host :3000')).toBeNull();
  });

  it('una base relativa es válida: la demo puede servirse desde el mismo origen', () => {
    expect(readLiveSettings('/api')).toEqual({ baseUrl: '/api' });
  });

  it('ya no hay región de build: la sesión sale de la zona elegida', () => {
    // Era el camino del defecto: `mx` por defecto mandaba a CDMX a cualquiera.
    expect(readLiveSettings('/api')).not.toHaveProperty('region');
  });
});

describe('override de la base en runtime', () => {
  it('el túnel tiene que ser http(s) y absoluto', () => {
    expect(isHttpBaseUrl('https://abc123.ngrok-free.app')).toBe(true);
    expect(isHttpBaseUrl('http://localhost:3000')).toBe(true);
    expect(isHttpBaseUrl('https://abc123.ngrok-free.app/')).toBe(true);

    for (const invalid of [
      null,
      undefined,
      '',
      '   ',
      '/api',
      'ftp://host',
      'javascript:alert(1)',
      'https://',
      'http://host :3000',
      'abc123.ngrok-free.app',
    ]) {
      expect(isHttpBaseUrl(invalid), `"${String(invalid)}" no es una base`).toBe(false);
    }
  });

  it('precedencia: query > storage > env', () => {
    expect(
      resolveApiBase(
        'http://localhost:3000',
        'https://aaa.ngrok-free.app',
        'https://bbb.ngrok-free.app',
      ),
    ).toEqual({ raw: 'https://aaa.ngrok-free.app', origin: 'query' });

    expect(resolveApiBase('http://localhost:3000', null, 'https://bbb.ngrok-free.app')).toEqual({
      raw: 'https://bbb.ngrok-free.app',
      origin: 'storage',
    });

    expect(resolveApiBase('http://localhost:3000', null, null)).toEqual({
      raw: 'http://localhost:3000',
      origin: 'env',
    });
  });

  it('un override inválido se descarta y no pisa al build', () => {
    expect(resolveApiBase('http://localhost:3000', 'javascript:alert(1)', null)).toEqual({
      raw: 'http://localhost:3000',
      origin: 'env',
    });
    // Basura guardada por una visita anterior: tampoco gana.
    expect(resolveApiBase(undefined, 'no-es-url', 'ftp://x')).toBeNull();
    expect(resolveApiBase(undefined, 'https://ok.ngrok-free.app', 'no-es-url')).toEqual({
      raw: 'https://ok.ngrok-free.app',
      origin: 'query',
    });
  });

  it('sin env ni overrides no hay live: el build publicado no cambia', () => {
    expect(resolveApiBase(undefined, null, null)).toBeNull();
    expect(resolveApiBase('', '', '')).toBeNull();
  });

  it('lee `?api=` de la página, sin confundirse con otros parámetros', () => {
    expect(readQueryApi('?api=https://abc.ngrok-free.app')).toBe('https://abc.ngrok-free.app');
    expect(readQueryApi('api=https%3A%2F%2Fabc.ngrok-free.app')).toBe(
      'https://abc.ngrok-free.app',
    );
    expect(readQueryApi('?foo=1&api=https://x.ngrok-free.app&bar=2')).toBe('https://x.ngrok-free.app');
    expect(readQueryApi('?foo=1')).toBeNull();
    expect(readQueryApi('')).toBeNull();
    expect(readQueryApi(null)).toBeNull();
  });

  it('`?api=off` es la salida del override guardado', () => {
    expect(isClearApiCommand('off')).toBe(true);
    expect(isClearApiCommand(' OFF ')).toBe(true);
    expect(isClearApiCommand('https://x.ngrok-free.app')).toBe(false);
    expect(isClearApiCommand(null)).toBe(false);
    expect(isClearApiCommand('')).toBe(false);
  });
});

describe('zona demo elegida', () => {
  it('sin elección no hay zona: la UI tiene que preguntar, no adivinar', () => {
    expect(resolveZone(null, null)).toBeNull();
    expect(resolveZone(undefined, undefined)).toBeNull();
    expect(resolveZone('', '   ')).toBeNull();
  });

  it('`?zone=` gana sobre lo guardado y se normaliza', () => {
    expect(resolveZone(' BOGOTA ', 'cdmx')).toBe('bogota');
    expect(resolveZone('cdmx', null)).toBe('cdmx');
    expect(resolveZone(null, 'bogota')).toBe('bogota');
  });

  it('una clave con forma inválida no viaja: se sigue con lo guardado', () => {
    expect(resolveZone('javascript:alert(1)', 'cdmx')).toBe('cdmx');
    expect(resolveZone('CDMX!', null)).toBeNull();
    expect(normalizeZoneKey('  cdmx  ')).toBe('cdmx');
    expect(normalizeZoneKey('no es una zona')).toBeNull();
    expect(normalizeZoneKey(null)).toBeNull();
  });

  it('lee `?zone=` sin confundirse con otros parámetros', () => {
    expect(readQueryZone('?zone=bogota')).toBe('bogota');
    expect(readQueryZone('?api=off&zone=cdmx')).toBe('cdmx');
    expect(readQueryZone('?api=off')).toBeNull();
    expect(readQueryZone(null)).toBeNull();
  });

  it('`?zone=off` es el reset de la zona; `?api=off` no la toca', () => {
    expect(isClearZoneCommand('off')).toBe(true);
    expect(isClearZoneCommand(' OFF ')).toBe(true);
    expect(isClearZoneCommand('cdmx')).toBe(false);
    expect(isClearZoneCommand(null)).toBe(false);
    expect(isClearApiCommand('cdmx')).toBe(false);
  });
});

/**
 * El storage real del navegador no existe en `environment: 'node'`, así que se
 * inyecta `window` con un `localStorage` de memoria. Es la única forma de
 * probar que la elección **sobrevive a una recarga** sin un navegador.
 */
describe('zona persistida entre cargas', () => {
  type FakeWindow = { location: { search: string }; localStorage: Map<string, string> & {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
  } };

  function withWindow<T>(
    search: string,
    run: (map: Map<string, string>) => T,
  ): { result: T; stored: Map<string, string> } {
    const map = new Map<string, string>();
    const store = map as FakeWindow['localStorage'];
    store.getItem = (key) => map.get(key) ?? null;
    store.setItem = (key, value) => {
      map.set(key, value);
    };
    store.removeItem = (key) => {
      map.delete(key);
    };
    const globals = globalThis as unknown as { window?: FakeWindow };
    globals.window = { location: { search }, localStorage: store };
    try {
      return { result: run(map), stored: map };
    } finally {
      delete globals.window;
    }
  }

  afterEach(() => {
    delete (globalThis as unknown as { window?: FakeWindow }).window;
  });

  it('sin storage no hay zona: el runtime sin DOM no inventa una', () => {
    expect(readStoredZone()).toBeNull();
    expect(readRuntimeZone()).toBeNull();
  });

  it('la elección se lee después de escribirse (la recarga no vuelve a mx)', () => {
    const { result, stored } = withWindow('', () => {
      writeStoredZone('bogota');
      return readRuntimeZone();
    });
    expect(result).toBe('bogota');
    expect(stored.get('nearbyig.demoZone')).toBe('bogota');
  });

  it('`?zone=` fija y persiste la zona de la URL', () => {
    const { result, stored } = withWindow('?zone=cdmx', () => readRuntimeZone());
    expect(result).toBe('cdmx');
    expect(stored.get('nearbyig.demoZone')).toBe('cdmx');
  });

  it('`?zone=off` borra la elección y no toca el override de API', () => {
    const { result, stored } = withWindow('?zone=off', (map) => {
      writeStoredZone('cdmx');
      map.set('nearbyig.api', 'https://tunel.ejemplo');
      return readRuntimeZone();
    });
    expect(result).toBeNull();
    expect(stored.get('nearbyig.demoZone')).toBeUndefined();
    expect(stored.get('nearbyig.api')).toBe('https://tunel.ejemplo');
  });

  it('`?api=off` no borra la zona elegida', () => {
    const { result, stored } = withWindow('?api=off', () => {
      writeStoredZone('bogota');
      return readRuntimeZone();
    });
    expect(result).toBe('bogota');
    expect(stored.get('nearbyig.demoZone')).toBe('bogota');
  });
});
