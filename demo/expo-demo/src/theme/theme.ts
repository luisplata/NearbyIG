import { tokens } from '../generated/tokens';

/**
 * Tokens del contrato expuestos a React Native. Nada de literales de color o
 * tamaño en pantallas: todo sale de `src/generated/tokens.ts`.
 */

export const colors = {
  bg: tokens.color.bg,
  surface: tokens.color.surface,
  surfaceAlt: tokens.color.surfaceAlt,
  text: tokens.color.text,
  muted: tokens.color.muted,
  border: tokens.color.border,
  gradientStart: tokens.color.gradientStart,
  gradientMid: tokens.color.gradientMid,
  gradientEnd: tokens.color.gradientEnd,
  accent: tokens.color.accent,
  accentWarm: tokens.color.accentWarm,
  online: tokens.color.online,
  verified: tokens.color.verified,
  danger: tokens.color.danger,
} as const;

export const fontFamily = {
  regular: 'Inter-Regular',
  semibold: 'Inter-SemiBold',
} as const;

export const fontSize = tokens.type.sizes;
export const lineHeight = tokens.type.lineHeights;
export const space = tokens.space;
export const radii = tokens.radius;

export const breakpoint = tokens.breakpoint;

/** Sombra de hoja del contrato: `0 -8 24 rgba(0,0,0,0.45)`. */
export const sheetShadow = {
  shadowColor: '#000000',
  shadowOffset: { width: 0, height: -8 },
  shadowOpacity: 0.45,
  shadowRadius: 24,
} as const;

export const text = {
  small: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize[0],
    lineHeight: fontSize[0] * lineHeight[2],
    color: colors.muted,
  },
  body: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize[1],
    lineHeight: fontSize[1] * lineHeight[2],
    color: colors.text,
  },
  bodyLarge: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize[2],
    lineHeight: fontSize[2] * lineHeight[1],
    color: colors.text,
  },
  label: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize[0],
    color: colors.text,
  },
  title: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize[3],
    lineHeight: fontSize[3] * lineHeight[0],
    color: colors.text,
  },
  heading: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize[4],
    lineHeight: fontSize[4] * lineHeight[0],
    color: colors.text,
  },
  display: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize[5],
    lineHeight: fontSize[5] * lineHeight[0],
    color: colors.text,
  },
} as const;

/** Fondo translúcido del backdrop de overlays. */
export const scrim = 'rgba(9,9,11,0.72)';

/**
 * Fondo de la atribución sobre el basemap real. 0.72 falla AA sobre el mapa más
 * claro (≈3.4:1); 0.88 da ≈6.1:1 con `colors.muted`, el mínimo legible.
 */
export const mapScrim = 'rgba(9,9,11,0.88)';

/** Sombra de hoja tal cual la define el contrato (CSS `box-shadow`). */
export const sheetBoxShadow = tokens.shadow.sheet;
