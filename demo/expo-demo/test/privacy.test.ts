import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { DEMO_CENTER } from '../src/map/basemap';

/**
 * Privacidad de la demo, como invariantes estáticos sobre `src/`.
 *
 * Historia: hasta el sprint 3 el basemap era un mapa de referencia y la app no
 * pedía ubicación en ningún lado. Ahora el modo live puede pedir la ubicación
 * real para mandarla **sólo** al `PUT /presence` (contrato: es la única entrada
 * que acepta coordenadas), así que el invariante cambió de "cero geolocalización"
 * a "una sola puerta, un solo destino":
 *
 * - la ubicación se pide en un único módulo (`live/geolocation.ts`) y nunca se
 *   sigue en el tiempo (`watchPosition`);
 * - el punto no se guarda en ningún storage ni en una cookie: el navegador lo
 *   conserva en memoria el tiempo que dura la sesión, y el server lo descarta al
 *   proyectar región y zona;
 * - las URLs absolutas sólo existen donde se configuran (basemap y override de
 *   API), no repartidas por la UI;
 * - el centro de demo (Buenos Aires) es una constante, no un dato del usuario.
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

/** Único módulo autorizado a hablar con la API de geolocalización del navegador. */
const GEOLOCATION_MODULE = 'live/geolocation.ts';
/** Único módulo autorizado a tocar storage: guarda la base de la API, no el punto. */
const STORAGE_MODULE = 'live/config.ts';
/** Módulos donde se configuran URLs absolutas de verdad (mapa y override). */
const URL_MODULES = ['map/basemap.ts', 'map/style.ts', 'map/MapBasemap.tsx', 'live/config.ts'];

describe('privacidad de la ubicación', () => {
  it('hay archivos para escanear', () => {
    expect(FILES.length).toBeGreaterThan(20);
  });

  it('la ubicación sólo se pide en un módulo', () => {
    const offenders = FILES.filter((file) =>
      /navigator\.geolocation|getCurrentPosition|permissions\.query/i.test(file.text),
    )
      .map((file) => file.path)
      .filter((path) => path !== GEOLOCATION_MODULE);
    expect(offenders).toEqual([]);
  });

  it('no hay seguimiento continuo de la ubicación', () => {
    for (const file of FILES) {
      expect(file.text, file.path).not.toMatch(/watchPosition|clearWatch/i);
    }
  });

  it('el punto no se guarda: storage sólo para la base de la API', () => {
    const offenders = FILES.filter((file) =>
      /document\.cookie|localStorage|sessionStorage|indexedDB/i.test(file.text),
    )
      .map((file) => file.path)
      .filter((path) => path !== STORAGE_MODULE);
    expect(offenders).toEqual([]);

    // El módulo que escribe en storage no puede nombrar una coordenada: así no
    // hay forma de que un punto termine persistido en el navegador.
    const storage = FILES.find((file) => file.path === STORAGE_MODULE);
    expect(storage).toBeDefined();
    expect(storage?.text ?? '').not.toMatch(/\blat(itude)?\b|\blng\b/i);
  });

  it('el centro de demo se declara una sola vez y es del build', () => {
    const withCenter = FILES.filter((file) => file.text.includes('export const DEMO_CENTER'));
    expect(withCenter.map((file) => file.path)).toEqual(['map/basemap.ts']);
    expect(DEMO_CENTER.lat).toBeLessThan(0);
  });

  it('las URLs absolutas sólo viven donde se configuran', () => {
    for (const file of FILES) {
      if (URL_MODULES.includes(file.path)) continue;
      expect(file.text, file.path).not.toMatch(/https?:\/\//i);
    }
  });
});
