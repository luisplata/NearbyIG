import { StyleSheet, Switch, Text, View } from 'react-native';

import { colors, fontFamily, fontSize, space } from '../theme/theme';

/** Fila de switch accesible con etiqueta semántica y targets de 44 px. */
export function ToggleRow({
  label,
  value,
  onChange,
  subtitle,
  disabled = false,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  subtitle?: string;
  /** Deshabilitado mientras una action está en vuelo o el overlay lo impide. */
  disabled?: boolean;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.labels}>
        <Text style={styles.label}>{label}</Text>
        {subtitle === undefined ? null : <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
      <Switch
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        disabled={disabled}
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.surfaceAlt, true: colors.accent }}
        thumbColor={value ? colors.accent : colors.muted}
        ios_backgroundColor={colors.surfaceAlt}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space[2],
    paddingVertical: space[1],
  },
  labels: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize[1],
    color: colors.text,
  },
  subtitle: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize[0],
    color: colors.muted,
  },
});
