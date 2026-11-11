import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';

import { fmt } from '../generated/copy';
import { datasetId, demoVersion, schemaVersion } from '../generated/dataset';
import { colors, fontFamily, fontSize, space, text } from '../theme/theme';

import { Button } from '../components/Button';

/**
 * Acerca de: marca, datasetId + schemaVersion (SC-8) y acceso a la hoja de
 * simulación (F-15).
 */
export function AboutScreen({ onOpenSim }: { onOpenSim: () => void }) {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.brandRow}>
        <Image
          source={require('../../assets/brand/icon-192.png')}
          style={styles.icon}
          accessibilityLabel={fmt('about.brand')}
        />
        <Text style={[text.title, styles.brand]}>{fmt('about.brand')}</Text>
      </View>

      <Text style={styles.club}>{fmt('about.club')}</Text>
      <Text style={[text.body, { color: colors.muted }]}>{fmt('about.positioning')}</Text>

      <Text style={[text.body, { color: colors.muted }]}>{fmt('about.disclaimer')}</Text>

      <View style={styles.divider} />

      <DataRow label={fmt('about.dataset')} value={datasetId} />
      <DataRow label={fmt('common.schemaVersion')} value={`${schemaVersion}`} />
      <DataRow label={fmt('about.version')} value={demoVersion} />

      <View style={styles.action}>
        <Button label={fmt('common.simTitle')} variant="outline" fullWidth onPress={onOpenSim} />
      </View>
    </ScrollView>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.dataRow}>
      <Text style={[text.body, styles.dataLabel, { color: colors.muted }]}>{label}</Text>
      <Text style={[text.body, styles.dataValue]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: space[2],
    paddingBottom: space[3],
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
  },
  icon: {
    width: 44,
    height: 44,
  },
  brand: {
    flex: 1,
  },
  club: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize[1],
    letterSpacing: 0.6,
    color: colors.accentWarm,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
  dataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  dataLabel: {
    flex: 1,
  },
  dataValue: {
    fontFamily: fontFamily.semibold,
  },
  action: {
    marginTop: space[1],
  },
});
