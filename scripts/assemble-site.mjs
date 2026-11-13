#!/usr/bin/env node
/**
 * Ensambla el artefacto único de GitHub Pages:
 *
 *   site/index.html            landing
 *   site/flutter/**            build web de Flutter
 *   site/expo/**               export web de Expo
 *   site/contract/**           doc estático del contrato (`npm run contract:docs`)
 *   site/.nojekyll             sin procesamiento Jekyll
 *
 * En el mismo paso audita el artefacto: denylist (ZIP, keystore, .env, config Firebase,
 * node_modules, *.map), hosts prohibidos, secretos, `index.html` de las tres demos y
 * el doc del contrato en `/contract/`.
 *
 * Uso:
 *   node scripts/assemble-site.mjs                 # construye site/ desde los builds
 *   node scripts/assemble-site.mjs --check-only    # audita site/ sin tocar nada
 *   node scripts/assemble-site.mjs --check-only --strict
 *   node scripts/assemble-site.mjs out-dir         # otro directorio de salida
 *
 * `--check-only` devuelve 0 si el único problema es un target todavía no construido
 * (lo informa como `pending`); con `--strict` eso también falla. Las demos son el
 * artefacto base; `/contract/` es una ruta adicional que sólo se exige cuando el
 * artefacto es el de publicación (`--strict`) o cuando el ensamblado acaba de
 * copiarla.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { auditText, deniedReason, isTextFile } from './lib/denylist.mjs';
import { ALLOWED_REQUEST_HOSTS, compareHostSets } from './lib/request-hosts.mjs';
import { datasetIdOf } from './lib/canonical.mjs';
import { canonicalContractId, loadSpec } from '../contract/scripts/lib/spec.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const checkOnly = args.includes('--check-only');
const strict = args.includes('--strict');
const positional = args.filter((arg) => !arg.startsWith('--'));

const outputDir = resolve(ROOT, positional[0] ?? 'site');
const basePath = (process.env.PAGES_BASE_PATH ?? '').replace(/\/+$/, '');

const SOURCES = [
  {
    key: 'landing',
    label: 'landing',
    source: join(ROOT, 'demo', 'landing'),
    target: '',
    hint: 'la landing es estática y vive en demo/landing',
  },
  {
    key: 'flutter',
    label: 'flutter',
    source: join(ROOT, 'demo', 'flutter-demo', 'build', 'web'),
    target: 'flutter',
    hint: 'flutter build web (ver demo/README.md)',
  },
  {
    key: 'expo',
    label: 'expo',
    source: join(ROOT, 'demo', 'expo-demo', 'dist'),
    target: 'expo',
    hint: 'npx expo export --platform web (ver demo/README.md)',
  },
  {
    key: 'contract',
    label: 'contract',
    source: join(ROOT, 'contract', 'dist'),
    target: 'contract',
    hint: 'npm run contract:docs',
  },
];

/** Las tres demos son el artefacto base; el contrato es la ruta adicional. */
const DEMO_INDEXES = [
  { label: 'landing', path: 'index.html' },
  { label: 'flutter', path: 'flutter/index.html' },
  { label: 'expo', path: 'expo/index.html' },
];
const CONTRACT_INDEX = 'contract/index.html';

const MAX_SCAN_BYTES = 8 * 1024 * 1024;

const problems = [];
const pending = [];

function displayPath(absolute) {
  return relative(ROOT, absolute).split(sep).join('/');
}

function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function problem(message) {
  problems.push(message);
}

function assertInsideWorkspace() {
  const relativePath = relative(ROOT, outputDir);
  if (relativePath.startsWith('..') || (relativePath !== '' && resolve(ROOT, relativePath) !== outputDir)) {
    console.error(`ERROR: el directorio de salida debe estar dentro del repo (${outputDir})`);
    process.exit(1);
  }
}

function walk(dir, onFile) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const absolute = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(absolute, onFile);
      continue;
    }
    if (entry.isFile()) onFile(absolute);
  }
}

