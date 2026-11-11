import { StyleSheet, Text, View } from 'react-native';

import { fmt } from '../generated/copy';
import { colors, fontSize } from '../theme/theme';

import { Button } from './Button';
import { Icon } from './Icon';

/**
 * Revelación de foto: sólo mutua. Mientras el par no revela se muestra el
 * estado de espera y la foto del otro sigue blurred (F-9).
 */
export function RevealButton({
  revealedByMe,
  revealedByPeer,
  peerName,
  onReveal,
}: {
  revealedByMe: boolean;
  revealedByPeer: boolean;
  peerName: string;
  onReveal: () => void;
}) {
  if (revealedByMe && revealedByPeer) {
    return (
      <View style={styles.row}>
        <Icon name="checkCircle" size={16} color={colors.accent} />
        <Text style={styles.text}>{fmt('chat.revealed')}</Text>
      </View>
    );
  }

  if (revealedByMe) {
    return (
      <Text style={styles.pending}>{fmt('chat.revealPending', { name: peerName })}</Text>
    );
  }

  return (
    <View style={styles.revealButton}>
      <Button
        label={fmt('chat.reveal')}
        icon="eye"
        variant="outline"
        onPress={onReveal}
        accessibilityLabel={fmt('chat.reveal')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  text: {
    fontSize: fontSize[1],
    color: colors.text,
  },
  pending: {
    fontSize: fontSize[1],
    color: colors.muted,
  },
  revealButton: {
    alignSelf: 'flex-start',
  },
});
