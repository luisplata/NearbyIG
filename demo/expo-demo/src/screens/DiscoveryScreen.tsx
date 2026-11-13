import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { fmt } from '../generated/copy';
import { unreadMatchCount } from '../live/chat';
import { useLive } from '../live/LiveProvider';
import { matchForPeer } from '../live/matches';
import { prefsCopy } from '../live/prefsCopy';
import { mapCenterFor, regionForZone } from '../live/regions';
import { useDemo } from '../state/DemoProvider';
import { usePreferences } from '../state/PreferencesProvider';
import { formatRadius } from '../state/format';
import { pingsBadgeCount, visibleProfiles } from '../state/selectors';
import type { UiProfile } from '../state/types';
import { colors, fontSize, space, text } from '../theme/theme';

import { BottomNav } from '../components/BottomNav';
import { Chip } from '../components/Chip';
import { EmptyState } from '../components/EmptyState';
import { IconButton } from '../components/IconButton';
import { ProfileList } from '../components/ProfileList';
import { RadarCaption, RadarMapView } from '../components/RadarMapView';
import { RadiusControl } from '../components/RadiusControl';
import type { NavItem } from '../navigation/navItems';

import { discoveryLayout } from './discoveryBody';

/**
 * Pantalla base: descubrimiento en lista o en la composición radar-sobre-mapa,
 * con radio y filtros compartidos (F-2, F-3). La vista reservada `map` renderiza
 * la misma composición que `radar`.
 */
export function DiscoveryScreen() {
  const { state, dispatch, store } = useDemo();
  const live = useLive();
  const prefs = usePreferences();
  const profiles = useMemo(() => visibleProfiles(state), [state]);
  const liveMode = state.source === 'live' && live.enabled && live.state.session !== null;
  /**
   * Geografía del basemap: el punto del GPS manda (vive sólo en memoria), y sin
   * punto el centroide de la zona de la sesión. Nunca una ciudad por defecto:
   * sin zona, `mapCenterFor(null, null)` devuelve el centro de la demo.
   */
  const regionKey = live.state.session?.regionKey ?? regionForZone(live.state.zoneKey);
  const point = live.state.point;
  const center = useMemo(() => mapCenterFor(point, regionKey), [point, regionKey]);
  const filtered =
    state.filters.intentions !== null ||
    state.filters.gender !== null ||
    state.filters.verifiedOnly ||
    state.filters.onlineOnly;

  const onOpen = (profile: UiProfile): void => {
    dispatch({ type: 'OPEN_OVERLAY', overlay: 'profile', profileId: profile.id });
  };

  /**
   * Bloqueo rápido desde la tarjeta. En dataset es la action del guion; en live
   * el server bloquea (y canoniza bots al dueño) y la próxima foto de discovery
   * saca la fila. El toast es el mismo host para los dos modos.
   */
  const onBlock = (profile: UiProfile): void => {
    if (!liveMode) {
      dispatch({ type: 'BLOCK_PROFILE', profileId: profile.id });
      return;
    }
    void live.block(profile.id).then((result) => {
      if (result.ok) {
        store.pushToast('safety.blocked');
      }
      // Un fallo deja el `blockError` en el controlador; la tarjeta no se mueve.
    });
  };

  const onReport = (profile: UiProfile): void => {
    dispatch({ type: 'OPEN_OVERLAY', overlay: 'safety', profileId: profile.id });
  };

  /**
   * Chats ya existentes, para que la tarjeta ofrezca el globo. En live la foto es
   * la de `GET /matches`; en dataset, el guion (`state.matches` sin no leídos).
   */
  const chatFor = (profile: UiProfile): { unread: number } | null => {
    if (liveMode) {
      const row = matchForPeer(live.matches, profile.id);
      return row === null ? null : { unread: row.unreadCount };
    }
    return state.matches.includes(profile.id) ? { unread: 0 } : null;
  };

  /** Un toque al globo abre la conversación, sin pasar por Pings → Matches. */
  const onOpenChat = (profile: UiProfile): void => {
    if (!liveMode) {
      dispatch({ type: 'OPEN_CHAT', profileId: profile.id });
      return;
    }
    void live.openChatWithPeer(profile.id).then((result) => {
      if (result.ok) {
        dispatch({ type: 'OPEN_OVERLAY', overlay: 'chat' });
      }
    });
  };

  const onNav = (item: NavItem): void => {
    if (item.kind === 'overlay') {
      dispatch({ type: 'OPEN_OVERLAY', overlay: item.overlay });
      return;
    }
    dispatch({ type: 'SET_VIEW', view: item.view });
  };

  const body = discoveryLayout(state.view, profiles.length);

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
        {/* Control visible del toggle de bots: un toque, sin abrir filtros. */}
        {prefs.botCount === 0 ? null : (
          <Chip
            label={prefs.includeBots ? prefsCopy.botsOn : prefsCopy.botsOff}
            selected={prefs.includeBots}
            onPress={prefs.toggleBots}
          />
        )}
      </View>

      <View style={styles.radius}>
        <RadiusControl
          radiusM={state.filters.radiusM}
          showLabel={false}
          onChanged={(radiusM) => dispatch({ type: 'SET_RADIUS', radiusM })}
        />
      </View>

      <View style={styles.body}>
        {body === 'radarMap' ? (
          <>
            <RadarMapView
              profiles={profiles}
              radiusM={state.filters.radiusM}
              center={center}
              onOpen={onOpen}
            />
            <RadarCaption />
          </>
        ) : body === 'emptyList' ? (
          <EmptyState
            message={fmt('empty.filters')}
            actionLabel={fmt('empty.filtersCta')}
            onAction={() => dispatch({ type: 'CLEAR_FILTERS' })}
          />
        ) : (
          <>
            <Text style={[text.small, styles.listHeading]}>{fmt('discovery.listHeading')}</Text>
            <ProfileList
              state={state}
              profiles={profiles}
              onOpen={onOpen}
              onClearFilters={() => dispatch({ type: 'CLEAR_FILTERS' })}
              onBlock={onBlock}
              onReport={onReport}
              chatFor={chatFor}
              onOpenChat={onOpenChat}
            />
          </>
        )}
      </View>

      <BottomNav
        view={state.view}
        /**
         * El badge del tab Chat cuenta **mensajes sin leer**; los pings
         * pendientes viajan aparte y se dibujan en el segmento Recibidos.
         */
        badges={{
          messages: liveMode ? unreadMatchCount(live.matches) : 0,
          pings: pingsBadgeCount(state, live.pings.pending, 0),
        }}
        onSelect={onNav}
      />
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
