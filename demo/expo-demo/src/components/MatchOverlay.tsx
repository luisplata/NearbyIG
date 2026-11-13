import { StyleSheet, Text, View } from 'react-native';

import { fmt } from '../generated/copy';
import type { UiProfile } from '../state/types';
import { colors, fontSize, space, text } from '../theme/theme';

import { Avatar } from './Avatar';
import { Button } from './Button';

/**
 * Celebración de match (2.5 s después de aceptar el ping). Es una capa sobre el
 * overlay actual, no una ruta: se cierra con "Seguir explorando".
 */
export function MatchOverlay({
  profile,
  onOpenChat,
  onDismiss,
}: {
  profile: UiProfile;
  onOpenChat: () => void;
  onDismiss: () => void;
}) {
  return (
    <View style={styles.layer} accessibilityViewIsModal accessibilityLabel={fmt('match.title')}>
      <View style={styles.card}>
        <Avatar photoId={profile.photoId} size={96} semanticLabel={profile.nickname} />
        <Text style={[text.display, styles.center]}>{fmt('match.title')}</Text>
        <Text style={[text.body, styles.center, { color: colors.muted }]}>
          {fmt('match.subtitle', { name: profile.nickname })}
        </Text>
        <View style={styles.actions}>
          <Button label={fmt('match.openChat')} onPress={onOpenChat} fullWidth />
          <Button label={fmt('match.keepBrowsing')} onPress={onDismiss} variant="outline" fullWidth />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(9,9,11,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: space[4],
  },
  card: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    gap: space[1],
  },
  center: {
    textAlign: 'center',
    fontSize: fontSize[1],
  },
  actions: {
    width: '100%',
    gap: space[1],
    marginTop: space[2],
  },
});
