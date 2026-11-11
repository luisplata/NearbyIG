import { Pressable, StyleSheet, View } from 'react-native';

import { fmt } from '../generated/copy';
import type { Profile } from '../generated/fixtures';
import { formatDistance } from '../state/format';
import { projectProfile } from '../state/selectors';
import { colors } from '../theme/theme';

/**
 * Capa tappable de puntos: 44×44 px por perfil, etiqueta con nombre y distancia
 * y posición derivada de la proyección compartida del contrato.
 */
export function ProfileDotLayer({
  profiles,
  radiusM,
  onOpen,
}: {
  profiles: Profile[];
  radiusM: number;
  onOpen: (profile: Profile) => void;
}) {
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
