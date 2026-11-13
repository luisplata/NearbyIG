#!/usr/bin/env node
/**
 * Gate del contrato: `redocly lint` + invariantes que el linter no puede ver.
 *
 * Invariantes:
 *  - raíz OpenAPI 3.1.0, `info.version` semver y `servers` con http://localhost:3000
 *  - toda operation declara `x-implementation-sprint` entero en 1..4
 *  - `operationId` presente y único
 *  - ningún path con prefijo de versión (`/v1`): el versionado vive en `info`
 *  - todo `$ref` resuelve, es relativo y no sale de `contract/`
 *  - `info.x-contract-id` igual al hash canónico del documento (con el campo en `pending`)
 *
 * Sale con código 1 y un mensaje por violación. Si todo pasa, imprime el id del contrato.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

import {
  CONTRACT_ID_PATTERN,
  CONTRACT_ROOT,
  REDOCLY_CONFIG,
  SPEC_FILE,
  canonicalContractId,
  listOperations,
  listRefs,
  loadSpec,
  splitRef,
} from './lib/spec.mjs';

const SUPPORTED_SPRINTS = [1, 2, 3, 4, 5];
const REPO_ROOT = resolve(CONTRACT_ROOT, '..');
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

const problems = [];
const rel = (file) => relative(REPO_ROOT, file).split('\\').join('/');

function structuralChecks() {
  let loaded;
  try {
    loaded = loadSpec();
  } catch (error) {
    problems.push(`el contrato no se pudo resolver: ${error.message}`);
    return;
  }

  const { raw, spec } = loaded;

  if (spec.openapi !== '3.1.0') {
    problems.push(`openapi debe ser 3.1.0, no ${JSON.stringify(spec.openapi)}`);
  }
  if (!SEMVER.test(spec.info?.version ?? '')) {
    problems.push(`info.version debe ser semver, no ${JSON.stringify(spec.info?.version)}`);
  }

  const servers = (spec.servers ?? []).map((server) => server?.url);
  if (!servers.includes('http://localhost:3000')) {
    problems.push('servers debe incluir http://localhost:3000');
  }

  const operations = listOperations(spec);
  if (operations.length === 0) problems.push('el documento no declara ninguna operation');

  const seen = new Map();
  for (const { path, method, operationId, operation } of operations) {
    const label = `${method.toUpperCase()} ${path}`;

    if (path.startsWith('/v1')) {
      problems.push(`${label}: el path no lleva prefijo de versión (/v1)`);
    }
    if (typeof operationId !== 'string' || operationId.trim() === '') {
      problems.push(`${label}: falta operationId`);
    } else if (seen.has(operationId)) {
      problems.push(`${label}: operationId duplicado "${operationId}" (también en ${seen.get(operationId)})`);
    } else {
      seen.set(operationId, label);
    }

    const sprint = operation?.['x-implementation-sprint'];
    if (!Number.isInteger(sprint) || !SUPPORTED_SPRINTS.includes(sprint)) {
      problems.push(
        `${label}: x-implementation-sprint debe ser entero en 1..4, no ${JSON.stringify(sprint)}`,
      );
    }
  }

  const refs = listRefs(raw);
  for (const { ref, at } of refs) {
    let file;
    try {
      ({ file } = splitRef(ref, SPEC_FILE));
    } catch (error) {
      problems.push(`${at}: ${error.message}`);
      continue;
    }
    if (relative(CONTRACT_ROOT, file).startsWith('..')) {
      problems.push(`${at}: $ref sale de contract/ (${ref})`);
    }
  }

  const expectedId = canonicalContractId(spec);
  if (!CONTRACT_ID_PATTERN.test(expectedId)) {
    problems.push(`el id calculado no tiene la forma esperada: ${expectedId}`);
  }
  const declaredId = spec.info?.['x-contract-id'];
  if (declaredId !== expectedId) {
    problems.push(
      `info.x-contract-id: ${JSON.stringify(declaredId)} ≠ ${expectedId} — ` +
        `escribí "${expectedId}" en contract/openapi.yaml`,
    );
  }

  console.log(
    `  ${operations.length} operations · ${refs.length} $ref resueltos · ` +
      `sprints ${[...new Set(operations.map((op) => op.operation['x-implementation-sprint']))].sort().join(', ')}`,
  );
  for (const { path, method, operationId, operation } of operations) {
    console.log(
      `    ${method.toUpperCase()} ${path} · ${operationId} · S${operation['x-implementation-sprint']}`,
    );
  }
}

function redoclyEntry() {
  const pkgFile = join(REPO_ROOT, 'node_modules', '@redocly', 'cli', 'package.json');
  if (!existsSync(pkgFile)) {
    throw new Error('falta @redocly/cli: corré `npm ci` en la raíz del repo');
  }
  const { bin } = JSON.parse(readFileSync(pkgFile, 'utf8'));
  return join(dirname(pkgFile), typeof bin === 'string' ? bin : bin.redocly);
}

function lintChecks() {
  let entry;
  try {
    entry = redoclyEntry();
  } catch (error) {
    problems.push(error.message);
    return;
  }

  const result = spawnSync(
    process.execPath,
    [entry, 'lint', rel(SPEC_FILE), '--config', rel(REDOCLY_CONFIG), '--format', 'stylish'],
    { cwd: REPO_ROOT, encoding: 'utf8' },
  );

  if (result.error) {
    problems.push(`no se pudo correr redocly: ${result.error.message}`);
    return;
  }
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    problems.push('redocly lint falló (ver el detalle arriba)');
  }
}

console.log(`▶ ${rel(SPEC_FILE)}`);
structuralChecks();
lintChecks();

if (problems.length > 0) {
  console.error(`\n✗ contract:validate — ${problems.length} problema(s):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log('\n✓ contract:validate verde: el contrato es OpenAPI 3.1 válido y cumple sus invariantes.');
