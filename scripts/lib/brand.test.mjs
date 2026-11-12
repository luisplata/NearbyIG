import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * La marca visible es Nearby Social Club / Cowork Café; los identificadores
 * técnicos (repo, URLs, bundle id, slug) no cambian. El nombre de la app Expo
 * sale de `app.config.ts` y alimenta `%WEB_TITLE%`, así que tiene que coincidir
 * con `about.brand`.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const copy = JSON.parse(readFileSync(join(ROOT, 'demo', 'shared', 'copy.json'), 'utf8'));
const appConfig = readFileSync(join(ROOT, 'demo', 'expo-demo', 'app.config.ts'), 'utf8');
const landing = readFileSync(join(ROOT, 'demo', 'landing', 'index.html'), 'utf8');
const expoApp = readFileSync(join(ROOT, 'demo', 'expo-demo', 'src', 'App.tsx'), 'utf8');
const aboutScreen = readFileSync(
  join(ROOT, 'demo', 'expo-demo', 'src', 'screens', 'AboutScreen.tsx'),
  'utf8',
);

test('la marca y el slogan del producto son los del club', () => {
  assert.equal(copy['about.brand'], 'Nearby Social Club');
  assert.equal(copy['about.club'], 'Cowork Café');
  assert.equal(copy['landing.eyebrow'], 'Cowork Café');
  assert.equal(copy['common.demoChip'], 'DEMO');
});

test('el título del documento de la landing contiene marca y slogan', () => {
  assert.ok(copy['landing.documentTitle'].includes(copy['about.brand']));
  assert.ok(copy['landing.documentTitle'].includes(copy['about.club']));
});

test('el nombre de la app Expo coincide con about.brand', () => {
  const match = /^\s*name:\s*'([^']+)',/m.exec(appConfig);
  assert.ok(match, 'app.config.ts no declara name');
  assert.equal(match[1], copy['about.brand'], 'name debe salir de about.brand (BR-1)');
  assert.ok(appConfig.includes("slug: 'nearbyig-demo'"), 'el slug técnico no cambia (BR-6)');
});

test('la landing muestra la marca, el slogan y el label DEMO en header y footer', () => {
  assert.ok(landing.includes('data-copy="about.brand"'), 'falta la marca en el header');
  assert.ok(landing.includes('data-copy="landing.eyebrow"'), 'falta el slogan del hero');
  assert.equal(
    (landing.match(/data-copy="common\.demoChip"/g) ?? []).length,
    2,
    'el label DEMO debe estar en el header y en el footer',
  );
});

test('la landing no promete paridad total entre las demos', () => {
  const landingCopy = Object.entries(copy).filter(([key]) => key.startsWith('landing.'));
  for (const [key, value] of landingCopy) {
    assert.ok(!/paridad/i.test(value), `${key} no puede prometer paridad: ${value}`);
  }
  assert.match(copy['landing.expo.tag'], /demo activa/i);
  assert.match(copy['landing.flutter.tag'], /referencia/i);
  assert.match(copy['landing.subtitle'], /Expo/);
  assert.match(copy['landing.subtitle'], /referencia/i);
});

test('el header Expo muestra marca y slogan sin el chip DEMO', () => {
  assert.ok(expoApp.includes("fmt('about.brand')"), 'el header debe mostrar la marca');
  assert.ok(expoApp.includes("fmt('about.club')"), 'el header debe mostrar el slogan');
  assert.ok(expoApp.includes('<VisibilitySwitch'), 'el header debe montar el switch de visibilidad');
  assert.ok(
    !expoApp.includes("fmt('common.demoChip')"),
    'el chip DEMO no puede quedar en el header de Expo',
  );
});

test('Acerca de muestra la marca, el slogan y el label DEMO', () => {
  assert.ok(aboutScreen.includes("fmt('about.brand')"));
  assert.ok(aboutScreen.includes("fmt('about.club')"));
  assert.ok(aboutScreen.includes("fmt('common.demoChip')"), 'About conserva el label DEMO');
  assert.ok(aboutScreen.includes("fmt('common.simTitle')"), 'About conserva la hoja de simulación');
});
