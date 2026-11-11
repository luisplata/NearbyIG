#!/usr/bin/env node
/**
 * Valida el contrato compartido antes de generar nada.
 *
 * Reglas duras:
 *  - prohibido lat/lng/latitude/longitude en cualquier nivel
 *  - prohibidas URLs http(s) y patrones de secreto en cualquier string
 *  - IDs únicos, 10 perfiles, distancias 200-5000 m, bearings 0-359
 *  - intenciones y géneros del catálogo, photoId existente, todo *Key resuelve en copy
 *  - timers exactos, filtros coherentes, 8 ítems de simulación
 *
 * Sale con código 1 y un mensaje por violación. Si todo pasa, imprime el datasetId.
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { datasetIdOf } from './lib/canonical.mjs';
import { SECRET_PATTERNS } from './lib/denylist.mjs';

const ROOT = resolve(
  process.env.NEARBYIG_CONTRACT_ROOT ?? resolve(dirname(fileURLToPath(import.meta.url)), '..'),
);
const SHARED = join(ROOT, 'demo', 'shared');

const EXPECTED_TIMERS = {
  incomingPingMs: 3000,
  matchMs: 2500,
  revealMs: 1500,
  toastMs: 4000,
  typingMs: 1200,
};

const REQUIRED_COPY_KEYS = [
  'about.dataset',
  'about.title',
  'a11y.profileDot',
  'chat.fallback',
  'chat.send',
  'common.back',
  'common.datasetId',
  'common.demoChip',
  'common.simTitle',
  'discovery.mapLegend',
  'empty.filters',
  'empty.filtersCta',
  'ig.simDisclaimer',
  'ig.state.linked',
  'ig.state.unverified',
  'ig.state.verified',
  'match.title',
  'notif.markAllRead',
  'notif.title',
  'ping.blocked.paused',
  'ping.sent',
  'privacy.noHistory',
  'profile.ping',
  'safety.reportDone',
  'settings.reset',
];

const REQUIRED_TOKEN_COLORS = [
  'bg',
  'surface',
  'surfaceAlt',
  'text',
  'muted',
  'border',
  'gradientStart',
  'gradientMid',
  'gradientEnd',
  'accent',
  'online',
  'verified',
  'danger',
];

const PROHIBITED_PROPERTY_NAMES = ['lat', 'lng', 'latitude', 'longitude'];
const ALLOWED_PLACEHOLDERS = new Set(['name', 'distance', 'count', 'radius']);

const errors = [];
const notes = [];

function fail(message) {
  errors.push(message);
}

function readJson(relativePath) {
  const absolute = join(ROOT, relativePath);
  try {
    return JSON.parse(readFileSync(absolute, 'utf8'));
  } catch (error) {
    fail(`${relativePath}: no se pudo leer o parsear (${error.message})`);
    return null;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Recorre el árbol y llama a onEntry(key, value, path) por cada par clave/valor. */
function walk(value, path, onEntry) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, `${path}[${index}]`, onEntry));
    return;
  }
  if (!isPlainObject(value)) return;
  for (const key of Object.keys(value)) {
    const childPath = path ? `${path}.${key}` : key;
    onEntry(key, value[key], childPath);
    walk(value[key], childPath, onEntry);
  }
}

function checkForbiddenContent(sourceName, data) {
  walk(data, '', (key, value, path) => {
    if (PROHIBITED_PROPERTY_NAMES.includes(key.toLowerCase())) {
      fail(`${sourceName}: propiedad geográfica prohibida "${path}" (usar distanceM + bearingDeg)`);
    }
    if (typeof value !== 'string') return;
    if (/https?:\/\//i.test(value)) {
      fail(`${sourceName}: URL externa prohibida en "${path}": ${value.slice(0, 60)}`);
    }
    for (const rule of SECRET_PATTERNS) {
      if (rule.pattern.test(value)) {
        fail(`${sourceName}: posible secreto (${rule.label}) en "${path}"`);
      }
    }
  });
}

function isInt(value) {
  return Number.isInteger(value);
}

