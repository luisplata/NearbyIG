import { useState } from 'react';
import type { ReactNode } from 'react';
import { Pressable, type StyleProp, type ViewStyle } from 'react-native';

import { colors } from '../theme/theme';

/**
 * Fila/contendor presionable con foco visible y etiqueta semántica. Es la base
 * de tarjetas, filas de ajustes y botones de icono.
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
      style={({ pressed }) => [style, focused && outline, pressed && pressedStyle]}
    >
      {children}
    </Pressable>
  );
}

const outline = { borderWidth: 2, borderColor: colors.accent } as const;
const pressedStyle = { opacity: 0.86 } as const;
