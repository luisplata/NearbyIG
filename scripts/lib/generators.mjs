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

function dartString(value) {
  const escaped = String(value)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\$/g, '\\$')
    .replace(/\r/g, '')
    .replace(/\n/g, '\\n');
  return `'${escaped}'`;
}

function dartInt(value) {
  return String(value);
}

function dartDouble(value) {
  return Number.isInteger(value) ? `${value}.0` : String(value);
}

function dartEnum(enumName, value) {
  return `${enumName}.${value}`;
}

function pascal(key) {
  return String(key).charAt(0).toUpperCase() + String(key).slice(1);
}

function hexColor(value) {
  return String(value).replace('#', '').toUpperCase();
}

function sortedKeys(object) {
  return Object.keys(object).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function tsJson(value) {
  return JSON.stringify(deepSort(value), null, 2);
}

function parseShadow(sheet) {
  const match = /^(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(
    String(sheet).trim(),
  );
  if (!match) {
    throw new Error(`Sombra no soportada: ${sheet}`);
  }
  const [, offsetY, blur, , red, green, blue, alpha] = match;
  const a = Math.round(Number(alpha) * 255);
  const argb = ((a << 24) | (Number(red) << 16) | (Number(green) << 8) | Number(blue)) >>> 0;
  return {
    offsetY: Number(offsetY),
    blur: Number(blur),
    argb: argb.toString(16).toUpperCase().padStart(8, '0'),
  };
}

// --- Dart: tokens ----------------------------------------------------------

export function dartTokensFile(tokens) {
  const lines = [];
  lines.push(banner('design-tokens.json'));
  lines.push("import 'dart:ui' show Color;");
  lines.push('');
  lines.push('/// Tokens de diseño del contrato compartido.');
  lines.push('abstract final class Tokens {');
  for (const key of sortedKeys(tokens.color)) {
    lines.push(`  static const Color color${pascal(key)} = Color(0xFF${hexColor(tokens.color[key])});`);
  }
  lines.push('');
  lines.push(`  static const String fontFamily = ${dartString(tokens.type.family)};`);
  lines.push(
    `  static const List<double> fontSizes = <double>[${tokens.type.sizes.map(dartDouble).join(', ')}];`,
  );
  lines.push(`  static const List<int> fontWeights = <int>[${tokens.type.weights.map(dartInt).join(', ')}];`);
  lines.push(
    `  static const List<double> lineHeights = <double>[${tokens.type.lineHeights
      .map(dartDouble)
      .join(', ')}];`,
  );
  lines.push('');
  lines.push(`  static const List<double> space = <double>[${tokens.space.map(dartDouble).join(', ')}];`);
  lines.push(`  static const List<double> radii = <double>[${tokens.radius.map(dartDouble).join(', ')}];`);
  lines.push('');
  for (const key of sortedKeys(tokens.shadow)) {
    const shadow = parseShadow(tokens.shadow[key]);
    const name = pascal(key);
    lines.push(`  static const double shadow${name}OffsetY = ${dartDouble(shadow.offsetY)};`);
    lines.push(`  static const double shadow${name}Blur = ${dartDouble(shadow.blur)};`);
    lines.push(`  static const Color shadow${name}Color = Color(0x${shadow.argb});`);
  }
  lines.push('');
  for (const key of sortedKeys(tokens.breakpoint)) {
    lines.push(`  static const double breakpoint${pascal(key)} = ${dartDouble(tokens.breakpoint[key])};`);
  }
  lines.push('}');
  return `${lines.join('\n')}\n`;
}

// --- Dart: fixtures -------------------------------------------------------

export function dartFixturesFile(fixtures) {
  const lines = [];
  lines.push(banner('fixtures.json'));
  lines.push(`enum Intention { ${fixtures.filters.intentions.join(', ')} }`);
  lines.push('');
  lines.push(`enum Gender { ${fixtures.filters.genders.join(', ')} }`);
  lines.push('');
  lines.push(`const int kSchemaVersion = ${fixtures.schemaVersion};`);
  lines.push('');

  lines.push('class DemoTimers {');
  lines.push('  const DemoTimers({');
  for (const key of sortedKeys(fixtures.timers)) {
    lines.push(`    required this.${key},`);
  }
  lines.push('  });');
  lines.push('');
  for (const key of sortedKeys(fixtures.timers)) {
    lines.push(`  final int ${key};`);
  }
  lines.push('}');
  lines.push('');
  lines.push('const DemoTimers kTimers = DemoTimers(');
  for (const key of sortedKeys(fixtures.timers)) {
    lines.push(`  ${key}: ${dartInt(fixtures.timers[key])},`);
  }
  lines.push(');');
  lines.push('');

  lines.push('class SelfProfile {');
  lines.push('  const SelfProfile({');
  lines.push('    required this.id,');
  lines.push('    required this.nickname,');
  lines.push('    required this.initials,');
  lines.push('    required this.intention,');
  lines.push('    required this.photoId,');
  lines.push('    required this.instagramHandle,');
  lines.push('    required this.statusKey,');
  lines.push('  });');
  lines.push('');
  lines.push('  final String id;');
  lines.push('  final String nickname;');
  lines.push('  final String initials;');
  lines.push('  final Intention intention;');
  lines.push('  final String photoId;');
  lines.push('  final String instagramHandle;');
  lines.push('  final String statusKey;');
  lines.push('}');
  lines.push('');
  lines.push('const SelfProfile kSelf = SelfProfile(');
  lines.push(`  id: ${dartString(fixtures.self.id)},`);
  lines.push(`  nickname: ${dartString(fixtures.self.nickname)},`);
  lines.push(`  initials: ${dartString(fixtures.self.initials)},`);
  lines.push(`  intention: ${dartEnum('Intention', fixtures.self.intention)},`);
  lines.push(`  photoId: ${dartString(fixtures.self.photoId)},`);
  lines.push(`  instagramHandle: ${dartString(fixtures.self.instagramHandle)},`);
  lines.push(`  statusKey: ${dartString(fixtures.self.statusKey)},`);
  lines.push(');');
  lines.push('');

  lines.push('class Profile {');
  lines.push('  const Profile({');
  for (const field of [
    'id',
    'nickname',
    'initials',
    'intention',
    'gender',
    'verified',
    'online',
    'distanceM',
    'bearingDeg',
    'photoId',
    'instagramHandle',
    'statusKey',
    'bioKey',
  ]) {
    lines.push(`    required this.${field},`);
  }
  lines.push('  });');
  lines.push('');
  lines.push('  final String id;');
  lines.push('  final String nickname;');
  lines.push('  final String initials;');
  lines.push('  final Intention intention;');
  lines.push('  final Gender gender;');
  lines.push('  final bool verified;');
  lines.push('  final bool online;');
  lines.push('  final int distanceM;');
  lines.push('  final int bearingDeg;');
  lines.push('  final String photoId;');
  lines.push('  final String instagramHandle;');
  lines.push('  final String statusKey;');
  lines.push('  final String bioKey;');
  lines.push('}');
  lines.push('');
  lines.push('const List<Profile> kProfiles = <Profile>[');
  for (const profile of fixtures.profiles) {
    lines.push(
      `  Profile(id: ${dartString(profile.id)}, nickname: ${dartString(profile.nickname)}, ` +
        `initials: ${dartString(profile.initials)}, intention: ${dartEnum('Intention', profile.intention)}, ` +
        `gender: ${dartEnum('Gender', profile.gender)}, verified: ${profile.verified}, ` +
        `online: ${profile.online}, distanceM: ${dartInt(profile.distanceM)}, ` +
        `bearingDeg: ${dartInt(profile.bearingDeg)}, photoId: ${dartString(profile.photoId)}, ` +
        `instagramHandle: ${dartString(profile.instagramHandle)}, statusKey: ${dartString(profile.statusKey)}, ` +
        `bioKey: ${dartString(profile.bioKey)}),`,
    );
  }
  lines.push('];');
  lines.push('');

  lines.push('class DemoScript {');
  lines.push('  const DemoScript({');
  lines.push('    required this.firstPingTargetId,');
  lines.push('    required this.incomingPingFromId,');
  lines.push('    required this.matchProfileId,');
  lines.push('    required this.chatReplies,');
  lines.push('    required this.fallbackReplyKey,');
  lines.push('  });');
  lines.push('');
  lines.push('  final String firstPingTargetId;');
  lines.push('  final String incomingPingFromId;');
  lines.push('  final String matchProfileId;');
  lines.push('  final Map<String, List<String>> chatReplies;');
  lines.push('  final String fallbackReplyKey;');
  lines.push('}');
  lines.push('');
  lines.push('const DemoScript kScript = DemoScript(');
  lines.push(`  firstPingTargetId: ${dartString(fixtures.script.firstPingTargetId)},`);
  lines.push(`  incomingPingFromId: ${dartString(fixtures.script.incomingPingFromId)},`);
  lines.push(`  matchProfileId: ${dartString(fixtures.script.matchProfileId)},`);
  lines.push('  chatReplies: <String, List<String>>{');
  for (const key of sortedKeys(fixtures.script.chatReplies)) {
    const replies = fixtures.script.chatReplies[key].map(dartString).join(', ');
    lines.push(`    ${dartString(key)}: <String>[${replies}],`);
  }
  lines.push('  },');
  lines.push(`  fallbackReplyKey: ${dartString(fixtures.script.fallbackReplyKey)},`);
  lines.push(');');
  lines.push('');

  lines.push('class DemoFilters {');
  lines.push('  const DemoFilters({');
  lines.push('    required this.radiiM,');
  lines.push('    required this.defaultRadiusM,');
  lines.push('    required this.intentions,');
  lines.push('    required this.genders,');
  lines.push('  });');
  lines.push('');
  lines.push('  final List<int> radiiM;');
  lines.push('  final int defaultRadiusM;');
  lines.push('  final List<Intention> intentions;');
  lines.push('  final List<Gender> genders;');
  lines.push('}');
  lines.push('');
  lines.push('const DemoFilters kFilters = DemoFilters(');
  lines.push(`  radiiM: <int>[${fixtures.filters.radiiM.map(dartInt).join(', ')}],`);
  lines.push(`  defaultRadiusM: ${dartInt(fixtures.filters.defaultRadiusM)},`);
  lines.push(
    `  intentions: <Intention>[${fixtures.filters.intentions
      .map((value) => dartEnum('Intention', value))
      .join(', ')}],`,
  );
  lines.push(
    `  genders: <Gender>[${fixtures.filters.genders.map((value) => dartEnum('Gender', value)).join(', ')}],`,
  );
  lines.push(');');
  lines.push('');
  lines.push(`const List<String> kReportReasons = <String>[${fixtures.reportReasons.map(dartString).join(', ')}];`);
  lines.push('');

  lines.push('class MapStreet {');
  lines.push('  const MapStreet({');
  lines.push('    required this.x1,');
  lines.push('    required this.y1,');
  lines.push('    required this.x2,');
  lines.push('    required this.y2,');
  lines.push('    required this.weight,');
  lines.push('  });');
  lines.push('');
  lines.push('  final double x1;');
  lines.push('  final double y1;');
  lines.push('  final double x2;');
  lines.push('  final double y2;');
  lines.push('  final double weight;');
  lines.push('}');
  lines.push('');
  lines.push('class MapBlock {');
  lines.push('  const MapBlock({');
  lines.push('    required this.x,');
  lines.push('    required this.y,');
  lines.push('    required this.w,');
  lines.push('    required this.h,');
  lines.push('    required this.radius,');
  lines.push('  });');
  lines.push('');
  lines.push('  final double x;');
  lines.push('  final double y;');
  lines.push('  final double w;');
  lines.push('  final double h;');
  lines.push('  final double radius;');
  lines.push('}');
  lines.push('');
  lines.push('class MapLabel {');
  lines.push('  const MapLabel({required this.x, required this.y, required this.copyKey});');
  lines.push('');
  lines.push('  final double x;');
  lines.push('  final double y;');
  lines.push('  final String copyKey;');
  lines.push('}');
  lines.push('');
  lines.push('class MapDecor {');
  lines.push('  const MapDecor({required this.streets, required this.blocks, required this.labels});');
  lines.push('');
  lines.push('  final List<MapStreet> streets;');
  lines.push('  final List<MapBlock> blocks;');
  lines.push('  final List<MapLabel> labels;');
  lines.push('}');
  lines.push('');
  lines.push('const MapDecor kMapDecor = MapDecor(');
  lines.push('  streets: <MapStreet>[');
  for (const street of fixtures.mapDecor.streets) {
    lines.push(
      `    MapStreet(x1: ${dartDouble(street.x1)}, y1: ${dartDouble(street.y1)}, ` +
        `x2: ${dartDouble(street.x2)}, y2: ${dartDouble(street.y2)}, weight: ${dartDouble(street.weight)}),`,
    );
  }
  lines.push('  ],');
  lines.push('  blocks: <MapBlock>[');
  for (const block of fixtures.mapDecor.blocks) {
    lines.push(
      `    MapBlock(x: ${dartDouble(block.x)}, y: ${dartDouble(block.y)}, w: ${dartDouble(block.w)}, ` +
        `h: ${dartDouble(block.h)}, radius: ${dartDouble(block.radius)}),`,
    );
  }
  lines.push('  ],');
  lines.push('  labels: <MapLabel>[');
  for (const label of fixtures.mapDecor.labels) {
    lines.push(
      `    MapLabel(x: ${dartDouble(label.x)}, y: ${dartDouble(label.y)}, copyKey: ${dartString(label.copyKey)}),`,
    );
  }
  lines.push('  ],');
  lines.push(');');
  return `${lines.join('\n')}\n`;
}

// --- Dart: copy -----------------------------------------------------------

export function dartCopyFile(copy) {
  const lines = [];
  lines.push(banner('copy.json'));
  lines.push('const Map<String, String> kCopy = <String, String>{');
  for (const key of sortedKeys(copy)) {
    lines.push(`  ${dartString(key)}: ${dartString(copy[key])},`);
  }
  lines.push('};');
  lines.push('');
  lines.push('/// Texto del catálogo con interpolación de `{clave}`.');
  lines.push('String fmt(String key, [Map<String, String> params = const <String, String>{}]) {');
  lines.push('  final raw = kCopy[key];');
  lines.push('  if (raw == null) {');
  lines.push("    return '[' + key + ']';");
  lines.push('  }');
  lines.push('  var out = raw;');
  lines.push('  for (final entry in params.entries) {');
  lines.push("    out = out.replaceAll('{' + entry.key + '}', entry.value);");
  lines.push('  }');
  lines.push('  return out;');
  lines.push('}');
  return `${lines.join('\n')}\n`;
}

// --- Dart: photo map ------------------------------------------------------

export function dartPhotoMapFile(photos) {
  const lines = [];
  lines.push(banner('photos.json'));
  lines.push('class PhotoSpec {');
  lines.push('  const PhotoSpec({');
  lines.push('    required this.initials,');
  lines.push('    required this.gradientStart,');
  lines.push('    required this.gradientEnd,');
  lines.push('    required this.shape,');
  lines.push('    required this.seed,');
  lines.push('  });');
  lines.push('');
  lines.push('  final String initials;');
  lines.push('  final String gradientStart;');
  lines.push('  final String gradientEnd;');
  lines.push("  final String shape; // 'circle' | 'squircle'");
  lines.push('  final int seed;');
  lines.push('}');
  lines.push('');
  lines.push('const Map<String, PhotoSpec> kPhotoMap = <String, PhotoSpec>{');
  for (const key of sortedKeys(photos)) {
    const spec = photos[key];
    lines.push(
      `  ${dartString(key)}: PhotoSpec(initials: ${dartString(spec.initials)}, ` +
        `gradientStart: ${dartString(spec.gradient[0])}, gradientEnd: ${dartString(spec.gradient[1])}, ` +
        `shape: ${dartString(spec.shape)}, seed: ${dartInt(spec.seed)}),`,
    );
  }
  lines.push('};');
  lines.push('');
  lines.push('/// Fallback determinista si un `photoId` no existe (la validación lo impide).');
  lines.push('const PhotoSpec kFallbackPhoto = PhotoSpec(');
  lines.push("  initials: '?',");
  lines.push("  gradientStart: '#2A2A33',");
  lines.push("  gradientEnd: '#1B1B21',");
  lines.push("  shape: 'squircle',");
  lines.push('  seed: 0,');
  lines.push(');');
  return `${lines.join('\n')}\n`;
}

// --- Dart: dataset --------------------------------------------------------

export function dartDatasetFile(datasetId, schemaVersion) {
  const lines = [];
  lines.push(banner('fixtures.json + copy.json + design-tokens.json + photos.json'));
  lines.push('/// Identificador estable derivado del contenido del contrato.');
  lines.push('/// Debe coincidir con el de la landing y con el de la demo Expo.');
  lines.push(`const String kDatasetId = ${dartString(datasetId)};`);
  lines.push('');
  lines.push(`const int kDatasetSchemaVersion = ${dartInt(schemaVersion)};`);
  return `${lines.join('\n')}\n`;
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

export function tsDatasetFile(datasetId, schemaVersion) {
  return (
    banner('fixtures.json + copy.json + design-tokens.json + photos.json') +
    'export const datasetId = ' +
    JSON.stringify(datasetId) +
    ';\n' +
    'export const schemaVersion = ' +
    JSON.stringify(schemaVersion) +
    ';\n'
  );
}

export function landingDatasetJs(datasetId, schemaVersion) {
  return (
    banner('fixtures.json + copy.json + design-tokens.json + photos.json') +
    'window.NEARBYIG_DATASET = Object.freeze({\n' +
    `  datasetId: ${JSON.stringify(datasetId)},\n` +
    `  schemaVersion: ${JSON.stringify(schemaVersion)},\n` +
    '});\n'
  );
}

/**
 * Todos los generados, por target. El sync escribe sólo los targets que existen.
 */
export function buildGeneratedFiles({ fixtures, copy, tokens, photos, datasetId }) {
  return {
    flutter: {
      'lib/generated/tokens.dart': dartTokensFile(tokens),
      'lib/generated/fixtures.dart': dartFixturesFile(fixtures),
      'lib/generated/copy.dart': dartCopyFile(copy),
      'lib/generated/photo_map.dart': dartPhotoMapFile(photos),
      'lib/generated/dataset.dart': dartDatasetFile(datasetId, fixtures.schemaVersion),
    },
    expo: {
      'src/generated/tokens.ts': tsTokensFile(tokens),
      'src/generated/fixtures.ts': tsFixturesFile(fixtures),
      'src/generated/copy.ts': tsCopyFile(copy),
      'src/generated/photoMap.ts': tsPhotoMapFile(photos),
      'src/generated/dataset.ts': tsDatasetFile(datasetId, fixtures.schemaVersion),
    },
    landing: {
      'generated/dataset.js': landingDatasetJs(datasetId, fixtures.schemaVersion),
    },
  };
}
