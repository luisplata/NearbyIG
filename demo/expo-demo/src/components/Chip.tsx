import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { focusRing } from '../theme/focusRing';
import { colors, fontFamily, fontSize, radii, space } from '../theme/theme';

import { Icon, type IconName } from './Icon';

export type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  /** Chip DEMO: fondo accent y texto bg. */
  emphasis?: boolean;
  icon?: IconName;
};

/**
 * Chip del contrato. Con `onPress` es un control de 44 px con `accessibilityState
 * .selected` y el anillo de foco compartido; sin `onPress` es una etiqueta de dato.
 *
 * El foco se dibuja en el `Pressable` (la caja de 44 px), no en la píldora
 * interna: así el anillo sigue la forma del control que recibe el foco y no
 * aparece como dos bordes distintos.
 */
export function Chip({ label, selected = false, onPress, emphasis = false, icon }: ChipProps) {
  const [focused, setFocused] = useState(false);
  const foreground = emphasis ? colors.bg : selected ? colors.accent : colors.muted;
  const background = emphasis ? colors.accent : colors.surfaceAlt;

  const body = (
    <View
      style={[
        styles.chip,
        { backgroundColor: background },
        emphasis || selected
          ? { borderColor: emphasis ? colors.accent : colors.accent }
          : { borderColor: colors.border },
      ]}
    >
      {icon === undefined ? null : <Icon name={icon} size={14} color={foreground} />}
      <Text numberOfLines={1} style={[styles.label, { color: foreground }]}>
        {label}
      </Text>
    </View>
  );

  if (onPress === undefined) {
    return (
      <View accessible accessibilityLabel={label} style={styles.static}>
        {body}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [
        styles.pressable,
        focusRing(focused),
        pressed && styles.pressed,
      ]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  static: {
    alignSelf: 'flex-start',
  },
  pressable: {
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: radii[4],
    paddingHorizontal: 2,
  },
  pressed: {
    opacity: 0.86,
  },
  chip: {
    minHeight: 26,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: space[1],
    paddingVertical: 3,
    borderRadius: radii[4],
    borderWidth: 1,
    marginHorizontal: 2,
  },
  label: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize[0],
    letterSpacing: 0.4,
  },
});
