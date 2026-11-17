import { deepSort } from './canonical.mjs';

/**
 * Emisores del contrato hacia las apps. Todas las salidas son byte-estables:
 * LF, claves ordenadas, sin timestamps y sin rutas absolutas.
 */

const BANNER = '// GENERATED FILE - do not edit by hand.';

function banner(source) {
  return `${BANNER}\n// Source: demo/shared/${source}\n// Regenerate with: node scripts/sync-demo-assets.mjs\n\n`;
}

// --- helpers de formato ----------------------------------------------------

function sortedKeys(object) {
  return Object.keys(object).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function tsJson(value) {
  return JSON.stringify(deepSort(value), null, 2);
}

// --- TypeScript -----------------------------------------------------------

export function tsTokensFile(tokens) {
  return (
    banner('design-tokens.json') +
    'export const tokens = ' +
    tsJson(tokens) +
    ' as const;\n\nexport type ColorToken = keyof typeof tokens.color;\nexport type FontSize = (typeof tokens.type.sizes)[number];\n'
  );
}

export function tsFixturesFile(fixtures) {
  return (
    banner('fixtures.json') +
    'export const fixtures = ' +
    tsJson(fixtures) +
    ' as const;\n\n' +
    'export type Intention = (typeof fixtures.filters.intentions)[number];\n' +
    'export type Gender = (typeof fixtures.filters.genders)[number];\n' +
    'export type Profile = (typeof fixtures.profiles)[number];\n' +
    'export type DemoTimers = typeof fixtures.timers;\n'
  );
}

export function tsCopyFile(copy) {
  return (
    banner('copy.json') +
    'export const copy = ' +
    tsJson(copy) +
    ' as const;\n\n' +
    'export type CopyKey = keyof typeof copy;\n\n' +
    'export function fmt(key: CopyKey | string, params: Record<string, string> = {}): string {\n' +
    '  const raw = (copy as unknown as Record<string, string>)[key];\n' +
    '  if (raw === undefined) {\n' +
    '    return `[${key}]`;\n' +
    '  }\n' +
    '  let out = raw;\n' +
    '  for (const [name, value] of Object.entries(params)) {\n' +
    '    out = out.split(`{${name}}`).join(value);\n' +
    '  }\n' +
    '  return out;\n' +
    '}\n'
  );
}

export function tsPhotoMapFile(photos) {
  return (
    banner('photos.json') +
    'export const photoMap = ' +
    tsJson(photos) +
    ' as const;\n\n' +
    'export type PhotoSpec = (typeof photoMap)[keyof typeof photoMap];\n\n' +
    'export const fallbackPhoto = {\n' +
    "  initials: '?',\n" +
    "  gradient: ['#2A2A33', '#1B1B21'],\n" +
    "  shape: 'squircle',\n" +
    '  seed: 0,\n' +
    '} as const;\n'
  );
}

export function tsDatasetFile(datasetId, schemaVersion, demoVersion) {
  return (
    banner('fixtures.json + copy.json + design-tokens.json + photos.json') +
    'export const datasetId = ' +
    JSON.stringify(datasetId) +
    ';\n' +
    'export const schemaVersion = ' +
    JSON.stringify(schemaVersion) +
    ';\n\n' +
    '/** Versión del repo (package.json); se muestra en "Acerca de". */\n' +
    'export const demoVersion = ' +
    JSON.stringify(demoVersion) +
    ';\n'
  );
}

function kebab(key) {
  return String(key).replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/**
 * Variables CSS de la landing. Así la página no duplica la paleta ni las
 * escalas: el único origen sigue siendo `design-tokens.json`.
 */
export function landingTokensCss(tokens) {
  const lines = [];
  lines.push('/* GENERATED FILE - do not edit by hand. */');
  lines.push('/* Source: demo/shared/design-tokens.json */');
  lines.push('/* Regenerate with: node scripts/sync-demo-assets.mjs */');
  lines.push('');
  lines.push(':root {');
  for (const key of sortedKeys(tokens.color)) {
    lines.push(`  --color-${kebab(key)}: ${tokens.color[key]};`);
  }
  lines.push(`  --font-family: '${tokens.type.family}', system-ui, sans-serif;`);
  tokens.type.sizes.forEach((size, index) => {
    lines.push(`  --font-size-${index + 1}: ${size}px;`);
  });
  tokens.type.lineHeights.forEach((height, index) => {
    lines.push(`  --line-height-${index + 1}: ${height};`);
  });
  tokens.space.forEach((value, index) => {
    lines.push(`  --space-${index + 1}: ${value}px;`);
  });
  tokens.radius.forEach((value, index) => {
    lines.push(`  --radius-${index + 1}: ${value}px;`);
  });
  lines.push(`  --frame-max: ${tokens.breakpoint.frameMax}px;`);
  lines.push(`  --breakpoint-wide: ${tokens.breakpoint.wide}px;`);
  lines.push(`  --breakpoint-min: ${tokens.breakpoint.min}px;`);
  lines.push('}');
  return `${lines.join('\n')}\n`;
}

/**
 * La landing consume el datasetId, el schemaVersion y el catálogo de copy desde
 * el contrato: no hay strings visibles hardcodeados en el HTML.
 */
export function landingDatasetJs(datasetId, schemaVersion, copy) {
  return (
    banner('fixtures.json + copy.json + design-tokens.json + photos.json') +
    'window.NEARBYIG_DATASET = Object.freeze({\n' +
    `  datasetId: ${JSON.stringify(datasetId)},\n` +
    `  schemaVersion: ${JSON.stringify(schemaVersion)},\n` +
    `  copy: Object.freeze(${JSON.stringify(deepSort(copy), null, 2)}),\n` +
    '});\n'
  );
}

/**
 * Todos los generados, por target. El sync escribe sólo los targets que existen.
 */
export function buildGeneratedFiles({ fixtures, copy, tokens, photos, datasetId, demoVersion }) {
  return {
    expo: {
      'src/generated/tokens.ts': tsTokensFile(tokens),
      'src/generated/fixtures.ts': tsFixturesFile(fixtures),
      'src/generated/copy.ts': tsCopyFile(copy),
      'src/generated/photoMap.ts': tsPhotoMapFile(photos),
      'src/generated/dataset.ts': tsDatasetFile(datasetId, fixtures.schemaVersion, demoVersion),
    },
    landing: {
      'generated/dataset.js': landingDatasetJs(datasetId, fixtures.schemaVersion, copy),
      'generated/tokens.css': landingTokensCss(tokens),
    },
  };
}
