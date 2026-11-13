import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { fmt } from '../generated/copy';
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
 */
export function ProfileScreen() {
  const { state, dispatch } = useDemo();
  const profile = profileById(state.profileId, state.catalog);
  if (profile === null) {
    return null;
  }

  const blockedReason = pingBlockedReason(state, profile.id);
  const alreadySent = state.pingsSent.includes(profile.id);
  const matched = state.matches.includes(profile.id);

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
          label={alreadySent ? fmt('profile.pingSent') : fmt('profile.ping')}
          onPress={() => dispatch({ type: 'SEND_PING', profileId: profile.id })}
          disabled={!canPing(state, profile.id)}
          fullWidth
        />
        {blockedReason === null ? null : (
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
  actionsRow: {
    flexDirection: 'row',
    gap: space[1],
    marginTop: space[2],
  },
  action: {
    flex: 1,
  },
});
