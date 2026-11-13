import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { focusRing } from '../theme/focusRing';
import { colors, fontFamily, fontSize, radii, space } from '../theme/theme';

import { Icon, type IconName } from './Icon';

export type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'danger';

export type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  accessibilityLabel?: string;
  icon?: IconName;
  fullWidth?: boolean;
};

/**
 * Botón del contrato: 44 px de alto mínimo, foco visible con el anillo compartido
 * (`focusRing`, no mueve el layout) y etiqueta semántica explícita cuando el texto
 * no alcanza (F-13 / E-5).
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  accessibilityLabel,
  icon,
  fullWidth = false,
}: ButtonProps) {
  const [focused, setFocused] = useState(false);
  const tone = variant === 'primary' ? colors.text : variant === 'danger' ? colors.danger : colors.text;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [
        styles.base,
        variantStyles[variant],
        fullWidth && styles.fullWidth,
        focusRing(focused),
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <View style={styles.content}>
        {icon === undefined ? null : <Icon name={icon} size={16} color={tone} />}
        <Text style={[styles.label, { color: tone }, disabled && styles.labelDisabled]}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    minWidth: 44,
    paddingHorizontal: space[3],
    borderRadius: radii[1],
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[1],
  },
  label: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize[1],
  },
  labelDisabled: {
    color: colors.muted,
  },
  fullWidth: {
    width: '100%',
  },
  pressed: {
    opacity: 0.86,
  },
  disabled: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    opacity: 0.7,
  },
});

const variantStyles = StyleSheet.create({
  primary: {
    backgroundColor: colors.gradientStart,
    borderColor: colors.gradientStart,
  },
  outline: {
    backgroundColor: 'transparent',
    borderColor: colors.border,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  danger: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
});
