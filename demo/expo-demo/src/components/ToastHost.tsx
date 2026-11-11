import { Pressable, StyleSheet, Text, View } from 'react-native';

import { fmt } from '../generated/copy';
import type { DemoToast } from '../state/types';
import { colors, fontSize, radii, space } from '../theme/theme';

import { Icon } from './Icon';

/**
 * Toast del contrato: 4 s (timer del store), `accessibilityLiveRegion` para
 * lectores de pantalla y tap para descartarlo.
 */
export function ToastHost({ toast, onDismiss }: { toast: DemoToast; onDismiss: () => void }) {
  const label = fmt(toast.textKey);
  return (
    <View style={styles.anchor} pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityLiveRegion="polite"
        onPress={onDismiss}
        style={({ pressed }) => [styles.toast, pressed && styles.pressed]}
      >
        <Icon name="checkCircle" size={16} color={colors.accent} />
        <Text numberOfLines={2} style={styles.text}>
          {label}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: 'absolute',
    left: space[3],
    right: space[3],
    bottom: space[3],
    alignItems: 'center',
  },
  toast: {
    minHeight: 44,
    maxWidth: 360,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space[2],
    paddingVertical: space[1],
    borderRadius: radii[1],
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  pressed: {
    opacity: 0.86,
  },
  text: {
    flexShrink: 1,
    fontSize: fontSize[1],
    color: colors.text,
  },
});
