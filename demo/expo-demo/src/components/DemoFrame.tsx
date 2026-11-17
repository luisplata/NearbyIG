import type { ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { breakpoint, colors, radii } from '../theme/theme';

/**
 * Marco de la demo: mobile-first de 320 a 1440 px con ancho máximo 480 px,
 * centrado y con borde redondeado en desktop (F-13 / E-5).
 *
 * **Insets acá y en un solo lugar.** Header, barra inferior, overlays, toasts,
 * match y sheets cuelgan todos de este `outer` (en `App.tsx` el `frame` es hijo
 * directo), así que un padding resuelve el notch, la barra de estado y la barra
 * de gestos sin tocar ninguna pantalla. Va en `outer` y no en `inner` porque
 * `inner` recorta con `overflow: 'hidden'` y lleva el borde del modo `wide`: el
 * padding ahí comería el borde en desktop. Las capas `absoluteFill` se resuelven
 * contra el padding box, así que `bottom: 0` queda arriba de la barra de gestos.
 *
 * En web los insets son 0 (la plantilla no declara `viewport-fit=cover`), así que
 * el layout publicado no cambia.
 */
export function DemoFrame({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const wide = width >= breakpoint.wide;

  return (
    <View style={[styles.outer, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
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
