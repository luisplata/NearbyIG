import { describe, expect, it } from 'vitest';

import {
  DEFAULT_DEMO_REGION,
  isClearApiCommand,
  isHttpBaseUrl,
  normalizeBaseUrl,
  normalizeRegion,
  readLiveSettings,
  readQueryApi,
  resolveApiBase,
} from '../src/live/config';

describe('base de la API', () => {
  it('sin variable no hay modo live (no hay default ni valor de producción)', () => {
    expect(readLiveSettings(undefined, undefined)).toBeNull();
    expect(readLiveSettings('', undefined)).toBeNull();
    expect(readLiveSettings('   ', undefined)).toBeNull();
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
    expect(readLiveSettings('/api', 'mx')).toEqual({ baseUrl: '/api', region: 'mx' });
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

describe('región de la demo', () => {
  it('cae en mx cuando no hay variable', () => {
    expect(normalizeRegion(undefined)).toBe(DEFAULT_DEMO_REGION);
    expect(DEFAULT_DEMO_REGION).toBe('mx');
  });

  it('acepta cualquier RegionKey del contrato (dos minúsculas)', () => {
    expect(normalizeRegion('co')).toBe('co');
    expect(normalizeRegion(' CO ')).toBe('co');
  });

  it('una región inválida no viaja: vuelve al default', () => {
    expect(normalizeRegion('mexico')).toBe('mx');
    expect(normalizeRegion('M')).toBe('mx');
    expect(normalizeRegion('')).toBe('mx');
    expect(normalizeRegion('1x')).toBe('mx');
  });
});