function checkCopyRef(sourceName, where, key, copy) {
  if (typeof key !== 'string' || key.length === 0) {
    fail(`${sourceName}: referencia de copy vacía en "${where}"`);
    return;
  }
  if (!(key in copy)) {
    fail(`${sourceName}: "${where}" referencia una clave inexistente en copy.json: ${key}`);
  }
}

function collectCopyRefs(data) {
  const refs = [];
  walk(data, '', (key, value, path) => {
    if (key === 'chatReplies' && isPlainObject(value)) {
      for (const profileId of Object.keys(value)) {
        if (!Array.isArray(value[profileId])) {
          fail(`fixtures.json: script.chatReplies.${profileId} debe ser una lista de claves de copy`);
          continue;
        }
        value[profileId].forEach((replyKey, index) => {
          refs.push({ where: `script.chatReplies.${profileId}[${index}]`, key: replyKey });
        });
      }
      return;
    }
    if (/Key$/.test(key) && typeof value === 'string') {
      refs.push({ where: path, key: value });
    }
    if (/Keys$/.test(key) && Array.isArray(value)) {
      value.forEach((item, index) => {
        if (typeof item === 'string') refs.push({ where: `${path}[${index}]`, key: item });
      });
    }
  });
  return refs;
}

// --- fixtures --------------------------------------------------------------

