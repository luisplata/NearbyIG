import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { liveText } from '../live/liveCopy';
import { useLive } from '../live/LiveProvider';
import { zoneCauseText } from '../live/status';
import type { ZonePromptCause } from '../live/types';
import { colors, space, text } from '../theme/theme';

import { Button } from './Button';
import { Chip } from './Chip';
import { LiveDebug } from './LiveDebug';

/**
 * Sheet de zona demo: la puerta que reemplaza al fallback silencioso.
 *
 * **Por qué existe.** Antes, si el GPS no daba un punto, el controlador abría la
 * sesión en la zona de la región por defecto (`mx → cdmx`) sin decir nada: un
 * usuario en Bogotá terminaba en CDMX. El plan (§4) pide lo contrario: "GPS
 * denegado → sheet de zona demo; CDMX/Bogotá funciona".
 *
 * **Dos salidas, en ese orden.** "Usar mi ubicación" es el gesto que dispara el
 * único pedido de GPS (atado a un click, como exige el móvil); las dos zonas son
 * el camino que no necesita permiso. Elegir una zona de otra región cierra la
 * sesión y abre otra allá — la sesión `mx` no puede registrar presencia de `co`.
 *
 * El mensaje cambia por causa: "bloqueado", "no disponible", "timeout", "sin
 * HTTPS", "fuera de México y Colombia" no se destraban igual.
 */
export function ZoneSheet({ cause }: { cause: ZonePromptCause }) {
  const live = useLive();
  const [busy, setBusy] = useState<string | null>(null);
  const current = live.state.zoneKey;

  const choose = async (zoneKey: string): Promise<void> => {
    setBusy(zoneKey);
    await live.chooseZone(zoneKey);
    setBusy(null);
  };

  const useLocation = async (): Promise<void> => {
    setBusy('gps');
    await live.requestLocation();
    setBusy(null);
  };

  const initial = cause === 'initial';
  const blocked = cause === 'denied' || cause === 'insecure';

  return (
    <View style={styles.sheet} accessibilityViewIsModal accessibilityLabel={liveText('zoneTitle')}>
      <View style={styles.header}>
        <Text style={[text.title, styles.title]}>{liveText('zoneTitle')}</Text>
        <Chip label={liveText('notNow')} onPress={live.dismissZoneSheet} />
      </View>

      <Text style={[text.small, styles.lead]}>
        {initial ? liveText('zoneLeadInitial') : liveText('zoneLead')}
      </Text>

      {initial ? null : (
        <Text style={[text.small, styles.cause]}>{zoneCauseText(cause)}</Text>
      )}

      {blocked ? (
        <Text style={[text.small, styles.hint]}>{liveText('unblockHint')}</Text>
      ) : null}

      <View style={styles.primary}>
        <Button
          label={liveText('useMyLocation')}
          icon="nearMe"
          fullWidth
          disabled={busy !== null}
          onPress={() => void useLocation()}
        />
      </View>

      <View style={styles.options}>
        <ZoneOption
          label={liveText('zoneCdmx')}
          selected={current === 'cdmx'}
          disabled={busy !== null}
          onPress={() => void choose('cdmx')}
        />
        <ZoneOption
          label={liveText('zoneBogota')}
          selected={current === 'bogota'}
          disabled={busy !== null}
          onPress={() => void choose('bogota')}
        />
      </View>

      {live.enabled ? (
        <Text style={[text.small, styles.note]}>{liveText('zoneSwitchNote')}</Text>
      ) : null}

      <LiveDebug />
    </View>
  );
}

function ZoneOption({
  label,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <View style={styles.option}>
      <Button
        label={label}
        variant={selected ? 'primary' : 'outline'}
        fullWidth
        disabled={disabled}
        onPress={onPress}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    paddingHorizontal: space[3],
    paddingTop: space[2],
    paddingBottom: space[2],
    gap: space[1],
    maxHeight: 460,
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
  lead: {
    paddingTop: 2,
  },
  cause: {
    color: colors.accent,
  },
  hint: {
    color: colors.muted,
  },
  primary: {
    paddingTop: space[1],
  },
  options: {
    flexDirection: 'row',
    gap: space[1],
  },
  option: {
    flex: 1,
  },
  note: {
    color: colors.muted,
  },
});
