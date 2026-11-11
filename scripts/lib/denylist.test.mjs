import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  FLUTTER_LOADER_FALLBACKS,
  deniedReason,
  scanText,
  stripFlutterLoaderFallbacks,
} from './denylist.mjs';

/**
 * Regresión del falso positivo que bloqueaba el build real de Flutter: el
 * loader del engine embebe `https://www.gstatic.com/flutter-canvaskit/` y
 * `https://fonts.gstatic.com/s/` como fallback, aunque la demo sirva CanvasKit
 * local. Se permiten sólo en los archivos de framework; cualquier otro host,
 * archivo o secreto sigue bloqueado.
 */

const CANVASKIT_FALLBACK = `return i.canvasKitBaseUrl?i.canvasKitBaseUrl:
  e.engineRevision&&!e.useLocalCanvasKit?I("${FLUTTER_LOADER_FALLBACKS[0]}",e.engineRevision):"canvaskit"`;
const FONT_FALLBACK = `return s==null?"${FLUTTER_LOADER_FALLBACKS[1]}":s`;

const FRAMEWORK_FILES = [
  'site/flutter/flutter.js',
  'site/flutter/flutter_bootstrap.js',
  'site/flutter/main.dart.js',
  'site/flutter/flutter_service_worker.js',
  'flutter.js',
];

test('permite los fallbacks del loader en los archivos de framework', () => {
  for (const path of FRAMEWORK_FILES) {
    assert.deepEqual(scanText(`${CANVASKIT_FALLBACK}\n${FONT_FALLBACK}`, { path }), []);
  }
});

test('el fallback sigue bloqueado fuera de los archivos de framework', () => {
  const findings = scanText(`<script src="${FLUTTER_LOADER_FALLBACKS[0]}abc/canvaskit.js"></script>`, {
    path: 'site/index.html',
  });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, 'host');
  assert.equal(findings[0].label, 'gstatic.com');

  // Sin `path` (llamada cruda) tampoco hay allowlist.
  assert.equal(scanText(FLUTTER_LOADER_FALLBACKS[0]).length, 1);
});

test('una URL externa real dentro del framework se rechaza', () => {
  const gstaticOther = scanText('const u="https://www.gstatic.com/other/asset.js"', {
    path: 'site/flutter/main.dart.js',
  });
  assert.equal(gstaticOther.length, 1);
  assert.equal(gstaticOther[0].label, 'gstatic.com');

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

test('stripFlutterLoaderFallbacks sólo toca archivos de framework', () => {
  const text = `<a href="${FLUTTER_LOADER_FALLBACKS[1]}">x</a>`;
  assert.equal(stripFlutterLoaderFallbacks('site/expo/index.html', text), text);
  assert.ok(!stripFlutterLoaderFallbacks('site/flutter/main.dart.js', text).includes('gstatic.com'));
});

test('la denylist de archivos no se relaja', () => {
  assert.equal(deniedReason('nearbyig-app-complete.zip'), '*.zip');
  assert.equal(deniedReason('site/release.keystore'), '*.keystore');
  assert.equal(deniedReason('site/.env.local'), '.env.*');
  assert.equal(deniedReason('site/google-services.json'), 'google-services.json');
  assert.equal(deniedReason('site/node_modules/react/index.js'), 'directorio node_modules');
  assert.equal(deniedReason('site/expo/index.html'), null);
});
