#!/usr/bin/env node
/**
 * Copia el worker de MapLibre a `public/` para que el export web lo publique en
 * la raíz del sitio (`/expo/maplibre-gl-worker.js`).
 *
 * Por qué: MapLibre 6 crea el worker con `new Worker(new URL(
 * './maplibre-gl-worker.mjs', import.meta.url))`. Metro no emite ese archivo en
 * el export (`expó query` verificado: sólo `maplibre-gl-*.js`), así que sin esta
 * copia el navegador pide un 404 y el mapa nunca pasa de `loading`.
 *
 * Se copia como `.js` (no `.mjs`) porque GitHub Pages no garantiza
 * `text/javascript` para `.mjs`, y un module worker con MIME incorrecto falla.
 * Sigue siendo module worker: MapLibre sólo usa el modo clásico para `.cjs`.
 *
 * `MapBasemap` apunta acá con `setWorkerUrl(new URL('maplibre-gl-worker.js',
 * document.baseURI))`, que respeta el base path del deploy.
 */

import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'node_modules', 'maplibre-gl', 'dist', 'maplibre-gl-worker.mjs');
const targetDir = join(root, 'public');
const target = join(targetDir, 'maplibre-gl-worker.js');

if (!existsSync(source)) {
  console.warn('[map] maplibre-gl no instalado: worker no copiado (corré npm ci).');
  process.exit(0);
}

mkdirSync(targetDir, { recursive: true });
copyFileSync(source, target);
console.log('[map] worker copiado a public/maplibre-gl-worker.js');
