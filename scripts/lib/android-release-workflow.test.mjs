import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * El release de Play es un contrato: un solo workflow compila el `.aab`, y nada se
 * publica si el artefacto no está firmado con la upload key, versionado y sin API
 * horneada. Estos checks son estáticos sobre el YAML: no reemplazan la corrida
 * real, pero sí fallan cuando alguien borra una propiedad y el job quedaría verde
 * produciendo un binario que Play rechaza o que apunta a un túnel.
 *
 * Las assertions se escriben sobre texto y no sobre el YAML parseado a propósito:
 * el test corre en el job `checks` de `pages.yml`, que instala las dependencias de
 * `demo/expo-demo` y no las del root (`yaml` vive ahí). Un test que necesita
 * `npm ci` en el root falla por el entorno, no por el workflow.
 *
 * No se repite acá el guard de Pages (`workflow.test.mjs` ya escanea todos los
 * workflows): duplicarlo obliga a tocar dos archivos por el mismo invariante.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const WORKFLOWS = join(ROOT, '.github', 'workflows');
const FILE = 'android-release.yml';
const source = readFileSync(join(WORKFLOWS, FILE), 'utf8');

/** Bloque de un paso, desde su `- name:` hasta el siguiente. */
function step(name) {
  const start = source.indexOf(`\n      - name: ${name}\n`);
  assert.ok(start >= 0, `falta el paso "${name}"`);
  const rest = source.slice(start + 1);
  const next = rest.search(/\n {6}- name: /);
  return next === -1 ? rest : rest.slice(0, next);
}

/** Posición de un fragmento, fallando con un mensaje legible si no está. */
function at(fragment) {
  const index = source.indexOf(fragment);
  assert.ok(index >= 0, `el workflow no contiene "${fragment}"`);
  return index;
}

test('es el único workflow que puede escribir el repo y publicar un release', () => {
  assert.ok(readdirSync(WORKFLOWS).includes(FILE), `falta ${FILE}`);
  // `gh release create --target` crea el tag: con `contents: read` el paso falla
  // recién al final del job, después de haber compilado.
  assert.match(source, /^permissions:\n {2}contents: write\n/m);
  assert.ok(!/contents: read/.test(source), 'el release necesita escribir, no sólo leer');
});

test('dispara a mano con el bump y el dry run como inputs', () => {
  assert.match(source, /^on:\n {2}workflow_dispatch:\n {4}inputs:\n/m);
  assert.match(source, /release_type:\n(?: {8}.*\n)*? {8}type: choice\n {8}options:\n {10}- auto\n {10}- patch\n {10}- minor\n {10}- major\n {8}default: auto\n/);
  assert.match(source, /dry_run:\n(?: {8}.*\n)*? {8}type: boolean\n {8}default: false\n/);
});

test('serializa los runs del release y no los cancela', () => {
  // Cancelar a mitad de camino quema un versionCode que Play no deja reusar: el
  // `.aab` ya se compiló aunque nadie lo suba.
  assert.match(source, /^concurrency:\n {2}group: android-release\n {2}cancel-in-progress: false\n/m);
});

test('el checkout trae la historia y los tags que necesita el CLI de versión', () => {
  const checkout = step('Checkout');
  assert.match(checkout, /fetch-depth: 0/);
  assert.match(checkout, /fetch-tags: true/);
});

