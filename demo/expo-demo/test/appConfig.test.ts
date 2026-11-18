import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { ConfigContext, ExpoConfig } from 'expo/config';
import { afterEach, describe, expect, it, vi } from 'vitest';

import appConfig from '../app.config';

/**
 * La identidad nativa no se ve en la demo web, pero es exactamente lo que
 * `prebuild` escribe en `AndroidManifest.xml` e `Info.plist`. Si esto se rompe,
 * el APK del piloto instala con otro package (dos apps conviviendo), sin icono
 * adaptativo o pidiendo permisos que la demo no usa.
 *
 * El test evalúa el config como lo hace Expo: llamando al default export con el
 * contexto de la app.
 */
const ROOT = process.cwd();

/** El contexto con el que Expo evalúa el config; se reusa en los casos con env. */
const CONTEXT = {
  projectRoot: ROOT,
  staticConfigPath: join(ROOT, 'app.config.ts'),
  packageJsonPath: join(ROOT, 'package.json'),
  config: {},
} satisfies ConfigContext;

const app = appConfig(CONTEXT);

/** Ruta del asset declarada en el config, chequeada contra el árbol de trabajo. */
function assetExists(declared: string | undefined): boolean {
  return typeof declared === 'string' && existsSync(join(ROOT, declared));
}

describe('identidad nativa', () => {
  it('declara las tres plataformas: android/ios son el entregable del piloto', () => {
    expect(app.platforms).toEqual(['web', 'android', 'ios']);
  });

  it('fija el package y el versionCode que espera el .aab firmado', () => {
    expect(app.android?.package).toBe('com.nearbyig.app');
    expect(app.android?.versionCode).toBe(1);
  });

  it('fija el bundle de iOS con buildNumber string y sin soporte de tablet', () => {
    expect(app.ios?.bundleIdentifier).toBe('com.nearbyig.app');
    expect(app.ios?.buildNumber).toBe('1');
    expect(app.ios?.supportsTablet).toBe(false);
  });

  it('bloquea SYSTEM_ALERT_WINDOW: la demo no dibuja sobre otras apps', () => {
    // Lo agrega alguna lib transitiva; Play lo marca como capacidad de overlay.
    expect(app.android?.blockedPermissions).toContain('android.permission.SYSTEM_ALERT_WINDOW');
  });
});

describe('plugin del basemap nativo', () => {
  /**
   * El mapa del binario no existe sin este plugin: registra el módulo nativo,
   * escribe `gradle.properties` y engancha el AAR de MapLibre Android en el
   * `android/` que genera `prebuild`. Sin él `prebuild` compila y el mapa tira
   * un módulo nativo ausente recién en runtime.
   */
  it('declara el plugin del SDK como string plano, no como tupla con props', () => {
    // Sin props: los defaults del paquete coinciden con la toolchain del SDK 58.
    // Una tupla acá es un override que hay que sostener en cada prebuild.
    const entry = (app.plugins ?? []).find(
      (plugin) => plugin === '@maplibre/maplibre-react-native',
    );

    expect(entry).toBe('@maplibre/maplibre-react-native');
    expect(Array.isArray(entry)).toBe(false);
  });

  it('lo registra después de expo-location', () => {
    // El orden importa: expo-location fija el texto del permiso y el plugin del
    // mapa agrega el módulo; invertirlos deja el manifest sin el permiso.
    const plugins = app.plugins ?? [];
    const location = plugins.findIndex(
      (plugin) =>
        plugin === 'expo-location' || (Array.isArray(plugin) && plugin[0] === 'expo-location'),
    );
    const maplibre = plugins.indexOf('@maplibre/maplibre-react-native');

    expect(location).toBeGreaterThanOrEqual(0);
    expect(maplibre).toBeGreaterThan(location);
  });

  it('no recorta plataformas: web sigue publicado y android es el piloto', () => {
    expect(app.platforms).toEqual(['web', 'android', 'ios']);
  });

  /**
   * El keep de R8 es lo único que impide que el release recorte las clases del
   * SDK. Si el plugin local se pierde del config, el APK compila igual y el mapa
   * revienta en el teléfono: por eso se fija acá y no en un comentario.
   */
  const LOCAL_PLUGIN = './plugins/withMapLibreProguard';

  it('declara el keep de R8 después del plugin del SDK', () => {
    // El SDK registra el módulo; el mod local edita el `android/` ya generado.
    // Invertirlos deja al plugin local escribiendo antes de que exista el proyecto.
    const plugins = app.plugins ?? [];
    const sdk = plugins.indexOf('@maplibre/maplibre-react-native');
    const local = plugins.indexOf(LOCAL_PLUGIN);

    expect(sdk).toBeGreaterThanOrEqual(0);
    expect(local).toBeGreaterThan(sdk);
    expect(plugins[plugins.length - 1]).toBe(LOCAL_PLUGIN);
  });

  it('el archivo del plugin local existe en disco', () => {
    // Expo no compila el plugin: una ruta rota no se ve hasta `prebuild` en CI.
    // El existsSync la agarra en el gate de tests.
    expect(existsSync(join(ROOT, 'plugins', 'withMapLibreProguard.js'))).toBe(true);
  });
});

