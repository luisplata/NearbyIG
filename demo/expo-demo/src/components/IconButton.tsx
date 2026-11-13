import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { focusRing } from '../theme/focusRing';
import { colors, fontSize, space } from '../theme/theme';

import { Icon, type IconName } from './Icon';

/** Botón de icono de 44×44 con etiqueta semántica y anillo de foco compartido. */
export function IconButton({
  icon,
  label,
  onPress,
  size = 20,
  color = colors.text,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  size?: number;
  color?: string;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [styles.button, focusRing(focused), pressed && styles.pressed]}
    >
      <Icon name={icon} size={size} color={color} />
    </Pressable>
  );
}

/** Badge de no leídos sobre la campana (live region: lo anuncia el padre). */
export function CountBadge({ count, label }: { count: number; label: string }) {
  if (count <= 0) {
    return null;
  }
  return (
    <View style={styles.badge} accessibilityLiveRegion="polite" accessibilityLabel={label}>
      <Text style={styles.badgeText}>{count}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  pressed: {
    backgroundColor: colors.surfaceAlt,
  },
  badge: {
    position: 'absolute',
    right: 6,
    top: 6,
    minWidth: 16,
    paddingHorizontal: 3,
    borderRadius: 999,
    backgroundColor: colors.accent,
    alignItems: 'center',
    zIndex: 1,
  },
  badgeText: {
    fontSize: fontSize[0],
    color: colors.bg,
    paddingHorizontal: space[0] / 2,
  },
});
