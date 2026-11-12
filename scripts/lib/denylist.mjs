/**
 * Lista única de archivos y contenido prohibidos en el repositorio y, sobre todo, en el
 * artefacto que se publica en GitHub Pages. La usan `sync-demo-assets.mjs` (al copiar a
 * las apps) y `assemble-site.mjs` (al ensamblar y auditar `site/`).
 */

import { scanRequestHosts } from './request-hosts.mjs';

export const DENIED_EXTENSIONS = ['.zip', '.keystore', '.jks', '.p12', '.pem', '.map'];

export const DENIED_BASENAMES = [
  { pattern: /^\.env$/i, label: '.env' },
  { pattern: /^\.env\..+$/i, label: '.env.*' },
  { pattern: /^google-services\.json$/i, label: 'google-services.json' },
  { pattern: /^googleservice-info\.plist$/i, label: 'GoogleService-Info.plist' },
  { pattern: /^firebase.*\.json$/i, label: 'firebase*.json' },
];

export const DENIED_DIRECTORIES = ['node_modules'];

/** Extensiones que se escanean como texto en el artefacto. */
export const TEXT_EXTENSIONS = [
  '.html',
  '.htm',
  '.js',
  '.mjs',
  '.cjs',
  '.css',
  '.json',
  '.svg',
  '.xml',
  '.txt',
  '.dart',
  '.ts',
  '.tsx',
  '.webmanifest',
];

/**
 * Fallbacks del **loader del engine de Flutter**. No son requests de la app: el
 * build usa CanvasKit local (`canvasKitBaseUrl` en `index.html`) y la fuente Inter
 * va bundleada, así que estas cadenas sólo se materializarían si esa configuración
 * se perdiera. Se permiten únicamente las **formas exactas** que el engine embebe
 * como default y sólo dentro de los archivos de framework (ver
 * `FLUTTER_FRAMEWORK_FILE`); una URL real con ese host y un path distinto —o el
 * mismo host en cualquier otro archivo— sigue siendo un ofensor.
 */
