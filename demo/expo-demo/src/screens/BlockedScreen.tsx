import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { fmt } from '../generated/copy';
import { useLive } from '../live/LiveProvider';
import { safetyErrorKey, type BlockRow } from '../live/safety';
import { safetyCopy, safetyText } from '../live/safetyCopy';
import { useDemo } from '../state/DemoProvider';
import { formatDistance } from '../state/format';
import { profileById } from '../state/selectors';
import { colors, fontFamily, fontSize, space, text } from '../theme/theme';

import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';

/**
 * Lista de bloqueados con opción de desbloquear.
 *
 * **Dos fuentes.** Con sesión live la lista es `GET /blocks` (el bloqueo más
 * reciente arriba, con el peer ya proyectado por el server): no se puede cruzar
 * contra discovery porque el bloqueado justamente ya no está ahí. Sin sesión se
 * mantiene el guion del dataset, que cruza `state.blocked` con el catálogo.
 *
 * **Desbloquear no restaura nada.** Ni pings, ni match, ni chat: el bloqueo sólo
 * dejó de aplicar. En live el server vuelve a listar al par en discovery, que es
 * lo que la próxima foto muestra.
 */
export function BlockedScreen() {
  const { state, dispatch, store } = useDemo();
  const live = useLive();
  const liveMode = state.source === 'live' && live.enabled && live.state.session !== null;
  const [busy, setBusy] = useState<string | null>(null);

  const unblockLive = async (row: BlockRow): Promise<void> => {
    setBusy(row.profileId);
    const result = await live.unblock(row.profileId);
    setBusy(null);
    if (result.ok) {
      store.pushToast('safety.unblocked');
    }
  };

  if (liveMode) {
    return (
      <View style={styles.root}>
        {live.blocks.length === 0 ? (
          <EmptyState message={safetyCopy.blockListEmpty} icon="block" />
        ) : (
          <ScrollView contentContainerStyle={styles.list}>
            {live.blocks.map((row) => (
              <View key={row.profileId} style={styles.row}>
                <Avatar photoId={row.peer.photoId} size={40} />
                <View style={styles.info}>
                  <Text numberOfLines={1} style={[text.body, styles.name]}>
                    {row.peer.nickname}
                  </Text>
                  <Text style={[text.small, { color: colors.muted }]}>
                    {fmt(`intention.${row.peer.intention}`)}
                  </Text>
                </View>
                <Button
                  label={fmt('safety.unblock')}
                  variant="ghost"
                  disabled={busy === row.profileId}
                  onPress={() => void unblockLive(row)}
                />
              </View>
            ))}
          </ScrollView>
        )}
        {live.blockError === null ? null : (
          <Text style={[text.small, styles.error]}>
            {safetyText(safetyErrorKey(live.blockError), { code: live.blockError })}
          </Text>
        )}
        <Text style={[text.small, styles.hint]}>{safetyCopy.blockListLiveHint}</Text>
      </View>
    );
  }

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
  error: {
    color: colors.danger,
  },
});