describe('icono y splash', () => {
  it('usa el icono de 1024 como icono principal', () => {
    // iOS rechaza en App Store cualquier icono que no sea 1024×1024.
    expect(app.icon).toBe('./assets/brand/icon-1024.png');
  });

  it('declara el icono adaptativo con fondo del tema', () => {
    expect(app.android?.adaptiveIcon?.foregroundImage).toBe(
      './assets/brand/adaptive-foreground.png',
    );
    // Sin backgroundColor el launcher rellena con blanco y el glifo flota.
    expect(app.android?.adaptiveIcon?.backgroundColor).toBe('#09090B');
  });

  it('el splash sale del plugin de expo-splash-screen, no de una clave raíz', () => {
    const splash = (app.plugins ?? []).find(
      (entry): entry is [string, Record<string, unknown>] =>
        Array.isArray(entry) && entry[0] === 'expo-splash-screen',
    );

    expect(splash, 'falta el plugin expo-splash-screen en app.config.ts').toBeDefined();
    expect(splash?.[1]).toMatchObject({
      image: './assets/brand/icon-1024.png',
      backgroundColor: '#09090B',
      resizeMode: 'contain',
    });
  });

  it('los assets que consume prebuild existen en el árbol (los genera el sync)', () => {
    // El sync los escribe en demo/shared y los copia acá; sin ellos prebuild falla.
    expect(assetExists('./assets/brand/icon-1024.png'), 'falta icon-1024.png').toBe(true);
    expect(
      assetExists('./assets/brand/adaptive-foreground.png'),
      'falta adaptive-foreground.png',
    ).toBe(true);
  });
});

describe('claves fuera del schema de SDK 58', () => {
  /**
   * `splash` raíz, `newArchEnabled` y `edgeToEdgeEnabled` no existen en
   * `@expo/config-types` de SDK 58: escribirlas rompe `tsc --noEmit` y Expo las
   * ignora. La arquitectura nueva y el edge-to-edge son el default del SDK.
   */
  it('no declara claves raíz que el schema no tiene', () => {
    expect(app).not.toHaveProperty('splash');
    expect(app).not.toHaveProperty('newArchEnabled');
    expect(app).not.toHaveProperty('edgeToEdgeEnabled');
  });
});

/**
 * La firma de upload es lo que separa el `.aab` que Play acepta del que no: el
 * plugin local appendea `signingConfigs.release` sobre el `app/build.gradle` que
 * genera `prebuild`. Si se cae del config el build compila igual, el `.aab` sale
 * firmado con la debug key y el rechazo aparece recién al subirlo.
 */
describe('plugin de firma de upload', () => {
  const SIGNING_PLUGIN = './plugins/withReleaseSigning';
  const PROGUARD_PLUGIN = './plugins/withMapLibreProguard';

  it('lo registra después del SDK del mapa y antes del keep de R8', () => {
    const plugins = app.plugins ?? [];
    const sdk = plugins.indexOf('@maplibre/maplibre-react-native');
    const signing = plugins.indexOf(SIGNING_PLUGIN);
    const proguard = plugins.indexOf(PROGUARD_PLUGIN);

    expect(signing).toBeGreaterThanOrEqual(0);
    // Mod de Gradle: necesita el `android/` que generan los plugins del SDK.
    expect(signing).toBeGreaterThan(sdk);
    expect(proguard).toBeGreaterThan(signing);
    // El keep de R8 sigue último: corre sobre el android/ ya generado.
    expect(plugins[plugins.length - 1]).toBe(PROGUARD_PLUGIN);
  });

  it('los dos plugins locales existen en disco', () => {
    // Expo no compila ni resuelve los plugins: una ruta rota se ve en `prebuild`.
    expect(existsSync(join(ROOT, 'plugins', 'withReleaseSigning.js'))).toBe(true);
    expect(existsSync(join(ROOT, 'plugins', 'withMapLibreProguard.js'))).toBe(true);
  });
});

describe('versión desde el entorno del build', () => {
  /**
   * `scripts/version.mjs` calcula la versión y el workflow la pasa por entorno.
   * El config la lee al evaluarse, así que cada caso reimporta el módulo: un
   * `app.config.ts` ya cargado se queda con el valor del primer load.
   */
  async function evaluate(env: Record<string, string>): Promise<ExpoConfig> {
    vi.resetModules();
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);

    const { default: config } = await import('../app.config');
    return config(CONTEXT);
  }

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('sin variables usa el baseline local', () => {
    expect(app.version).toBe('0.1.0');
    expect(app.android?.versionCode).toBe(1);
  });

  it('toma versión y versionCode del entorno, con versionCode numérico', async () => {
    const config = await evaluate({ NEARBYIG_VERSION: '0.2.0', NEARBYIG_VERSION_CODE: '2000' });

    expect(config.version).toBe('0.2.0');
    // Gradle escribe el número en el manifest: un string no llega al `.aab`.
    expect(config.android?.versionCode).toBe(2000);
    expect(typeof config.android?.versionCode).toBe('number');
  });

  it.each(['abc', '-5', '2.5'])(
    'cae al fallback y avisa cuando el versionCode es "%s"',
    async (raw) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const config = await evaluate({ NEARBYIG_VERSION_CODE: raw });

      expect(config.android?.versionCode).toBe(1);
      // Un aviso, no un throw: `prebuild` local no tiene por qué romperse.
      expect(warn).toHaveBeenCalledTimes(1);
    },
  );

  it('cae al fallback y avisa cuando la versión no es semver', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // `v0.2.0` es el tag de git, no un versionName: la `v` la pone el tag.
    const config = await evaluate({ NEARBYIG_VERSION: 'v0.2.0' });

    expect(config.version).toBe('0.1.0');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('no toca la identidad nativa con las variables puestas', async () => {
    const config = await evaluate({ NEARBYIG_VERSION: '9.9.9', NEARBYIG_VERSION_CODE: '999999' });

    expect(config.android?.package).toBe('com.nearbyig.app');
    expect(config.name).toBe('Nearby Social Club');
    expect(config.icon).toBe('./assets/brand/icon-1024.png');
  });
});
