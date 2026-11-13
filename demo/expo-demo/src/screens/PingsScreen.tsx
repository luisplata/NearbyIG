import { useEffect, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { fmt } from '../generated/copy';
import { fixtures } from '../generated/fixtures';
import type { Intention } from '../generated/fixtures';
import { chatText } from '../live/chatCopy';
import type { MatchRow } from '../live/chat';
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
 * Bandeja de pings **y** de matches.
 *
 * **Dos fuentes, una pantalla.** Con sesión live la bandeja es la del backend
 * (`GET /pings?box=inbox|sent`) y la tercera pestaña son los matches reales
 * (`GET /matches`): cada fila trae el peer ya proyectado, el último mensaje y
 * cuántos mensajes del otro lado quedan sin leer. Sin sesión (dataset del build)
 * se ve el guion de siempre, con aceptar/rechazar simulados. El mock no se rompió:
 * es el piso de la demo cuando la API no está configurada o no responde.
 *
 * **Aceptar crea match, y el match se puede abrir.** La respuesta del accept trae
 * el `Match`; la fila pasa a `accepted` y el match aparece en la pestaña Matches,
 * que es la puerta al chat real.
 */
export function PingsScreen() {
  const { state } = useDemo();
  const live = useLive();
  if (state.source === 'live' && live.enabled) {
    return <LivePings />;
  }
  return <MockPings />;
}

/** Guion del dataset: secciones de recibidos y enviados, como antes. */
function MockPings() {
  const { state } = useDemo();
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

  if (incoming.length === 0 && sent.length === 0) {
    return <EmptyState message={fmt('ping.inboxEmpty')} icon="ping" />;
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {incoming.length === 0 ? null : (
        <Section title={fmt('ping.inboxTitle')}>
          {incoming.map((profile) => (
            <MockReceivedCard key={profile.id} profile={profile} />
          ))}
        </Section>
      )}
      {sent.length === 0 ? null : (
        <Section title={fmt('ping.sentTitle')}>
          {sent.map((profile) => (
            <MockSentCard key={profile.id} profile={profile} />
          ))}
        </Section>
      )}
    </ScrollView>
  );
}

/**
 * Bandeja real: pestañas recibidos/enviados/matches, refresco manual y estado por
 * fila. El polling del controlador (5 s) mantiene la lista de pings al día sin
 * que el usuario tenga que tocar nada; la de matches se refresca al abrir la
 * pestaña y con los eventos `match.created`/`message.created` del stream.
 */
function LivePings() {
  const { dispatch } = useDemo();
  const live = useLive();
  const [tab, setTab] = useState<'inbox' | 'sent' | 'matches'>('inbox');
  const [busy, setBusy] = useState<string | null>(null);
  const rows = tab === 'inbox' ? live.pings.inbox : live.pings.sent;
  const error = live.pings.error;
  const unread = live.matches.reduce((total, row) => total + row.unreadCount, 0);

  // La pestaña Matches pide su foto al entrar: la bandeja no tiene polling propio
  // (mismo criterio que la campana: no sumar requests al rate limit).
  useEffect(() => {
    if (tab === 'matches') {
      void live.refreshMatches();
    }
  }, [tab, live.refreshMatches]);

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
      <View style={styles.tabs}>
        <Chip
          label={pingText('tabInbox')}
          selected={tab === 'inbox'}
          onPress={() => setTab('inbox')}
        />
        <Chip
          label={pingText('tabSent')}
          selected={tab === 'sent'}
          onPress={() => setTab('sent')}
        />
        <Chip
          label={chatText('tabMatches')}
          selected={tab === 'matches'}
          onPress={() => setTab('matches')}
        />
        {tab === 'inbox' && live.pings.pending > 0 ? (
          <Chip label={String(live.pings.pending)} icon="ping" selected emphasis />
        ) : null}
        {tab === 'matches' && unread > 0 ? (
          <Chip label={String(unread)} icon="heart" selected emphasis />
        ) : null}
        <View style={styles.refresh}>
          <Chip
            label={pingText('refresh')}
            onPress={() =>
              void (tab === 'matches' ? live.refreshMatches() : live.refreshPings())
            }
          />
        </View>
      </View>

      {tab === 'matches' ? (
        <Text style={[text.small, styles.hint]}>{chatText('matchesHint')}</Text>
      ) : (
        <Text style={[text.small, styles.hint]}>{pingText('liveHint')}</Text>
      )}

      {error === null || tab === 'matches' ? null : (
        <Text style={[text.small, styles.error]}>
          {pingText(pingErrorKey(error), { code: error })}
        </Text>
      )}

      {tab === 'matches' ? <MatchList busy={busy} onOpen={openChat} /> : null}

      {tab !== 'matches' ? (
        rows.length === 0 ? (
          <EmptyState
            message={pingText(tab === 'inbox' ? 'inboxEmptyLive' : 'sentEmptyLive')}
            icon="ping"
          />
        ) : (
          <ScrollView contentContainerStyle={styles.content}>
            {rows.map((row) => (
              <LiveCard
                key={row.id}
                row={row}
                busy={busy === row.id}
                onAccept={() => void run(row.id, 'accept')}
                onReject={() => void run(row.id, 'reject')}
              />
            ))}
          </ScrollView>
        )
      ) : null}
    </View>
  );
}

/** Pestaña Matches: preview, hora y no leídos. Tap = abrir la conversación. */
function MatchList({
  busy,
  onOpen,
}: {
  busy: string | null;
  onOpen: (matchId: string) => Promise<void>;
}) {
  const live = useLive();
  if (live.matches.length === 0) {
    return <EmptyState message={chatText('matchesEmpty')} icon="heart" />;
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
}: {
  row: PingRow;
  busy: boolean;
  onAccept: () => void;
  onReject: () => void;
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
        <Text style={[text.small, styles.match]}>
          {pingText('matchCreated', { name: row.peer.nickname })}
        </Text>
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

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={[text.small, styles.sectionTitle]}>{title}</Text>
      {children}
    </View>
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

function MockReceivedCard({ profile }: { profile: UiProfile }) {
  const { dispatch } = useDemo();
  return (
    <Card profile={profile} subtitle={`${fmt('notif.ping')} · ${formatDistance(profile.distanceM)}`}>
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

const styles = StyleSheet.create({
  liveRoot: {
    flex: 1,
    gap: space[1],
  },
  tabs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  refresh: {
    flex: 1,
    alignItems: 'flex-end',
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
  section: {
    gap: space[1],
    paddingTop: space[1],
  },
  sectionTitle: {
    color: colors.muted,
    fontWeight: '600',
    letterSpacing: 0.4,
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
