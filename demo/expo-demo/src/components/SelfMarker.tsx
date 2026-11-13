import { StyleSheet, Text, View } from 'react-native';

import { mapText } from '../map/mapCopy';
import { colors, fontSize, fontFamily } from '../theme/theme';

/**
 * Marcador propio del radar: el centro siempre "sos vos".
 *
 * **Para qué.** Sin un punto propio, el radar mostraba a los demás y no daba
 * ninguna referencia de dónde está el usuario: el mapa "no se movía" porque no
 * había nada quieto contra lo que comparar. El centro de la proyección
 * (`projectProfile` mide distancia y rumbo **desde** el usuario) es exactamente
 * la posición propia, y el basemap se recentra en el punto del GPS, así que este
 * marcador queda fijo en el medio y los demás se mueven alrededor.
 *
 * **Visual distinto a los demás.** Los perfiles son puntos de 12 px rellenos; el
 * propio es un anillo de acento con núcleo sólido, halo translúcido y la
 * etiqueta "vos". Se distingue por forma, color y texto, no sólo por color.
 *
 * **Sin animación.** No late ni gira: con `prefers-reduced-motion` habría que
 * apagarlo igual, y el punto fijo es más legible que un pulso.
 */
export function SelfMarker() {
  return (
    <View
      style={styles.wrap}
      pointerEvents="none"
      accessibilityRole="text"
      accessibilityLabel={mapText('selfA11y')}
    >
      <View style={styles.halo} accessibilityElementsHidden importantForAccessibility="no" />
      <View style={styles.ring}>
        <View style={styles.core} />
      </View>
      <Text style={styles.caption}>{mapText('selfYou')}</Text>
    </View>
  );
}

const HALO = 28;
const RING = 20;

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 64,
    // El halo queda centrado en el medio del radar; la etiqueta cuelga debajo.
    marginLeft: -32,
    marginTop: -HALO / 2,
    alignItems: 'center',
  },
  halo: {
    position: 'absolute',
    top: 0,
    width: HALO,
    height: HALO,
    borderRadius: HALO / 2,
    backgroundColor: colors.accent,
    opacity: 0.18,
  },
  ring: {
    width: RING,
    height: RING,
    marginTop: (HALO - RING) / 2,
    borderRadius: RING / 2,
    borderWidth: 2,
    borderColor: colors.accent,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  core: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  caption: {
    marginTop: 2,
    color: colors.accent,
    fontFamily: fontFamily.semibold,
    fontSize: fontSize[0],
  },
});
