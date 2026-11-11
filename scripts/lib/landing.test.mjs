import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { datasetIdOf } from './canonical.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const LANDING = join(ROOT, 'demo', 'landing');

const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const landingFile = (name) => readFileSync(join(LANDING, name), 'utf8');

function sharedJson(name) {
  return JSON.parse(read(`demo/shared/${name}`));
}

test('la landing toma todo el texto del catálogo de copy', () => {
  const copy = sharedJson('copy.json');
  const html = landingFile('index.html');
  const keys = [...html.matchAll(/data-copy(?:-alt)?="([^"]+)"/g)].map((match) => match[1]);

  assert.ok(keys.length >= 20, `esperaba al menos 20 claves, encontré ${keys.length}`);
  for (const key of keys) {
    assert.ok(key in copy, `index.html referencia una clave inexistente: ${key}`);
  }

  const simItems = keys.filter((key) => key.startsWith('common.simItems.'));
  assert.equal(simItems.length, 8, 'la landing lista los 8 ítems de "Qué es simulado"');
});

test('la landing declara noindex y enlaces relativos a las demos', () => {
  const html = landingFile('index.html');

  assert.match(html, /<html lang="es">/);
  assert.match(html, /<meta name="robots" content="noindex, nofollow" \/>/);
  assert.ok(html.includes('href="./flutter/"'), 'falta el enlace relativo a ./flutter/');
  assert.ok(html.includes('href="./expo/"'), 'falta el enlace relativo a ./expo/');
  assert.ok(html.includes('data-dataset-id'), 'falta el placeholder del datasetId');
  assert.ok(html.includes('data-schema-version'), 'falta el placeholder del schemaVersion');
  assert.ok(!html.includes('href="/flutter/'), 'el enlace a Flutter no puede ser absoluto');
  assert.ok(!html.includes('href="/expo/'), 'el enlace a Expo no puede ser absoluto');
});

test('la landing consume el datasetId del contrato vigente', () => {
  const expected = datasetIdOf({
    fixtures: sharedJson('fixtures.json'),
    copy: sharedJson('copy.json'),
    designTokens: sharedJson('design-tokens.json'),
    photos: sharedJson('photos.json'),
  });

  const generated = landingFile('generated/dataset.js');
  assert.ok(generated.includes(`datasetId: "${expected}"`), `dataset.js no contiene ${expected}`);
  assert.match(generated, /window\.NEARBYIG_DATASET = Object\.freeze\(/);
  assert.ok(generated.includes('schemaVersion: 2'));
});

test('la landing sólo usa variables generadas desde design-tokens.json', () => {
  const tokensCss = landingFile('generated/tokens.css');
  const styles = landingFile('styles.css');
  const declared = new Set([...tokensCss.matchAll(/^\s*(--[a-z0-9-]+):/gm)].map((match) => match[1]));
  const used = new Set([...styles.matchAll(/var\((--[a-z0-9-]+)\)/g)].map((match) => match[1]));

  assert.ok(declared.size >= 20, 'tokens.css debería declarar la paleta y las escalas');
  for (const name of used) {
    assert.ok(declared.has(name), `styles.css usa una variable no generada: ${name}`);
  }
});

test('la landing no pide nada a dominios externos', () => {
  for (const name of ['index.html', 'styles.css', 'main.js', 'generated/dataset.js', 'generated/tokens.css']) {
    assert.ok(!/https?:\/\//i.test(landingFile(name)), `${name} contiene una URL externa`);
  }
});
