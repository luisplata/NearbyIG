import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * W6 / E-5 / F-13: el documento de la demo Expo es es-AR. El idioma sale del
 * build (config + plantilla propia), no de un parche sobre `dist/` ni de un
 * override en runtime. El gate final es `assemble-site` sobre el HTML exportado.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CONFIG = join(ROOT, 'demo', 'expo-demo', 'app.config.ts');
const TEMPLATE = join(ROOT, 'demo', 'expo-demo', 'public', 'index.html');

test('app.config.ts declara web.lang = es', () => {
  const source = readFileSync(CONFIG, 'utf8');
  const web = source.match(/web:\s*\{[\s\S]*?\n  \},/);
  assert.ok(web, 'no se encontró el bloque web en app.config.ts');
  assert.match(web[0], /lang:\s*'es'/, 'web.lang debe ser "es" (E-5)');
});

test('la plantilla web usa los placeholders de Expo y copy en español', () => {
  const html = readFileSync(TEMPLATE, 'utf8');

  assert.match(html, /<html lang="%LANG_ISO_CODE%">/, 'el idioma lo sustituye expo export');
  assert.match(html, /<title>%WEB_TITLE%<\/title>/, 'el título lo sustituye expo export');
  assert.match(html, /<div id="root"><\/div>/, 'falta el nodo raíz de React');
  assert.match(
    html,
    /<noscript>Esta demo necesita JavaScript/,
    'el <noscript> tiene que estar en español',
  );
  assert.ok(
    !/You need to enable JavaScript/.test(html),
    'la plantilla no debe conservar el <noscript> en inglés',
  );
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, '');
  assert.ok(
    !/https?:\/\//.test(withoutComments),
    'la plantilla no debe referenciar hosts externos (la fuente y los estilos son locales)',
  );
});
