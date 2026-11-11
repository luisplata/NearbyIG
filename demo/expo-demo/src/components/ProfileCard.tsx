import { StyleSheet, Text, View } from 'react-native';

import { fmt } from '../generated/copy';
import type { Profile } from '../generated/fixtures';
import { formatDistance } from '../state/format';
import type { AvatarRenderState } from '../state/types';
import { colors, fontFamily, fontSize, radii, space } from '../theme/theme';

import { Avatar } from './Avatar';
import { OnlineDot, VerifiedBadge } from './Badges';
import { Icon } from './Icon';
import { PressableRow } from './PressableRow';

/**
 * Tarjeta de perfil de la lista. El label accesible expone nombre y distancia
 * (F-13) y el resto del contenido queda fuera del árbol semántico.
 */
export function ProfileCard({
  profile,
  renderState,
  onTap,
}: {
  profile: Profile;
  renderState: AvatarRenderState;
  onTap: () => void;
}) {
  const label = [
    fmt('a11y.profileDot', {
      name: profile.nickname,
      distance: formatDistance(profile.distanceM),
    }),
    ...(profile.verified ? [fmt('a11y.verified')] : []),
    ...(profile.online ? [fmt('a11y.online')] : []),
  ].join('. ');

  return (
    <PressableRow accessibilityLabel={label} onPress={onTap} style={styles.card}>
      <View
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.content}
      >
        <Avatar photoId={profile.photoId} size={52} renderState={renderState} />
        <View style={styles.body}>
          <View style={styles.nameRow}>
            <Text numberOfLines={1} style={styles.name}>
              {profile.nickname}
            </Text>
            {profile.verified ? <VerifiedBadge /> : null}
            {profile.online ? <View style={styles.dotGap}><OnlineDot /></View> : null}
          </View>
          <Text numberOfLines={1} style={styles.status}>
            {fmt(profile.statusKey)}
          </Text>
          <View style={styles.metaRow}>
            <Text style={styles.meta}>{fmt(`intention.${profile.intention}`)}</Text>
            <Text style={styles.distance}>{formatDistance(profile.distanceM)}</Text>
          </View>
        </View>
        <Icon name="chevronRight" size={20} color={colors.muted} />
      </View>
    </PressableRow>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii[1],
    padding: space[2],
    minHeight: 76,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
  },
  body: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dotGap: {
    marginLeft: 2,
  },
  name: {
    flexShrink: 1,
    fontFamily: fontFamily.semibold,
    fontSize: fontSize[2],
    color: colors.text,
  },
  status: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize[0],
    color: colors.muted,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[1],
    marginTop: 2,
  },
  meta: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize[0],
    color: colors.muted,
  },
  distance: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize[0],
    color: colors.text,
  },
});