function validateFixtures(fixtures, copy, photos) {
  const name = 'fixtures.json';

  if (fixtures.schemaVersion !== 1) {
    fail(`${name}: schemaVersion debe ser 1 (encontrado ${JSON.stringify(fixtures.schemaVersion)})`);
  }

  const timers = fixtures.timers ?? {};
  const timerKeys = Object.keys(EXPECTED_TIMERS).sort();
  const foundKeys = Object.keys(timers).sort();
  if (timerKeys.join(',') !== foundKeys.join(',')) {
    fail(`${name}: timers debe tener exactamente ${timerKeys.join(', ')} (encontrado ${foundKeys.join(', ') || 'vacío'})`);
  }
  for (const [key, expected] of Object.entries(EXPECTED_TIMERS)) {
    if (timers[key] !== expected) {
      fail(`${name}: timers.${key} debe ser ${expected} (encontrado ${JSON.stringify(timers[key])})`);
    }
  }

  const filters = fixtures.filters ?? {};
  const intentions = Array.isArray(filters.intentions) ? filters.intentions : [];
  const genders = Array.isArray(filters.genders) ? filters.genders : [];
  const radii = Array.isArray(filters.radiiM) ? filters.radiiM : [];

  if (intentions.length !== 4 || new Set(intentions).size !== 4) {
    fail(`${name}: filters.intentions debe tener 4 valores únicos (encontrado ${intentions.length})`);
  }
  if (genders.length !== 3 || new Set(genders).size !== 3) {
    fail(`${name}: filters.genders debe tener 3 valores únicos (encontrado ${genders.length})`);
  }
  if (radii.length === 0) {
    fail(`${name}: filters.radiiM no puede estar vacío`);
  }
  radii.forEach((radius, index) => {
    if (!isInt(radius) || radius < 200 || radius > 5000) {
      fail(`${name}: filters.radiiM[${index}] = ${JSON.stringify(radius)} fuera de 200-5000`);
    }
    if (index > 0 && radius <= radii[index - 1]) {
      fail(`${name}: filters.radiiM debe ser ascendente y sin repetidos (${radii.join(', ')})`);
    }
  });
  if (!radii.includes(500)) fail(`${name}: filters.radiiM debe incluir 500`);
  if (!radii.includes(5000)) fail(`${name}: filters.radiiM debe incluir 5000`);
  if (!radii.includes(filters.defaultRadiusM)) {
    fail(`${name}: filters.defaultRadiusM = ${JSON.stringify(filters.defaultRadiusM)} no está en radiiM`);
  }

  const reportReasons = Array.isArray(fixtures.reportReasons) ? fixtures.reportReasons : [];
  if (reportReasons.length < 5) {
    fail(`${name}: reportReasons debe tener al menos 5 motivos`);
  }
  for (const reason of ['harassment', 'spam', 'fake', 'inappropriate', 'other']) {
    if (!reportReasons.includes(reason)) {
      fail(`${name}: reportReasons debe incluir "${reason}"`);
    }
  }

  const profiles = Array.isArray(fixtures.profiles) ? fixtures.profiles : [];
  if (profiles.length !== 10) {
    fail(`${name}: debe haber exactamente 10 perfiles (encontrado ${profiles.length})`);
  }

  const self = fixtures.self ?? {};
  if (!isPlainObject(self) || typeof self.id !== 'string' || self.id.length === 0) {
    fail(`${name}: self.id es obligatorio`);
  }
  if (typeof self.intention !== 'string' || !intentions.includes(self.intention)) {
    fail(`${name}: self.intention = ${JSON.stringify(self.intention)} no está en filters.intentions`);
  }
  if (typeof self.photoId !== 'string' || !isPlainObject(photos) || !(self.photoId in photos)) {
    fail(`${name}: self.photoId = ${JSON.stringify(self.photoId)} no existe en photos.json`);
  }

  const ids = new Set();
  for (const id of [self.id, ...profiles.map((profile) => profile.id)]) {
    if (typeof id !== 'string' || id.length === 0) {
      fail(`${name}: hay un perfil con id vacío o inválido`);
      continue;
    }
    if (ids.has(id)) fail(`${name}: id duplicado "${id}"`);
    ids.add(id);
  }

  const seenDistances = [];
  profiles.forEach((profile, index) => {
    const where = `profiles[${index}] (${profile?.id ?? 'sin id'})`;
    if (typeof profile.nickname !== 'string' || profile.nickname.trim().length === 0) {
      fail(`${name}: ${where} sin nickname`);
    }
    if (!/^[A-Z]{2}$/.test(String(profile.initials ?? ''))) {
      fail(`${name}: ${where} initials debe ser 2 letras mayúsculas`);
    }
    if (!intentions.includes(profile.intention)) {
      fail(`${name}: ${where} intention "${profile.intention}" no válida`);
    }
    if (!genders.includes(profile.gender)) {
      fail(`${name}: ${where} gender "${profile.gender}" no válido`);
    }
    if (typeof profile.verified !== 'boolean') fail(`${name}: ${where} verified debe ser booleano`);
    if (typeof profile.online !== 'boolean') fail(`${name}: ${where} online debe ser booleano`);
    if (!isInt(profile.distanceM) || profile.distanceM < 200 || profile.distanceM > 5000) {
      fail(`${name}: ${where} distanceM = ${JSON.stringify(profile.distanceM)} fuera de 200-5000`);
    } else {
      seenDistances.push(profile.distanceM);
    }
    if (!isInt(profile.bearingDeg) || profile.bearingDeg < 0 || profile.bearingDeg > 359) {
      fail(`${name}: ${where} bearingDeg = ${JSON.stringify(profile.bearingDeg)} fuera de 0-359`);
    }
    if (typeof profile.photoId !== 'string' || !isPlainObject(photos) || !(profile.photoId in photos)) {
      fail(`${name}: ${where} photoId "${profile.photoId}" no existe en photos.json`);
    }
    if (!/^[a-z0-9._]{3,30}$/.test(String(profile.instagramHandle ?? ''))) {
      fail(`${name}: ${where} instagramHandle inválido ("${profile.instagramHandle}")`);
    }
  });

  if (new Set(seenDistances).size !== seenDistances.length) {
    fail(`${name}: hay distancias repetidas (${seenDistances.join(', ')}); cada perfil debe tener una única`);
  }

  const script = fixtures.script ?? {};
  const profileIds = new Set(profiles.map((profile) => profile.id));
  for (const key of ['firstPingTargetId', 'incomingPingFromId', 'matchProfileId']) {
    const value = script[key];
    if (typeof value !== 'string' || !profileIds.has(value)) {
      fail(`${name}: script.${key} = ${JSON.stringify(value)} no corresponde a un perfil existente`);
    }
  }
  if (isPlainObject(script.chatReplies)) {
    for (const profileId of Object.keys(script.chatReplies)) {
      if (!profileIds.has(profileId)) {
        fail(`${name}: script.chatReplies tiene un perfil inexistente "${profileId}"`);
      }
    }
    if (typeof script.incomingPingFromId === 'string' && !(script.incomingPingFromId in script.chatReplies)) {
      notes.push(
        `${name}: script.chatReplies no define respuestas para "${script.incomingPingFromId}"; se usará fallbackReplyKey`,
      );
    }
  }

  const mapDecor = fixtures.mapDecor ?? {};
  for (const key of ['streets', 'blocks', 'labels']) {
    if (!Array.isArray(mapDecor[key]) || mapDecor[key].length === 0) {
      fail(`${name}: mapDecor.${key} debe ser una lista no vacía`);
    }
  }
  (mapDecor.streets ?? []).forEach((street, index) => {
    for (const field of ['x1', 'y1', 'x2', 'y2']) {
      const value = street?.[field];
      if (typeof value !== 'number' || value < 0 || value > 1) {
        fail(`${name}: mapDecor.streets[${index}].${field} debe ser un número entre 0 y 1`);
      }
    }
    if (!(typeof street?.weight === 'number' && street.weight > 0)) {
      fail(`${name}: mapDecor.streets[${index}].weight debe ser > 0`);
    }
  });
  (mapDecor.blocks ?? []).forEach((block, index) => {
    for (const field of ['x', 'y', 'w', 'h']) {
      const value = block?.[field];
      if (typeof value !== 'number' || value < 0 || value > 1) {
        fail(`${name}: mapDecor.blocks[${index}].${field} debe ser un número entre 0 y 1`);
      }
    }
    if (!(typeof block?.radius === 'number' && block.radius >= 0)) {
      fail(`${name}: mapDecor.blocks[${index}].radius debe ser >= 0`);
    }
  });
  (mapDecor.labels ?? []).forEach((label, index) => {
    for (const field of ['x', 'y']) {
      const value = label?.[field];
      if (typeof value !== 'number' || value < 0 || value > 1) {
        fail(`${name}: mapDecor.labels[${index}].${field} debe ser un número entre 0 y 1`);
      }
    }
  });

  for (const ref of collectCopyRefs(fixtures)) {
    checkCopyRef(name, ref.where, ref.key, copy ?? {});
  }

  return { profiles, intentions, genders };
}

