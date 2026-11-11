import { createHash } from 'node:crypto';

/**
 * Serializa un valor a JSON canónico: claves ordenadas, sin espacios, números
 * normalizados y sin `undefined`. Dos estructuras equivalentes producen exactamente
 * los mismos bytes, sin importar el orden de las claves de entrada.
 */
export function canonicalize(value) {
  return encode(value, '');
}

function encode(value, path) {
  if (value === null) return 'null';

  const type = typeof value;
  if (type === 'boolean') return value ? 'true' : 'false';
  if (type === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`Número no finito en ${path || '<root>'}`);
    }
    if (Object.is(value, -0)) return '0';
    return String(value);
  }
  if (type === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    const items = value.map((item, index) => encode(item, `${path}[${index}]`));
    return `[${items.join(',')}]`;
  }
  if (type === 'object') {
    const keys = Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const entries = keys.map((key) => `${JSON.stringify(key)}:${encode(value[key], `${path}.${key}`)}`);
    return `{${entries.join(',')}}`;
  }
  throw new Error(`Valor no serializable (${type}) en ${path || '<root>'}`);
}

export function sha256Hex(input) {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * datasetId estable derivado del contenido del contrato. No se persiste en los JSON
 * fuente: se recalcula en cada sync.
 */
export function datasetBasis({ fixtures, copy, designTokens, photos }) {
  return canonicalize({ copy, designTokens, fixtures, photos });
}

export function datasetIdFromBasis(basis) {
  return `ds-${sha256Hex(basis).slice(0, 8)}`;
}

export function datasetIdOf(inputs) {
  return datasetIdFromBasis(datasetBasis(inputs));
}

/** Ordena recursivamente las claves de un objeto (para emitir JSON estable). */
export function deepSort(value) {
  if (Array.isArray(value)) return value.map(deepSort);
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
      out[key] = deepSort(value[key]);
    }
    return out;
  }
  return value;
}
