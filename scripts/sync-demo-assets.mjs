#!/usr/bin/env node
/**
 * Sincroniza el contrato compartido hacia las apps y la landing.
 *
 * 1. lee fixtures/copy/design-tokens/photos
 * 2. calcula el datasetId del contenido
 * 3. verifica los hashes de PROVENANCE (marca y fuentes)
 * 4. rasteriza icon.svg a 192/512 PNG (resvg)
 * 5. copia marca, fuentes y golden a cada app existente
 * 6. escribe los generados (5 por app + dataset de la landing)
 *
 * Es idempotente: misma entrada → mismos bytes (LF, claves ordenadas, sin timestamps).
 * Los targets que todavía no existen se informan como `skipped`, no son un error.
 *
 * Flags:
 *   --target <all|flutter|expo|landing>
 *   --no-raster        usa los PNG ya commiteados
 *   --check            no escribe: falla si algo quedó desactualizado (drift)
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { datasetIdOf } from './lib/canonical.mjs';
import { buildGeneratedFiles } from './lib/generators.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHARED = join(ROOT, 'demo', 'shared');

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const noRaster = args.includes('--no-raster');

const targetArg = (() => {
  const inline = args.find((arg) => arg.startsWith('--target='));
  if (inline) return inline.slice('--target='.length);
  const index = args.indexOf('--target');
  if (index >= 0 && args[index + 1]) return args[index + 1];
  return 'all';
})();

const TARGETS = {
  flutter: { root: join(ROOT, 'demo', 'flutter-demo'), label: 'demo/flutter-demo' },
  expo: { root: join(ROOT, 'demo', 'expo-demo'), label: 'demo/expo-demo' },
  landing: { root: join(ROOT, 'demo', 'landing'), label: 'demo/landing' },
};

const BRAND_ASSETS = [
  { source: join(SHARED, 'assets/brand/icon.svg'), target: 'assets/brand/icon.svg' },
  { source: join(SHARED, 'assets/brand/icon-192.png'), target: 'assets/brand/icon-192.png' },
  { source: join(SHARED, 'assets/brand/icon-512.png'), target: 'assets/brand/icon-512.png' },
];

const FONT_ASSETS = [
  { source: join(SHARED, 'assets/fonts/Inter-Regular.ttf'), target: 'assets/fonts/Inter-Regular.ttf' },
  { source: join(SHARED, 'assets/fonts/Inter-SemiBold.ttf'), target: 'assets/fonts/Inter-SemiBold.ttf' },
  { source: join(SHARED, 'assets/fonts/OFL.txt'), target: 'assets/fonts/OFL.txt' },
];

/** La landing necesita el icono (favicon) y las fuentes para no pedir nada externo. */
const TARGET_ASSETS = {
  flutter: [...BRAND_ASSETS, ...FONT_ASSETS],
  expo: [...BRAND_ASSETS, ...FONT_ASSETS],
  landing: [...BRAND_ASSETS, ...FONT_ASSETS],
};

const TARGET_GOLDEN = {
  flutter: true,
  expo: true,
  landing: false,
};

const counters = { written: 0, unchanged: 0 };
const drift = [];
const skipped = [];
const notes = [];

function log(message) {
  console.log(message);
}

function warn(message) {
  console.warn(`WARN: ${message}`);
}

function fatal(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function displayPath(absolute) {
  return relative(ROOT, absolute).split('\\').join('/');
}

function writePlanned(absolutePath, content) {
  const desired = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
  const current = existsSync(absolutePath) ? readFileSync(absolutePath) : null;

  if (current && current.equals(desired)) {
    counters.unchanged += 1;
    return;
  }

  if (checkOnly) {
    drift.push({ path: displayPath(absolutePath), reason: current ? 'contenido distinto' : 'no existe' });
    return;
  }

  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, desired);
  counters.written += 1;
  log(`  write     ${displayPath(absolutePath)}`);
}

