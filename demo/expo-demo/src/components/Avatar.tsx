import { View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';

import { photoMap, fallbackPhoto } from '../generated/photoMap';
import type { AvatarRenderState } from '../state/types';
import { colors, fontFamily } from '../theme/theme';

export type AvatarProps = {
  photoId: string;
  size: number;
  renderState?: AvatarRenderState;
  semanticLabel?: string;
};

const specs = photoMap as Record<string, (typeof photoMap)[keyof typeof photoMap]>;

/**
 * Avatar procedural del contrato (A1): gradiente de 2 stops + círculos
 * translúcidos derivados del `seed` + iniciales. `blurred` es una variante de
 * render (sin `filter: blur`, que RNW no garantiza), no un archivo de imagen.
 */
export function Avatar({ photoId, size, renderState = 'blurred', semanticLabel }: AvatarProps) {
  const spec = specs[photoId] ?? fallbackPhoto;
  const clear = renderState === 'clear';
  const rx = spec.shape === 'circle' ? 50 : 28;
  const gradientId = `avatar-${photoId}-${clear ? 'clear' : 'blurred'}`;
  const stops: readonly string[] = spec.gradient;

  return (
    <View
      accessible={semanticLabel !== undefined}
      accessibilityRole={semanticLabel === undefined ? undefined : 'image'}
      accessibilityLabel={semanticLabel}
      accessibilityElementsHidden={semanticLabel === undefined}
      importantForAccessibility={semanticLabel === undefined ? 'no-hide-descendants' : 'auto'}
      style={{ width: size, height: size }}
    >
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={stops[0]} stopOpacity={clear ? 1 : 0.55} />
            <Stop offset="1" stopColor={stops[1]} stopOpacity={clear ? 1 : 0.55} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="100" rx={rx} fill={`url(#${gradientId})`} />
        {[0, 1, 2].map((index) => (
          <Circle
            key={index}
            cx={(((spec.seed * (index + 2) + 3) % 10) / 10) * 100}
            cy={(((spec.seed * (index + 3) + 5) % 10) / 10) * 100}
            r={20}
            fill={colors.text}
            fillOpacity={0.08 + index * 0.04}
          />
        ))}
        {clear ? (
          <SvgText
            x="50"
            y="59"
            textAnchor="middle"
            fontSize="34"
            fontFamily={fontFamily.semibold}
            fill={colors.text}
          >
            {spec.initials}
          </SvgText>
        ) : (
          <>
            <Rect x="0" y="0" width="100" height="100" rx={rx} fill={colors.surface} fillOpacity={0.45} />
            <Path
              d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2z"
              fill={colors.text}
              fillOpacity={0.75}
              transform="translate(35 35) scale(1.25)"
            />
          </>
        )}
        <Rect x="0.5" y="0.5" width="99" height="99" rx={rx} fill="none" stroke={colors.border} strokeWidth="1" />
      </Svg>
    </View>
  );
}
