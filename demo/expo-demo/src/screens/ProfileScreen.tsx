import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { fmt } from '../generated/copy';
import { useLive } from '../live/LiveProvider';
import { pingErrorKey, pingForPeer, pingSendBlock } from '../live/pings';
import { pingText } from '../live/pingsCopy';
import { useDemo } from '../state/DemoProvider';
import { formatDistance } from '../state/format';
import {
  avatarState,
  canPing,
  pingBlockedReason,
  profileById,
} from '../state/selectors';
import { colors, fontSize, space, text } from '../theme/theme';

import { Avatar } from '../components/Avatar';
import { OnlineDot, VerifiedBadge } from '../components/Badges';
import { Button } from '../components/Button';
import { Chip } from '../components/Chip';

/**
 * Detalle de un perfil: foto (blur/clear), intención, distancia, ping, entrada
 * a seguridad y bloqueo (F-1, F-4, F-10).
 *
 * **El ping, según la fuente.** En dataset el botón despacha `SEND_PING` y el
 * reducer simula la respuesta. Con sesión live llama a `POST /pings` y refleja
 * el estado real: `pending` deshabilita el botón (el server rechazaría un
 * duplicado con 409) y un `accepted` —el caso del bot, que acepta solo— muestra
 * el match creado. Los errores del backend se explican con su código, no con un
 * "algo salió mal".
 */
export function ProfileScreen() {
  const { state, dispatch } = useDemo();
  const live = useLive();
  const profile = profileById(state.profileId, state.catalog);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (profile === null) {
    return null;
  }

  const liveMode = state.source === 'live' && live.enabled && live.state.session !== null;
  const livePing = liveMode ? pingForPeer(live.pings.sent, profile.id) : null;
  const liveBlock = pingSendBlock(livePing);
  const guest = liveMode && live.state.session?.sourceType !== 'human';
  const blockedReason = pingBlockedReason(state, profile.id);
  const alreadySent = state.pingsSent.includes(profile.id);
  const matched = state.matches.includes(profile.id);

  const sendPing = async (): Promise<void> => {
    if (!liveMode) {
      dispatch({ type: 'SEND_PING', profileId: profile.id });
      return;
    }
    setBusy(true);
    setError(null);
    const result = await live.sendPing(profile.id);
    setBusy(false);
    if (!result.ok) {
      setError(pingText(pingErrorKey(result.code), { code: result.code ?? '' }));
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.center}>
        <Avatar
          photoId={profile.photoId}
          size={120}
          renderState={avatarState(state, profile.id)}
          semanticLabel={profile.nickname}
        />
      </View>

      <View style={[styles.center, styles.nameRow]}>
        <Text numberOfLines={1} style={[text.heading, styles.name]}>
          {profile.nickname}
        </Text>
        {profile.verified ? <VerifiedBadge size={18} /> : null}
        {profile.online ? <OnlineDot size={10} /> : null}
      </View>

      <Text style={[text.body, styles.centerText, { color: colors.muted }]}>
        {fmt(profile.statusKey)}
      </Text>

      <View style={[styles.center, styles.chips]}>
        <Chip label={fmt(`intention.${profile.intention}`)} icon="offer" />
        <Chip
          label={fmt('profile.distance', { distance: formatDistance(profile.distanceM) })}
          icon="nearMe"
        />
      </View>

      <Text style={[text.body, styles.bio]}>{fmt(profile.bioKey)}</Text>
      <Text style={[text.small, { color: colors.muted }]}>{fmt('profile.revealHint')}</Text>

      <View style={styles.block}>
        <Button
          label={pingLabel({
            liveMode,
            busy,
            liveBlock,
            alreadySent,
          })}
          onPress={() => void sendPing()}
          disabled={
            busy || guest || (liveMode ? liveBlock !== null : !canPing(state, profile.id))
          }
          fullWidth
        />
        {guest ? (
          <Text style={[text.small, styles.hint]}>{pingText('guestNote')}</Text>
        ) : null}
        {error === null ? null : <Text style={[text.small, styles.error]}>{error}</Text>}
        {livePing?.status === 'accepted' ? (
          <Text style={[text.small, styles.match]}>
            {pingText('matchCreated', { name: profile.nickname })}
          </Text>
        ) : null}
        {livePing?.status === 'pending' ? (
          <Text style={[text.small, styles.hint]}>
            {pingText('sendPending')}
          </Text>
        ) : null}
        {livePing?.peer.sourceType === 'bot' && livePing.status === 'accepted' ? (
          <Text style={[text.small, styles.match]}>{pingText('sendBotNote')}</Text>
        ) : null}
        {liveMode ? null : blockedReason === null ? null : (
          <Text style={[text.small, styles.hint]}>{fmt(blockedReason)}</Text>
        )}
        {alreadySent ? (
          <Text style={[text.small, styles.hint]}>
            {fmt('profile.pingSentHint', { name: profile.nickname })}
          </Text>
        ) : null}
        {matched ? (
          <Button
            label={fmt('profile.viewChat')}
            variant="outline"
            fullWidth
            onPress={() => dispatch({ type: 'OPEN_CHAT', profileId: profile.id })}
          />
        ) : null}
      </View>

      <View style={styles.actionsRow}>
        <View style={styles.action}>
          <Button
            label={fmt('profile.report')}
            variant="outline"
            fullWidth
            onPress={() =>
              dispatch({ type: 'OPEN_OVERLAY', overlay: 'safety', profileId: profile.id })
            }
          />
        </View>
        <View style={styles.action}>
          <Button
            label={fmt('profile.block')}
            variant="danger"
            fullWidth
            onPress={() => dispatch({ type: 'BLOCK_PROFILE', profileId: profile.id })}
          />
        </View>
      </View>

      <Text style={[text.small, styles.hint]}>{fmt('safety.blockedHint')}</Text>
    </ScrollView>
  );
}

function pingLabel({
  liveMode,
  busy,
  liveBlock,
  alreadySent,
}: {
  liveMode: boolean;
  busy: boolean;
  liveBlock: 'sent' | 'matched' | null;
  alreadySent: boolean;
}): string {
  if (busy) {
    return pingText('sending');
  }
  if (liveMode) {
    if (liveBlock === 'sent') {
      return fmt('profile.pingSent');
    }
    if (liveBlock === 'matched') {
      return pingText('statusAccepted');
    }
    return pingText('send');
  }
  return alreadySent ? fmt('profile.pingSent') : fmt('profile.ping');
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: space[3],
    gap: space[1],
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerText: {
    textAlign: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: space[2],
  },
  name: {
    flexShrink: 1,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[1],
    marginTop: space[2],
  },
  bio: {
    marginTop: space[3],
  },
  block: {
    marginTop: space[3],
    gap: space[1],
  },
  hint: {
    color: colors.muted,
    fontSize: fontSize[0],
  },
  error: {
    color: colors.danger,
    fontSize: fontSize[0],
  },
  match: {
    color: colors.accent,
    fontSize: fontSize[0],
  },
  actionsRow: {
    flexDirection: 'row',
    gap: space[1],
    marginTop: space[2],
  },
  action: {
    flex: 1,
  },
});
