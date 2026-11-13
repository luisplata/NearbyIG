import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { fmt } from '../generated/copy';
import { useDemo } from '../state/DemoProvider';
import { formatDistance } from '../state/format';
import { profileById } from '../state/selectors';
import { colors, fontFamily, fontSize, space, text } from '../theme/theme';

import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';

/**
 * Lista de perfiles bloqueados con opción de desbloquear. Desbloquear no
 * restaura pings, match ni chat (F-10).
 */
export function BlockedScreen() {
  const { state, dispatch } = useDemo();
  const profiles = state.blocked.flatMap((id) => {
    const profile = profileById(id, state.catalog);
    return profile === null ? [] : [profile];
  });

  if (profiles.length === 0) {
    return <EmptyState message={fmt('safety.blockedEmpty')} icon="block" />;
  }

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.list}>
        {profiles.map((profile) => (
          <View key={profile.id} style={styles.row}>
            <Avatar photoId={profile.photoId} size={40} />
            <View style={styles.info}>
              <Text numberOfLines={1} style={[text.body, styles.name]}>
                {profile.nickname}
              </Text>
              <Text style={[text.small, { color: colors.muted }]}>
                {formatDistance(profile.distanceM)}
              </Text>
            </View>
            <Button
              label={fmt('safety.unblock')}
              variant="ghost"
              onPress={() => dispatch({ type: 'UNBLOCK_PROFILE', profileId: profile.id })}
            />
          </View>
        ))}
      </ScrollView>
      <Text style={[text.small, styles.hint]}>{fmt('safety.blockedHint')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    gap: space[1],
  },
  list: {
    gap: space[1],
    paddingBottom: space[2],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    paddingVertical: space[1],
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  info: {
    flex: 1,
  },
  name: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize[1],
  },
  hint: {
    color: colors.muted,
  },
});