// --- copy ------------------------------------------------------------------

function validateCopy(copy) {
  const name = 'copy.json';
  if (!isPlainObject(copy)) {
    fail(`${name}: debe ser un objeto plano clave → string`);
    return;
  }

  for (const [key, value] of Object.entries(copy)) {
    if (!/^[a-zA-Z0-9]+(\.[a-zA-Z0-9]+)+$/.test(key)) {
      fail(`${name}: clave con formato inválido "${key}" (usar dot.case)`);
    }
    if (typeof value !== 'string') {
      fail(`${name}: "${key}" debe ser un string (encontrado ${typeof value})`);
      continue;
    }
    if (value.trim().length === 0) {
      fail(`${name}: "${key}" está vacío`);
    }
    if (value !== value.trim()) {
      fail(`${name}: "${key}" tiene espacios al inicio o al final`);
    }
    const open = (value.match(/\{/g) ?? []).length;
    const close = (value.match(/\}/g) ?? []).length;
    if (open !== close) {
      fail(`${name}: "${key}" tiene llaves de interpolación desbalanceadas`);
    }
    for (const match of value.matchAll(/\{([^{}]*)\}/g)) {
      if (!ALLOWED_PLACEHOLDERS.has(match[1])) {
        fail(`${name}: "${key}" usa un placeholder no permitido {${match[1]}} (permitidos: ${[...ALLOWED_PLACEHOLDERS].join(', ')})`);
      }
    }
  }

  for (const key of REQUIRED_COPY_KEYS) {
    if (!(key in copy)) fail(`${name}: falta la clave obligatoria "${key}"`);
  }

  for (let index = 1; index <= 8; index += 1) {
    if (!(`common.simItems.${index}` in copy)) {
      fail(`${name}: falta "common.simItems.${index}" (la hoja de simulación necesita 8 ítems)`);
    }
  }
  if ('common.simItems.9' in copy) {
    fail(`${name}: "common.simItems.9" sobra; la hoja de simulación tiene exactamente 8 ítems`);
  }

  if (copy['common.demoChip'] !== 'DEMO') {
    fail(`${name}: common.demoChip debe ser exactamente "DEMO"`);
  }
  if (typeof copy['privacy.noHistory'] === 'string' && !/sin historial de rutas/i.test(copy['privacy.noHistory'])) {
    fail(`${name}: privacy.noHistory debe contener "sin historial de rutas"`);
  }
  if (typeof copy['ig.simDisclaimer'] === 'string' && !/simulado/i.test(copy['ig.simDisclaimer'])) {
    fail(`${name}: ig.simDisclaimer debe aclarar que es simulado`);
  }
  if (typeof copy['discovery.mapLegend'] === 'string' && !/simulado/i.test(copy['discovery.mapLegend'])) {
    fail(`${name}: discovery.mapLegend debe aclarar que el mapa es simulado`);
  }
  return copy;
}

