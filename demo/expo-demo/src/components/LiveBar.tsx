import { StyleSheet, Text, View } from 'react-native';

import { liveText } from '../live/liveCopy';
import { useLive } from '../live/LiveProvider';
import {
  liveCountText,
  liveLocationText,
  liveNoticeText,
  liveSessionText,
  liveStatusText,
  liveTransportText,
} from '../live/status';
import { useDemo } from '../state/DemoProvider';
import { colors, fontSize, space, text } from '../theme/theme';

import { Chip } from './Chip';
import { LiveDebug } from './LiveDebug';

/**
 * Barra de la sesión live, debajo del header.
 *
 * **No hay switch.** Cuando el build tiene API, la sesión arranca sola —si hay
 * zona elegida— y la barra cuenta qué pasa: estado, línea de sesión, transporte,
 * perfiles y si las distancias salen del GPS o de la zona demo (`zona demo
 * (CDMX)`). El dataset del build no es un modo que se elija: es el catálogo con
 * el que la app arranca y al que vuelve si la API no responde.
 *
 * **La ubicación no se pide sola.** El chip "Usar mi ubicación" es el gesto que
 * dispara el único pedido al navegador; queda visible siempre que la presencia
 * sea de zona demo, así se puede reintentar después de elegir zona.
 *
 * Sin API configurada (`EXPO_PUBLIC_API_URL` o `?api=`) la barra no se monta: el
 * artefacto publicado se ve exactamente como antes (CONTRACT.md §6 y §9).
 */
export function LiveBar({ onOpenProfiles }: { onOpenProfiles: () => void }) {
  const { state } = useDemo();
  const live = useLive();
  const isLive = state.source === 'live';
  const notice = liveNoticeText(live.state.notice);
  const session = liveSessionText(live.state);
  const transport = liveTransportText(live.state);
  const location = liveLocationText(live.state);
  const needsZone = live.state.status === 'needs-zone';

  // Sin base de API en el build no hay nada que contar: la barra no se monta.
  if (!live.available) {
    return null;
  }

  const offline = live.state.status === 'offline';
  const meta = [session, transport, location, liveCountText(state.catalog.length)].filter(
    (part): part is string => part !== null,
  );

  return (
    <View style={styles.bar}>
      <View style={styles.row}>
        <Text numberOfLines={1} style={[text.small, styles.status]}>
          {liveStatusText(state.source, live.state)}
        </Text>
        {isLive && live.enabled ? (
          <Chip label={liveText('changeProfile')} icon="person" onPress={onOpenProfiles} />
        ) : null}
        {needsZone ? <Chip label={liveText('chooseZone')} onPress={live.openZoneSheet} /> : null}
        {offline ? <Chip label={liveText('retry')} onPress={() => void live.enable()} /> : null}
      </View>

      {isLive && meta.length > 0 ? (
        <View style={styles.row}>
          <Text numberOfLines={1} style={[text.small, styles.meta]}>
            {meta.join(' · ')}
          </Text>
          {live.state.location === 'demo' && live.enabled ? (
            <Chip label={liveText('changeZone')} onPress={live.openZoneSheet} />
          ) : null}
          {live.state.location === 'demo' && live.enabled ? (
            <Chip
              label={liveText('useMyLocation')}
              onPress={() => void live.requestLocation()}
            />
          ) : null}
        </View>
      ) : null}

      {notice === null ? null : (
        <Text style={[text.small, styles.notice]}>{notice}</Text>
      )}

      <LiveDebug />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingHorizontal: space[3],
    paddingBottom: space[1],
    gap: 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  status: {
    flex: 1,
    paddingVertical: 2,
  },
  meta: {
    flex: 1,
    fontSize: fontSize[0],
    opacity: 0.9,
  },
  notice: {
    color: colors.danger,
  },
});
