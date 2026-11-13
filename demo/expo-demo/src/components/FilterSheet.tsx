import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { fmt } from '../generated/copy';
import { fixtures } from '../generated/fixtures';
import { prefsCopy, prefsText } from '../live/prefsCopy';
import { useDemo } from '../state/DemoProvider';
import { usePreferences } from '../state/PreferencesProvider';
import { colors, space, text } from '../theme/theme';

import { Button } from './Button';
import { Chip } from './Chip';
import { IntentionChips } from './IntentionChips';
import { RadiusControl } from './RadiusControl';
import { ToggleRow } from './ToggleRow';

/**
 * Hoja de filtros: radio + intención + género + verificados + en línea + bots.
 * Todo cambio se refleja de inmediato en radar, mapa y lista (F-3).
 *
 * El toggle de bots es del cliente: recorta el catálogo en `visibleProfiles`
 * (`sourceType === 'bot'`), sin cambiar lo que devuelve el server. Sólo aparece
 * cuando el catálogo activo tiene bots — en el dataset del build no hay, y un
 * switch que no hace nada es ruido.
 */
export function FilterSheet() {
  const { state, dispatch } = useDemo();
  const prefs = usePreferences();
  const selectedIntentions = state.filters.intentions ?? [];

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <RadiusControl
        radiusM={state.filters.radiusM}
        onChanged={(radiusM) => dispatch({ type: 'SET_RADIUS', radiusM })}
      />

      <Text style={[text.small, styles.section]}>{fmt('filters.intention')}</Text>
      <IntentionChips
        selected={selectedIntentions}
        onTap={(intention) => dispatch({ type: 'TOGGLE_FILTER_INTENTION', intention })}
      />

      <Text style={[text.small, styles.section]}>{fmt('filters.gender')}</Text>
      <View style={styles.genderRow}>
        <Chip
          label={fmt('filters.genderAll')}
          selected={state.filters.gender === null}
          onPress={() => dispatch({ type: 'SET_GENDER_FILTER', gender: null })}
        />
        {fixtures.filters.genders.map((gender) => (
          <Chip
            key={gender}
            label={fmt(`gender.${gender}`)}
            selected={state.filters.gender === gender}
            onPress={() => dispatch({ type: 'SET_GENDER_FILTER', gender })}
          />
        ))}
      </View>

      <ToggleRow
        label={fmt('filters.verifiedOnly')}
        value={state.filters.verifiedOnly}
        onChange={() => dispatch({ type: 'TOGGLE_VERIFIED_ONLY' })}
      />
      <ToggleRow
        label={fmt('filters.onlineOnly')}
        value={state.filters.onlineOnly}
        onChange={() => dispatch({ type: 'TOGGLE_ONLINE_ONLY' })}
      />

      {prefs.botCount === 0 ? null : (
        <ToggleRow
          label={prefsCopy.botsLabel}
          value={prefs.includeBots}
          subtitle={prefsText('botsCount', { count: String(prefs.botCount) })}
          onChange={prefs.setIncludeBots}
        />
      )}

      <View style={styles.clear}>
        <Button
          label={fmt('filters.clear')}
          variant="outline"
          fullWidth
          onPress={() => dispatch({ type: 'CLEAR_FILTERS' })}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: space[3],
  },
  section: {
    marginTop: space[3],
    marginBottom: 6,
    color: colors.muted,
  },
  genderRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[1],
    marginLeft: -2,
  },
  clear: {
    marginTop: space[2],
  },
});