// --- tokens ----------------------------------------------------------------

function validateTokens(tokens) {
  const name = 'design-tokens.json';

  if (!isPlainObject(tokens.color)) {
    fail(`${name}: falta el bloque color`);
  } else {
    for (const key of REQUIRED_TOKEN_COLORS) {
      if (!(key in tokens.color)) {
        fail(`${name}: falta color.${key}`);
        continue;
      }
      if (!/^#[0-9A-Fa-f]{6}$/.test(String(tokens.color[key]))) {
        fail(`${name}: color.${key} debe ser hex #RRGGBB (encontrado ${JSON.stringify(tokens.color[key])})`);
      }
    }
  }

  if (!isPlainObject(tokens.type)) {
    fail(`${name}: falta el bloque type`);
  } else {
    if (tokens.type.family !== 'Inter') fail(`${name}: type.family debe ser "Inter"`);
    for (const field of ['sizes', 'weights', 'lineHeights']) {
      if (!Array.isArray(tokens.type[field]) || tokens.type[field].length === 0) {
        fail(`${name}: type.${field} debe ser una lista no vacía`);
      }
    }
    const sizes = tokens.type.sizes ?? [];
    if (sizes.some((size) => typeof size !== 'number' || size <= 0)) {
      fail(`${name}: type.sizes debe contener números positivos`);
    }
    if (sizes.some((size, index) => index > 0 && size <= sizes[index - 1])) {
      fail(`${name}: type.sizes debe ser ascendente`);
    }
    const weights = tokens.type.weights ?? [];
    for (const weight of [400, 600]) {
      if (!weights.includes(weight)) fail(`${name}: type.weights debe incluir ${weight}`);
    }
  }

  for (const field of ['space', 'radius']) {
    const values = tokens[field];
    if (!Array.isArray(values) || values.length === 0) {
      fail(`${name}: ${field} debe ser una lista no vacía`);
      continue;
    }
    if (values.some((value) => typeof value !== 'number' || value < 0)) {
      fail(`${name}: ${field} debe contener números >= 0`);
    }
    if (values.some((value, index) => index > 0 && value <= values[index - 1])) {
      fail(`${name}: ${field} debe ser ascendente`);
    }
  }

  if (!isPlainObject(tokens.shadow) || typeof tokens.shadow.sheet !== 'string') {
    fail(`${name}: falta shadow.sheet`);
  } else if (!/^-?\d+(?:\.\d+)?\s+-?\d+(?:\.\d+)?\s+\d+(?:\.\d+)?\s+rgba\(\d+,\s*\d+,\s*\d+,\s*[\d.]+\)$/.test(tokens.shadow.sheet)) {
    fail(`${name}: shadow.sheet debe tener el formato "<x> <y> <blur> rgba(r,g,b,a)"`);
  }

  if (!isPlainObject(tokens.breakpoint)) {
    fail(`${name}: falta el bloque breakpoint`);
  } else {
    const { min, frameMax, wide } = tokens.breakpoint;
    if (min !== 320) fail(`${name}: breakpoint.min debe ser 320`);
    if (frameMax !== 480) fail(`${name}: breakpoint.frameMax debe ser 480`);
    if (wide !== 600) fail(`${name}: breakpoint.wide debe ser 600`);
    if (!(min < frameMax && frameMax < wide)) {
      fail(`${name}: breakpoints deben crecer (min < frameMax < wide)`);
    }
  }
}

