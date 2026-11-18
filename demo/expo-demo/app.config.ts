import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Base path del deploy, en build time. Sin barra final: Expo concatena el
 * prefijo y una barra final produciría `//`.
 */
const baseUrl = (process.env.EXPO_BASE_URL ?? '/expo').replace(/\/+$/, '');

/**
 * Versión y `versionCode` llegan del build: `scripts/version.mjs` los deriva de
 * los conventional commits y el workflow los pasa por entorno, porque el número
 * que Play acepta no puede escribirse a mano sin arriesgar subir dos veces el
 * mismo código (Play lo rechaza, pero el run ya gastó 30 minutos compilando).
 *
 * Sin variables el fallback es el de desarrollo local: `prebuild` y los tests
 * siguen dando un binario instalable. Presente pero inválida es un error de
 * tipeo del workflow y se avisa: Play no deja corregir un `versionCode` malo.
 */
const SEMVER = /^\d+\.\d+\.\d+$/;

function envVersion(raw: string | undefined): string {
  if (raw === undefined || raw === '') return '0.1.0';
  if (SEMVER.test(raw)) return raw;

  console.warn(`[app.config] NEARBYIG_VERSION inválido ("${raw}"); uso 0.1.0`);
  return '0.1.0';
}

function envVersionCode(raw: string | undefined): number {
  if (raw === undefined || raw === '') return 1;

  const parsed = Number(raw);
  // Entero positivo: `2.5` y `-5` compilan igual desde Gradle pero Play los rechaza.
  if (Number.isInteger(parsed) && parsed > 0) return parsed;

  console.warn(`[app.config] NEARBYIG_VERSION_CODE inválido ("${raw}"); uso 1`);
  return 1;
}

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Nearby Social Club',
  slug: 'nearbyig-demo',
  version: envVersion(process.env.NEARBYIG_VERSION),
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  backgroundColor: '#09090B',
  // iOS exige 1024×1024 en el App Store; el mismo arte alimenta el icono
  // adaptativo de Android y el splash. Lo genera `npm run sync`.
  icon: './assets/brand/icon-1024.png',
  /**
   * `web` sigue siendo lo único que se publica (Pages), pero la aceptación del
   * piloto es instalar el APK en un teléfono: sin android/ios acá `prebuild` no
   * tiene identidad que escribir y el binario no puede existir.
   */
  platforms: ['web', 'android', 'ios'],
  android: {
    // Package y versionCode se fijan ANTES del .aab firmado: Play no deja
    // cambiarlos después y el cambio del release los da por hechos.
    package: 'com.nearbyig.app',
    versionCode: envVersionCode(process.env.NEARBYIG_VERSION_CODE),
    /**
     * El foreground va al 75 % del canvas porque fuera de eso el recorte del
     * launcher (círculo, squircle) se come el glifo. El fondo se declara acá y
     * no dentro del PNG: así el sistema lo pinta detrás y el arte queda opaco.
     */
    adaptiveIcon: {
      foregroundImage: './assets/brand/adaptive-foreground.png',
      backgroundColor: '#09090B',
    },
    // Alguna lib transitiva declara overlay; la demo no dibuja sobre otras apps
    // y Play lo lee como capacidad engañosa. Se remueve del manifest final.
    blockedPermissions: ['android.permission.SYSTEM_ALERT_WINDOW'],
  },
  ios: {
    bundleIdentifier: 'com.nearbyig.app',
    // buildNumber es string por contrato (CFBundleVersion), no número.
    buildNumber: '1',
    // La demo es un mock de teléfono: en iPad el layout de 390 px no tiene sentido.
    supportsTablet: false,
  },
  web: {
    bundler: 'metro',
    output: 'single',
    favicon: './assets/brand/icon-192.png',
    // Idioma del documento (E-5/F-13): `expo export` sustituye %LANG_ISO_CODE% en
    // `public/index.html`. Sin esto el template de Expo sale con lang="en".
    lang: 'es',
    description: 'Demo no funcional de Nearby Social Club: datos ficticios, sin backend ni cuentas.',
  },
  experiments: { baseUrl },
  plugins: [
    'expo-font',
    /**
     * El splash nativo se declara por plugin y no por una clave raíz `splash`:
     * esa clave no existe en el schema de SDK 58 (rompe `tsc --noEmit`) y el
     * plugin es el único camino que `prebuild` aplica. Reusa el icono para no
     * inventar arte nuevo; 220 px es el tamaño legible de un logo cuadrado.
     */
    [
      'expo-splash-screen',
      {
        image: './assets/brand/icon-1024.png',
        imageWidth: 220,
        resizeMode: 'contain',
        backgroundColor: '#09090B',
      },
    ],
    /**
     * Permiso de ubicación del binario. El texto es lo que el sistema muestra en
     * el diálogo (iOS `NSLocationWhenInUseUsageDescription`, Android el aviso de
     * ubicación en primer plano): dice las tres cosas que importan —cuándo se
     * usa, para qué, y que no se guarda—, porque quien lo lee está decidiendo en
     * ese momento si confía en la app.
     *
     * En web este plugin no hace nada: ahí el permiso lo pide el navegador.
     */
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'Nearby Social Club usa tu ubicación sólo mientras usás la demo, para mostrar tu punto en el radar. No se guarda ni se comparte.',
      },
    ],
    /**
     * Módulo nativo del basemap. Va como string plano y sin props: los defaults
     * del paquete (minSdk 24, MapLibre Android 13.6.1, variante opengl) son los
     * que necesita esta toolchain, y cualquier override acá es superficie de
     * rotura en el próximo prebuild.
     *
     * En web este plugin no hace nada: ahí el mapa lo dibuja MapLibre GL JS.
     */
    '@maplibre/maplibre-react-native',
    /**
     * Firma de upload de Play. Mod de Gradle: appendea `signingConfigs.release`
     * y el `release { signingConfig … }` del buildType sobre el `app/build.gradle`
     * que genera `prebuild`. Va después de los plugins del SDK (necesita el
     * proyecto creado) y antes del keep de R8, que sigue siendo el último.
     *
     * Sin las cuatro variables de firma no escribe nada: `android.yml` compila
     * el APK del piloto sin secrets y ese run tiene que seguir verde.
     */
    './plugins/withReleaseSigning',
    /**
     * Keep de R8 del mapa, versionado porque `android/` es CNG y se regenera en
     * cada `prebuild`. Va DESPUÉS del plugin del SDK a propósito: el SDK registra
     * el módulo y escribe su configuración; este mod local corre sobre el
     * `android/` ya generado. Invertirlos deja al mod sin proyecto que editar.
     */
    './plugins/withMapLibreProguard',
  ],
});
