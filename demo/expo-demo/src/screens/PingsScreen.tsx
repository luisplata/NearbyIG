import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { fmt } from '../generated/copy';
import { useDemo } from '../state/DemoProvider';
import { formatDistance } from '../state/format';
import { profileById } from '../state/selectors';
import { colors, fontSize, radii, space, text } from '../theme/theme';

import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';

/** Bandeja de pings recibidos: aceptar (match a 2.5 s) o rechazar (F-4, F-5). */
export function PingsScreen() {
  const { state, dispatch } = useDemo();
  const pings = state.incomingPings.flatMap((id) => {
    const profile = profileById(id);
    return profile === null ? [] : [profile];
  });

  if (pings.length === 0) {
    return <EmptyState message={fmt('ping.inboxEmpty')} icon="ping" />;
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {pings.map((profile) => (
        <View key={profile.id} style={styles.card}>
          <View style={styles.header}>
            <Avatar photoId={profile.photoId} size={44} />
            <View style={styles.info}>
              <Text numberOfLines={1} style={[text.bodyLarge, styles.name]}>
                {profile.nickname}
              </Text>
              <Text numberOfLines={1} style={[text.small, { color: colors.muted }]}>
                {`${fmt('notif.ping')} · ${formatDistance(profile.distanceM)}`}
              </Text>
            </View>
          </View>
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
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
});
