import { Pressable, StyleSheet, Text, View } from 'react-native';

import { fmt } from '../generated/copy';
import { colors, fontSize, space } from '../theme/theme';

import { Icon } from './Icon';

/**
 * Banner persistente del modo fantasma/pausa (F-8): el perfil propio sale del
 * descubrimiento y los pings quedan deshabilitados.
 */
export function GhostBanner({ onDisable }: { onDisable: () => void }) {
  return (
    <View style={styles.banner} accessibilityLiveRegion="polite">
      <Icon name="eyeOff" size={16} color={colors.accent} />
      <Text numberOfLines={2} style={styles.text}>
        {fmt('settings.ghostOn')}
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
