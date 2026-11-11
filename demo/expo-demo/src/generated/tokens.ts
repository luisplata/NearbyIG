// GENERATED FILE - do not edit by hand.
// Source: demo/shared/design-tokens.json
// Regenerate with: node scripts/sync-demo-assets.mjs

export const tokens = {
  "breakpoint": {
    "frameMax": 480,
    "min": 320,
    "wide": 600
  },
  "color": {
    "accent": "#FFD600",
    "accentWarm": "#E8B27A",
    "bg": "#09090B",
    "border": "#2A2A33",
    "danger": "#EF4444",
    "gradientEnd": "#3858FA",
    "gradientMid": "#7638FA",
    "gradientStart": "#FF0069",
    "muted": "#A1A1AA",
    "online": "#22C55E",
    "surface": "#121216",
    "surfaceAlt": "#1B1B21",
    "text": "#F4F4F5",
    "verified": "#3B82F6"
  },
  "radius": [
    8,
    12,
    20,
    28,
    999
  ],
  "shadow": {
    "sheet": "0 -8 24 rgba(0,0,0,0.45)"
  },
  "space": [
    4,
    8,
    12,
    16,
    24,
    32
  ],
  "type": {
    "family": "Inter",
    "lineHeights": [
      1.2,
      1.35,
      1.5
    ],
    "sizes": [
      11,
      13,
      15,
      17,
      22,
      28
    ],
    "weights": [
      400,
      600
    ]
  }
} as const;

export type ColorToken = keyof typeof tokens.color;
export type FontSize = (typeof tokens.type.sizes)[number];
