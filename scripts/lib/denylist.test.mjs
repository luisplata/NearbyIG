import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  EXPO_GO_DEAD_CODE,
  FLUTTER_LOADER_FALLBACK_PATTERNS,
  MAPLIBRE_DEAD_CODE,
  auditText,
  deniedReason,
  scanText,
  stripKnownDeadCode,
} from './denylist.mjs';

/**
 * Regresión del falso positivo que bloqueaba el build real de Flutter: el loader
 * del engine embebe `https://www.gstatic.com/flutter-canvaskit/<revisión>/` y
 * `https://fonts.gstatic.com/s/` como default, aunque la demo sirva CanvasKit
 * local y la Inter bundleada. Se permiten sólo esas formas exactas en los
 * archivos de framework; cualquier otro host, URL real o secreto sigue bloqueado.
 *
 * Misma regla para `classic-assets.eascdn.net`: es código muerto de Expo Go
 * (`NativeModules['ExponentKernel']`) embebido por `expo-asset` en el bundle web.
 */

// Fragmentos con la forma real que embeben el loader y el engine de Flutter 3.41.2.
const CANVASKIT_LOADER =
  'e.engineRevision&&!e.useLocalCanvasKit?I("https://www.gstatic.com/flutter-canvaskit",e.engineRevision):"canvaskit"';
const CANVASKIT_FALLBACK =
  'return(s==null?"https://www.gstatic.com/flutter-canvaskit/6c0baaebf70e0148f485f27d5616b3d3382da7bf/":s)+a';
const FONT_FALLBACK = 'return s==null?"https://fonts.gstatic.com/s/":s';

const FRAMEWORK_FILES = [
  'site/flutter/flutter.js',
  'site/flutter/flutter_bootstrap.js',
  'site/flutter/main.dart.js',
  'site/flutter/flutter_service_worker.js',
  'flutter.js',
];

const EXPO_BUNDLE = 'site/expo/_expo/static/js/web/index-ed66ca93043b238daecd77c3f7868d90.js';
const EXPO_GO_SNIPPET =
  'if(n.default.ExponentKernel)return{uri:`https://classic-assets.eascdn.net/~assets/${encodeURIComponent(l)}`,hash:l};return{uri:"",hash:l}';

test('permite los fallbacks del loader en los archivos de framework', () => {
  for (const path of FRAMEWORK_FILES) {
    assert.deepEqual(
      scanText(`${CANVASKIT_LOADER}\n${CANVASKIT_FALLBACK}\n${FONT_FALLBACK}`, { path }),
      [],
    );
  }
});

test('el fallback sigue bloqueado fuera de los archivos de framework', () => {
  const findings = scanText(`<script src="${CANVASKIT_FALLBACK}"></script>`, {
    path: 'site/index.html',
  });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, 'host');
  assert.equal(findings[0].label, 'gstatic.com');

  // Sin `path` (llamada cruda) tampoco hay allowlist.
  assert.equal(scanText(CANVASKIT_FALLBACK).length, 1);
});

test('una URL externa real dentro del framework se rechaza', () => {
  const gstaticOther = scanText('const u="https://www.gstatic.com/other/asset.js"', {
    path: 'site/flutter/main.dart.js',
  });
  assert.equal(gstaticOther.length, 1);
  assert.equal(gstaticOther[0].label, 'gstatic.com');

  // El default de `fontFallbackBaseUrl` termina en la cadena; un pedido real de
  // fuente agrega un path y NO se enmascara.
  const realFontRequest = scanText(
    'const u="https://fonts.gstatic.com/s/inter/v13/abc123.woff2"',
    { path: 'site/flutter/main.dart.js' },
  );
  assert.equal(realFontRequest.length, 1);
  assert.equal(realFontRequest[0].label, 'gstatic.com');

  const cdn = scanText('fetch("https://cdn.jsdelivr.net/npm/lib.js")', {
    path: 'site/flutter/main.dart.js',
  });
  assert.deepEqual(
    cdn.map((finding) => finding.label),
    ['cdn.*'],
  );

  const instagram = scanText('window.open("https://instagram.com/x")', {
    path: 'site/flutter/flutter.js',
  });
  assert.deepEqual(
    instagram.map((finding) => finding.label),
    ['instagram.com'],
  );
});

test('los secretos se siguen detectando dentro del framework', () => {
  const findings = scanText(`var k="AIza${'a'.repeat(35)}"; ${CANVASKIT_FALLBACK}`, {
    path: 'site/flutter/main.dart.js',
  });
  assert.deepEqual(
    findings.map((finding) => finding.kind),
    ['secret'],
  );
  assert.equal(findings[0].label, 'Google API key');
});

test('stripKnownDeadCode sólo toca archivos de framework', () => {
  const text = `<a href="https://fonts.gstatic.com/s/">x</a>`;
  assert.equal(stripKnownDeadCode('site/expo/index.html', text), text);
  assert.ok(!stripKnownDeadCode('site/flutter/main.dart.js', text).includes('gstatic.com'));

  for (const entry of FLUTTER_LOADER_FALLBACK_PATTERNS) {
    assert.ok(entry.label.length > 0);
  }
});

