import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { fmt } from '../generated/copy';
import { useDemo } from '../state/DemoProvider';
import { formatRadius } from '../state/format';
import { visibleProfiles } from '../state/selectors';
import type { UiProfile } from '../state/types';
import { colors, fontSize, space, text } from '../theme/theme';

import { BottomNav } from '../components/BottomNav';
import { EmptyState } from '../components/EmptyState';
import { IconButton } from '../components/IconButton';
import { ProfileList } from '../components/ProfileList';
import { RadarCaption, RadarMapView } from '../components/RadarMapView';
import { RadiusControl } from '../components/RadiusControl';
import type { NavItem } from '../navigation/navItems';

import { bodyFor } from './discoveryBody';

/**
 * Pantalla base: descubrimiento en lista o en la composición radar-sobre-mapa,
 * con radio y filtros compartidos (F-2, F-3). La vista reservada `map` renderiza
 * la misma composición que `radar`.
 */
export function DiscoveryScreen() {
  const { state, dispatch } = useDemo();
  const profiles = useMemo(() => visibleProfiles(state), [state]);
  const filtered =
    state.filters.intentions !== null ||
    state.filters.gender !== null ||
    state.filters.verifiedOnly ||
    state.filters.onlineOnly;

  const onOpen = (profile: UiProfile): void => {
    dispatch({ type: 'OPEN_OVERLAY', overlay: 'profile', profileId: profile.id });
  };

  const onNav = (item: NavItem): void => {
    if (item.kind === 'overlay') {
      dispatch({ type: 'OPEN_OVERLAY', overlay: item.overlay });
      return;
    }
    dispatch({ type: 'SET_VIEW', view: item.view });
  };

  const body = bodyFor(state.view);

  return (
    <View style={styles.root}>
      <View style={styles.headerRow}>
        <Text style={[text.heading, styles.title]}>{fmt('discovery.title')}</Text>
        <View>
          <IconButton
            icon="tune"
            label={fmt('discovery.filters')}
            onPress={() => dispatch({ type: 'OPEN_OVERLAY', overlay: 'filters' })}
          />
          {filtered ? <View style={styles.filterDot} /> : null}
        </View>
      </View>

      <View style={styles.countRow}>
        <Text style={[text.small, styles.count]}>
          {fmt('discovery.count', {
            count: `${profiles.length}`,
            radius: formatRadius(state.filters.radiusM),
          })}
        </Text>
        {filtered ? (
          <Text style={[text.small, { color: colors.accent }]}>{fmt('discovery.filtersApplied')}</Text>
        ) : null}
      </View>

      <View style={styles.radius}>
        <RadiusControl
          radiusM={state.filters.radiusM}
          showLabel={false}
          onChanged={(radiusM) => dispatch({ type: 'SET_RADIUS', radiusM })}
        />
      </View>

      <View style={styles.body}>
        {profiles.length === 0 ? (
          <EmptyState
            message={fmt('empty.filters')}
            actionLabel={fmt('empty.filtersCta')}
            onAction={() => dispatch({ type: 'CLEAR_FILTERS' })}
          />
        ) : body === 'radarMap' ? (
          <>
            <RadarMapView profiles={profiles} radiusM={state.filters.radiusM} onOpen={onOpen} />
            <RadarCaption />
          </>
        ) : (
          <>
            <Text style={[text.small, styles.listHeading]}>{fmt('discovery.listHeading')}</Text>
            <ProfileList
              state={state}
              profiles={profiles}
              onOpen={onOpen}
              onClearFilters={() => dispatch({ type: 'CLEAR_FILTERS' })}
            />
          </>
        )}
      </View>

      <BottomNav view={state.view} pingsCount={state.incomingPings.length} onSelect={onNav} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: space[3],
    paddingRight: space[1],
  },
  title: {
    flex: 1,
  },
  filterDot: {
    position: 'absolute',
    right: 8,
    top: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space[3],
    gap: space[1],
  },
  count: {
    flex: 1,
  },
  radius: {
    paddingHorizontal: space[3],
    paddingVertical: space[1],
  },
  body: {
    flex: 1,
    paddingHorizontal: space[3],
  },
  listHeading: {
    fontSize: fontSize[0],
    paddingBottom: 4,
  },
});