function readJson(relativePath) {
  const absolute = join(ROOT, relativePath);
  try {
    return JSON.parse(readFileSync(absolute, 'utf8'));
  } catch (error) {
    fatal(`${relativePath}: no se pudo leer o parsear (${error.message})`);
  }
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

/** Verifica que los hashes registrados en PROVENANCE.md coincidan con los archivos. */
function verifyProvenance(provenancePath, assetDir) {
  const text = readFileSync(provenancePath, 'utf8');
  const entries = [];
  for (const line of text.split(/\r?\n/)) {
    const match = /^sha256\s+(\S+)\s+([0-9a-f]{64})$/.exec(line.trim());
    if (match) entries.push({ name: match[1], hash: match[2] });
  }

  if (entries.length === 0) {
    fatal(`${displayPath(provenancePath)}: no tiene líneas "sha256 <archivo> <hash>"`);
  }

  for (const entry of entries) {
    const absolute = join(assetDir, entry.name);
    if (!existsSync(absolute)) {
      fatal(`${displayPath(provenancePath)}: registra "${entry.name}" pero el archivo no existe`);
    }
    const actual = sha256(readFileSync(absolute));
    if (actual !== entry.hash) {
      fatal(
        `${entry.name}: sha256 no coincide con ${displayPath(provenancePath)}.\n` +
          `       registrado: ${entry.hash}\n       actual:     ${actual}\n` +
          `       Si el cambio es intencional, actualizá el hash en PROVENANCE.md y volvé a correr el sync.`,
      );
    }
  }

  return entries.length;
}

async function rasterizeBrand() {
  const svgPath = join(SHARED, 'assets/brand/icon.svg');
  const sizes = [
    { width: 192, file: join(SHARED, 'assets/brand/icon-192.png') },
    { width: 512, file: join(SHARED, 'assets/brand/icon-512.png') },
  ];

  if (noRaster) {
    for (const size of sizes) {
      if (!existsSync(size.file)) {
        fatal(`--no-raster requiere ${displayPath(size.file)}; corré el sync sin --no-raster una vez`);
      }
    }
    notes.push('--no-raster: se reutilizan los PNG de marca ya commiteados');
    return sizes.map((size) => ({ ...size, buffer: readFileSync(size.file) }));
  }

  let Resvg;
  try {
    ({ Resvg } = await import('@resvg/resvg-js'));
  } catch (error) {
    for (const size of sizes) {
      if (!existsSync(size.file)) {
        fatal(
          `no se pudo cargar @resvg/resvg-js (${error.message}) y falta ${displayPath(size.file)}.\n` +
            '       Corré `npm install` (o el sync con --no-raster si los PNG ya existen).',
        );
      }
    }
    warn(`no se pudo cargar @resvg/resvg-js (${error.message}); se usan los PNG existentes`);
    return sizes.map((size) => ({ ...size, buffer: readFileSync(size.file) }));
  }

  const svg = readFileSync(svgPath);
  return sizes.map((size) => {
    const png = new Resvg(svg, { fitTo: { mode: 'width', value: size.width } }).render().asPng();
    return { ...size, buffer: Buffer.from(png) };
  });
}

async function main() {
  log(`NearbyIG demo sync${checkOnly ? ' (check)' : ''}`);

  const fixtures = readJson('demo/shared/fixtures.json');
  const copy = readJson('demo/shared/copy.json');
  const tokens = readJson('demo/shared/design-tokens.json');
  const photos = readJson('demo/shared/photos.json');

  const datasetId = datasetIdOf({ fixtures, copy, designTokens: tokens, photos });
  log(`  dataset   ${datasetId}`);

  const brandHashes = verifyProvenance(
    join(SHARED, 'assets/brand/PROVENANCE.md'),
    join(SHARED, 'assets/brand'),
  );
  const fontHashes = verifyProvenance(
    join(SHARED, 'assets/fonts/PROVENANCE.md'),
    join(SHARED, 'assets/fonts'),
  );
  log(`  provenance ${brandHashes + fontHashes} hash(es) verificados`);

  const rendered = await rasterizeBrand();
  for (const size of rendered) {
    writePlanned(size.file, size.buffer);
  }

  const selectedTargets =
    targetArg === 'all' ? Object.keys(TARGETS) : [targetArg];
  for (const target of selectedTargets) {
    if (!(target in TARGETS)) {
      fatal(`--target desconocido: ${target} (válidos: all, ${Object.keys(TARGETS).join(', ')})`);
    }
  }

  const generated = buildGeneratedFiles({ fixtures, copy, tokens, photos, datasetId });

  for (const target of selectedTargets) {
    const { root, label } = TARGETS[target];
    if (!existsSync(root)) {
      skipped.push(`${label} (target inexistente)`);
      continue;
    }

    for (const asset of TARGET_ASSETS[target]) {
      if (!existsSync(asset.source)) {
        fatal(`falta el asset fuente ${displayPath(asset.source)}`);
      }
      writePlanned(join(root, asset.target), readFileSync(asset.source));
    }

    if (TARGET_GOLDEN[target]) {
      for (const file of readdirSync(join(SHARED, 'golden')).sort()) {
        const absolute = join(SHARED, 'golden', file);
        if (!statSync(absolute).isFile()) continue;
        writePlanned(join(root, 'test/golden', file), readFileSync(absolute));
      }
    }

    const files = generated[target] ?? {};
    for (const relativePath of Object.keys(files).sort()) {
      writePlanned(join(root, relativePath), files[relativePath]);
    }
  }

  for (const note of notes) {
    log(`  note      ${note}`);
  }
  for (const entry of skipped) {
    log(`  skipped   ${entry}`);
  }

  if (checkOnly) {
    if (drift.length > 0) {
      console.error(`\nDRIFT: ${drift.length} archivo(s) generado(s) desactualizado(s):`);
      for (const entry of drift) {
        console.error(`  - ${entry.path} (${entry.reason})`);
      }
      console.error('\nCorré `node scripts/sync-demo-assets.mjs` y commiteá el resultado.');
      process.exit(1);
    }
    log(`\nOK (check): ${counters.unchanged} archivo(s) al día, 0 drift.`);
    return;
  }

  log(`\nOK: ${counters.written} archivo(s) escrito(s), ${counters.unchanged} sin cambios, ${skipped.length} target(s) omitido(s).`);
}

main().catch((error) => {
  console.error(`ERROR: ${error.stack ?? error.message}`);
  process.exit(1);
});
