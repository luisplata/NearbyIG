import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ALLOWED_REQUEST_HOSTS,
  BENIGN_TEXT_HOSTS,
  REQUEST_POSITION,
  compareHostSets,
  scanRequestHosts,
} from './request-hosts.mjs';

/**
 * Regla posicional de hosts: el artefacto puede pedir **un solo** host; los
 * literales benignos del artefacto real (namespaces, licencias, mensajes de
 * error) se toleran únicamente fuera de posición pedible.
 *
 * Cada caso está nombrado por la **forma** que evalúa, no por el archivo donde
 * apareció: si mañana cambia el minificador, el test sigue diciendo qué regla
 * se rompió.
 */

const labels = (text) => scanRequestHosts(text).findings.map((finding) => finding.label);

test('un segundo host pedible en fetch( falla', () => {
  assert.deepEqual(labels('fetch("https://tile.openstreetmap.org/5/10/10.png")'), [
    'tile.openstreetmap.org',
  ]);
});

test('un segundo host pedible como style: de MapLibre falla', () => {
  assert.deepEqual(labels('new Map({style:"https://demotiles.maplibre.org/style.json"})'), [
    'demotiles.maplibre.org',
  ]);
});

test('un host benigno en href= falla', () => {
  assert.deepEqual(labels('<a href="https://www.w3.org/2000/svg">x</a>'), ['www.w3.org']);
});

test('un host benigno en url( de CSS falla', () => {
  assert.deepEqual(labels('.a{background:url(https://scripts.sil.org/OFL)}'), ['scripts.sil.org']);
});

test('un host benigno en src= falla aunque el host exista en el artefacto', () => {
  assert.deepEqual(labels('<script src="https://react.dev/errors/418.js"></script>'), ['react.dev']);
});

test('xmlns no es posición pedible: el namespace de SVG pasa', () => {
  assert.deepEqual(labels('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), []);
});

test('la licencia con scripts.sil.org pasa en texto', () => {
  assert.deepEqual(labels('available with a FAQ at:\nhttp://scripts.sil.org/OFL'), []);
});

test('un host benigno en texto plano se tolera', () => {
  assert.deepEqual(labels('const url = "Consultá https://react.dev/errors/418";'), []);
  assert.deepEqual(labels('// ver https://github.com/rsms/inter para la licencia'), []);
});

test('los hosts benignos no se toleran por sufijo: el subdominio es otro host', () => {
  assert.deepEqual(labels('fetch("https://demotiles.maplibre.org/style.json")'), [
    'demotiles.maplibre.org',
  ]);
  // El host benigno exacto, en cambio, se tolera fuera de posición pedible.
  assert.deepEqual(labels('https://maplibre.org/maplibre-gl-js/docs/'), []);
});

test('un host desconocido es finding en cualquier posición', () => {
  assert.deepEqual(labels('https://example.org/x.png'), ['example.org']);
  assert.deepEqual(labels('import("https://example.org/mod.js")'), ['example.org']);
});

test('todas las formas de REQUEST_POSITION se evalúan', () => {
  const samples = {
    fetch: 'fetch("https://a.example/x")',
    import: 'import("https://b.example/y")',
    attribute: '<img src="https://c.example/z.png">',
    'css-url': 'url(https://d.example/z.png)',
    'css-import': '@import "https://e.example/z.css"',
    'map-key': 'glyphs:"https://f.example/{fontstack}/{range}.pbf"',
  };
  for (const rule of REQUEST_POSITION) {
    assert.ok(samples[rule.id], `falta un caso para la forma "${rule.id}"`);
    assert.equal(labels(samples[rule.id]).length, 1, `la forma "${rule.id}" no se detectó`);
  }
});

test('cada entrada benigna documenta su razón', () => {
  assert.ok(BENIGN_TEXT_HOSTS.length > 0, 'la lista benigna no puede estar vacía');
  for (const entry of BENIGN_TEXT_HOSTS) {
    assert.equal(typeof entry.host, 'string');
    assert.match(entry.host, /^[a-z0-9.-]+\.[a-z]{2,}$/, `host inválido: ${entry.host}`);
    assert.equal(typeof entry.reason, 'string');
    assert.ok(entry.reason.trim().length >= 10, `la razón de ${entry.host} tiene que explicar el caso`);
  }
  const hosts = BENIGN_TEXT_HOSTS.map((entry) => entry.host);
  assert.equal(new Set(hosts).size, hosts.length, 'no puede haber hosts benignos repetidos');
  for (const host of ALLOWED_REQUEST_HOSTS) {
    assert.ok(!hosts.includes(host), `${host} no puede ser pedible y benigno a la vez`);
  }
});

test('el host del basemap está permitido y se cuenta como ocurrencia', () => {
  assert.deepEqual(ALLOWED_REQUEST_HOSTS, ['tiles.openfreemap.org']);

  const style = scanRequestHosts('style:"https://tiles.openfreemap.org/styles/liberty"');
  assert.deepEqual(style.findings, []);
  assert.deepEqual(style.occurrences, ['tiles.openfreemap.org']);

  const tileJson = scanRequestHosts('{type:"vector",url:"https://tiles.openfreemap.org/planet"}');
  assert.deepEqual(tileJson.findings, []);
  assert.deepEqual(tileJson.occurrences, ['tiles.openfreemap.org']);

  const glyphs = scanRequestHosts('glyphs:"https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf"');
  assert.deepEqual(glyphs.findings, []);
  assert.deepEqual(glyphs.occurrences, ['tiles.openfreemap.org']);
});

test('el host permitido en texto plano no cuenta como pedido', () => {
  const { findings, occurrences } = scanRequestHosts('// tiles.openfreemap.org es el basemap');
  assert.deepEqual(findings, []);
  assert.deepEqual(occurrences, []);
});

test('un segundo host pedible sigue fallando con la allowlist activa', () => {
  assert.deepEqual(labels('fetch("https://tile.openstreetmap.org/{z}/{x}/{y}.png")'), [
    'tile.openstreetmap.org',
  ]);
  assert.deepEqual(labels('url:"https://demotiles.maplibre.org/style.json"'), [
    'demotiles.maplibre.org',
  ]);
  // El namespace sigue sin ser request, así que no lo permite la allowlist: lo
  // tolera la lista benigna sólo fuera de posición pedible.
  assert.deepEqual(labels('xmlns="https://www.w3.org/2000/svg"'), []);
  assert.deepEqual(labels('href="https://www.w3.org/2000/svg"'), ['www.w3.org']);
});

test('--strict exige el host presente y único', () => {
  assert.deepEqual(compareHostSets([]), {
    missing: ['tiles.openfreemap.org'],
    extra: [],
  });
  assert.deepEqual(compareHostSets(['tiles.openfreemap.org']), { missing: [], extra: [] });
  assert.deepEqual(compareHostSets(['tiles.openfreemap.org', 'demotiles.maplibre.org']), {
    missing: [],
    extra: ['demotiles.maplibre.org'],
  });
  assert.deepEqual(compareHostSets([]), compareHostSets([], ALLOWED_REQUEST_HOSTS));
});