// --- photos ----------------------------------------------------------------

function validatePhotos(photos, fixtures) {
  const name = 'photos.json';
  if (!isPlainObject(photos) || Object.keys(photos).length === 0) {
    fail(`${name}: debe ser un objeto no vacío photoId → spec`);
    return;
  }

  for (const photoId of Object.keys(photos)) {
    const spec = photos[photoId];
    const where = `${name}: ${photoId}`;
    if (!isPlainObject(spec)) {
      fail(`${where} debe ser un objeto`);
      continue;
    }
    if (!/^[A-Z]{2}$/.test(String(spec.initials ?? ''))) {
      fail(`${where}.initials debe ser 2 letras mayúsculas`);
    }
    if (!Array.isArray(spec.gradient) || spec.gradient.length !== 2) {
      fail(`${where}.gradient debe tener exactamente 2 colores`);
    } else {
      spec.gradient.forEach((color, index) => {
        if (!/^#[0-9A-Fa-f]{6}$/.test(String(color))) {
          fail(`${where}.gradient[${index}] debe ser hex #RRGGBB`);
        }
      });
    }
    if (!['circle', 'squircle'].includes(spec.shape)) {
      fail(`${where}.shape debe ser "circle" o "squircle"`);
    }
    if (!isInt(spec.seed) || spec.seed < 0 || spec.seed > 9999) {
      fail(`${where}.seed debe ser un entero entre 0 y 9999`);
    }
  }

  if (!('ph00' in photos)) {
    fail(`${name}: falta el avatar del perfil propio "ph00"`);
  }

  const used = new Set([fixtures?.self?.photoId, ...(fixtures?.profiles ?? []).map((profile) => profile.photoId)]);
  for (const photoId of used) {
    if (typeof photoId === 'string' && !(photoId in photos)) {
      fail(`${name}: falta el avatar "${photoId}" referenciado por fixtures.json`);
    }
  }
  if (Object.keys(photos).length !== used.size) {
    notes.push(`${name}: hay ${Object.keys(photos).length - used.size} avatar(es) sin uso; no es un error`);
  }
}

// --- main ------------------------------------------------------------------

function main() {
  const fixtures = readJson('demo/shared/fixtures.json');
  const copy = readJson('demo/shared/copy.json');
  const tokens = readJson('demo/shared/design-tokens.json');
  const photos = readJson('demo/shared/photos.json');

  if (fixtures) checkForbiddenContent('fixtures.json', fixtures);
  if (copy) checkForbiddenContent('copy.json', copy);
  if (tokens) checkForbiddenContent('design-tokens.json', tokens);
  if (photos) checkForbiddenContent('photos.json', photos);

  if (copy) validateCopy(copy);
  if (tokens) validateTokens(tokens);
  if (photos) validatePhotos(photos, fixtures);

  let summary = null;
  if (fixtures && copy && photos) {
    summary = validateFixtures(fixtures, copy, photos);
  }

  for (const note of notes) {
    console.log(`NOTE: ${note}`);
  }

  if (errors.length > 0) {
    for (const message of errors) {
      console.error(`ERROR: ${message}`);
    }
    console.error(`\nFAILED: ${errors.length} violación(es) del contrato.`);
    process.exit(1);
  }

  if (!summary) {
    console.error('\nFAILED: faltan archivos del contrato; no se puede calcular el datasetId.');
    process.exit(1);
  }

  const datasetId = datasetIdOf({ fixtures, copy, designTokens: tokens, photos });
  console.log(
    `OK: ${datasetId} · schema ${fixtures.schemaVersion} · ${summary.profiles.length} perfiles · ` +
      `${Object.keys(copy).length} claves de copy · ${Object.keys(photos).length} avatares`,
  );
}

main();
