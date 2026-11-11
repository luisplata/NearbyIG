import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { fmt } from '../generated/copy';
import { colors, radii, space, text } from '../theme/theme';

const PARAGRAPHS = [
  { key: 'privacy.noHistory', highlighted: true },
  { key: 'privacy.noLocation', highlighted: false },
  { key: 'privacy.dataNote', highlighted: false },
  { key: 'privacy.demoNote', highlighted: false },
] as const;

/**
 * Privacidad: copy explícito de "sin historial de rutas", sin ubicación real y
 * sin persistencia (F-11).
 */
export function PrivacyScreen() {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      {PARAGRAPHS.map((paragraph) => (
        <View
          key={paragraph.key}
          style={[styles.card, paragraph.highlighted && styles.highlighted]}
        >
          <Text style={text.body}>{fmt(paragraph.key)}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: space[2],
    paddingBottom: space[3],
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii[1],
    borderWidth: 1,
    borderColor: colors.border,
    padding: space[2],
  },
  highlighted: {
    borderColor: colors.accent,
  },
});
