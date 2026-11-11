import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { fmt } from '../generated/copy';
import { colors, radii, scrim, sheetBoxShadow, space, text } from '../theme/theme';

import { IconButton } from './IconButton';

/**
 * Overlay del contrato: backdrop + hoja inferior con header (volver/cerrar).
 * Nunca `Navigator`: es una capa absoluta del shell (design A4 / E-3).
 */
export function Overlay({
  title,
  full = false,
  onBack,
  children,
}: {
  title: string;
  full?: boolean;
  onBack: () => void;
  children: ReactNode;
}) {
  return (
    <View
      style={StyleSheet.absoluteFill}
      accessibilityViewIsModal
      importantForAccessibility="yes"
      accessibilityLabel={title}
    >
      <Pressable
        style={[StyleSheet.absoluteFill, { backgroundColor: scrim }]}
        onPress={onBack}
        accessible={false}
        importantForAccessibility="no"
      />
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: full ? '96%' : '84%',
        }}
      >
        <View style={styles.sheet}>
          <View style={styles.header}>
            <IconButton icon="back" label={fmt('common.back')} onPress={onBack} />
            <Text numberOfLines={1} style={[text.title, styles.title]}>
              {title}
            </Text>
            <IconButton icon="close" label={fmt('common.close')} onPress={onBack} />
          </View>
          <View style={styles.body}>{children}</View>
        </View>
      </View>
    </View>
  );
}

/** Capa de la hoja "Qué es simulado", fuera del estado del reducer. */
export function SheetLayer({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <View style={StyleSheet.absoluteFill} accessibilityViewIsModal>
      <Pressable
        style={[StyleSheet.absoluteFill, { backgroundColor: scrim }]}
        onPress={onClose}
        accessible={false}
        importantForAccessibility="no"
      />
      <View style={styles.simAnchor}>
        <View style={styles.simSheet}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii[2],
    borderTopRightRadius: radii[2],
    boxShadow: sheetBoxShadow,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[1],
    paddingHorizontal: space[2],
    paddingTop: space[1],
  },
  title: {
    flex: 1,
  },
  body: {
    flex: 1,
    paddingHorizontal: space[3],
    paddingBottom: space[2],
    paddingTop: space[1],
  },
  simAnchor: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: 520,
  },
  simSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii[2],
    borderTopRightRadius: radii[2],
    boxShadow: sheetBoxShadow,
  },
});
