import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { fmt } from '../generated/copy';
import { fixtures } from '../generated/fixtures';
import { toSelfView } from '../live/adapter';
import { useLive } from '../live/LiveProvider';
import { liveText } from '../live/liveCopy';
import { prefsCopy, prefsText } from '../live/prefsCopy';
import { safetyCopy, safetyText } from '../live/safetyCopy';
import { useGhost } from '../live/useGhost';
import { useDemo } from '../state/DemoProvider';
import { usePreferences } from '../state/PreferencesProvider';
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
 * fantasma/pausa, entradas a privacidad/bloqueados/acerca de, preferencias
 * persistentes y reset (F-1, F-7, F-8, F-12).
 *
 * **El perfil es el de la sesión, no el del dataset.** Con API, el encabezado
 * muestra `GET /me` (o la fila del catálogo con el mismo `profileId` si esa
 * operation todavía no existe) y una nota aclara el fallback. Sin API se ve el
 * `self` del build, que es lo que la demo siempre mostró.
 *
 * **Preferencias.** Radio, filtros y bots se guardan solos (los persiste
 * `PreferencesProvider`); "Restablecer preferencias" los vuelve a fábrica sin
 * tocar la zona ni la sesión. "Reiniciar demo" sigue siendo el reset completo
 * del guion.
 */
export function SettingsScreen() {
  const { state, dispatch } = useDemo();
  const live = useLive();
  const prefs = usePreferences();
  const ghost = useGhost();
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const liveMode = state.source === 'live' && live.enabled && live.state.session !== null;
  const selfView = state.source === 'live' ? toSelfView(live.state.self) : null;
  const self = fixtures.self;
  const nickname = selfView?.nickname ?? self.nickname;
  const photoId = selfView?.photoId ?? self.photoId;
  const statusKey = selfView !== null && selfView.statusKey !== '' ? selfView.statusKey : self.statusKey;
  const handle =
    selfView !== null && selfView.instagramHandle !== ''
      ? selfView.instagramHandle
      : self.instagramHandle;
  const intention = selfView?.intention ?? state.selfIntention;

  /**
   * Reset **propio**: cierra esta sesión y borra lo privado propio en el
   * backend. No es el reset global (`/demo/reset`, que borra toda la demo) y no
   * toca el catálogo. Al volver, el controlador deja el sheet de zona abierto.
   */
  const resetSelf = async (): Promise<void> => {
    setResetBusy(true);
    setResetError(null);
    const result = await live.resetSelf();
    setResetBusy(false);
    if (!result.ok) {
      setResetError(result.code);
      return;
    }
    setConfirmReset(false);
    // La sesión ya no existe: el fantasma local y el overlay tampoco.
    if (state.ghost) {
      dispatch({ type: 'TOGGLE_GHOST' });
    }
    dispatch({ type: 'CLOSE_OVERLAY' });
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.profileRow}>
        <Avatar photoId={photoId} size={64} renderState="clear" />
        <View style={styles.profileText}>
          <Text style={text.title}>{nickname}</Text>
          <Text style={[text.small, { color: colors.muted }]}>{fmt(statusKey)}</Text>
          <View style={styles.selfChip}>
            <Chip label={fmt(`intention.${intention}`)} icon="offer" />
            {selfView === null ? null : <Chip label={prefsCopy.selfLive} />}
          </View>
        </View>
      </View>

      {state.source === 'live' && live.state.selfSource !== 'me' ? (
        <Text style={[text.small, styles.fallbackNote]}>
          {live.state.selfSource === 'catalog' ? prefsCopy.selfFallback : prefsCopy.selfGuest}
        </Text>
      ) : null}

      <Text style={[text.small, styles.sectionLabel]}>{fmt('profile.intentions')}</Text>
      <IntentionChips
        selected={[state.selfIntention]}
        onTap={(next) => dispatch({ type: 'SET_SELF_INTENTION', intention: next })}
      />

      <View style={styles.divider} />

      <Text style={[text.bodyLarge, { fontFamily: fontFamily.semibold }]}>
        {fmt('settings.instagram')}
      </Text>
      <View style={styles.handleRow}>
        <Icon name="person" size={16} color={colors.muted} />
        <Text style={[text.body, { fontSize: fontSize[1] }]}>{handle}</Text>
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
        value={ghost.checked}
        disabled={ghost.disabled}
        subtitle={
          ghost.checked
            ? ghost.banner === 'live'
              ? safetyText('ghostLiveOn')
              : fmt('settings.ghostOn')
            : undefined
        }
        onChange={ghost.toggle}
      />
      {ghost.error === null ? null : (
        <Text style={[text.small, styles.error]}>
          {safetyText('ghostError', { code: ghost.error })}
        </Text>
      )}

      {prefs.botCount === 0 ? null : (
        <ToggleRow
          label={prefsCopy.botsLabel}
          value={prefs.includeBots}
          subtitle={prefsText('botsCount', { count: String(prefs.botCount) })}
          onChange={prefs.setIncludeBots}
        />
      )}

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
        <Button label={prefsCopy.reset} variant="outline" fullWidth onPress={prefs.reset} />
        <Text style={[text.small, styles.resetHint]}>{prefsCopy.resetHint}</Text>
      </View>

      {liveMode ? (
        <View style={styles.reset}>
          {confirmReset ? (
            <>
              <Text style={[text.small, styles.resetHint]}>{safetyCopy.resetSelfConfirm}</Text>
              <View style={styles.confirmRow}>
                <View style={styles.action}>
                  <Button
                    label={fmt('common.confirm')}
                    variant="danger"
                    fullWidth
                    disabled={resetBusy}
                    onPress={() => void resetSelf()}
                  />
                </View>
                <View style={styles.action}>
                  <Button
                    label={liveText('cancel')}
                    variant="outline"
                    fullWidth
                    disabled={resetBusy}
                    onPress={() => {
                      setConfirmReset(false);
                      setResetError(null);
                    }}
                  />
                </View>
              </View>
            </>
          ) : (
            <Button
              label={safetyCopy.resetSelf}
              variant="outline"
              fullWidth
              onPress={() => setConfirmReset(true)}
            />
          )}
          <Text style={[text.small, styles.resetHint]}>{safetyCopy.resetSelfHint}</Text>
          {resetError === null ? null : (
            <Text style={[text.small, styles.error]}>
              {safetyText('resetSelfError', { code: resetError })}
            </Text>
          )}
        </View>
      ) : null}

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
  fallbackNote: {
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
  error: {
    color: colors.danger,
  },
  confirmRow: {
    flexDirection: 'row',
    gap: space[1],
  },
  action: {
    flex: 1,
  },
});
