import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { fmt } from '../generated/copy';
import { colors, fontSize, space, text } from '../theme/theme';

import { Icon } from './Icon';
import { IconButton } from './IconButton';

/** Hoja "Qué es simulado" (F-15): los 8 ítems numerados del catálogo. */
export function SimSheet({ onClose }: { onClose: () => void }) {
  return (
    <View style={styles.sheet} accessibilityViewIsModal accessibilityLabel={fmt('common.simTitle')}>
      <View style={styles.header}>
        <Text style={[text.title, styles.title]}>{fmt('common.simTitle')}</Text>
        <IconButton icon="close" label={fmt('common.close')} onPress={onClose} />
      </View>
      <ScrollView contentContainerStyle={styles.list}>
        {[1, 2, 3, 4, 5, 6, 7, 8].map((index) => (
          <View key={index} style={styles.item}>
            <Icon name="info" size={14} color={colors.muted} />
            <Text style={[text.body, styles.itemText]}>{fmt(`common.simItems.${index}`)}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    paddingHorizontal: space[3],
    paddingTop: space[2],
    paddingBottom: space[3],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space[1],
  },
  title: {
    flex: 1,
  },
  list: {
    gap: space[1],
    paddingTop: space[1],
  },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  itemText: {
    flex: 1,
    fontSize: fontSize[1],
  },
});
