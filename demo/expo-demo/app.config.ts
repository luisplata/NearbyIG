import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Base path del deploy, en build time. Sin barra final: Expo concatena el
 * prefijo y una barra final produciría `//`.
 */
const baseUrl = (process.env.EXPO_BASE_URL ?? '/expo').replace(/\/+$/, '');

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'NearbyIG Demo',
  slug: 'nearbyig-demo',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  backgroundColor: '#09090B',
  icon: './assets/brand/icon-512.png',
  platforms: ['web'],
  web: {
    bundler: 'metro',
    output: 'single',
    favicon: './assets/brand/icon-192.png',
  },
  experiments: { baseUrl },
  plugins: ['expo-font'],
});
