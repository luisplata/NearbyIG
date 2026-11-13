import { Platform, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { fmt } from '../generated/copy';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { formatDistance } from '../state/format';
import { projectProfile } from '../state/selectors';
import type { UiProfile } from '../state/types';
import { colors } from '../theme/theme';

/**
 * Capa tappable de puntos: 44×44 px por perfil, etiqueta con nombre y distancia
 * y posición derivada de la proyección compartida del contrato.
 *
 * **Interpolación sólo en render.** En el modo live los bots saltan cada 5 s
 * (un tramo de waypoint): la distancia y el rumbo llegan ya calculados por el
 * server. El único lugar donde se interpola es acá, con una transición CSS de
 * `left`/`top` sobre la posición normalizada — el estado nunca guarda posiciones
 * intermedias. En nativo no hay transición (misma proyección, sin animación
 * implícita) y con `prefers-reduced-motion` tampoco: el perfil salta, que es el
 * comportamiento del mock.
 */

const LIVE_TRANSITION_MS = 4_800;

function useDotTransition(): ViewStyle | null {
  const reduced = useReducedMotion();
  if (Platform.OS !== 'web' || reduced) {
    return null;
  }
  // react-native-web acepta transiciones CSS; el tipo de RN no las declara.
  return {
    transitionProperty: 'left, top',
    transitionDuration: `${LIVE_TRANSITION_MS}ms`,
    transitionTimingFunction: 'linear',
  } as unknown as ViewStyle;
}

export function ProfileDotLayer({
  profiles,
  radiusM,
  onOpen,
}: {
  profiles: UiProfile[];
  radiusM: number;
  onOpen: (profile: UiProfile) => void;
}) {
  const transition = useDotTransition();
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {profiles.map((profile) => {
        const dot = projectProfile(profile, radiusM);
        const label = fmt('a11y.profileDot', {
          name: profile.nickname,
          distance: formatDistance(profile.distanceM),
        });
        return (
          <Pressable
            key={profile.id}
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={() => onOpen(profile)}
            style={({ pressed }) => [
              styles.dot,
              // Centro del punto: 50% del contenedor + (0.5 - x) del radio útil (46%).
              { left: `${50 + (dot.x - 0.5) * 92}%`, top: `${50 + (dot.y - 0.5) * 92}%` },
              transition,
              pressed && styles.pressed,
            ]}
          >
            <View
              style={[
                styles.marker,
                { backgroundColor: profile.verified ? colors.verified : colors.gradientStart },
              ]}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  dot: {
    position: 'absolute',
    width: 44,
    height: 44,
    marginLeft: -22,
    marginTop: -22,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  pressed: {
    backgroundColor: colors.surfaceAlt,
  },
  marker: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.bg,
  },
});
