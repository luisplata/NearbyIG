import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { fmt } from '../generated/copy';
import { fixtures } from '../generated/fixtures';
import { colors, fontFamily, fontSize, space, text } from '../theme/theme';

import { Button } from './Button';
import { PressableRow } from './PressableRow';

/**
 * Hoja de reporte simulado (F-10). Los motivos salen del dataset; enviar sólo
 * produce un toast, no bloquea ni toca el dataset.
 */
export function ReportSheet({
  onSubmit,
  initialReason,
}: {
  onSubmit: (reason: string) => void;
  initialReason?: string;
}) {
  const [reason, setReason] = useState<string | null>(initialReason ?? null);

  return (
    <View style={styles.wrap}>
      <Text style={[text.body, styles.label]}>{fmt('safety.reasons.title')}</Text>
      <ScrollView contentContainerStyle={styles.reasons}>
        {fixtures.reportReasons.map((value) => (
          <PressableRow
            key={value}
            accessibilityLabel={fmt(`safety.reasons.${value}`)}
            accessibilityState={{ selected: reason === value }}
            onPress={() => setReason(value)}
            style={styles.reason}
          >
            <View style={[styles.radio, reason === value && styles.radioSelected]}>
              {reason === value ? <View style={styles.radioDot} /> : null}
            </View>
            <Text style={[text.body, styles.reasonText]}>{fmt(`safety.reasons.${value}`)}</Text>
          </PressableRow>
        ))}
      </ScrollView>
      <Text style={[text.small, styles.note]}>{fmt('safety.reportNote')}</Text>
      <Button
        label={fmt('common.confirm')}
        fullWidth
        disabled={reason === null}
        onPress={() => {
          if (reason !== null) {
            onSubmit(reason);
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    gap: space[1],
  },
  label: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize[0],
    color: colors.muted,
    marginBottom: 4,
  },
  reasons: {
    gap: 2,
    paddingBottom: space[1],
  },
  reason: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[1],
    minHeight: 44,
    borderRadius: 8,
  },
  reasonText: {
    flex: 1,
    fontSize: fontSize[1],
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: colors.accent,
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  note: {
    color: colors.muted,
    fontSize: fontSize[0],
  },
});
