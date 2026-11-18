import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * El seam de plataforma del basemap, como invariantes estáticos sobre `src/`.
 *
 * Historia: hasta este change el radar nativo no tenía mapa real porque
 * `MapBasemap.tsx` cortaba con `Platform.OS !== 'web'`. Ahora hay **un estilo y
 * dos renderers**, y la elección no es un `if`: es la extensión del archivo.
 * Metro resuelve `MapBasemap.native.tsx` en android/ios y `MapBasemap.tsx` en
 * web; lo que se testea acá es que esa sea la única puerta y que ningún paquete
 * cruce de lado:
 *
 * - MapLibre Native sólo lo nombra el renderer `.native`;
 * - MapLibre GL JS sólo vive en el renderer web y en el estilo compartido (y en
 *   `style.ts` **sólo como tipo**: el estilo es dato, no código del motor);
 * - el renderer nativo no tiene DOM (`document`/`window`) que consultar;
 * - el renderer web ya no pregunta por la plataforma: si volviera el `if`, el
 *   binario volvería a mostrar la ilustración sin mapa;
 * - las props del `Map` nativo son un contrato visual: textura obligatoria,
 *   cero gestos y cero ornamentos del SDK.
 *
 * Los escenarios de render (tiles reales, orden de capas en device) no se
 * unit-testean: esto congela el seam, no la composición.
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

/** Ruta relativa a `src/` con barras normales: igual en Windows y en CI. */
function key(absolute: string): string {
  return relative(SRC, absolute).replace(/\\/g, '/');
}

const FILES = walk(SRC).map((absolute) => ({
  path: key(absolute),
  text: readFileSync(absolute, 'utf8'),
}));

/** Quien nombra el paquete como **specifier** de módulo (import o require). */
function modulesNaming(specifier: string): string[] {
  // El string entrecomillado exacto y no la substring: `basemap.ts` documenta
  // `maplibre-gl.mjs` en un comentario sobre la fórmula de zoom, y eso no es una
  // dependencia del motor (mismo criterio que privacy.test.ts con `expo-location`).
  const pattern = new RegExp(`['"]${specifier.replace(/[/.]/g, '\\$&')}['"]`);
  return FILES.filter((file) => pattern.test(file.text))
    .map((file) => file.path)
    .sort();
}

const NATIVE_RENDERER = 'map/MapBasemap.native.tsx';
const WEB_RENDERER = 'map/MapBasemap.tsx';
const STYLE = 'map/style.ts';

const native = FILES.find((file) => file.path === NATIVE_RENDERER);
const web = FILES.find((file) => file.path === WEB_RENDERER);
const style = FILES.find((file) => file.path === STYLE);

describe('seam de plataforma del basemap', () => {
  it('hay archivos para escanear y existen los dos renderers', () => {
    expect(FILES.length).toBeGreaterThan(20);
    expect(native, `falta src/${NATIVE_RENDERER}`).toBeDefined();
    expect(web, `falta src/${WEB_RENDERER}`).toBeDefined();
    expect(style, `falta src/${STYLE}`).toBeDefined();
  });

  it('MapLibre Native sólo lo nombra el renderer nativo', () => {
    // Metro elige por extensión: si el paquete aparece en otro módulo (o como
    // string suelto, por ejemplo en un `require`), el bundle web puede alcanzarlo.
    const mentioners = FILES.filter((file) => file.text.includes('@maplibre/maplibre-react-native'))
      .map((file) => file.path)
      .sort();
    expect(mentioners).toEqual([NATIVE_RENDERER]);
    expect(modulesNaming('@maplibre/maplibre-react-native')).toEqual([NATIVE_RENDERER]);
  });

  it('MapLibre GL JS sólo vive en el renderer web y en el estilo compartido', () => {
    expect(modulesNaming('maplibre-gl')).toEqual([WEB_RENDERER, STYLE].sort());
  });

  it('el estilo importa los tipos de GL JS, nunca su runtime', () => {
    // `import type` se borra en compilación: el estilo es agnóstico de renderer.
    // Un import de valor arrastraría el motor de JS al bundle nativo.
    const text = style?.text ?? '';
    expect(text).toMatch(/^import type \{[^}]*\} from ['"]maplibre-gl['"];$/m);
    expect(text).not.toMatch(/^import \{[^}]*\} from ['"]maplibre-gl['"];$/m);
    expect(text).not.toMatch(/import\(['"]maplibre-gl['"]\)/);
  });

  it('el renderer nativo no tiene DOM: ni `document` ni `window`', () => {
    // En el puente de RN esas globals no existen; nombrarlas es creer que se
    // corre en un navegador.
    expect(native?.text ?? '').not.toMatch(/\bdocument\b/);
    expect(native?.text ?? '').not.toMatch(/\bwindow\b/);
  });

  it('el renderer web ya no pregunta por la plataforma', () => {
    // El gate `Platform.OS !== 'web'` era la razón por la que el APK mostraba la
    // ilustración. Si vuelve, el binario pierde el mapa aunque exista el .native.
    const text = web?.text ?? '';
    expect(text).not.toMatch(/Platform\.OS/);
    expect(text).not.toMatch(/import \{[^}]*\bPlatform\b[^}]*\} from ['"]react-native['"]/);
  });

  it('el renderer nativo usa el estilo compartido y la vista de textura', () => {
    const text = native?.text ?? '';
    expect(text).toMatch(/import \{ mapStyle \} from ['"]\.\/style['"];/);
    // `surface` (el default) ignora el alpha del padre y perfora el z-order:
    // el mapa taparía anillos y puntos antes de `ready`.
    expect(text).toMatch(/androidView="texture"/);
  });

  it('el `Map` nativo no es interactivo y no trae ornamentos del SDK', () => {
    const text = native?.text ?? '';
    // 6 gestos: los puntos son el único blanco de toque.
    for (const prop of [
      'dragPan',
      'touchZoom',
      'touchRotate',
      'touchPitch',
      'doubleTapZoom',
      'doubleTapHoldZoom',
    ]) {
      expect(text, `${prop} debe estar en false`).toContain(`${prop}={false}`);
    }
    // 4 ornamentos: la atribución del contrato la dibuja el radar, no el mapa.
    for (const prop of ['attribution', 'logo', 'compass', 'scaleBar']) {
      expect(text, `${prop} debe estar en false`).toContain(`${prop}={false}`);
    }
  });
});
