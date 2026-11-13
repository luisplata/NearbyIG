import { describe, expect, it } from 'vitest';

import {
  DEFAULT_DEMO_REGION,
  normalizeBaseUrl,
  normalizeRegion,
  readLiveSettings,
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
