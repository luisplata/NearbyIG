import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Base path del deploy, en build time. Sin barra final: Expo concatena el
 * prefijo y una barra final produciría `//`.
 */
const baseUrl = (process.env.EXPO_BASE_URL ?? '/expo').replace(/\/+$/, '');

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Nearby Social Club',
  slug: 'nearbyig-demo',
  version: '0.1.0',
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
    versionCode: 1,
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
  ],
});
