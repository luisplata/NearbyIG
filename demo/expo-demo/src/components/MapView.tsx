import { StyleSheet, View } from 'react-native';
import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg';

import { fmt } from '../generated/copy';
import { fixtures } from '../generated/fixtures';
import type { Profile } from '../generated/fixtures';
import { colors, fontFamily } from '../theme/theme';

import { Chip } from './Chip';
import { ProfileDotLayer } from './ProfileDotLayer';

/** Mapa estilizado: calles y manzanas del `mapDecor`, cero tiles y cero red (F-2). */
export function MapView({
  profiles,
  radiusM,
  onOpen,
}: {
  profiles: Profile[];
  radiusM: number;
  onOpen: (profile: Profile) => void;
}) {
  return (
    <View style={styles.wrap} accessibilityLabel={fmt('a11y.map')}>
      <View style={StyleSheet.absoluteFill}>
        <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
          <Rect x="0" y="0" width="100" height="100" fill={colors.surface} />
          {[1, 2, 3, 4, 5, 6, 7].map((index) => (
            <Line
              key={`v${index}`}
              x1={(100 * index) / 8}
              y1={0}
              x2={(100 * index) / 8}
              y2={100}
              stroke={colors.border}
              strokeOpacity={0.25}
              strokeWidth={0.15}
            />
          ))}
          {[1, 2, 3, 4, 5, 6, 7].map((index) => (
            <Line
              key={`h${index}`}
              x1={0}
              y1={(100 * index) / 8}
              x2={100}
              y2={(100 * index) / 8}
              stroke={colors.border}
              strokeOpacity={0.25}
              strokeWidth={0.15}
            />
          ))}
          {fixtures.mapDecor.blocks.map((block, index) => (
            <Rect
              key={`block${index}`}
              x={block.x * 100}
              y={block.y * 100}
              width={block.w * 100}
              height={block.h * 100}
              rx={Math.max(block.radius / 6, 0.5)}
              fill={colors.surfaceAlt}
              stroke={colors.border}
              strokeWidth={0.15}
            />
          ))}
          {fixtures.mapDecor.streets.map((street, index) => (
            <Line
              key={`street${index}`}
              x1={street.x1 * 100}
              y1={street.y1 * 100}
              x2={street.x2 * 100}
              y2={street.y2 * 100}
              stroke={colors.border}
              strokeWidth={Math.max(street.weight / 4, 0.2)}
              strokeLinecap="round"
            />
          ))}
          {fixtures.mapDecor.labels.map((label, index) => (
            <SvgText
              key={`label${index}`}
              x={label.x * 100}
              y={label.y * 100}
              fontSize={3.2}
              fontFamily={fontFamily.regular}
              fill={colors.muted}
              fillOpacity={0.8}
              textAnchor="middle"
            >
              {fmt(label.copyKey)}
            </SvgText>
          ))}
          <Rect x="0.4" y="0.4" width="99.2" height="99.2" fill="none" stroke={colors.border} strokeWidth={0.2} />
        </Svg>
      </View>
      <ProfileDotLayer profiles={profiles} radiusM={radiusM} onOpen={onOpen} />
      <View style={styles.legend}>
        <Chip label={fmt('discovery.mapLegend')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  legend: {
    position: 'absolute',
    left: 8,
    bottom: 8,
  },
});
