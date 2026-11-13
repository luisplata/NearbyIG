import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { fmt } from '../generated/copy';
import { fixtures } from '../generated/fixtures';
import { colors, fontFamily, fontSize, space, text } from '../theme/theme';

import { Button } from './Button';
import { PressableRow } from './PressableRow';

/**
 * Hoja de reporte. Los motivos entran por prop: el dataset usa su vocabulario
 * simulado (`fixtures.reportReasons`) y el modo live, el enum del contrato
 * (`spam | harassment | inappropriate | impersonation | other`). Enviar sólo
 * llama al `onSubmit`: la hoja no sabe si el reporte viaja a un server o a un
 * toast, y por eso los dos modos la comparten sin duplicar la lista.
 */
export function ReportSheet({
  onSubmit,
  initialReason,
  reasons,
  note,
  busy = false,
}: {
  onSubmit: (reason: string) => void;
  initialReason?: string;
  /** Opciones explícitas; sin esto se usa el vocabulario del dataset. */
  reasons?: readonly { value: string; label: string }[];
  /** Nota al pie; sin esto se usa la del dataset ("simulado"). */
  note?: string;
  busy?: boolean;
}) {
  const [reason, setReason] = useState<string | null>(initialReason ?? null);
  const options =
    reasons ??
    fixtures.reportReasons.map((value) => ({ value, label: fmt(`safety.reasons.${value}`) }));

  return (
    <View style={styles.wrap}>
      <Text style={[text.body, styles.label]}>{fmt('safety.reasons.title')}</Text>
      <ScrollView contentContainerStyle={styles.reasons}>
        {options.map((option) => (
          <PressableRow
            key={option.value}
            accessibilityLabel={option.label}
            accessibilityState={{ selected: reason === option.value }}
            onPress={() => setReason(option.value)}
            style={styles.reason}
          >
            <View style={[styles.radio, reason === option.value && styles.radioSelected]}>
              {reason === option.value ? <View style={styles.radioDot} /> : null}
            </View>
            <Text style={[text.body, styles.reasonText]}>{option.label}</Text>
          </PressableRow>
        ))}
      </ScrollView>
      <Text style={[text.small, styles.note]}>{note ?? fmt('safety.reportNote')}</Text>
      <Button
        label={fmt('common.confirm')}
        fullWidth
        disabled={busy || reason === null}
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
