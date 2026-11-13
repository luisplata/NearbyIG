import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { fmt } from '../generated/copy';
import { useLive } from '../live/LiveProvider';
import type { NotificationRow } from '../live/notifications';
import { formatPingTime, pendingPings } from '../live/pings';
import { pingText } from '../live/pingsCopy';
import { safetyCopy, safetyText } from '../live/safetyCopy';
import type { LiveNotificationKind } from '../live/types';
import { useDemo } from '../state/DemoProvider';
import { unreadCount } from '../state/selectors';
import type { DemoNotification } from '../state/types';
import { colors, fontFamily, fontSize, space, text } from '../theme/theme';

import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { Icon, type IconName } from '../components/Icon';
import { PressableRow } from '../components/PressableRow';

/**
 * Centro de notificaciones.
 *
 * **Dos fuentes, igual que las bandejas.** Con sesión live la lista es
 * `GET /notifications`: avisos persistidos por el backend (`ping.received`,
 * `match.created`, `message.created`) con el peer ya proyectado y `readAt` como
 * única autoridad del estado. Sin sesión se ve el guion del dataset de siempre.
 *
 * **Abrir no marca leído.** En dataset abrir el centro marca todo leído (F-6);
 * en live eso sería mentirle al server: el badge se apaga con la acción
 * explícita ("Marcar todas como leídas"), que es `POST /notifications/read`.
 *
 * **Tap.** Lleva a la bandeja de pings, donde vive el estado del match y la
 * acción de aceptar/rechazar. El build todavía no tiene pantalla de chat live,
 * así que no hay otra pantalla a la que ir sin inventarla.
 */
export function NotificationsScreen() {
  const { state } = useDemo();
  const live = useLive();
  if (state.source === 'live' && live.enabled) {
    return <LiveNotifications />;
  }
  return <DatasetNotifications />;
}

