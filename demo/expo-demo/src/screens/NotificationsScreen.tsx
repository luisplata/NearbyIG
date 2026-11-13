import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { fmt } from '../generated/copy';
import { useLive } from '../live/LiveProvider';
import { formatPingTime, pendingPings } from '../live/pings';
import { pingText } from '../live/pingsCopy';
import { useDemo } from '../state/DemoProvider';
import { bellBadgeCount, unreadCount } from '../state/selectors';
import type { DemoNotification } from '../state/types';
import { colors, fontFamily, fontSize, space, text } from '../theme/theme';

import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { Icon, type IconName } from '../components/Icon';

/**
 * Centro de notificaciones.
 *
 * **Dos fuentes.** Las notificaciones guionadas del dataset (badge de no leídos,
 * marcar leído) y, cuando hay sesión live, los pings pendientes de la bandeja
 * real. Antes el centro no mostraba nada aunque el backend hubiera recibido un
 * ping: ahora la fila live es explícita ("Ping de {nombre}") y lleva a la
 * bandeja, donde sí se puede aceptar o rechazar.
 *
 * **Por qué no se marcan leídos.** Un ping live no es una notificación local: se
 * apaga cuando el server deja de listarlo como `pending` (aceptado, rechazado o
 * vencido). Marcarlo leído acá sería mentirle al backend.
 */
export function NotificationsScreen() {
  const { state, dispatch } = useDemo();
  const live = useLive();
  const livePings = state.source === 'live' ? pendingPings(live.pings.inbox) : [];
  const unread = unreadCount(state);
  const badge = bellBadgeCount(state, live.pings.pending);
  const empty = state.notifications.length === 0 && livePings.length === 0;

  return (
    <View style={styles.root}>
      <View style={styles.topRow}>
        <Text style={[text.small, styles.unread]}>
          {fmt('notif.unread', { count: `${badge}` })}
        </Text>
        <Button
          label={fmt('notif.markAllRead')}
          variant="ghost"
          disabled={unread === 0}
          onPress={() => dispatch({ type: 'MARK_ALL_READ' })}
        />
      </View>

      {livePings.length === 0 ? null : (
        <View style={styles.section}>
          <Text style={[text.small, styles.sectionTitle]}>{fmt('ping.inboxTitle')}</Text>
          {livePings.map((row) => (
            <LivePingRow
              key={row.id}
              name={row.peer.nickname}
              time={formatPingTime(row.createdAt)}
              onOpen={() => {
                dispatch({ type: 'OPEN_OVERLAY', overlay: 'pings' });
              }}
            />
          ))}
        </View>
      )}

      {empty ? (
        <EmptyState message={fmt('notif.empty')} icon="bellOutline" />
      ) : state.notifications.length === 0 ? null : (
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

function LivePingRow({
  name,
  time,
  onOpen,
}: {
  name: string;
  time: string;
  onOpen: () => void;
}) {
  const label = pingText('notifLive', { name });
  return (
    <View style={styles.row}>
      <Icon name="ping" size={18} color={colors.accent} />
      <View style={styles.rowBody}>
        <Text style={[text.body, styles.unreadLabel, { fontSize: fontSize[1] }]}>{label}</Text>
        {time === '' ? null : (
          <Text style={[text.small, { color: colors.muted }]}>{time}</Text>
        )}
      </View>
      <Button label={fmt('ping.accept')} variant="ghost" onPress={onOpen} />
    </View>
  );
}

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
  section: {
    gap: 2,
  },
  sectionTitle: {
    color: colors.muted,
    fontWeight: '600',
    letterSpacing: 0.4,
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
