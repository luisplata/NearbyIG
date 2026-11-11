import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { fmt } from '../generated/copy';
import type { Profile } from '../generated/fixtures';
import { useDemo } from '../state/DemoProvider';
import { formatRadius } from '../state/format';
import { visibleProfiles } from '../state/selectors';
import { colors, fontSize, space, text } from '../theme/theme';

import { BottomNav, type NavTarget } from '../components/BottomNav';
import { EmptyState } from '../components/EmptyState';
import { IconButton } from '../components/IconButton';
import { MapView } from '../components/MapView';
import { ProfileList } from '../components/ProfileList';
import { RadarCaption, RadarView } from '../components/RadarView';
import { RadiusControl } from '../components/RadiusControl';

/**
 * Pantalla base: descubrimiento en radar, mapa o lista, con radio y filtros
 * compartidos (F-2, F-3).
 */
export function DiscoveryScreen() {
  const { state, dispatch } = useDemo();
  const profiles = useMemo(() => visibleProfiles(state), [state]);
  const filtered =
    state.filters.intentions !== null ||
    state.filters.gender !== null ||
    state.filters.verifiedOnly ||
    state.filters.onlineOnly;

  const onOpen = (profile: Profile): void => {
    dispatch({ type: 'OPEN_OVERLAY', overlay: 'profile', profileId: profile.id });
  };

  const onNav = (target: NavTarget): void => {
    switch (target) {
      case 'profile':
        dispatch({ type: 'OPEN_OVERLAY', overlay: 'settings' });
        return;
      case 'pings':
        dispatch({ type: 'OPEN_OVERLAY', overlay: 'pings' });
        return;
      default:
        dispatch({ type: 'SET_VIEW', view: target });
    }
  };

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
        ) : state.view === 'radar' ? (
          <>
            <RadarView profiles={profiles} radiusM={state.filters.radiusM} onOpen={onOpen} />
            <RadarCaption />
          </>
        ) : state.view === 'map' ? (
          <View style={styles.mapWrap}>
            <MapView profiles={profiles} radiusM={state.filters.radiusM} onOpen={onOpen} />
          </View>
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
  mapWrap: {
    flex: 1,
    paddingBottom: space[2],
  },
  listHeading: {
    fontSize: fontSize[0],
    paddingBottom: 4,
  },
});
