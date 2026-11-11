import Svg, { Circle, G, Line, Path } from 'react-native-svg';

import { colors } from '../theme/theme';

export type RadarSvgProps = {
  /** Barrido estático para `prefers-reduced-motion` o para el mapa. */
  showSweep?: boolean;
  sweepOpacity?: number;
};

const RADIUS = 46;

/** Sector del barrido: centro → radio en el ángulo de las 12, arco de 45°. */
export const sweepWedgePath = (() => {
  const cx = 50;
  const cy = 50;
  const start = -Math.PI / 2;
  const end = start + Math.PI / 4;
  const x1 = cx + Math.cos(start) * RADIUS;
  const y1 = cy + Math.sin(start) * RADIUS;
  const x2 = cx + Math.cos(end) * RADIUS;
  const y2 = cy + Math.sin(end) * RADIUS;
  return `M ${cx} ${cy} L ${x1.toFixed(3)} ${y1.toFixed(3)} A ${RADIUS} ${RADIUS} 0 0 1 ${x2.toFixed(3)} ${y2.toFixed(3)} Z`;
})();

/**
 * Radar decorativo: tres anillos, cruz y centro. Los puntos y sus etiquetas
 * viven en `ProfileDotLayer` (fuera de este SVG).
 */
export function RadarSvg({ showSweep = false, sweepOpacity = 0.18 }: RadarSvgProps) {
  return (
    <Svg width="100%" height="100%" viewBox="0 0 100 100">
      <G>
        {[1, 2, 3].map((ring) => (
          <Circle
            key={ring}
            cx={50}
            cy={50}
            r={(RADIUS * ring) / 3}
            fill="none"
            stroke={colors.border}
            strokeWidth={0.35}
          />
        ))}
        <Line x1={50 - RADIUS} y1={50} x2={50 + RADIUS} y2={50} stroke={colors.border} strokeOpacity={0.5} strokeWidth={0.35} />
        <Line x1={50} y1={50 - RADIUS} x2={50} y2={50 + RADIUS} stroke={colors.border} strokeOpacity={0.5} strokeWidth={0.35} />
        {showSweep ? <Path d={sweepWedgePath} fill={colors.accent} fillOpacity={sweepOpacity} /> : null}
        <Circle cx={50} cy={50} r={4} fill={colors.accent} />
        <Circle cx={50} cy={50} r={7} fill="none" stroke={colors.accent} strokeOpacity={0.5} strokeWidth={0.35} />
      </G>
    </Svg>
  );
}
