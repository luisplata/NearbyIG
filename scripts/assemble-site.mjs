#!/usr/bin/env node
/**
 * Ensambla el artefacto único de GitHub Pages:
 *
 *   site/index.html            landing
 *   site/flutter/**            build web de Flutter
 *   site/expo/**               export web de Expo
 *   site/.nojekyll             sin procesamiento Jekyll
 *
 * En el mismo paso audita el artefacto: denylist (ZIP, keystore, .env, config Firebase,
 * node_modules, *.map), hosts prohibidos, secretos e `index.html` en las tres rutas.
 *
 * Uso:
 *   node scripts/assemble-site.mjs                 # construye site/ desde los builds
 *   node scripts/assemble-site.mjs --check-only    # audita site/ sin tocar nada
 *   node scripts/assemble-site.mjs --check-only --strict
 *   node scripts/assemble-site.mjs out-dir         # otro directorio de salida
 *
 * `--check-only` devuelve 0 si el único problema es un target todavía no construido
 * (lo informa como `pending`); con `--strict` eso también falla.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { deniedReason, isTextFile, scanText } from './lib/denylist.mjs';
import { datasetIdOf } from './lib/canonical.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const checkOnly = args.includes('--check-only');
const strict = args.includes('--strict');
const positional = args.filter((arg) => !arg.startsWith('--'));

const outputDir = resolve(ROOT, positional[0] ?? 'site');
const basePath = (process.env.PAGES_BASE_PATH ?? '').replace(/\/+$/, '');

const SOURCES = [
  { key: 'landing', label: 'landing', source: join(ROOT, 'demo', 'landing'), target: '' },
  { key: 'flutter', label: 'flutter', source: join(ROOT, 'demo', 'flutter-demo', 'build', 'web'), target: 'flutter' },
  { key: 'expo', label: 'expo', source: join(ROOT, 'demo', 'expo-demo', 'dist'), target: 'expo' },
];

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
    for (const finding of scanText(text, { path: rel })) {
      findings.push(`${rel}: ${finding.kind} prohibido "${finding.label}" (${finding.match})`);
    }
  });

  return { offenders, findings, files, bytes };
}

function checkIndexes(dir) {
  const required = [
    { label: 'landing', path: join(dir, 'index.html') },
    { label: 'flutter', path: join(dir, 'flutter', 'index.html') },
    { label: 'expo', path: join(dir, 'expo', 'index.html') },
  ];

  const missing = [];
  for (const entry of required) {
    if (!existsSync(entry.path)) missing.push(entry.label);
  }
  return missing;
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

function report(dir) {
  const { offenders, findings, files, bytes } = audit(dir);
  for (const entry of offenders) problem(`archivo prohibido: ${entry}`);
  for (const entry of findings) problem(`contenido prohibido: ${entry}`);

  const expectedDatasetId = contractDatasetId();
  checkLanding(dir, expectedDatasetId);

  const missing = checkIndexes(dir);
  for (const label of missing) {
    if (label === 'landing') continue; // reported by checkLanding as a real problem
    const source = SOURCES.find((entry) => entry.key === label);
    pending.push(`${label} (falta ${source ? displayPath(source.source) : 'build'})`);
  }

  checkBaseHref(dir);

  console.log(`\n  artefacto ${displayPath(dir)}: ${files} archivo(s), ${humanSize(bytes)}`);
  console.log(`  dataset   ${expectedDatasetId}`);
  if (missing.length === 0) {
    console.log('  index.html  landing, flutter y expo OK');
  }
  return { files, bytes };
}

function main() {
  assertInsideWorkspace();

  if (!checkOnly) {
    const missingSources = SOURCES.filter((entry) => !existsSync(entry.source));
    if (missingSources.length > 0) {
      console.error('ERROR: faltan builds requeridos:');
      for (const entry of missingSources) {
        console.error(`  - ${entry.label}: ${displayPath(entry.source)}`);
      }
      console.error('\n  Construí las apps primero (ver demo/README.md) o usá --check-only para auditar.');
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
    console.log('Nada que auditar: los targets se ensamblan después de construir Flutter y Expo.');
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
    console.log('            (esperado hasta que ambas apps estén construidas)');
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
