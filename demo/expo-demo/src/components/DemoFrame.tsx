import type { ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { breakpoint, colors, radii } from '../theme/theme';

/**
 * Marco de la demo: mobile-first de 320 a 1440 px con ancho máximo 480 px,
 * centrado y con borde redondeado en desktop (F-13 / E-5).
 */
export function DemoFrame({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions();
  const wide = width >= breakpoint.wide;

  return (
    <View style={styles.outer}>
      <View style={[styles.inner, wide && styles.wide]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.bg,
  },
  inner: {
    flex: 1,
    width: '100%',
    maxWidth: breakpoint.frameMax,
    backgroundColor: colors.bg,
    overflow: 'hidden',
  },
  wide: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii[3],
    marginVertical: 16,
  },
});
