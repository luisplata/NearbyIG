import { StyleSheet, View } from 'react-native';

import { fmt } from '../generated/copy';
import { fixtures } from '../generated/fixtures';
import type { Intention } from '../generated/fixtures';
import { space } from '../theme/theme';

import { Chip } from './Chip';

export type IntentionChipsProps = {
  selected: readonly Intention[];
  onTap: (intention: Intention) => void;
};

/**
 * Selector de intenciones (las 4 del dataset): selección simple en el perfil
 * propio, múltiple en el filtro de descubrimiento.
 */
export function IntentionChips({ selected, onTap }: IntentionChipsProps) {
  return (
    <View style={styles.wrap}>
      {fixtures.filters.intentions.map((intention) => (
        <Chip
          key={intention}
          label={fmt(`intention.${intention}`)}
          selected={selected.includes(intention)}
          onPress={() => onTap(intention)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[1],
    marginLeft: -2,
  },
});
