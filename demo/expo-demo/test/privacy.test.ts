import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { DEMO_CENTER } from '../src/map/basemap';

/**
 * Privacidad del basemap: el mapa es de referencia, no del usuario.
 *
 * - cero APIs de geolocalización en `src/` (ni permisos, ni watch);
 * - el centro de demo vive en un único módulo: no se lee de IP, cookies ni
 *   storage;
 * - las URLs absolutas sólo existen en `src/map/` (el host único del basemap);
 * - no hay cookies, `localStorage`, `sessionStorage` ni `indexedDB`.
 */
const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src');

function walk(directory: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(absolute));
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry.name)) out.push(absolute);
  }
  return out;
}

const FILES = walk(SRC).map((absolute) => ({
  path: relative(SRC, absolute).replace(/\\/g, '/'),
  text: readFileSync(absolute, 'utf8'),
}));

describe('privacidad del basemap', () => {
  it('hay archivos para escanear', () => {
    expect(FILES.length).toBeGreaterThan(20);
  });

  it('ningún archivo usa geolocalización', () => {
    for (const file of FILES) {
      expect(file.text, file.path).not.toMatch(/geolocation|getCurrentPosition|watchPosition/i);
    }
  });

  it('ningún archivo pide permisos ni lee la ubicación del dispositivo', () => {
    for (const file of FILES) {
      expect(file.text, file.path).not.toMatch(/permissions\.query|navigator\.geolocation/i);
    }
  });

  it('el centro de demo se declara una sola vez', () => {
    const withCenter = FILES.filter((file) => file.text.includes('export const DEMO_CENTER'));
    expect(withCenter.map((file) => file.path)).toEqual(['map/basemap.ts']);
    expect(DEMO_CENTER.lat).toBeLessThan(0);
  });

  it('las URLs absolutas sólo viven en src/map/', () => {
    for (const file of FILES) {
      if (file.path.startsWith('map/')) continue;
      expect(file.text, file.path).not.toMatch(/https?:\/\//i);
    }
  });

  it('no hay cookies ni storage', () => {
    for (const file of FILES) {
      expect(file.text, file.path).not.toMatch(/document\.cookie|localStorage|sessionStorage|indexedDB/i);
    }
  });
});
