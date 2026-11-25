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

  // El rebuild inlineó el cuerpo de la landing a propósito, así que un mínimo de
  // claves ya no mide "todo el texto viene del catálogo". Lo que sí garantiza este
  // test: ninguna clave referenciada falta en copy.json, los 8 ítems de
  // "Qué es simulado" están referenciados y el chip DEMO vive en header y footer.
  for (const key of keys) {
    assert.ok(key in copy, `index.html referencia una clave inexistente: ${key}`);
  }

  const simItems = keys
    .filter((key) => key.startsWith('common.simItems.'))
    .sort();
  assert.deepEqual(
    simItems,
    [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `common.simItems.${n}`),
    'la landing lista los 8 ítems de "Qué es simulado"',
  );

  assert.equal(
    keys.filter((key) => key === 'common.demoChip').length,
    2,
    'el chip DEMO aparece en el header y en el footer',
  );
});

test('la landing declara noindex y un enlace relativo a la demo publicada', () => {
  const html = landingFile('index.html');

  assert.match(html, /<html lang="es">/);
  assert.match(html, /<meta name="robots" content="noindex, nofollow"\s*\/?>/);
  assert.ok(html.includes('href="./expo/"'), 'falta el enlace relativo a ./expo/');
  assert.ok(html.includes('data-dataset-id'), 'falta el placeholder del datasetId');
  assert.ok(html.includes('data-schema-version'), 'falta el placeholder del schemaVersion');

  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
  for (const href of hrefs) {
    assert.ok(!href.startsWith('/'), `el enlace ${href} no puede ser absoluto`);
  }
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
  // Sólo importan los canales que disparan un request: src, href, url(...) y
  // @import. Un xmlns es un identificador XML, no una URL que se descargue, y una
  // URI data: viaja embebida en el documento. Ignorarlos evita falsos positivos
  // como el SVG inline con xmlns="http://www.w3.org/2000/svg".
  const external = /^(?:https?:)?\/\//i;
  for (const name of ['index.html', 'styles.css', 'main.js', 'generated/dataset.js', 'generated/tokens.css']) {
    const text = landingFile(name);
    const targets = [
      ...text.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi),
      ...text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi),
      ...text.matchAll(/@import\s+["']([^"']+)["']/gi),
    ].map((match) => match[1].trim());

    for (const target of targets) {
      if (target.startsWith('data:')) continue;
      assert.ok(!external.test(target), `${name} pide a un host externo: ${target}`);
    }
  }
});
