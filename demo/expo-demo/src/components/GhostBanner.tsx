import { Pressable, StyleSheet, Text, View } from 'react-native';

import { fmt } from '../generated/copy';
import { colors, fontSize, space } from '../theme/theme';

import { Icon } from './Icon';

/**
 * Banner persistente del modo fantasma/pausa (F-8).
 *
 * En dataset el texto es el del guion (`settings.ghostOn`, "pausa activa"). Con
 * sesión live el aviso cambia: no es una pausa del cliente, es que el server te
 * tiene invisible para los demás mientras vos seguís viendo. Por eso el copy
 * entra por prop y no se reescribe el del catálogo congelado.
 */
export function GhostBanner({ onDisable, message }: { onDisable: () => void; message?: string }) {
  const text = message ?? fmt('settings.ghostOn');
  return (
    <View style={styles.banner} accessibilityLiveRegion="polite">
      <Icon name="eyeOff" size={16} color={colors.accent} />
      <Text numberOfLines={2} style={styles.text}>
        {text}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={fmt('settings.ghost')}
        onPress={onDisable}
        style={({ pressed }) => [styles.action, pressed && styles.pressed]}
      >
        <Text style={styles.actionLabel}>{fmt('settings.ghost')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space[2],
    paddingVertical: 6,
    backgroundColor: colors.surfaceAlt,
    borderBottomWidth: 1,
    borderBottomColor: colors.accent,
  },
  text: {
    flex: 1,
    fontSize: fontSize[0],
    color: colors.text,
  },
  action: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: space[1],
  },
  pressed: {
    opacity: 0.7,
  },
  actionLabel: {
    fontSize: fontSize[1],
    color: colors.accent,
  },
});