export const FLUTTER_LOADER_FALLBACK_PATTERNS = [
  {
    label: 'canvasKitBaseUrl default',
    // Dos formas reales: el loader embebe el prefijo solo
    // (`I("https://www.gstatic.com/flutter-canvaskit", engineRevision)`) y el
    // engine embebe el default ya resuelto con la revisión de 40 hex. Ninguna es
    // un pedido de la app: `canvasKitBaseUrl` apunta a `canvaskit/` local.
    pattern: /https:\/\/www\.gstatic\.com\/flutter-canvaskit(?:\/[0-9a-f]{40}\/|(?=["'`]))/g,
  },
  {
    label: 'fontFallbackBaseUrl default',
    // Default de `fontFallbackBaseUrl`: la cadena termina ahí (`".../s/"`). Un
    // pedido real (p. ej. `.../s/inter/v13/x.woff2`) no coincide y falla el gate.
    pattern: /https:\/\/fonts\.gstatic\.com\/s\/(?=["'`])/g,
  },
];

/** Archivos del engine/loader de Flutter donde viven esos fallbacks. */
const FLUTTER_FRAMEWORK_FILE =
  /^(?:main\.dart\.js|flutter(?:\.js|_bootstrap\.js|_service_worker\.js))$/i;

/**
 * Código muerto de **Expo Go** embebido por `expo-asset` en el bundle web
 * (`AssetSources.js` → `if (NativeModules['ExponentKernel'])`). `ExponentKernel`
 * sólo existe dentro del cliente nativo de Expo Go: en web la rama nunca se
 * ejecuta, así que la URL no es un request de la app. Se permite únicamente la
 * forma exacta (prefijo de template literal con `${`) y sólo en el bundle web de
 * Expo; cualquier otro uso de `eascdn.net` bloquea el artefacto.
 */
export const EXPO_GO_DEAD_CODE = {
  label: 'expo-go classic-assets',
  path: /(?:^|\/)expo\/_expo\/static\/js\/web\/[\w.-]+\.js$/i,
  pattern: /https:\/\/classic-assets\.eascdn\.net\/~assets\/\$\{/g,
};

/**
 * Links de atribución y logo que MapLibre embebe **en su propio bundle** como
 * valores por defecto de controles que la demo nunca agrega:
 * `attributionControl: false` y `maplibreLogo: false`. No son pedidos de red:
 * son `href` de anchors que jamás se montan. Se recortan sólo esas dos formas
 * exactas y sólo en el chunk de MapLibre; un `href` a ese host en cualquier otro
 * archivo (o en el resto del chunk) sigue bloqueando el artefacto.
 */
export const MAPLIBRE_DEAD_CODE = {
  label: 'maplibre attribution/logo links',
  path: /(?:^|\/)expo\/_expo\/static\/js\/web\/maplibre-gl-[\w.-]+\.js$/i,
  patterns: [
    /customAttribution:"<a href=\\"https:\/\/maplibre\.org\/\\" target=\\"_blank\\">MapLibre<\/a>"/g,
    /\.href="https:\/\/maplibre\.org\/"/g,
  ],
};

/**
 * Quita sólo las formas exactas conocidas cuando `relativePath` corresponde al
 * archivo donde el framework las embebe. Devuelve el texto tal cual en cualquier
 * otro caso.
 */
export function stripKnownDeadCode(relativePath, text) {
  const posix = toPosix(relativePath);
  const base = posix.split('/').pop() ?? posix;
  let out = text;
  if (FLUTTER_FRAMEWORK_FILE.test(base)) {
    for (const entry of FLUTTER_LOADER_FALLBACK_PATTERNS) {
      out = out.replace(entry.pattern, '');
    }
  }
  if (EXPO_GO_DEAD_CODE.path.test(posix)) {
    out = out.replace(EXPO_GO_DEAD_CODE.pattern, '');
  }
  if (MAPLIBRE_DEAD_CODE.path.test(posix)) {
    for (const pattern of MAPLIBRE_DEAD_CODE.patterns) {
      out = out.replace(pattern, '');
    }
  }
  return out;
}

export const FORBIDDEN_HOSTS = [
  { label: 'gstatic.com', pattern: /gstatic\.com/i },
  { label: 'googleapis.com', pattern: /googleapis\.com/i },
  { label: 'eascdn.net', pattern: /eascdn\.net/i },
  { label: 'firebase', pattern: /\bfirebase[a-z0-9-]*\.(?:com|io|app)\b/i },
  { label: 'unsplash.com', pattern: /unsplash\.com/i },
  { label: 'instagram.com', pattern: /instagram\.com/i },
  { label: 'facebook.com', pattern: /facebook\.com/i },
  { label: 'cdn.*', pattern: /\bcdn\.[a-z0-9-]+\.[a-z]{2,}/i },
];

export const SECRET_PATTERNS = [
  { label: 'Google API key', pattern: /AIza[0-9A-Za-z_-]{35}/ },
  { label: 'private key block', pattern: /BEGIN [A-Z ]*PRIVATE KEY/ },
  { label: 'firebase private_key_id', pattern: /"private_key_id"/ },
  { label: 'firebase client_email', pattern: /"client_email"\s*:/ },
  { label: 'client_secret', pattern: /client_secret/i },
  { label: 'apiKey literal', pattern: /\bapiKey\s*[:=]\s*["'][^"']{8,}["']/i },
];

export function toPosix(relativePath) {
  return String(relativePath).replace(/\\/g, '/');
}

/**
 * Devuelve la etiqueta de la regla que prohíbe `relativePath`, o `null` si está
 * permitido. Case-insensitive y por nombre y extensión.
 */
export function deniedReason(relativePath) {
  const posix = toPosix(relativePath);
  const segments = posix.split('/').filter(Boolean);
  for (const segment of segments) {
    if (DENIED_DIRECTORIES.includes(segment.toLowerCase())) {
      return `directorio ${segment}`;
    }
  }

  const base = segments.length > 0 ? segments[segments.length - 1] : posix;
  const lower = base.toLowerCase();

  for (const rule of DENIED_BASENAMES) {
    if (rule.pattern.test(base)) return rule.label;
  }

  for (const extension of DENIED_EXTENSIONS) {
    if (lower.endsWith(extension)) return `*${extension}`;
  }

  return null;
}

export function isTextFile(fileName) {
  const lower = String(fileName).toLowerCase();
  return TEXT_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

/**
 * Devuelve `{ findings, occurrences }` para cada host o secreto encontrado en
 * `text`. Los secretos se escanean siempre sobre el texto original; los hosts
 * ignoran las formas exactas de código muerto conocidas cuando se pasa `path`
 * (ver `stripKnownDeadCode`) y después aplican la regla posicional de
 * `request-hosts.mjs`.
 *
 * Un host ya prohibido por `FORBIDDEN_HOSTS` no se repite como `request-host`:
 * la prohibición incondicional gana y el finding queda con su etiqueta propia.
 * `occurrences` son las apariciones del host permitido en posición pedible.
 */
export function auditText(text, { hosts = true, secrets = true, path = '' } = {}) {
  const findings = [];
  let occurrences = [];
  if (hosts) {
    const hostText = path ? stripKnownDeadCode(path, text) : text;
    for (const rule of FORBIDDEN_HOSTS) {
      const match = rule.pattern.exec(hostText);
      if (match) findings.push({ kind: 'host', label: rule.label, match: match[0].slice(0, 120) });
    }
    const positional = scanRequestHosts(hostText);
    for (const finding of positional.findings) {
      if (FORBIDDEN_HOSTS.some((rule) => rule.pattern.test(finding.label))) continue;
      findings.push(finding);
    }
    occurrences = positional.occurrences;
  }
  if (secrets) {
    for (const rule of SECRET_PATTERNS) {
      const match = rule.pattern.exec(text);
      if (match) findings.push({ kind: 'secret', label: rule.label, match: match[0].slice(0, 120) });
    }
  }
  return { findings, occurrences };
}

/** Compatibilidad: sólo los findings, en el orden de siempre. */
export function scanText(text, options = {}) {
  return auditText(text, options).findings;
}
