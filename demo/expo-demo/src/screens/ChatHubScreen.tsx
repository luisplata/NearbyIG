import { useEffect, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { fmt } from '../generated/copy';
import { fixtures } from '../generated/fixtures';
import type { Intention } from '../generated/fixtures';
import { chatText } from '../live/chatCopy';
import { unreadMatchCount, type MatchRow } from '../live/chat';
import { useLive } from '../live/LiveProvider';
import { canResolve, formatPingTime, pingErrorKey, type PingRow } from '../live/pings';
import { pingText, type PingsCopyKey } from '../live/pingsCopy';
import type { PingStatus } from '../live/types';
import { useDemo } from '../state/DemoProvider';
import { formatDistance } from '../state/format';
import { profileById } from '../state/selectors';
import type { UiProfile } from '../state/types';
import { colors, fontSize, radii, space, text } from '../theme/theme';

import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { Chip } from '../components/Chip';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { PressableRow } from '../components/PressableRow';

/**
 * Pantalla de **Chat**: conversaciones primero, pings después.
 *
 * **Qué cambió y por qué.** Antes esta pantalla se llamaba "Pings" y el chat era
 * una pestaña adentro; el usuario no la encontraba y no había forma de llegar a
 * una conversación sin adivinar el camino. Ahora es un tab principal del nav y
 * abre en **Conversaciones**. Los pings no se perdieron: son los segmentos
 * Recibidos y Enviados, en ese orden de importancia.
 *
 * **Dos fuentes, una pantalla.** Con sesión live las conversaciones son
 * `GET /matches` (con último mensaje y no leídos) y las bandejas son
 * `GET /pings?box=inbox|sent`. Sin sesión se ve el guion del dataset: matches del
 * reducer, pings entrantes y pings enviados. El mock es el piso de la demo cuando
 * la API no está configurada o no responde.
 *
 * **Badges.** El nav muestra mensajes sin leer; el segmento Recibidos muestra los
 * pings pendientes en su propia etiqueta. Son números distintos y no se suman.
 */
export type ChatSegment = 'conversations' | 'inbox' | 'sent';

export function ChatHubScreen() {
  const { state } = useDemo();
  const live = useLive();
  if (state.source === 'live' && live.enabled) {
    return <LiveChatHub />;
  }
  return <MockChatHub />;
}

/**
 * Segmentos. El contador va en la etiqueta porque un chip extra por número no
 * entra en 360 px y el número al lado de la palabra se lee sin pensar.
 */
function SegmentBar({
  segment,
  unread,
  pending,
  onSelect,
}: {
  segment: ChatSegment;
  unread: number;
  pending: number;
  onSelect: (segment: ChatSegment) => void;
}) {
  return (
    <View style={styles.tabs}>
      <Chip
        label={
          unread > 0
            ? `${chatText('segConversations')} · ${unread}`
            : chatText('segConversations')
        }
        selected={segment === 'conversations'}
        onPress={() => onSelect('conversations')}
      />
      <Chip
        label={
          pending > 0 ? `${chatText('segInbox')} · ${pending}` : chatText('segInbox')
        }
        icon={pending > 0 ? 'ping' : undefined}
        selected={segment === 'inbox'}
        onPress={() => onSelect('inbox')}
      />
      <Chip
        label={chatText('segSent')}
        selected={segment === 'sent'}
        onPress={() => onSelect('sent')}
      />
    </View>
  );
}

/** Salida del estado vacío: cerrar la pantalla y buscar gente para pinguear. */
function useFindPeople(): () => void {
  const { dispatch } = useDemo();
  return () => {
    dispatch({ type: 'CLOSE_OVERLAY' });
    dispatch({ type: 'SET_VIEW', view: 'list' });
  };
}

function LiveChatHub() {
  const { dispatch } = useDemo();
  const live = useLive();
  const findPeople = useFindPeople();
  const [segment, setSegment] = useState<ChatSegment>('conversations');
  const [busy, setBusy] = useState<string | null>(null);
  const rows = segment === 'inbox' ? live.pings.inbox : live.pings.sent;
  const error = live.pings.error;
  const unread = unreadMatchCount(live.matches);
  const pending = live.pings.pending;

  // La bandeja de conversaciones no tiene polling propio: se pide al entrar
  // (mismo criterio que la campana: no sumar requests al rate limit).
  useEffect(() => {
    if (segment === 'conversations') {
      void live.refreshMatches();
    }
  }, [segment, live.refreshMatches]);

  const run = async (pingId: string, mode: 'accept' | 'reject'): Promise<void> => {
    setBusy(pingId);
    if (mode === 'accept') {
      await live.acceptPing(pingId);
    } else {
      await live.rejectPing(pingId);
    }
    setBusy(null);
  };

  /** Abrir un match: la conversación real reemplaza al mock en la pantalla chat. */
  const openChat = async (matchId: string): Promise<void> => {
    setBusy(matchId);
    await live.openChat(matchId);
    setBusy(null);
    dispatch({ type: 'OPEN_OVERLAY', overlay: 'chat' });
  };

  return (
    <View style={styles.liveRoot}>
      <SegmentBar
        segment={segment}
        unread={unread}
        pending={pending}
        onSelect={setSegment}
      />
      <View style={styles.toolbar}>
        <Chip
          label={pingText('refresh')}
          onPress={() =>
            void (segment === 'conversations' ? live.refreshMatches() : live.refreshPings())
          }
        />
      </View>

      <Text style={[text.small, styles.hint]}>
        {segment === 'conversations' ? chatText('matchesHint') : pingText('liveHint')}
      </Text>

      {error === null || segment === 'conversations' ? null : (
        <Text style={[text.small, styles.error]}>
          {pingText(pingErrorKey(error), { code: error })}
        </Text>
      )}

      {segment === 'conversations' ? (
        <MatchList busy={busy} onOpen={openChat} onFindPeople={findPeople} />
      ) : rows.length === 0 ? (
        <EmptyState
          message={pingText(segment === 'inbox' ? 'inboxEmptyLive' : 'sentEmptyLive')}
          icon="ping"
        />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {rows.map((row) => {
            const matchId = row.matchId;
            return (
              <LiveCard
                key={row.id}
                row={row}
                busy={busy === row.id}
                onAccept={() => void run(row.id, 'accept')}
                onReject={() => void run(row.id, 'reject')}
                onOpenChat={matchId === null ? undefined : () => void openChat(matchId)}
              />
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

/**
 * Conversaciones. Si no hay ninguna, el estado vacío **explica cómo conseguir
 * una**: antes era una lista muda y el usuario no sabía qué hacer después.
 */
function MatchList({
  busy,
  onOpen,
  onFindPeople,
}: {
  busy: string | null;
  onOpen: (matchId: string) => Promise<void>;
  onFindPeople: () => void;
}) {
  const live = useLive();
  if (live.matches.length === 0) {
    return (
      <EmptyState
        message={chatText('matchesEmpty')}
        actionLabel={chatText('matchesEmptyCta')}
        onAction={onFindPeople}
        icon="chat"
      />
    );
  }
  return (
    <ScrollView contentContainerStyle={styles.content}>
      {live.matches.map((row) => (
        <MatchCard
          key={row.id}
          row={row}
          busy={busy === row.id}
          onOpen={() => void onOpen(row.id)}
        />
      ))}
    </ScrollView>
  );
}

function MatchCard({
  row,
  busy,
  onOpen,
}: {
  row: MatchRow;
  busy: boolean;
  onOpen: () => void;
}) {
  const time = formatPingTime(row.previewAt ?? row.createdAt);
  const isBot = row.peer.sourceType === 'bot';
  const preview =
    row.preview === null
      ? chatText('matchNoMessages')
      : row.previewMine === true
        ? `${chatText('matchYouPrefix')}${row.preview}`
        : row.preview;

  return (
    <PressableRow
      accessibilityLabel={`${row.peer.nickname}, ${preview}`}
      accessibilityState={{ disabled: busy }}
      onPress={busy ? () => undefined : onOpen}
      style={styles.card}
    >
      <View style={styles.header}>
        <Avatar photoId={row.peer.photoId} size={44} />
        <View style={styles.info}>
          <View style={styles.nameRow}>
            <Text numberOfLines={1} style={[text.bodyLarge, styles.name]}>
              {row.peer.nickname}
            </Text>
            {isBot ? <Chip label={chatText('matchBotTag')} /> : null}
          </View>
          <Text numberOfLines={1} style={[text.small, { color: colors.muted }]}>
            {preview}
          </Text>
        </View>
        <View style={styles.metaColumn}>
          <Text style={[text.small, styles.metaTime]}>{time}</Text>
          {row.unreadCount > 0 ? (
            <View
              style={styles.unread}
              accessibilityLabel={chatText('unreadA11y', {
                count: String(row.unreadCount),
              })}
            >
              <Text style={styles.unreadText}>{row.unreadCount}</Text>
            </View>
          ) : null}
        </View>
        <Icon name="chevronRight" size={18} color={colors.muted} />
      </View>
    </PressableRow>
  );
}

const STATUS_LABELS: Readonly<Record<PingStatus, PingsCopyKey>> = {
  pending: 'statusPending',
  accepted: 'statusAccepted',
  rejected: 'statusRejected',
  expired: 'statusExpired',
};

function LiveCard({
  row,
  busy,
  onAccept,
  onReject,
  onOpenChat,
}: {
  row: PingRow;
  busy: boolean;
  onAccept: () => void;
  onReject: () => void;
  /** Sólo existe con match: es la salida directa a la conversación. */
  onOpenChat?: () => void;
}) {
  const time = formatPingTime(row.createdAt);
  const intention = intentionLabel(row.peer.intention);
  const meta = [intention, time].filter((part): part is string => part !== null).join(' · ');

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Avatar photoId={row.peer.photoId} size={44} />
        <View style={styles.info}>
          <Text numberOfLines={1} style={[text.bodyLarge, styles.name]}>
            {row.peer.nickname}
          </Text>
          <Text numberOfLines={1} style={[text.small, { color: colors.muted }]}>
            {meta}
          </Text>
        </View>
      </View>

      <View style={styles.status}>
        <Icon
          name={row.status === 'accepted' ? 'heart' : row.status === 'pending' ? 'schedule' : 'ping'}
          size={16}
          color={row.status === 'accepted' ? colors.accent : colors.muted}
        />
        <Text numberOfLines={1} style={[text.small, styles.statusText]}>
          {pingText(STATUS_LABELS[row.status])}
        </Text>
      </View>

      {row.status === 'accepted' ? (
        <>
          <Text style={[text.small, styles.match]}>
            {pingText('matchCreated', { name: row.peer.nickname })}
          </Text>
          {onOpenChat === undefined ? null : (
            <Button
              label={busy ? chatText('opening') : chatText('openChat')}
              fullWidth
              disabled={busy}
              onPress={onOpenChat}
            />
          )}
        </>
      ) : null}

      {canResolve(row) ? (
        <View style={styles.actions}>
          <View style={styles.action}>
            <Button
              label={busy ? pingText('sending') : fmt('ping.accept')}
              fullWidth
              disabled={busy}
              onPress={onAccept}
            />
          </View>
          <View style={styles.action}>
            <Button
              label={fmt('ping.reject')}
              variant="outline"
              fullWidth
              disabled={busy}
              onPress={onReject}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** Intención del peer: sólo se dibuja si está en el vocabulario del catálogo. */
function intentionLabel(value: string): string | null {
  return INTENTIONS.includes(value as Intention) ? fmt(`intention.${value}`) : null;
}

const INTENTIONS: readonly Intention[] = fixtures.filters.intentions;

/**
 * Dataset: el guion de siempre, con las etiquetas nuevas. Conversaciones son los
 * matches del reducer (abren el chat mock); Recibidos y Enviados son los pings
 * simulados con aceptar/rechazar.
 */
function MockChatHub() {
  const { state, dispatch } = useDemo();
  const findPeople = useFindPeople();
  const [segment, setSegment] = useState<ChatSegment>('conversations');
  const incoming = state.incomingPings.flatMap((id) => {
    const profile = profileById(id, state.catalog);
    return profile === null ? [] : [profile];
  });
  // Un ping enviado sigue "esperando respuesta" hasta que hay match (ahí la
  // conversación vive en el chat) o el perfil se bloquea.
  const sent = state.pingsSent.flatMap((id) => {
    const profile = profileById(id, state.catalog);
    if (profile === null || state.matches.includes(id) || state.blocked.includes(id)) {
      return [];
    }
    return [profile];
  });
  const matches = state.matches.flatMap((id) => {
    const profile = profileById(id, state.catalog);
    return profile === null ? [] : [profile];
  });

  const openChat = (profile: UiProfile): void => {
    dispatch({ type: 'OPEN_CHAT', profileId: profile.id });
  };

  return (
    <View style={styles.liveRoot}>
      <SegmentBar
        segment={segment}
        unread={0}
        pending={incoming.length}
        onSelect={setSegment}
      />
      <Text style={[text.small, styles.hint]}>{chatText('hintConversations')}</Text>

      {segment === 'conversations' ? (
        matches.length === 0 ? (
          <EmptyState
            message={chatText('matchesEmpty')}
            actionLabel={chatText('matchesEmptyCta')}
            onAction={findPeople}
            icon="chat"
          />
        ) : (
          <ScrollView contentContainerStyle={styles.content}>
            {matches.map((profile) => (
              <PressableRow
                key={profile.id}
                accessibilityLabel={`${profile.nickname}, ${chatText('openChat')}`}
                onPress={() => openChat(profile)}
                style={styles.card}
              >
                <View style={styles.header}>
                  <Avatar photoId={profile.photoId} size={44} />
                  <View style={styles.info}>
                    <Text numberOfLines={1} style={[text.bodyLarge, styles.name]}>
                      {profile.nickname}
                    </Text>
                    <Text numberOfLines={1} style={[text.small, { color: colors.muted }]}>
                      {formatDistance(profile.distanceM)}
                    </Text>
                  </View>
                  <Icon name="chat" size={18} color={colors.accent} />
                </View>
              </PressableRow>
            ))}
          </ScrollView>
        )
      ) : segment === 'inbox' ? (
        incoming.length === 0 ? (
          <EmptyState message={fmt('ping.inboxEmpty')} icon="ping" />
        ) : (
          <ScrollView contentContainerStyle={styles.content}>
            {incoming.map((profile) => (
              <MockReceivedCard key={profile.id} profile={profile} />
            ))}
          </ScrollView>
        )
      ) : sent.length === 0 ? (
        <EmptyState message={pingText('sentEmptyLive')} icon="ping" />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {sent.map((profile) => (
            <MockSentCard key={profile.id} profile={profile} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function MockReceivedCard({ profile }: { profile: UiProfile }) {
  const { dispatch } = useDemo();
  return (
    <Card
      profile={profile}
      subtitle={`${fmt('notif.ping')} · ${formatDistance(profile.distanceM)}`}
    >
      <View style={styles.actions}>
        <View style={styles.action}>
          <Button
            label={fmt('ping.accept')}
            fullWidth
            onPress={() => dispatch({ type: 'ACCEPT_PING', profileId: profile.id })}
          />
        </View>
        <View style={styles.action}>
          <Button
            label={fmt('ping.reject')}
            variant="outline"
            fullWidth
            onPress={() => dispatch({ type: 'REJECT_PING', profileId: profile.id })}
          />
        </View>
      </View>
    </Card>
  );
}

function MockSentCard({ profile }: { profile: UiProfile }) {
  const status = fmt('ping.sentStatus');
  return (
    <Card profile={profile} subtitle={formatDistance(profile.distanceM)}>
      <View style={styles.status} accessibilityLabel={status}>
        <Icon name="schedule" size={16} color={colors.accent} />
        <Text numberOfLines={1} style={[text.small, styles.statusText]}>
          {status}
        </Text>
      </View>
    </Card>
  );
}

function Card({
  profile,
  subtitle,
  children,
}: {
  profile: UiProfile;
  subtitle: string;
  children?: ReactNode;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Avatar photoId={profile.photoId} size={44} />
        <View style={styles.info}>
          <Text numberOfLines={1} style={[text.bodyLarge, styles.name]}>
            {profile.nickname}
          </Text>
          <Text numberOfLines={1} style={[text.small, { color: colors.muted }]}>
            {subtitle}
          </Text>
        </View>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  liveRoot: {
    flex: 1,
    gap: space[1],
  },
  tabs: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 2,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 2,
  },
  hint: {
    color: colors.muted,
  },
  error: {
    color: colors.danger,
  },
  content: {
    gap: space[1],
    paddingBottom: space[3],
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii[1],
    padding: space[2],
    gap: space[1],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: fontSize[2],
  },
  actions: {
    flexDirection: 'row',
    gap: space[1],
  },
  action: {
    flex: 1,
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[1],
  },
  statusText: {
    flex: 1,
    color: colors.muted,
  },
  match: {
    color: colors.accent,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  metaColumn: {
    alignItems: 'flex-end',
    gap: 2,
  },
  metaTime: {
    color: colors.muted,
  },
  unread: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadText: {
    color: colors.bg,
    fontSize: fontSize[0],
    fontWeight: '600',
  },
});
