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
 * Switch mock/live del descubrimiento, debajo del header.
 *
 * **Default: mock.** El artefacto publicado (`/expo/`) es la demo sin red y no
 * depende de que haya un backend en la máquina del que mira. El modo live es
 * opt-in explícito y además requiere que el build tenga `EXPO_PUBLIC_API_URL`.
 *
 * Si el arranque falla, el switch vuelve solo a mock y el aviso queda visible:
 * la app no se rompe ni se queda en un estado intermedio.
 */
export function LiveBar({ onOpenProfiles }: { onOpenProfiles: () => void }) {
  const { state } = useDemo();
  const live = useLive();
  const isLive = state.source === 'live';
  const notice = liveNoticeText(live.state.notice);
  const session = liveSessionText(live.state);
  const transport = liveTransportText(live.state);

  return (
    <View style={styles.bar}>
      <View style={styles.row}>
        <Chip
          label={liveText('mock')}
          selected={!isLive}
          onPress={() => {
            if (isLive) {
              void live.disable();
              return;
            }
            void live.enable();
          }}
        />
        {live.available ? (
          <Chip
            label={liveText('live')}
            selected={isLive}
            onPress={() => {
              if (!isLive) {
                void live.enable();
              }
            }}
          />
        ) : (
          <View style={styles.unavailable}>
            <Text style={styles.unavailableText}>{liveText('notConfigured')}</Text>
          </View>
        )}
        <Text numberOfLines={1} style={[text.small, styles.status]}>
          {liveStatusText(state.source, live.state)}
        </Text>
        {isLive && live.enabled ? (
          <Chip label={liveText('changeProfile')} icon="person" onPress={onOpenProfiles} />
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
    textAlign: 'right',
    paddingHorizontal: space[1],
  },
  meta: {
    fontSize: fontSize[0],
    opacity: 0.9,
  },
  notice: {
    color: colors.danger,
  },
  unavailable: {
    justifyContent: 'center',
    paddingHorizontal: space[1],
  },
  unavailableText: {
    color: colors.muted,
    fontSize: fontSize[0],
  },
});
