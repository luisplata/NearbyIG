import { StyleSheet, Text, View } from 'react-native';

import { fmt } from '../generated/copy';
import { fixtures } from '../generated/fixtures';
import { formatRadius } from '../state/format';
import { colors, fontSize, space, text } from '../theme/theme';

import { Chip } from './Chip';

/** Selector de radio: siempre uno de los valores del contrato (500 m–5 km). */
export function RadiusControl({
  radiusM,
  onChanged,
  showLabel = true,
}: {
  radiusM: number;
  onChanged: (value: number) => void;
  showLabel?: boolean;
}) {
  return (
    <View>
      {showLabel ? <Text style={[text.small, styles.label]}>{fmt('discovery.radiusLabel')}</Text> : null}
      <View style={styles.row}>
        {fixtures.filters.radiiM.map((value) => (
          <Chip
            key={value}
            label={formatRadius(value)}
            selected={value === radiusM}
            onPress={() => onChanged(value)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    marginBottom: 6,
    color: colors.muted,
    fontSize: fontSize[0],
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[1],
    marginLeft: -2,
  },
});
