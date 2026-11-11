import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  EXPO_GO_DEAD_CODE,
  FLUTTER_LOADER_FALLBACK_PATTERNS,
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

test('la denylist de archivos no se relaja', () => {
  assert.equal(deniedReason('nearbyig-app-complete.zip'), '*.zip');
  assert.equal(deniedReason('site/release.keystore'), '*.keystore');
  assert.equal(deniedReason('site/.env.local'), '.env.*');
  assert.equal(deniedReason('site/google-services.json'), 'google-services.json');
  assert.equal(deniedReason('site/node_modules/react/index.js'), 'directorio node_modules');
  assert.equal(deniedReason('site/expo/index.html'), null);
});
