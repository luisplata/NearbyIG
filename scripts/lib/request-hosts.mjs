/**
 * Regla **posicional** de hosts del artefacto.
 *
 * El artefacto publicado tiene literales de host que no son pedidos (namespaces
 * `xmlns`, licencias, enlaces en mensajes de error de las librerías). Negar todo
 * host que no sea el permitido es inviable; lo que sí se puede garantizar es que
 * **un único host sea pedible**:
 *
 *  1. `ALLOWED_REQUEST_HOSTS` — la lista blanca de hosts que pueden aparecer en
 *     posición pedible. Es el conjunto exacto que exige `assemble-site --strict`.
 *  2. `BENIGN_TEXT_HOSTS` — hosts reales del artefacto que sólo se toleran en
 *     posición **no** pedible. Cada entrada lleva su `reason` escrita: agregar un
 *     host sin justificar es un error de proceso (lo cubre el test de datos).
 *  3. Cualquier otro host es un finding, esté donde esté (conservador: obliga a
 *     revisarlo y a documentar la decisión).
 *
 * Comparación literal, sin sufijos: `demotiles.maplibre.org` no es `maplibre.org`
 * y el host de un segundo proveedor de tiles no se cuela por ser subdominio.
 */

/** Hosts que el artefacto puede pedir. Exactamente este conjunto. */
export const ALLOWED_REQUEST_HOSTS = ['tiles.openfreemap.org'];

/**
 * Hosts que aparecen en el artefacto real y que **no** son pedidos: namespaces
 * XML/SVG, texto de licencia y enlaces dentro de mensajes de error. Se toleran
 * sólo fuera de posición pedible; en `src=`, `fetch(`, `url(`, etc. fallan.
 */
export const BENIGN_TEXT_HOSTS = [
  { host: 'www.w3.org', reason: 'namespace xmlns de SVG/XML (icon.svg) y del template HTML' },
  { host: 'github.com', reason: 'copyright de la licencia OFL de la tipografía Inter' },
  { host: 'scripts.sil.org', reason: 'FAQ de la licencia OFL en assets/fonts/OFL.txt' },
  { host: 'necolas.github.io', reason: 'comentario del style reset de react-native-web en expo/index.html' },
  { host: 'react.dev', reason: 'enlace al catálogo de errores de React en el bundle (mensaje)' },
  { host: 'expo.dev', reason: 'default del dev server de Expo y enlaces de error, nunca en el artefacto' },
  { host: 'api.flutter.dev', reason: 'enlace a la documentación dentro de un mensaje de assert de Flutter' },
  { host: 'docs.flutter.dev', reason: 'enlace a la documentación dentro de un mensaje de assert de Flutter' },
  { host: 'flutter.dev', reason: 'enlace a la documentación dentro de un mensaje de assert de Flutter' },
  { host: 'pub.dev', reason: 'enlace a la ficha del paquete dentro de un mensaje de assert de Flutter' },
  { host: 'maplibre.org', reason: 'enlaces de documentación en los mensajes de error de MapLibre' },
  { host: 'maplibre.invalid', reason: 'base ficticia de MapLibre para normalizar atributos DOM (TLD .invalid)' },
  { host: 'wiki.openstreetmap.org', reason: 'enlace dentro del mensaje de error de WebGL2 de MapLibre' },
];

/**
 * Formas que convierten un literal de URL en un request (o en un recurso
 * cargado por el navegador). Se evalúan contra los 40 caracteres anteriores a la
 * URL, que es donde vive la clave o el atributo en JS, CSS y HTML minificados.
 *
 * `id` existe para nombrar el caso en los tests por forma, no por posición.
 */
export const REQUEST_POSITION = [
  { id: 'fetch', pattern: /(?:fetch|import|new\s+Worker|new\s+Image)\s*\(\s*[`"']?$/i },
  { id: 'attribute', pattern: /(?:src|href|poster|srcset|xlink:href)\s*[:=]\s*["']?$/i },
  { id: 'css-url', pattern: /\burl\(\s*["']?$/i },
  { id: 'css-import', pattern: /@import\s+["']?$/i },
  { id: 'map-key', pattern: /\b(?:style|tiles|sprite|glyphs|url)\s*:\s*["']?$/i },
];

/** Ventana de contexto previo a la URL (minificado: `url:"` entra sin problema). */
const CONTEXT_WINDOW = 40;

/** `https://host/...` (sin soportar IPs ni puertos: no existen en el artefacto). */
const URL_RE = /\bhttps?:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi;

const BENIGN = new Set(BENIGN_TEXT_HOSTS.map((entry) => entry.host));

function isRequestPosition(context) {
  return REQUEST_POSITION.some((rule) => rule.pattern.test(context));
}

/**
 * Clasifica cada URL absoluta de `text`.
 *
 * - host permitido: se registra en `occurrences` (sólo si está en posición
 *   pedible, que es lo que después exige `--strict`).
 * - host benigno: tolerado fuera de posición pedible; en posición pedible es
 *   un `request-host`.
 * - cualquier otro host: `request-host` siempre.
 *
 * @param {string} text
 * @returns {{ findings: Array<{kind: string, label: string, match: string}>, occurrences: string[] }}
 */
export function scanRequestHosts(text) {
  const findings = [];
  const occurrences = [];
  if (typeof text !== 'string' || text.length === 0) return { findings, occurrences };

  for (const match of text.matchAll(URL_RE)) {
    const host = match[1].toLowerCase();
    const index = match.index ?? 0;
    const context = text.slice(Math.max(0, index - CONTEXT_WINDOW), index);
    const request = isRequestPosition(context);

    if (ALLOWED_REQUEST_HOSTS.includes(host)) {
      if (request) occurrences.push(host);
      continue;
    }

    if (BENIGN.has(host) && !request) continue;

    findings.push({ kind: 'request-host', label: host, match: match[0].slice(0, 120) });
  }

  return { findings, occurrences };
}

/**
 * Compara el conjunto de hosts observados con la allowlist. `--strict` exige
 * igualdad exacta: ni falta el host del basemap ni sobra un segundo host.
 */
export function compareHostSets(observed, allowed = ALLOWED_REQUEST_HOSTS) {
  const seen = new Set(observed);
  return {
    missing: allowed.filter((host) => !seen.has(host)),
    extra: [...seen].filter((host) => !allowed.includes(host)).sort(),
  };
}
