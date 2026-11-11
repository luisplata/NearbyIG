/**
 * Lista única de archivos y contenido prohibidos en el repositorio y, sobre todo, en el
 * artefacto que se publica en GitHub Pages. La usan `sync-demo-assets.mjs` (al copiar a
 * las apps) y `assemble-site.mjs` (al ensamblar y auditar `site/`).
 */

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

export const FORBIDDEN_HOSTS = [
  { label: 'gstatic.com', pattern: /gstatic\.com/i },
  { label: 'googleapis.com', pattern: /googleapis\.com/i },
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

/** Devuelve `{ label, match }` para cada host o secreto encontrado en `text`. */
export function scanText(text, { hosts = true, secrets = true } = {}) {
  const findings = [];
  if (hosts) {
    for (const rule of FORBIDDEN_HOSTS) {
      const match = rule.pattern.exec(text);
      if (match) findings.push({ kind: 'host', label: rule.label, match: match[0].slice(0, 120) });
    }
  }
  if (secrets) {
    for (const rule of SECRET_PATTERNS) {
      const match = rule.pattern.exec(text);
      if (match) findings.push({ kind: 'secret', label: rule.label, match: match[0].slice(0, 120) });
    }
  }
  return findings;
}
