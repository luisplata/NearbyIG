/**
 * Carga y resuelve el contrato OpenAPI repartido en `contract/`.
 *
 * El documento se escribe en varios archivos (`openapi.yaml`, `paths/*.yaml`,
 * `schemas/*.yaml`) para que un PR pueda tocar una sola ruta sin reescribir la
 * raíz. Este módulo junta todo en un objeto único y **resuelve todos los `$ref`
 * en memoria**: después de `loadSpec()` no queda ningún `$ref` sin expandir.
 *
 * Eso es lo que hace determinista al `x-contract-id`: el hash se calcula sobre
 * la semántica resuelta, así que renombrar un archivo no cambia el id, pero
 * cambiar un tipo sí.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse } from 'yaml';

import { canonicalize, sha256Hex } from '../../../scripts/lib/canonical.mjs';

export const CONTRACT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SPEC_FILE = resolve(CONTRACT_ROOT, 'openapi.yaml');
export const REDOCLY_CONFIG = resolve(CONTRACT_ROOT, 'redocly.yaml');

/** Métodos HTTP que cuentan como operation al recorrer un path item. */
export const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];

/** Placeholder con el que se calcula el hash: el id no puede depender de sí mismo. */
export const CONTRACT_ID_PLACEHOLDER = 'pending';
export const CONTRACT_ID_PATTERN = /^[0-9a-f]{12}$/;

const cache = new Map();

/** Lee un YAML del contrato (con cache por ruta, para no parsear dos veces). */
export function readYaml(file) {
  const key = resolve(file);
  if (!cache.has(key)) {
    cache.set(key, parse(readFileSync(key, 'utf8')));
  }
  return cache.get(key);
}

/**
 * Parte un `$ref` en archivo + puntero JSON.
 * Un ref sin archivo (`#/components/schemas/X`) apunta al archivo que lo declara.
 */
export function splitRef(ref, fromFile) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(ref)) {
    throw new Error(`$ref absoluto no permitido (${ref}): el contrato no depende de la red`);
  }
  const hashAt = ref.indexOf('#');
  const rawFile = hashAt === -1 ? ref : ref.slice(0, hashAt);
  const pointer = hashAt === -1 ? '' : ref.slice(hashAt + 1);
  const file = rawFile === '' ? fromFile : resolve(dirname(fromFile), rawFile);
  return { file, pointer };
}

function decodeToken(token) {
  return token.replace(/~1/g, '/').replace(/~0/g, '~');
}

/** Resuelve un puntero JSON (`/schemas/auth.yaml#/DemoSession`) dentro de un documento. */
export function resolvePointer(document, pointer, ref) {
  if (pointer === '' || pointer === '/') return document;
  if (!pointer.startsWith('/')) {
    throw new Error(`$ref con puntero inválido (${ref}): se esperaba /… después de #`);
  }

  let node = document;
  for (const token of pointer.slice(1).split('/').map(decodeToken)) {
    if (node === null || typeof node !== 'object' || !Object.hasOwn(node, token)) {
      throw new Error(`$ref colgado (${ref}): no existe "${token}"`);
    }
    node = node[token];
  }
  return node;
}

function resolveNode(node, fromFile, trail) {
  if (Array.isArray(node)) {
    return node.map((item, index) => resolveNode(item, fromFile, `${trail}[${index}]`));
  }
  if (node === null || typeof node !== 'object') return node;

  if (typeof node.$ref === 'string') {
    const { file, pointer } = splitRef(node.$ref, fromFile);
    const refKey = `${file}#${pointer}`;
    if (trail.includes(refKey)) {
      throw new Error(`$ref circular: ${[...trail, refKey].join(' → ')}`);
    }

    const target = resolveNode(resolvePointer(readYaml(file), pointer, node.$ref), file, [
      ...trail,
      refKey,
    ]);
    const siblings = Object.entries(node).filter(([key]) => key !== '$ref');
    if (siblings.length === 0) return target;
    if (target === null || typeof target !== 'object' || Array.isArray(target)) {
      throw new Error(`$ref con hermanos sobre un valor no-objeto (${node.$ref})`);
    }
    return { ...target, ...resolveNode(Object.fromEntries(siblings), fromFile, trail) };
  }

  const out = {};
  for (const [key, value] of Object.entries(node)) {
    out[key] = resolveNode(value, fromFile, `${trail}.${key}`);
  }
  return out;
}

/**
 * Carga el contrato y devuelve las dos vistas:
 *  - `raw`: tal como está en disco, con los `$ref` como strings (sirve para
 *    auditar los refs).
 *  - `spec`: con todos los `$ref` expandidos (sirve para hash, tests y walkers).
 */
export function loadSpec({ file = SPEC_FILE } = {}) {
  const raw = readYaml(file);
  const spec = resolveNode(raw, resolve(file), []);
  return { file: resolve(file), raw, spec };
}

/** Lista plana de operations: `{ path, method, operationId, operation }`. */
export function listOperations(spec) {
  const operations = [];
  for (const [path, item] of Object.entries(spec.paths ?? {})) {
    for (const [method, operation] of Object.entries(item ?? {})) {
      if (!HTTP_METHODS.includes(method)) continue;
      operations.push({
        path,
        method,
        operationId: operation?.operationId,
        operation,
      });
    }
  }
  return operations;
}

/** Todos los `$ref` del documento crudo, con la ruta donde aparecen. */
export function listRefs(raw, trail = '#') {
  if (Array.isArray(raw)) {
    return raw.flatMap((item, index) => listRefs(item, `${trail}[${index}]`));
  }
  if (raw === null || typeof raw !== 'object') return [];

  const refs = [];
  if (typeof raw.$ref === 'string') refs.push({ ref: raw.$ref, at: trail });
  for (const [key, value] of Object.entries(raw)) {
    if (key === '$ref') continue;
    refs.push(...listRefs(value, `${trail}.${key}`));
  }
  return refs;
}

/** Documento con `info.x-contract-id` forzado al placeholder (base del hash). */
export function contractIdBasis(spec) {
  return canonicalize({
    ...spec,
    info: { ...spec.info, 'x-contract-id': CONTRACT_ID_PLACEHOLDER },
  });
}

/** `x-contract-id` esperado: 12 hex de SHA-256 sobre el documento canónico. */
export function canonicalContractId(spec) {
  return sha256Hex(contractIdBasis(spec)).slice(0, 12);
}
