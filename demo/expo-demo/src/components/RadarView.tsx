import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { fmt } from '../generated/copy';
import type { Profile } from '../generated/fixtures';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { colors, fontSize } from '../theme/theme';

import { ProfileDotLayer } from './ProfileDotLayer';
import { RadarSvg, sweepWedgePath } from './RadarSvg';

/**
 * Radar: anillos + barrido de 6 s. Con `prefers-reduced-motion` el barrido queda
 * estático y los puntos siguen visibles (F-2 / E-5).
 */
export function RadarView({
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

  return (
    <View style={styles.wrap} accessibilityLabel={fmt('a11y.radar')} onLayout={onLayout}>
      <View style={side > 0 ? { width: side, height: side } : styles.hidden}>
        <View style={StyleSheet.absoluteFill}>
          <RadarSvg />
        </View>
        {reduced ? null : (
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { transform: [{ rotate }] }]}
          >
            <Svg width="100%" height="100%" viewBox="0 0 100 100">
              <Path d={sweepWedgePath} fill={colors.accent} fillOpacity={0.18} />
            </Svg>
          </Animated.View>
        )}
        <ProfileDotLayer profiles={profiles} radiusM={radiusM} onOpen={onOpen} />
      </View>
    </View>
  );
}

/** Caption del radar (misma clave de copy que Flutter). */
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
  caption: {
    textAlign: 'center',
    color: colors.muted,
    fontSize: fontSize[0],
    paddingBottom: 4,
  },
});
