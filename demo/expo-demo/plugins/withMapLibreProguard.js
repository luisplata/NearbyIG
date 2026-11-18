/**
 * Keep de R8 para MapLibre Native, versionado como config plugin.
 *
 * Por qué vive acá y no en `android/`: ese directorio es salida de CNG
 * (`prebuild`) — está gitignored y se regenera en cada build, también en CI. Un
 * keep escrito a mano ahí no existe en ninguna otra máquina ni en el runner, el
 * APK saldría sin reglas y R8 recortaría las clases del SDK: la falla aparece
 * recién en runtime, lejos del lugar donde se causó.
 *
 * Escribe `android/app/proguard-rules.pro`, el archivo que el template de Expo ya
 * declara en `proguardFiles` de `app/build.gradle`. No hay que tocar Gradle: el
 * archivo existe para que uno lo llene.
 */

const fs = require('node:fs');
const path = require('node:path');

const { withDangerousMod } = require('expo/config-plugins');

/**
 * Marcador de idempotencia: si ya está, el bloque ya se aplicó.
 *
 * El comentario es `#`, no `//`: R8 lee este archivo como directivas y un `//`
 * lo hace fallar en `minifyReleaseWithR8` — en release, no en debug ni en tests.
 */
const MARKER = '# @nearbyig/maplibre-r8';

/**
 * El SDK viaja como AAR sin consumer rules y el build release tiene minify on:
 * R8 no ve los entrypoints JNI (`org.maplibre.android`) ni las factories que el
 * módulo de RN resuelve por nombre (`org.maplibre.reactnative`). Se conserva el
 * namespace completo porque el paquete no expone una API estable de entrypoints.
 */
const BLOCK = [
  MARKER,
  '# MapLibre Native viaja como AAR sin consumer rules y el release tiene minify on:',
  '# R8 no ve los entrypoints JNI ni las factories del SDK.',
  '-keep class org.maplibre.reactnative.** { *; }',
  '-keep class org.maplibre.android.** { *; }',
  '',
].join('\n');

module.exports = function withMapLibreProguard(config) {
  return withDangerousMod(config, [
    'android',
    async (mod) => {
      const file = path.join(mod.modRequest.platformProjectRoot, 'app', 'proguard-rules.pro');

      // `prebuild` genera `android/app`, pero un dangerous mod no debe asumirlo:
      // crear el directorio cuesta nada y fallar acá cuesta un run de CI.
      fs.mkdirSync(path.dirname(file), { recursive: true });

      const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
      if (current.includes(MARKER)) {
        // `prebuild` corre más de una vez por run (y el CI lo corre siempre):
        // sin esta guarda el keep se duplicaría en cada pasada.
        console.log('[withMapLibreProguard] keep de R8 ya presente; sin cambios');
        return mod;
      }

      const separator = current === '' || current.endsWith('\n') ? '' : '\n';
      fs.writeFileSync(file, `${current}${separator}${BLOCK}`);
      console.log('[withMapLibreProguard] keep de R8 escrito en app/proguard-rules.pro');
      return mod;
    },
  ]);
};
