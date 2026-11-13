import { useEffect, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { fmt } from '../generated/copy';
import { useReducedMotion } from '../hooks/useReducedMotion';
import type { LngLat } from '../map/basemap';
import { MapBasemap } from '../map/MapBasemap';
import { showsRealTiles, type MapPhase } from '../map/mapStatus';
import type { UiProfile } from '../state/types';
import { colors, fontSize, fontFamily, lineHeight, mapScrim, radii, space } from '../theme/theme';

import { Chip } from './Chip';
import { MapCanvas } from './MapCanvas';
import { ProfileDotLayer } from './ProfileDotLayer';
import { RadarSvg, sweepWedgePath } from './RadarSvg';

/**
 * Composición única de descubrimiento: mapa estilizado permanente + basemap real
 * (sólo web, encima y opcional) + anillos, cruz y barrido + una sola capa de
 * puntos. El contenedor es cuadrado (`side = floor(min(w, h))`) para que los
 * anillos sean círculos y los puntos conserven la proyección compartida.
 *
 * `MapCanvas` nunca se desmonta: es la capa base y el fallback. El basemap real
 * se monta una vez y avisa su fase; la esquina inferior izquierda muestra
 * "mapa simulado" mientras manda la ilustración y la atribución del proveedor
 * (abajo a la derecha) sólo cuando hay tiles de verdad.
 */
export function RadarMapView({
  profiles,
  radiusM,
  center,
  onOpen,
}: {
  profiles: UiProfile[];
  radiusM: number;
  /** Centro del basemap: la zona de la región activa. */
  center: LngLat;
  onOpen: (profile: UiProfile) => void;
}) {
  const reduced = useReducedMotion();
  const spin = useRef(new Animated.Value(0)).current;
  const wrapRef = useRef<ComponentRef<typeof View>>(null);
  const [side, setSide] = useState(0);
  const [phase, setPhase] = useState<MapPhase>('idle');

  const onLayout = (event: LayoutChangeEvent): void => {
    const { width, height } = event.nativeEvent.layout;
    const next = Math.max(0, Math.floor(Math.min(width, height)));
    setSide((current) => (current === next ? current : next));
  };

  useEffect(() => {
    const element = wrapRef.current as unknown as HTMLElement | null;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const update = (): void => {
      const rect = element.getBoundingClientRect();
      const next = Math.max(0, Math.floor(Math.min(rect.width, rect.height)));
      setSide((current) => (current === next ? current : next));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

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
  const realTiles = showsRealTiles(phase);

  return (
    <View
      ref={wrapRef}
      style={styles.wrap}
      onLayout={onLayout}
      accessibilityRole="region"
      accessibilityLabel={fmt('a11y.radar')}
    >
      <View style={side > 0 ? { width: side, height: side } : styles.hidden}>
        <MapCanvas />

        <MapBasemap side={side} radiusM={radiusM} center={center} onPhaseChange={setPhase} />

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

        {realTiles ? null : (
          <View style={styles.legend} pointerEvents="none" {...decorative}>
            <Chip label={fmt('discovery.mapLegend')} />
          </View>
        )}

        {realTiles ? (
          <View style={styles.attribution} pointerEvents="none">
            <View accessibilityRole="text" style={styles.attributionChip}>
              <Text style={styles.attributionText}>{fmt('discovery.mapAttribution')}</Text>
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Caption del radar, hermana de la composición para no recortar el cuadrado.
 * La nota del basemap va acá (fuera del cuadrado) para no competir con la
 * atribución ni con la leyenda dentro del mapa a 320 px.
 */
export function RadarCaption() {
  return (
    <View style={styles.captionWrap}>
      <Text style={styles.caption}>{fmt('discovery.radarCaption')}</Text>
      <Text style={styles.note}>{fmt('discovery.mapNote')}</Text>
    </View>
  );
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
  attribution: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    maxWidth: '72%',
    alignItems: 'flex-end',
  },
  attributionChip: {
    backgroundColor: mapScrim,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii[4],
    paddingHorizontal: space[1],
    paddingVertical: 2,
  },
  attributionText: {
    color: colors.muted,
    fontFamily: fontFamily.regular,
    fontSize: fontSize[0],
    lineHeight: fontSize[0] * lineHeight[2],
  },
  captionWrap: {
    paddingBottom: 4,
    gap: 2,
  },
  caption: {
    textAlign: 'center',
    color: colors.muted,
    fontSize: fontSize[0],
  },
  note: {
    textAlign: 'center',
    color: colors.muted,
    fontSize: fontSize[0],
    opacity: 0.8,
  },
});
