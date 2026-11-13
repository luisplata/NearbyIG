import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { fmt } from '../generated/copy';
import { useLive } from '../live/LiveProvider';
import { isReportReason, REPORT_REASONS, type ReportReason } from '../live/types';
import { safetyErrorKey } from '../live/safety';
import { reasonText, safetyCopy, safetyText } from '../live/safetyCopy';
import { useDemo } from '../state/DemoProvider';
import { profileById } from '../state/selectors';
import { colors, fontFamily, space, text } from '../theme/theme';

import { ReportSheet } from '../components/ReportSheet';

/**
 * Seguridad: reporte de un perfil.
 *
 * **Live y dataset comparten la hoja, no el destino.** En live `POST /reports`
 * registra la señal en el backend y devuelve un acuse sin identidad del
 * reportado; el motivo sale del enum del contrato. En dataset sigue siendo el
 * guion (`REPORT_PROFILE`: un toast, nada sale del navegador).
 *
 * **Reportar no bloquea.** Son decisiones distintas: el acuse se muestra y el
 * perfil sigue visible. Para que desaparezca está "Bloquear".
 */
export function SafetyScreen() {
  const { state, dispatch } = useDemo();
  const live = useLive();
  const profile = profileById(state.profileId, state.catalog);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (profile === null) {
    return null;
  }

  const liveMode = state.source === 'live' && live.enabled && live.state.session !== null;
  const already = liveMode && live.reported.includes(profile.id);

  const submit = async (reason: string): Promise<void> => {
    if (!liveMode) {
      dispatch({ type: 'REPORT_PROFILE', profileId: profile.id, reason });
      dispatch({ type: 'CLOSE_OVERLAY' });
      return;
    }
    if (!isReportReason(reason)) {
      setError('VALIDATION_FAILED');
      return;
    }
    setBusy(true);
    setError(null);
    const result = await live.report(profile.id, reason as ReportReason);
    setBusy(false);
    if (!result.ok) {
      setError(result.code);
    }
  };

  return (
    <View style={styles.root}>
      <Text style={[text.title, { fontFamily: fontFamily.semibold }]}>{profile.nickname}</Text>
      <Text style={[text.small, { color: colors.muted }]}>{fmt(profile.statusKey)}</Text>
      <View style={styles.divider} />

      {liveMode ? (
        already ? (
          <View style={styles.acuse}>
            <Text style={[text.body, { color: colors.accent }]}>{safetyCopy.reportDone}</Text>
            <Text style={[text.small, { color: colors.muted }]}>{safetyCopy.reportNote}</Text>
          </View>
        ) : (
          <>
            <ReportSheet
              busy={busy}
              note={safetyCopy.reportNote}
              reasons={REPORT_REASONS.map((reason) => ({
                value: reason,
                label: reasonText(reason),
              }))}
              onSubmit={(reason) => void submit(reason)}
            />
            {error === null ? null : (
              <Text style={[text.small, styles.error]}>
                {safetyText(safetyErrorKey(error), { code: error })}
              </Text>
            )}
          </>
        )
      ) : (
        <ReportSheet
          onSubmit={(reason) => {
            dispatch({ type: 'REPORT_PROFILE', profileId: profile.id, reason });
            dispatch({ type: 'CLOSE_OVERLAY' });
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: space[2],
  },
  acuse: {
    gap: space[1],
  },
  error: {
    color: colors.danger,
  },
});
