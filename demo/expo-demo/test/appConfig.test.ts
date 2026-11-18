import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { ConfigContext } from 'expo/config';
import { describe, expect, it } from 'vitest';

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

const app = appConfig({
  projectRoot: ROOT,
  staticConfigPath: join(ROOT, 'app.config.ts'),
  packageJsonPath: join(ROOT, 'package.json'),
  config: {},
} satisfies ConfigContext);

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
