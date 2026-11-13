import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { liveText } from '../live/liveCopy';
import { useLive } from '../live/LiveProvider';
import { colors, fontFamily, fontSize, radii, space } from '../theme/theme';

import { Chip } from './Chip';

/**
 * Debug del flujo de ubicación, a la vista.
 *
 * **Por qué existe.** El defecto que motivó este cambio se diagnosticó adivinan‑
 * do: el usuario estaba en Bogotá, el GPS funcionaba, el backend respondía
 * `fallbackRequired` y la sesión seguía siendo `mx`. Con estas cuatro líneas se
 * ve en el acto qué pidió el navegador, qué contestó el `PUT /presence`, en qué
 * región quedó la sesión y qué zona está activa.
 *
 * **Qué NO muestra.** Coordenadas: ni en pantalla ni en consola. Sólo la
 * precisión redondeada a 10 m, que describe el error de la medición y no el
 * lugar. La zona (`cdmx`/`bogota`) es del catálogo público, no del usuario.
 *
 * **Layout.** Cerrado es un chip; abierto son cuatro líneas de una sola línea
 * cada una, así no rompe el ancho de 360 px. El componente vive en la barra y en
 * el sheet de zona.
 */
export function LiveDebug() {
  const live = useLive();
  const [open, setOpen] = useState(false);
  const { diagnostics, session, zoneKey } = live.state;
  const dash = liveText('none');

  const lines = [
    liveText('debugGeo', {
      geo: diagnostics.geo ?? dash,
      accuracy: diagnostics.accuracyM === null ? dash : `${diagnostics.accuracyM} m`,
    }),
    liveText('debugPresence', {
      status: diagnostics.presenceStatus === null ? dash : String(diagnostics.presenceStatus),
      zone: diagnostics.presenceZoneKey ?? dash,
      fallback:
        diagnostics.fallbackRequired === null
          ? dash
          : diagnostics.fallbackRequired
            ? liveText('yes')
            : liveText('no'),
    }),
    liveText('debugSession', {
      region: session?.regionKey ?? dash,
      slot:
        session === null
          ? dash
          : session.demoSlot === null
            ? liveText('guest')
            : String(session.demoSlot),
    }),
    liveText('debugZone', { zone: zoneKey ?? dash }),
  ];

  return (
    <View style={styles.wrap}>
      <Chip
        label={liveText('debugToggle')}
        selected={open}
        onPress={() => setOpen((current) => !current)}
      />
      {open ? (
        <View style={styles.box} accessibilityLabel={liveText('debugTitle')}>
          {lines.map((line, index) => (
            <Text key={`${index}-${line}`} numberOfLines={1} style={styles.line}>
              {line}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'flex-start',
    gap: 2,
  },
  box: {
    alignSelf: 'stretch',
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii[1],
    paddingHorizontal: space[1],
    paddingVertical: 2,
    gap: 1,
  },
  line: {
    color: colors.muted,
    fontFamily: fontFamily.regular,
    fontSize: fontSize[0] - 1,
  },
});
