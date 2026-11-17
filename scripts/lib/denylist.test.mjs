import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  EXPO_GO_DEAD_CODE,
  MAPLIBRE_DEAD_CODE,
  auditText,
  deniedReason,
  scanText,
  stripKnownDeadCode,
} from './denylist.mjs';

/**
 * Regresión de los recortes de código muerto del artefacto.
 *
 * `stripKnownDeadCode` sólo tolera formas exactas dentro de archivos de
 * terceros: el código muerto de Expo Go que `expo-asset` embebe en el bundle
 * web (`NativeModules['ExponentKernel']`) y los links de atribución/logo que
 * MapLibre trae como default de controles que la demo nunca monta.
 *
 * Todo lo demás sigue bloqueado, y `gstatic.com` no tiene excepción: al retirar
 * la allowlist del engine viejo, cualquier aparición de ese host es un ofensor
 * en cualquier archivo, con o sin `path`.
 */

const EXPO_BUNDLE = 'site/expo/_expo/static/js/web/index-ed66ca93043b238daecd77c3f7868d90.js';
const EXPO_GO_SNIPPET =
  'if(n.default.ExponentKernel)return{uri:`https://classic-assets.eascdn.net/~assets/${encodeURIComponent(l)}`,hash:l};return{uri:"",hash:l}';

test('gstatic se rechaza en cualquier archivo, con o sin path', () => {
  const cdn = 'const u="https://www.gstatic.com/canvaskit/1.0/canvaskit.wasm"';

  assert.deepEqual(
    scanText(cdn, { path: 'site/expo/index.html' }).map((finding) => finding.label),
    ['gstatic.com'],
  );
  assert.deepEqual(
    scanText(cdn).map((finding) => finding.label),
    ['gstatic.com'],
  );

  // El texto queda intacto: ya no hay archivos "de framework" que se recorten.
  assert.equal(stripKnownDeadCode('site/expo/index.html', cdn), cdn);
  assert.equal(stripKnownDeadCode('site/canvaskit/index.html', cdn), cdn);
});

test('el código muerto de Expo Go se permite sólo en el bundle web de Expo', () => {
  assert.deepEqual(scanText(EXPO_GO_SNIPPET, { path: EXPO_BUNDLE }), []);

  // Falla en cualquier otro archivo del artefacto.
  const outside = scanText(EXPO_GO_SNIPPET, { path: 'site/index.html' });
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

test('stripKnownDeadCode sólo toca los bundles donde el framework lo embebe', () => {
  const text = 'if(n.default.ExponentKernel)return{uri:`https://classic-assets.eascdn.net/~assets/${l}`}';
  assert.equal(stripKnownDeadCode('site/index.html', text), text);
  assert.ok(!stripKnownDeadCode(EXPO_BUNDLE, text).includes('eascdn.net'));
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
