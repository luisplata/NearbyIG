import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { fmt } from '../generated/copy';
import { colors } from '../theme/theme';

import { Icon } from './Icon';

/**
 * Switch de visibilidad del header, ligado al estado fantasma existente. Es un
 * control de 44 px con rol `switch`, estado checked/disabled, nombre accesible
 * `settings.ghost` y foco visible. ON significa pausa, no invisibilidad.
 */
export function VisibilitySwitch({
  checked,
  disabled,
  onToggle,
}: {
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const color = disabled ? colors.muted : checked ? colors.accentWarm : colors.text;

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={fmt('settings.ghost')}
      accessibilityState={{ checked, disabled }}
      aria-checked={checked}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onToggle}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [
        styles.button,
        checked && styles.checked,
        focused && !disabled && styles.focused,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Icon name={checked ? 'eyeOff' : 'eye'} size={20} color={color} />
    </Pressable>
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
  checked: {
    backgroundColor: colors.surfaceAlt,
  },
  focused: {
    borderColor: colors.accent,
  },
  pressed: {
    backgroundColor: colors.surfaceAlt,
  },
});