test('ningún env global puede hornear la API en el bundle', () => {
  // Un `env:` a nivel workflow entra a TODOS los pasos, incluido el de Gradle que
  // corre Metro: `EXPO_PUBLIC_API_URL` se inlinea en el bundle y sobrevive al build.
  assert.ok(!/^env:/m.test(source), 'el workflow no debe declarar env a nivel workflow');
  // Un `KEY: valor` en la indentación de un `env:` (4 espacios) es la forma en que
  // la variable entra al build. El guard `${...}` del paso de verificación no
  // cuenta: ahí la variable es la que se está controlando.
  assert.ok(
    !/^ {4,}EXPO_PUBLIC_API_URL:/m.test(source),
    'ningún paso debe asignar EXPO_PUBLIC_API_URL',
  );

  // La defensa es la assertion: se chequea antes de compilar y otra vez sobre el
  // bundle empaquetado.
  const guards = source.match(/\$\{EXPO_PUBLIC_API_URL:-/g) ?? [];
  assert.ok(guards.length >= 2, `esperaba el guard antes de prebuild y en la verificación, encontré ${guards.length}`);
});

test('el .aab sale con las 4 ABIs de gradle.properties', () => {
  // `-PreactNativeArchitectures` existe en `android.yml` para el APK de un solo
  // teléfono. Acá recortaría el bundle y dejaría afuera a los demás dispositivos.
  assert.ok(!source.includes('-PreactNativeArchitectures'), 'el .aab no debe recortar ABIs');
  assert.match(source, /\.\/gradlew bundleRelease/);
  // La verificación exige las 4 explícitas, no "alguna".
  for (const abi of ['armeabi-v7a', 'arm64-v8a', 'x86', 'x86_64']) {
    assert.ok(source.includes(abi), `la verificación no nombra la ABI ${abi}`);
  }
});

test('la versión se resuelve antes de prebuild, de Gradle y del release', () => {
  // Se ordenan los pasos por nombre y no por el comando: los comentarios del
  // archivo nombran `gh release create` mucho antes de que exista el paso.
  const versionAt = at('- name: Read the release version');
  const prebuildAt = at('- name: Expo prebuild');
  const bundleAt = at('- name: Bundle release (aab)');
  const verifyAt = at('- name: Verify the aab');
  const releaseAt = at('- name: Publish GitHub release');

  assert.ok(versionAt < prebuildAt, 'la versión se calcula antes de prebuild');
  assert.ok(prebuildAt < bundleAt, 'prebuild va antes de bundleRelease');
  assert.ok(bundleAt < verifyAt, 'no se verifica un artefacto que todavía no existe');
  assert.ok(verifyAt < releaseAt, 'el release se publica con el .aab ya verificado');

  // El CLI publica `version` y `version_code` en `$GITHUB_OUTPUT`: el resto del
  // job los lee de ahí y nadie los recalcula por su cuenta.
  assert.match(step('Read the release version'), /id: version/);
  assert.match(step('Expo prebuild'), /NEARBYIG_VERSION_CODE: \$\{\{ steps\.version\.outputs\.version_code \}\}/);
});

test('falla en segundos si el plugin de firma no enganchó, antes de Gradle', () => {
  const failFast = at("grep -c '@nearbyig/release-signing'");
  assert.ok(failFast < at('./gradlew bundleRelease'), 'el grep del marcador va antes de compilar');

  const signing = step('Assert the release signing config was injected');
  assert.match(signing, /markers" != "1"/, 'el marcador tiene que ser exactamente uno');
  assert.match(signing, /signingConfig signingConfigs\.release/);
  assert.match(signing, /::error::/, 'el fallo tiene que aparecer como anotación del run');
});

test('las credenciales viven en los pasos que las usan, no en el job', () => {
  const decode = step('Decode upload keystore');
  assert.match(decode, /base64 -d/);
  assert.match(decode, /chmod 600/, 'el keystore no puede quedar legible por otros usuarios del runner');
  assert.match(decode, /ANDROID_KEYSTORE_PATH=/, 'la ruta se publica una sola vez para los pasos siguientes');

  for (const name of ['Expo prebuild', 'Bundle release (aab)']) {
    const block = step(name);
    for (const secret of [
      'ANDROID_KEYSTORE_PASSWORD',
      'ANDROID_KEY_ALIAS',
      'ANDROID_KEY_PASSWORD',
    ]) {
      assert.ok(
        block.includes(`${secret}: \${{ secrets.${secret} }}`),
        `el paso "${name}" no declara ${secret}`,
      );
    }
  }
});

test('verifica el artefacto antes de publicarlo', () => {
  const verify = step('Verify the aab');
  const verifyAt = at('- name: Verify the aab');
  assert.ok(verifyAt < at('- name: Publish GitHub release'), 'la verificación corre antes del release');

  // Firma: fingerprint normalizado contra el keystore, nunca el `Owner:` textual.
  assert.match(verify, /keytool -printcert -jarfile/);
  assert.ok(
    verify.includes('SHA256: //p'),
    'la firma se compara por SHA-256 normalizado, no por el texto del CN',
  );
  assert.match(verify, /CN=Android Debug/);
  // Contenido: el manifest del bundle y el APK que instalaría el tester.
  assert.match(verify, /\$BUNDLETOOL_JAR" dump manifest --bundle/);
  assert.match(verify, /--mode=universal/);
  assert.match(verify, /AAPT2" dump badging/);
  // Estructura y host horneado.
  assert.match(verify, /unzip -Z1/);
  assert.match(verify, /grep -aoE/, 'el grep del bundle necesita -a: Hermes lo deja binario');
  assert.match(verify, /trycloudflare/);
  // Un warning no alcanza: cualquier mismatch tiene que cortar el job.
  assert.match(verify, /die\(\) \{ echo "::error::\$1"; exit 1; \}/);
});

test('publica sólo fuera del dry run y ancla el tag al commit del checkout', () => {
  const release = step('Publish GitHub release');
  assert.match(release, /if: \$\{\{ !inputs\.dry_run \}\}/, 'el dry run no debe crear tag ni Release');
  assert.match(release, /gh release create/);
  // Sin `--target`, `gh` taggea el HEAD remoto, que puede haber avanzado mientras
  // el job compilaba: el Release apuntaría a un commit distinto del artefacto.
  assert.match(release, /--target "\$GITHUB_SHA"/);
});

test('el artefacto queda descargable aunque no se publique el Release', () => {
  const upload = step('Upload aab artifact');
  assert.match(upload, /actions\/upload-artifact@v4/);
  assert.match(upload, /name: nearbyig-android-aab/);
  assert.match(upload, /retention-days: 90/);
  assert.match(upload, /if-no-files-found: error/, 'un .aab ausente no puede pasar como éxito');

  // El timeout tiene que cubrir 4 ABIs + Hermes; el default de 360 minutos deja un
  // job colgado casi seis horas y el siguiente run espera por la concurrencia.
  assert.match(source, /^ {4}timeout-minutes: 60\n/m);
});

test('el prebuild recibe exactamente las variables que el plugin de firma exige', () => {
  // El contrato entre el plugin y el workflow no lo verifica nadie más: si una
  // de las dos partes cambia un nombre, el prebuild no inyecta la firma, el
  // fail-fast corta y el mensaje habla de un marcador ausente, no de la variable.
  // Pasó una vez: el plugin pedía `ANDROID_KEYSTORE_BASE64` y el prebuild recibía
  // la ruta decodificada.
  const require = createRequire(import.meta.url);
  const plugin = require(resolve(ROOT, 'demo/expo-demo/plugins/withReleaseSigning.js'));
  const prebuild = step('Expo prebuild');

  for (const name of plugin.REQUIRED) {
    assert.match(
      prebuild,
      new RegExp(`^ {10}${name}: `, 'm'),
      `el prebuild no recibe ${name}, que el plugin exige`,
    );
  }
});