/** Guion del dataset: mismas filas, mismo badge y mismo "marcar leído". */
function DatasetNotifications() {
  const { state, dispatch } = useDemo();
  const live = useLive();
  const livePings = state.source === 'live' ? pendingPings(live.pings.inbox) : [];
  const unread = unreadCount(state);
  const empty = state.notifications.length === 0 && livePings.length === 0;

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

      {livePings.length === 0 ? null : (
        <View style={styles.section}>
          <Text style={[text.small, styles.sectionTitle]}>{fmt('ping.inboxTitle')}</Text>
          {livePings.map((row) => (
            <View key={row.id} style={styles.row}>
              <Icon name="ping" size={18} color={colors.accent} />
              <View style={styles.rowBody}>
                <Text style={[text.body, styles.unreadLabel, { fontSize: fontSize[1] }]}>
                  {pingText('notifLive', { name: row.peer.nickname })}
                </Text>
                <Text style={[text.small, { color: colors.muted }]}>
                  {formatPingTime(row.createdAt)}
                </Text>
              </View>
              <Button
                label={fmt('ping.accept')}
                variant="ghost"
                onPress={() => {
                  dispatch({ type: 'OPEN_OVERLAY', overlay: 'pings' });
                }}
              />
            </View>
          ))}
        </View>
      )}

      {empty ? (
        <EmptyState message={fmt('notif.empty')} icon="bellOutline" />
      ) : state.notifications.length === 0 ? null : (
        <ScrollView contentContainerStyle={styles.list}>
          {state.notifications.map((notification) => (
            <NotificationRowView
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

/**
 * Campana real. El badge y el "sin leer" salen del `unreadCount` del server; la
 * lista pide la foto al abrir porque no tiene polling propio (evita sumar
 * requests al rate limit del backend) y el stream la refresca cuando hay
 * `ping.received`, `match.created` o `message.created`.
 */
function LiveNotifications() {
  const { dispatch } = useDemo();
  const live = useLive();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void live.refreshNotifications();
    // Sólo al abrir: el resto de los refrescos vienen del stream.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = live.notifications;
  const unread = live.unreadCount;
  const pending = pendingPings(live.pings.inbox);

  const markAll = async (): Promise<void> => {
    setBusy(true);
    await live.markNotificationsRead();
    setBusy(false);
  };

  const open = (row: NotificationRow): void => {
    void live.markNotificationsRead([row.id]);
    dispatch({ type: 'OPEN_OVERLAY', overlay: 'pings' });
  };

  return (
    <View style={styles.root}>
      <View style={styles.topRow}>
        <Text style={[text.small, styles.unread]}>
          {safetyText('notifUnread', { count: `${unread}` })}
        </Text>
        <Button
          label={safetyCopy.notifLive}
          variant="ghost"
          disabled={busy || unread === 0}
          onPress={() => void markAll()}
        />
      </View>

      {live.notificationError === null ? null : (
        <Text style={[text.small, styles.error]}>
          {safetyText('notifError', { code: live.notificationError })}
        </Text>
      )}

      {rows.length === 0 && pending.length > 0 ? (
        <View style={styles.section}>
          <Text style={[text.small, styles.sectionTitle]}>{fmt('ping.inboxTitle')}</Text>
          {pending.map((row) => (
            <View key={row.id} style={styles.row}>
              <Icon name="ping" size={18} color={colors.accent} />
              <View style={styles.rowBody}>
                <Text style={[text.body, styles.unreadLabel, { fontSize: fontSize[1] }]}>
                  {pingText('notifLive', { name: row.peer.nickname })}
                </Text>
                <Text style={[text.small, { color: colors.muted }]}>
                  {formatPingTime(row.createdAt)}
                </Text>
              </View>
              <Button
                label={fmt('ping.accept')}
                variant="ghost"
                onPress={() => dispatch({ type: 'OPEN_OVERLAY', overlay: 'pings' })}
              />
            </View>
          ))}
        </View>
      ) : rows.length === 0 ? (
        <EmptyState message={safetyCopy.notifEmpty} icon="bellOutline" />
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {rows.map((row) => (
            <View key={row.id} style={styles.row}>
              <Icon
                name={notificationIcon(row.kind)}
                size={18}
                color={row.readAt === null ? colors.accent : colors.muted}
              />
              <PressableRow
                accessibilityLabel={notificationLabel(row)}
                onPress={() => open(row)}
                style={styles.rowBody}
              >
                <Text
                  numberOfLines={2}
                  style={[
                    text.body,
                    { fontSize: fontSize[1] },
                    row.readAt === null ? styles.unreadLabel : styles.readLabel,
                  ]}
                >
                  {notificationLabel(row)}
                </Text>
                <Text style={[text.small, { color: colors.muted }]}>
                  {formatPingTime(row.createdAt)}
                </Text>
              </PressableRow>
              {row.readAt === null ? (
                <Button
                  label={safetyCopy.notifRead}
                  variant="ghost"
                  onPress={() => void live.markNotificationsRead([row.id])}
                />
              ) : null}
            </View>
          ))}
        </ScrollView>
      )}

      <Text style={[text.small, { color: colors.muted }]}>{safetyCopy.notifLiveHint}</Text>
    </View>
  );
}

const icons: Record<DemoNotification['kind'], IconName> = {
  ping: 'ping',
  match: 'heart',
  reveal: 'eye',
};

function notificationIcon(kind: LiveNotificationKind): IconName {
  switch (kind) {
    case 'ping.received':
      return 'ping';
    case 'match.created':
      return 'heart';
    case 'message.created':
      return 'bell';
  }
}

function notificationLabel(row: NotificationRow): string {
  switch (row.kind) {
    case 'ping.received':
      return safetyText('notifPing', { name: row.peer.nickname });
    case 'match.created':
      return safetyText('notifMatch', { name: row.peer.nickname });
    case 'message.created':
      return safetyText('notifMessage', { name: row.peer.nickname });
  }
}

function NotificationRowView({
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
  error: {
    color: colors.danger,
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
