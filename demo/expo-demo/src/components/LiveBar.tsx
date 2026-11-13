import { StyleSheet, Text, View } from 'react-native';

import { liveText } from '../live/liveCopy';
import { useLive } from '../live/LiveProvider';
import {
  liveCountText,
  liveNoticeText,
  liveSessionText,
  liveStatusText,
  liveTransportText,
} from '../live/status';
import { useDemo } from '../state/DemoProvider';
import { colors, fontSize, space, text } from '../theme/theme';

import { Chip } from './Chip';

/**
 * Barra de la sesión live, debajo del header.
 *
 * **No hay switch.** Cuando el build tiene API, la sesión arranca sola y la barra
 * cuenta qué pasa (estado, línea de sesión, transporte, perfiles). El dataset del
 * build no es un modo que se elija: es el catálogo con el que la app arranca y al
 * que vuelve si la API no responde, con un aviso que explica el porqué.
 *
 * Sin `EXPO_PUBLIC_API_URL` la barra no se monta: el artefacto publicado se ve
 * exactamente como antes (CONTRACT.md §6 y §9).
 */
export function LiveBar({ onOpenProfiles }: { onOpenProfiles: () => void }) {
  const { state } = useDemo();
  const live = useLive();
  const isLive = state.source === 'live';
  const notice = liveNoticeText(live.state.notice);
  const session = liveSessionText(live.state);
  const transport = liveTransportText(live.state);

  // Sin base de API en el build no hay nada que contar: la barra no se monta.
  if (!live.available) {
    return null;
  }

  const offline = live.state.status === 'offline';

  return (
    <View style={styles.bar}>
      <View style={styles.row}>
        <Text numberOfLines={1} style={[text.small, styles.status]}>
          {liveStatusText(state.source, live.state)}
        </Text>
        {isLive && live.enabled ? (
          <Chip label={liveText('changeProfile')} icon="person" onPress={onOpenProfiles} />
        ) : null}
        {offline ? (
          <Chip label={liveText('retry')} onPress={() => void live.enable()} />
        ) : null}
      </View>

      {isLive && session !== null ? (
        <Text numberOfLines={1} style={[text.small, styles.meta]}>
          {[session, transport, liveCountText(state.catalog.length)]
            .filter((part): part is string => part !== null)
            .join(' · ')}
        </Text>
      ) : null}

      {notice === null ? null : (
        <Text style={[text.small, styles.notice]}>{notice}</Text>
      )}
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
    fontSize: fontSize[0],
    opacity: 0.9,
  },
  notice: {
    color: colors.danger,
  },
});
