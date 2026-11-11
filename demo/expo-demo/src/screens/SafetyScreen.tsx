import { StyleSheet, Text, View } from 'react-native';

import { fmt } from '../generated/copy';
import { useDemo } from '../state/DemoProvider';
import { profileById } from '../state/selectors';
import { colors, fontFamily, space, text } from '../theme/theme';

import { ReportSheet } from '../components/ReportSheet';

/**
 * Seguridad: reporte simulado con motivos del dataset. No bloquea ni envía nada
 * a ningún servicio (F-10).
 */
export function SafetyScreen() {
  const { state, dispatch } = useDemo();
  const profile = profileById(state.profileId);
  if (profile === null) {
    return null;
  }

  return (
    <View style={styles.root}>
      <Text style={[text.title, { fontFamily: fontFamily.semibold }]}>{profile.nickname}</Text>
      <Text style={[text.small, { color: colors.muted }]}>{fmt(profile.statusKey)}</Text>
      <View style={styles.divider} />
      <ReportSheet
        onSubmit={(reason) => {
          dispatch({ type: 'REPORT_PROFILE', profileId: profile.id, reason });
          dispatch({ type: 'CLOSE_OVERLAY' });
        }}
      />
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
});
