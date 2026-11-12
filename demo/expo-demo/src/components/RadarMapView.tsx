import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { fmt } from '../generated/copy';
import type { Profile } from '../generated/fixtures';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { colors, fontSize } from '../theme/theme';

import { Chip } from './Chip';
import { MapCanvas } from './MapCanvas';
import { ProfileDotLayer } from './ProfileDotLayer';
import { RadarSvg, sweepWedgePath } from './RadarSvg';

/**
 * Composición única de descubrimiento: mapa estilizado de fondo + anillos,
 * cruz y barrido + una sola capa de puntos. El contenedor es cuadrado
 * (`side = floor(min(w, h))`) para que los anillos sean círculos y los puntos
 * conserven la proyección compartida. Sin tiles, SDK ni red.
 */
export function RadarMapView({
  profiles,
  radiusM,
  onOpen,
}: {
  profiles: Profile[];
  radiusM: number;
  onOpen: (profile: Profile) => void;
}) {
  const reduced = useReducedMotion();
  const spin = useRef(new Animated.Value(0)).current;
  const [side, setSide] = useState(0);

  const onLayout = (event: LayoutChangeEvent): void => {
    const { width, height } = event.nativeEvent.layout;
    const next = Math.max(0, Math.floor(Math.min(width, height)));
    setSide((current) => (current === next ? current : next));
  };

  useEffect(() => {
    if (reduced) {
      spin.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 6000,
        easing: Easing.linear,
        useNativeDriver: false,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const decorative = {
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants' as const,
  };

  return (
    <View
      style={styles.wrap}
      onLayout={onLayout}
      accessibilityRole="region"
      accessibilityLabel={fmt('a11y.radar')}
    >
      <View style={side > 0 ? { width: side, height: side } : styles.hidden}>
        <MapCanvas />

        <View style={[StyleSheet.absoluteFill]} pointerEvents="none" {...decorative}>
          <RadarSvg />
        </View>

        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { transform: [{ rotate }] }]}
          {...decorative}
        >
          <Svg width="100%" height="100%" viewBox="0 0 100 100">
            <Path d={sweepWedgePath} fill={colors.accent} fillOpacity={0.18} />
          </Svg>
        </Animated.View>

        <ProfileDotLayer profiles={profiles} radiusM={radiusM} onOpen={onOpen} />

        <View style={styles.legend} pointerEvents="none" {...decorative}>
          <Chip label={fmt('discovery.mapLegend')} />
        </View>
      </View>
    </View>
  );
}

/** Caption del radar, hermana de la composición para no recortar el cuadrado. */
export function RadarCaption() {
  return <Text style={styles.caption}>{fmt('discovery.radarCaption')}</Text>;
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  hidden: {
    width: 0,
    height: 0,
  },
  legend: {
    position: 'absolute',
    left: 8,
    bottom: 8,
  },
  caption: {
    textAlign: 'center',
    color: colors.muted,
    fontSize: fontSize[0],
    paddingBottom: 4,
  },
});
