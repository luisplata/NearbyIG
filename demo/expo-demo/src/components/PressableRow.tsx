import { useState } from 'react';
import type { ReactNode } from 'react';
import { Pressable, type StyleProp, type ViewStyle } from 'react-native';

import { focusRing } from '../theme/focusRing';

/**
 * Fila/contendor presionable con foco visible y etiqueta semántica. Es la base
 * de tarjetas, filas de ajustes y botones de icono.
 *
 * El foco es el anillo compartido de `focusRing`: antes era un `borderWidth: 2`
 * que agrandaba la tarjeta y dibujaba un rectángulo sobre el `borderRadius`.
 */
export function PressableRow({
  accessibilityLabel,
  onPress,
  style,
  children,
  accessibilityState,
}: {
  accessibilityLabel: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
  accessibilityState?: { selected?: boolean; disabled?: boolean };
}) {
  const [focused, setFocused] = useState(false);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={accessibilityState}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [style, focusRing(focused), pressed && pressedStyle]}
    >
      {children}
    </Pressable>
  );
}

const pressedStyle = { opacity: 0.86 } as const;