test('el código muerto de Expo Go se permite sólo en el bundle web de Expo', () => {
  assert.deepEqual(scanText(EXPO_GO_SNIPPET, { path: EXPO_BUNDLE }), []);

  // Falla en cualquier otro archivo del artefacto (incluido el bundle de Flutter).
  const outside = scanText(EXPO_GO_SNIPPET, { path: 'site/flutter/main.dart.js' });
  assert.deepEqual(
    outside.map((finding) => finding.label),
    ['eascdn.net'],
  );

  // Un pedido real a eascdn.net no es la forma exacta del template: se rechaza.
  const realRequest = scanText(
    'fetch("https://classic-assets.eascdn.net/updates/manifest.json")',
    { path: EXPO_BUNDLE },
  );
  assert.deepEqual(
    realRequest.map((finding) => finding.label),
    ['eascdn.net'],
  );

  assert.ok(EXPO_GO_DEAD_CODE.path.test(EXPO_BUNDLE));
  assert.ok(!EXPO_GO_DEAD_CODE.path.test('site/expo/index.html'));
});

test('un host desconocido en posición pedible es un finding request-host', () => {
  const findings = scanText('const t=await fetch("https://example.org/tiles.json")', {
    path: 'site/expo/_expo/static/js/web/index-abc.js',
  });
  assert.deepEqual(
    findings.map((finding) => [finding.kind, finding.label]),
    [['request-host', 'example.org']],
  );
});

test('request-host convive con los prohibidos sin duplicar la etiqueta', () => {
  const findings = scanText(
    'fetch("https://example.org/a");fetch("https://maps.googleapis.com/maps/api/js");' +
      `var k="AIza${'a'.repeat(35)}";`,
    { path: 'site/expo/_expo/static/js/web/index-abc.js' },
  );
  assert.deepEqual(
    findings.map((finding) => [finding.kind, finding.label]),
    [
      ['host', 'googleapis.com'],
      ['request-host', 'example.org'],
      ['secret', 'Google API key'],
    ],
  );
});

test('un host benigno no produce findings ni ocurrencias', () => {
  const result = auditText('<svg xmlns="http://www.w3.org/2000/svg"></svg>', {
    path: 'site/expo/index.html',
  });
  assert.deepEqual(result.findings, []);
  assert.deepEqual(result.occurrences, []);
});

test('el strip de Flutter corre antes de la regla posicional', () => {
  // En el archivo del engine la forma exacta se recorta: no queda ni `host` ni
  // un `request-host` duplicado.
  assert.deepEqual(scanText(`<script src="${CANVASKIT_FALLBACK}"></script>`, {
    path: 'site/flutter/flutter.js',
  }), []);

  // Fuera del engine la URL es un pedido real: gana la prohibición
  // incondicional y no se repite como `request-host`.
  const outside = scanText(`<script src="${CANVASKIT_FALLBACK}"></script>`, {
    path: 'site/index.html',
  });
  assert.deepEqual(
    outside.map((finding) => finding.kind),
    ['host'],
  );
});

test('los links de atribución/logo de MapLibre se recortan sólo en su chunk', () => {
  const attribution =
    'const qz={compact:!0,customAttribution:"<a href=\\"https://maplibre.org/\\" target=\\"_blank\\">MapLibre</a>"};';
  const logo =
    'return t.target="_blank",t.rel="noopener nofollow",t.href="https://maplibre.org/",t.setAttribute("aria-label",x)';
  const chunk = 'site/expo/_expo/static/js/web/maplibre-gl-3bd86c6e7479129125a210f527cfd951.js';

  assert.ok(MAPLIBRE_DEAD_CODE.path.test(chunk));
  assert.deepEqual(scanText(`${attribution}\n${logo}`, { path: chunk }), []);

  // Fuera del chunk de MapLibre el mismo href es un pedido y bloquea.
  const outside = scanText('<a href="https://maplibre.org/">MapLibre</a>', {
    path: 'site/index.html',
  });
  assert.deepEqual(
    outside.map((finding) => [finding.kind, finding.label]),
    [['request-host', 'maplibre.org']],
  );

  // Y el recorte no tolera otro path de `maplibre.org` dentro del chunk.
  const otherPath = scanText('fetch("https://maplibre.org/api/x.json")', { path: chunk });
  assert.deepEqual(
    otherPath.map((finding) => finding.label),
    ['maplibre.org'],
  );
});

test('los hosts benignos de MapLibre se toleran sólo en texto', () => {
  const chunk = 'site/expo/_expo/static/js/web/maplibre-gl-abc.js';
  const message =
    'Read more on https://wiki.openstreetmap.org/wiki/This_map_requires_WebGL";}' +
    ' const base = new URL(t, "https://maplibre.invalid/");';
  assert.deepEqual(scanText(message, { path: chunk }), []);

  const baseAsFetch = scanText('fetch("https://maplibre.invalid/x")', { path: chunk });
  assert.deepEqual(
    baseAsFetch.map((finding) => finding.label),
    ['maplibre.invalid'],
  );
});

test('la denylist de archivos no se relaja', () => {
  assert.equal(deniedReason('nearbyig-app-complete.zip'), '*.zip');
  assert.equal(deniedReason('site/release.keystore'), '*.keystore');
  assert.equal(deniedReason('site/.env.local'), '.env.*');
  assert.equal(deniedReason('site/google-services.json'), 'google-services.json');
  assert.equal(deniedReason('site/node_modules/react/index.js'), 'directorio node_modules');
  assert.equal(deniedReason('site/expo/index.html'), null);
});
