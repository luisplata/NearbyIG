import { StyleSheet, Text, View } from 'react-native';

import { colors, fontSize, radii, space, text } from '../theme/theme';

import { Button } from './Button';
import { Icon, type IconName } from './Icon';

/** Estado vacío reutilizable: mensaje + acción opcional (F-3). */
export function EmptyState({
  message,
  actionLabel,
  onAction,
  icon = 'searchOff',
}: {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: IconName;
}) {
  return (
    <View style={styles.empty}>
      <Icon name={icon} size={28} color={colors.muted} />
      <Text style={[text.body, styles.emptyText, { color: colors.muted }]}>{message}</Text>
      {actionLabel !== undefined && onAction !== undefined ? (
        <View style={styles.emptyAction}>
          <Button label={actionLabel} onPress={onAction} variant="outline" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space[3],
    gap: space[2],
  },
  emptyText: {
    textAlign: 'center',
  },
  emptyAction: {
    minWidth: 180,
  },
});
