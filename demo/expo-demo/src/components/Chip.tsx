import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

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
 * Chip del contrato. Con `onPress` es un control de 44 px con foco visible y
 * `accessibilityState.selected`; sin `onPress` es una etiqueta de dato.
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
        focused && styles.focused,
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
      style={({ pressed }) => [styles.pressable, focused && styles.focusedRing, pressed && styles.pressed]}
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
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: 2,
  },
  focusedRing: {
    borderColor: colors.accent,
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
  focused: {
    borderColor: colors.accent,
  },
  label: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize[0],
    letterSpacing: 0.4,
  },
});
