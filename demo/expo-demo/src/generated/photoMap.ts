// GENERATED FILE - do not edit by hand.
// Source: demo/shared/photos.json
// Regenerate with: node scripts/sync-demo-assets.mjs

export const photoMap = {
  "ph00": {
    "gradient": [
      "#FF0069",
      "#7638FA"
    ],
    "initials": "LU",
    "seed": 7,
    "shape": "squircle"
  },
  "ph01": {
    "gradient": [
      "#3858FA",
      "#22C55E"
    ],
    "initials": "VA",
    "seed": 12,
    "shape": "circle"
  },
  "ph02": {
    "gradient": [
      "#FFD600",
      "#FF6B00"
    ],
    "initials": "NI",
    "seed": 19,
    "shape": "squircle"
  },
  "ph03": {
    "gradient": [
      "#D300C5",
      "#3858FA"
    ],
    "initials": "SO",
    "seed": 23,
    "shape": "circle"
  },
  "ph04": {
    "gradient": [
      "#22C55E",
      "#3858FA"
    ],
    "initials": "TO",
    "seed": 31,
    "shape": "squircle"
  },
  "ph05": {
    "gradient": [
      "#FF0069",
      "#FFD600"
    ],
    "initials": "JU",
    "seed": 37,
    "shape": "circle"
  },
  "ph06": {
    "gradient": [
      "#7638FA",
      "#FF0069"
    ],
    "initials": "FR",
    "seed": 41,
    "shape": "squircle"
  },
  "ph07": {
    "gradient": [
      "#FF6B00",
      "#D300C5"
    ],
    "initials": "CA",
    "seed": 47,
    "shape": "circle"
  },
  "ph08": {
    "gradient": [
      "#3858FA",
      "#FF0069"
    ],
    "initials": "LE",
    "seed": 53,
    "shape": "squircle"
  },
  "ph09": {
    "gradient": [
      "#22C55E",
      "#FFD600"
    ],
    "initials": "MI",
    "seed": 59,
    "shape": "circle"
  },
  "ph10": {
    "gradient": [
      "#D300C5",
      "#22C55E"
    ],
    "initials": "DE",
    "seed": 67,
    "shape": "squircle"
  }
} as const;

export type PhotoSpec = (typeof photoMap)[keyof typeof photoMap];

export const fallbackPhoto = {
  initials: '?',
  gradient: ['#2A2A33', '#1B1B21'],
  shape: 'squircle',
  seed: 0,
} as const;
