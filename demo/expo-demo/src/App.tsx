import { useFonts } from 'expo-font';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { DemoStoreProvider } from './state/DemoProvider';
import { createDemoStore } from './state/store';
import { colors } from './theme/theme';

/**
 * Shell mínimo del slice 6: carga Inter local (sin CDN) y provee el store con
 * su limpieza de timers. Las pantallas llegan en el slice 7.
 */
export default function App() {
  const [fontsLoaded] = useFonts({
    'Inter-Regular': require('../assets/fonts/Inter-Regular.ttf'),
    'Inter-SemiBold': require('../assets/fonts/Inter-SemiBold.ttf'),
  });
  const store = useMemo(() => createDemoStore(), []);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <DemoStoreProvider store={store}>
      <View style={styles.root} />
    </DemoStoreProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
});
