import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { fmt } from '../generated/copy';
import { fixtures } from '../generated/fixtures';
import { useDemo } from '../state/DemoProvider';
import { colors, fontFamily, fontSize, radii, space, text } from '../theme/theme';

import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { Chip } from '../components/Chip';
import { Icon, type IconName } from '../components/Icon';
import { IntentionChips } from '../components/IntentionChips';
import { PressableRow } from '../components/PressableRow';
import { ToggleRow } from '../components/ToggleRow';

/**
 * Ajustes del perfil propio: intención, Instagram simulado (3 estados),
 * fantasma/pausa, entradas a privacidad/bloqueados/acerca de y reset (F-1, F-7,
 * F-8, F-12).
 */
export function SettingsScreen() {
  const { state, dispatch } = useDemo();
  const self = fixtures.self;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.profileRow}>
        <Avatar photoId={self.photoId} size={64} renderState="clear" />
        <View style={styles.profileText}>
          <Text style={text.title}>{self.nickname}</Text>
          <Text style={[text.small, { color: colors.muted }]}>{fmt(self.statusKey)}</Text>
          <View style={styles.selfChip}>
            <Chip label={fmt(`intention.${state.selfIntention}`)} icon="offer" />
          </View>
        </View>
      </View>

      <Text style={[text.small, styles.sectionLabel]}>{fmt('profile.intentions')}</Text>
      <IntentionChips
        selected={[state.selfIntention]}
        onTap={(intention) => dispatch({ type: 'SET_SELF_INTENTION', intention })}
      />

      <View style={styles.divider} />

      <Text style={[text.bodyLarge, { fontFamily: fontFamily.semibold }]}>
        {fmt('settings.instagram')}
      </Text>
      <View style={styles.handleRow}>
        <Icon name="person" size={16} color={colors.muted} />
        <Text style={[text.body, { fontSize: fontSize[1] }]}>{self.instagramHandle}</Text>
      </View>
      <Text style={[text.small, styles.sectionLabel]}>{fmt('settings.verification')}</Text>
      <View style={styles.verificationRow}>
        <Chip
          label={fmt(`ig.state.${state.verification}`)}
          icon={state.verification === 'verified' ? 'verified' : 'help'}
        />
        <Button
          label={fmt('ig.cycleHint')}
          variant="outline"
          onPress={() => dispatch({ type: 'SET_VERIFICATION' })}
        />
      </View>
      <Text style={[text.small, styles.disclaimer]}>{fmt('ig.simDisclaimer')}</Text>

      <View style={styles.divider} />

      <ToggleRow
        label={fmt('settings.ghost')}
        value={state.ghost}
        subtitle={state.ghost ? fmt('settings.ghostOn') : undefined}
        onChange={() => dispatch({ type: 'TOGGLE_GHOST' })}
      />

      <EntryRow
        icon="lock"
        label={fmt('settings.privacy')}
        onPress={() => dispatch({ type: 'OPEN_OVERLAY', overlay: 'privacy' })}
      />
      <EntryRow
        icon="block"
        label={fmt('settings.blocked')}
        onPress={() => dispatch({ type: 'OPEN_OVERLAY', overlay: 'blocked' })}
      />
      <EntryRow
        icon="info"
        label={fmt('settings.about')}
        onPress={() => dispatch({ type: 'OPEN_OVERLAY', overlay: 'about' })}
      />

      <View style={styles.reset}>
        <Button
          label={fmt('settings.reset')}
          fullWidth
          onPress={() => dispatch({ type: 'RESET' })}
        />
        <Text style={[text.small, styles.resetHint]}>{fmt('settings.resetHint')}</Text>
      </View>
    </ScrollView>
  );
}

function EntryRow({
  icon,
  label,
  onPress,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
}) {
  return (
    <PressableRow accessibilityLabel={label} onPress={onPress} style={styles.entry}>
      <Icon name={icon} size={18} color={colors.muted} />
      <Text style={[text.body, styles.entryLabel]}>{label}</Text>
      <Icon name="chevronRight" size={18} color={colors.muted} />
    </PressableRow>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: space[3],
    gap: space[1],
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
  },
  profileText: {
    flex: 1,
    gap: 2,
  },
  selfChip: {
    marginTop: 4,
  },
  sectionLabel: {
    color: colors.muted,
    fontSize: fontSize[0],
    marginTop: space[1],
    marginBottom: 4,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: space[2],
  },
  handleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  verificationRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space[1],
  },
  disclaimer: {
    color: colors.accent,
    marginTop: space[1],
  },
  entry: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[1],
    borderRadius: radii[0],
    paddingVertical: space[1],
  },
  entryLabel: {
    flex: 1,
    fontSize: fontSize[1],
  },
  reset: {
    marginTop: space[2],
    gap: 6,
  },
  resetHint: {
    color: colors.muted,
  },
});
