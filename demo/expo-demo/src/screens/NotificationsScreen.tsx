import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { fmt } from '../generated/copy';
import { useDemo } from '../state/DemoProvider';
import { unreadCount } from '../state/selectors';
import type { DemoNotification } from '../state/types';
import { colors, fontFamily, fontSize, space, text } from '../theme/theme';

import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { Icon, type IconName } from '../components/Icon';

/**
 * Centro de notificaciones guionadas: badge de no leídos, marcar leído y marcar
 * todo leído. No hay push real (F-6).
 */
export function NotificationsScreen() {
  const { state, dispatch } = useDemo();
  const unread = unreadCount(state);

  return (
    <View style={styles.root}>
      <View style={styles.topRow}>
        <Text style={[text.small, styles.unread]}>
          {fmt('notif.unread', { count: `${unread}` })}
        </Text>
        <Button
          label={fmt('notif.markAllRead')}
          variant="ghost"
          disabled={unread === 0}
          onPress={() => dispatch({ type: 'MARK_ALL_READ' })}
        />
      </View>

      {state.notifications.length === 0 ? (
        <EmptyState message={fmt('notif.empty')} icon="bellOutline" />
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {state.notifications.map((notification) => (
            <NotificationRow
              key={notification.id}
              notification={notification}
              onRead={() => dispatch({ type: 'MARK_READ', notificationId: notification.id })}
            />
          ))}
        </ScrollView>
      )}

      <Text style={[text.small, { color: colors.muted }]}>{fmt('notif.pushNote')}</Text>
    </View>
  );
}

const icons: Record<DemoNotification['kind'], IconName> = {
  ping: 'ping',
  match: 'heart',
  reveal: 'eye',
};

function NotificationRow({
  notification,
  onRead,
}: {
  notification: DemoNotification;
  onRead: () => void;
}) {
  return (
    <View style={styles.row}>
      <Icon
        name={icons[notification.kind]}
        size={18}
        color={notification.read ? colors.muted : colors.accent}
      />
      <View style={styles.rowBody}>
        <Text
          style={[
            text.body,
            { fontSize: fontSize[1] },
            notification.read ? styles.readLabel : styles.unreadLabel,
          ]}
        >
          {fmt(`notif.${notification.kind}`)}
        </Text>
      </View>
      {notification.read ? null : (
        <Button label={fmt('notif.markRead')} variant="ghost" onPress={onRead} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    gap: space[1],
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[1],
  },
  unread: {
    flex: 1,
  },
  list: {
    gap: space[1],
    paddingVertical: space[1],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[1],
    paddingVertical: space[1],
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowBody: {
    flex: 1,
  },
  readLabel: {
    fontFamily: fontFamily.regular,
    color: colors.text,
  },
  unreadLabel: {
    fontFamily: fontFamily.semibold,
    color: colors.text,
  },
});