/** Copia un árbol omitiendo la denylist. Devuelve el tamaño copiado. */
function copyTree(sourceRoot, destRoot, { label }) {
  let bytes = 0;
  let files = 0;
  let omitted = 0;

  const walkCopy = (fromDir, toDir, relBase) => {
    mkdirSync(toDir, { recursive: true });
    for (const entry of readdirSync(fromDir, { withFileTypes: true })) {
      const from = join(fromDir, entry.name);
      const to = join(toDir, entry.name);
      const rel = relBase ? `${relBase}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        if (deniedReason(`${rel}/`) !== null) {
          omitted += 1;
          console.warn(`  omit      ${displayPath(to)} (denylist)`);
          continue;
        }
        walkCopy(from, to, rel);
        continue;
      }

      if (!entry.isFile()) continue;

      const denied = deniedReason(rel);
      if (denied !== null) {
        omitted += 1;
        console.warn(`  omit      ${displayPath(to)} (denylist: ${denied})`);
        continue;
      }

      const stats = statSync(from);
      writeFileSync(to, readFileSync(from));
      bytes += stats.size;
      files += 1;
    }
  };

  walkCopy(sourceRoot, destRoot, '');
  console.log(
    `  ${label.padEnd(8)} ${files} archivo(s), ${humanSize(bytes)}${omitted ? `, ${omitted} omitido(s)` : ''}`,
  );
  return { bytes, files, omitted };
}

/** Audita un directorio ya existente: denylist, hosts, secretos e index.html. */
function audit(dir) {
  const offenders = [];
  const findings = [];
  const hosts = new Map();
  let files = 0;
  let bytes = 0;

  walk(dir, (absolute) => {
    const rel = displayPath(absolute);
    files += 1;
    bytes += statSync(absolute).size;

    const denied = deniedReason(rel);
    if (denied !== null) {
      offenders.push(`${rel} (denylist: ${denied})`);
      return;
    }

    if (!isTextFile(absolute)) return;
    const size = statSync(absolute).size;
    if (size > MAX_SCAN_BYTES) return;

    const text = readFileSync(absolute, 'utf8');
    // El doc del contrato inlina el bundle standalone de Redoc: trae decenas de
    // literales de host de features que nunca usa (CDN de íconos, telemetría,
    // links de documentación) y mantenerlos en la allowlist sería frágil. Se
    // audita con una regla más fuerte y propia: `checkContractDoc` exige que el
    // doc no referencie **ningún** subrecurso y que la carpeta tenga un único
    // archivo, así que no hay dónde esconder un pedido externo.
    const insideContractDocs = relative(dir, absolute).split(sep).join('/').startsWith('contract/');
    const result = auditText(text, { path: rel, hosts: !insideContractDocs });
    for (const finding of result.findings) {
      findings.push(`${rel}: ${finding.kind} prohibido "${finding.label}" (${finding.match})`);
    }
    for (const host of result.occurrences) {
      hosts.set(host, (hosts.get(host) ?? 0) + 1);
    }
  });

  return { offenders, findings, hosts, files, bytes };
}

/**
 * Las tres demos son el artefacto base: si falta una, el artefacto no está
 * completo. `/contract/` es una ruta **adicional** esperada, que se publica con
 * el doc generado; se informa aparte para que el mensaje diga qué falta y cómo
 * arreglarlo, sin confundirla con una demo sin construir.
 */
function checkIndexes(dir) {
  const missingDemos = DEMO_INDEXES.filter((entry) => !existsSync(join(dir, entry.path))).map(
    (entry) => entry.label,
  );
  const contractMissing = !existsSync(join(dir, CONTRACT_INDEX));
  return { missingDemos, contractMissing };
}

/** datasetId del contrato vigente: se recalcula, nunca se hardcodea. */
function contractDatasetId() {
  const readShared = (name) => JSON.parse(readFileSync(join(ROOT, 'demo', 'shared', name), 'utf8'));
  return datasetIdOf({
    fixtures: readShared('fixtures.json'),
    copy: readShared('copy.json'),
    designTokens: readShared('design-tokens.json'),
    photos: readShared('photos.json'),
  });
}

/**
 * La landing es estática y siempre está disponible: si falta o quedó fuera de
 * contrato, es un defecto, no un target `pending`. Verifica D-6 (noindex,
 * enlaces relativos, datasetId visible) y SC-8 (mismo datasetId que las apps).
 */
function checkLanding(dir, expectedDatasetId) {
  const indexPath = join(dir, 'index.html');
  if (!existsSync(indexPath)) {
    problem('falta la landing en site/index.html');
    return;
  }

  const html = readFileSync(indexPath, 'utf8');
  if (!/<meta\s+name="robots"\s+content="[^"]*noindex/i.test(html)) {
    problem('landing/index.html no declara <meta name="robots" content="noindex">');
  }
  for (const href of ['./flutter/', './expo/']) {
    if (!html.includes(`href="${href}"`)) {
      problem(`landing/index.html no enlaza la demo con ruta relativa href="${href}"`);
    }
  }
  if (!html.includes('data-dataset-id')) {
    problem('landing/index.html no expone el datasetId (falta data-dataset-id)');
  }

  const generated = join(dir, 'generated', 'dataset.js');
  if (!existsSync(generated)) {
    problem('falta generated/dataset.js en la landing (corré el sync del contrato)');
    return;
  }
  if (!readFileSync(generated, 'utf8').includes(expectedDatasetId)) {
    problem(`generated/dataset.js de la landing no contiene el datasetId esperado (${expectedDatasetId})`);
  }
}

/**
 * E-5 / F-13: el documento de Expo es es-AR. `expo export` sustituye
 * `%LANG_ISO_CODE%` (de `web.lang`) y `%WEB_TITLE%` en `public/index.html`; si
 * alguno queda en el HTML, el reemplazo no ocurrió y el artefacto sale con el
 * idioma equivocado. La copia de `<noscript>` también tiene que estar en español.
 */
function checkExpoDocument(dir) {
  const indexPath = join(dir, 'expo', 'index.html');
  if (!existsSync(indexPath)) return;

  const html = readFileSync(indexPath, 'utf8');
  if (/%LANG_ISO_CODE%|%WEB_TITLE%/.test(html)) {
    problem('expo/index.html conserva placeholders sin sustituir (%LANG_ISO_CODE% / %WEB_TITLE%)');
  }
  if (!/<html[^>]*\blang="es"/i.test(html)) {
    problem('expo/index.html no declara <html lang="es">: revisá web.lang en demo/expo-demo/app.config.ts');
  }
  if (!/<noscript>[\s\S]*<\/noscript>/i.test(html)) {
    problem('expo/index.html no incluye <noscript> (sin JS no hay mensaje para el usuario)');
  } else if (!/Esta demo necesita JavaScript/.test(html)) {
    problem('expo/index.html no tiene el <noscript> en español (E-5 / F-13)');
  }
}

/**
 * El host permitido vive en el entry (el estilo local), no en el chunk: pedir el
 * host en `--strict` no prueba que MapLibre haya entrado al bundle. Este chequeo
 * cierra ese hueco: sin chunk lazy `maplibre-gl-*.js`, el mapa no llegó.
 */
const BASEMAP_CHUNK = /^maplibre-gl-.*\.js$/;

function hasBasemapChunk(dir) {
  const jsDir = join(dir, 'expo', '_expo', 'static', 'js', 'web');
  if (!existsSync(jsDir)) return false;
  const chunk = readdirSync(jsDir).some((name) => BASEMAP_CHUNK.test(name));
  // MapLibre pide su worker por URL: si no se copió a `public/`, el mapa nunca
  // pasa de `loading` y cae al SVG sin avisar en el build.
  const worker = existsSync(join(dir, 'expo', 'maplibre-gl-worker.js'));
  return chunk && worker;
}

function checkBaseHref(dir) {
  const flutterIndex = join(dir, 'flutter', 'index.html');
  if (!existsSync(flutterIndex)) return;

  const expectedFlutter = `${basePath}/flutter/`;
  const html = readFileSync(flutterIndex, 'utf8');
  if (!html.includes(`href="${expectedFlutter}"`) && !html.includes(`href='${expectedFlutter}'`)) {
    problem(
      `flutter/index.html no declara <base href="${expectedFlutter}">. ` +
        `Rebuild con --base-href "${expectedFlutter}" (PAGES_BASE_PATH="${basePath}").`,
    );
  }

  const expoIndex = join(dir, 'expo', 'index.html');
  if (existsSync(expoIndex) && basePath.length > 0) {
    const expoHtml = readFileSync(expoIndex, 'utf8');
    if (!expoHtml.includes(`${basePath}/expo`)) {
      console.warn(
        `WARN: expo/index.html no parece referenciar "${basePath}/expo"; revisá EXPO_BASE_URL al exportar.`,
      );
    }
  }
}

/**
 * El doc del contrato se publica en `/contract/` como **un único HTML
 * autocontenido** generado por `npm run contract:docs`. Verifica las tres
 * propiedades que ningún otro chequeo cubre:
 *
 *  1. Un solo archivo: el doc inlina su JS y su CSS, así que un hermano
 *     (`openapi.yaml`, un `.js`, un `.map`) sobra o esconde un pedido externo.
 *     Es lo que cierra el hueco de la excepción de hosts (ver `audit`).
 *  2. Cero subrecursos: sin `src`/`href` en tags que cargan, sin `url(http…)` ni
 *     `@import http…`. Más fuerte que la allowlist del artefacto.
 *  3. Sin telemetría y con el contrato vigente adentro: si el HTML se generó con
 *     otra revisión del spec, publica docs que no son los del `x-contract-id`.
 */
const CONTRACT_SUBRESOURCE_RULES = [
  {
    label: 'tag que carga un recurso',
    pattern: /<(?:script|link|img|iframe|source|embed|object|video|audio|track)\b[^>]*?\b(?:src|href|srcset)\s*=/i,
  },
  { label: 'url() externa', pattern: /url\(\s*["']?https?:/i },
  { label: '@import externo', pattern: /@import\s+(?:url\()?["']?https?:/i },
];

function checkContractDoc(dir, expectedContractId) {
  const docsDir = join(dir, 'contract');
  const indexPath = join(docsDir, 'index.html');
  if (!existsSync(indexPath)) return;

  const extra = readdirSync(docsDir).filter((name) => name !== 'index.html');
  if (extra.length > 0) {
    problem(`contract/ debe publicarse como un único index.html autocontenido: sobra ${extra.join(', ')}`);
  }

  const html = readFileSync(indexPath, 'utf8');
  for (const rule of CONTRACT_SUBRESOURCE_RULES) {
    const match = rule.pattern.exec(html);
    if (match) {
      problem(`contract/index.html no puede cargar subrecursos (${rule.label}): "${match[0].slice(0, 80)}"`);
    }
  }

  if (!html.includes('"disableTelemetry":true')) {
    problem('contract/index.html deja la telemetría de Redoc prendida (regenerá con npm run contract:docs)');
  }
  if (!html.includes(expectedContractId)) {
    problem(
      `contract/index.html no corresponde al contrato vigente (falta x-contract-id ${expectedContractId}): ` +
        'regenerá con npm run contract:docs',
    );
  }
}

function report(dir) {
  const { offenders, findings, hosts, files, bytes } = audit(dir);
  for (const entry of offenders) problem(`archivo prohibido: ${entry}`);
  for (const entry of findings) problem(`contenido prohibido: ${entry}`);

  const expectedDatasetId = contractDatasetId();
  const expectedContractId = canonicalContractId(loadSpec().spec);
  checkLanding(dir, expectedDatasetId);
  checkContractDoc(dir, expectedContractId);

  const { missingDemos, contractMissing } = checkIndexes(dir);
  for (const label of missingDemos) {
    if (label === 'landing') continue; // reported by checkLanding as a real problem
    const source = SOURCES.find((entry) => entry.key === label);
    pending.push(`${label} (falta ${source ? displayPath(source.source) : 'build'})`);
  }

  // La publicación está activa cuando el artefacto es el que se sube (`--strict`):
  // ahí el contrato no puede faltar. En una auditoría parcial sin `--strict` se
  // informa como `pending`, igual que una app todavía sin construir.
  if (contractMissing) {
    if (strict) {
      problem('falta contract/index.html: el contrato es una ruta publicada (corré npm run contract:docs)');
    } else {
      pending.push('contract (falta contract/dist: npm run contract:docs)');
    }
  }

  checkBaseHref(dir);
  checkExpoDocument(dir);

  const observed = [...hosts.keys()].sort();
  const detail = ALLOWED_REQUEST_HOSTS.map((host) => `${host} (${hosts.get(host) ?? 0})`).join(', ');
  console.log(`\n  artefacto ${displayPath(dir)}: ${files} archivo(s), ${humanSize(bytes)}`);
  console.log(`  dataset   ${expectedDatasetId}`);
  console.log(`  host pedible: ${observed.length === 0 ? 'ninguno' : observed.join(', ')}`);
  if (detail.length > 0) console.log(`  allowlist   ${detail}`);

  // La allowlist es el conjunto exacto: ni falta el host del basemap ni sobra otro.
  if (strict && pending.length === 0) {
    const { missing: absent, extra } = compareHostSets(observed);
    if (absent.length > 0) {
      problem(`--strict exige que el artefacto pida el host permitido: falta ${absent.join(', ')}`);
    }
    if (extra.length > 0) {
      problem(`--strict: el artefacto pide hosts fuera de la allowlist: ${extra.join(', ')}`);
    }
    if (ALLOWED_REQUEST_HOSTS.length > 0 && !hasBasemapChunk(dir)) {
      problem('--strict: falta el chunk maplibre-gl-*.js o el worker en expo/ (el mapa no llegó al bundle)');
    }
  }

  if (missingDemos.length === 0) {
    console.log('  demos       landing, flutter y expo completas');
  }
  if (!contractMissing) {
    console.log(`  contrato    contract/index.html · x-contract-id ${expectedContractId}`);
  }
  return { files, bytes };
}

function main() {
  assertInsideWorkspace();

  if (!checkOnly) {
    const missingSources = SOURCES.filter((entry) => !existsSync(entry.source));
    if (missingSources.length > 0) {
      console.error('ERROR: faltan artefactos requeridos:');
      for (const entry of missingSources) {
        console.error(`  - ${entry.label}: ${displayPath(entry.source)} (${entry.hint})`);
      }
      console.error('\n  Construí las demos y generá el doc del contrato, o usá --check-only para auditar.');
      process.exit(1);
    }

    console.log(`Assembling ${displayPath(outputDir)}${basePath ? ` (base "${basePath}")` : ' (base "")'}`);
    rmSync(outputDir, { recursive: true, force: true });
    mkdirSync(outputDir, { recursive: true });

    const sections = [];
    for (const entry of SOURCES) {
      const destination = entry.target ? join(outputDir, entry.target) : outputDir;
      const result = copyTree(entry.source, destination, { label: entry.label });
      sections.push({ label: entry.label, ...result });
    }

    writeFileSync(join(outputDir, '.nojekyll'), '');
    console.log('  .nojekyll escrito');
  } else if (!existsSync(outputDir)) {
    console.log(`site/ no existe todavía (${displayPath(outputDir)}).`);
    console.log('Nada que auditar: los targets se ensamblan después de construir Flutter, Expo y los docs.');
    console.log(`pending: ${SOURCES.map((entry) => entry.label).join(', ')}`);
    if (strict) {
      console.error('ERROR: --strict exige un artefacto ensamblado.');
      process.exit(1);
    }
    return 0;
  } else {
    console.log(`Checking ${displayPath(outputDir)}${basePath ? ` (base "${basePath}")` : ' (base "")'}`);
  }

  report(outputDir);

  if (pending.length > 0) {
    console.log(`\n  pending   ${pending.join('; ')}`);
    console.log('            (esperado hasta que las demos y el doc del contrato estén construidos)');
  }

  if (problems.length > 0) {
    console.error(`\nFAILED: ${problems.length} problema(s) en el artefacto:`);
    for (const entry of problems) console.error(`  - ${entry}`);
    process.exit(1);
  }

  if (pending.length > 0 && strict) {
    console.error(`\nFAILED (--strict): faltan targets: ${pending.join('; ')}`);
    process.exit(1);
  }

  if (pending.length > 0) {
    console.log('\nOK (parcial): sin archivos ni contenido prohibidos; faltan targets por construir.');
  } else {
    console.log('\nOK: artefacto listo para publicar.');
  }
  return 0;
}

main();
