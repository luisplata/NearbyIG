#!/usr/bin/env node
/**
 * Los cinco gates de Sprint 0, verificables de una sola corrida.
 *
 * `docs/plan-sprints-backend-demo.md` §2 define cinco gates. `contract:check` ya
 * corre el gate del contrato completo, pero "el mock sigue publicable" y "no hay
 * secretos" no son parte de ese comando. Este script los corre todos y reporta
 * **pass/fail por gate** con exit code agregado: es lo que se usa en el verify,
 * no una inspección manual.
 *
 * Cada gate es una lista de pasos atómicos. Un gate pasa si todos sus pasos pasan;
 * el script sale 1 si cualquiera falla, y no corta en el primero para que el
 * reporte muestre el estado real de los cinco.
 *
 *   G1  El contrato compila y el cliente TS se genera sin errores
 *   G2  Los seeds se pueden correr dos veces sin duplicar
 *   G3  Un test de serialización confirma que ningún DTO expone coordenadas
 *   G4  El mock actual sigue intacto y publicable
 *   G5  No hay secretos ni configuración de Firebase en el artefacto
 */

import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Los comandos salen de package.json: no hay lógica duplicada en el YAML ni acá. */
const GATES = [
  {
    id: 'G1',
    title: 'el contrato compila y el cliente TS se genera',
    steps: [
      { label: 'contract:validate', command: 'npm run contract:validate' },
      { label: 'contract:generate:check', command: 'npm run contract:generate:check' },
      { label: 'contract:typecheck', command: 'npm run contract:typecheck' },
    ],
  },
  {
    id: 'G2',
    title: 'los seeds corren dos veces sin duplicar',
    steps: [
      { label: 'seed-idempotent', command: 'node --test contract/test/seed-idempotent.test.mjs' },
      { label: 'contract:seed:dry-run', command: 'npm run contract:seed:dry-run' },
    ],
  },
  {
    id: 'G3',
    title: 'ningún DTO expone coordenadas',
    steps: [{ label: 'no-coordinates', command: 'node --test contract/test/no-coordinates.test.mjs' }],
  },
  {
    id: 'G4',
    title: 'el mock sigue intacto y publicable',
    steps: [
      { label: 'validate', command: 'npm run validate' },
      { label: 'sync:check', command: 'npm run sync:check' },
      { label: 'test:scripts', command: 'npm run test:scripts' },
      { label: 'diff demo/ site/', command: 'git diff --stat -- demo site', expectEmpty: true },
      { label: 'assemble --strict', command: 'node scripts/assemble-site.mjs --strict site' },
    ],
  },
  {
    id: 'G5',
    title: 'sin secretos ni configuración de Firebase',
    steps: [{ label: 'secrets', command: 'node --test contract/test/secrets.test.mjs' }],
  },
];

/** Corre un paso y devuelve `{ ok, ms, output }`. */
function runStep(step) {
  const startedAt = Date.now();
  const result = spawnSync(step.command, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    shell: true,
  });
  const ms = Date.now() - startedAt;
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();

  if (result.error) {
    return { ok: false, ms, output: result.error.message };
  }
  if (step.expectEmpty) {
    const lines = output.split('\n').filter((line) => line.trim() !== '');
    return {
      ok: result.status === 0 && lines.length === 0,
      ms,
      output: lines.length === 0 ? '' : `hay cambios sin commitear:\n${output}`,
    };
  }
  return { ok: result.status === 0, ms, output };
}

/** Últimas líneas del output de un paso que falló. */
function tail(output, lines = 8) {
  const all = output.split('\n').filter((line) => line.trim() !== '');
  return all.slice(-lines).join('\n');
}

const startedAt = Date.now();
const report = [];
let failures = 0;

console.log('▶ gates de Sprint 0 · contrato congelado y banco de pruebas\n');

for (const gate of GATES) {
  console.log(`${gate.id} · ${gate.title}`);

  const results = [];
  for (const step of gate.steps) {
    const result = runStep(step);
    results.push({ ...step, ...result });
    const seconds = (result.ms / 1000).toFixed(1);
    console.log(`   ${result.ok ? '✓' : '✗'} ${step.label} (${seconds}s)`);
    if (!result.ok) {
      for (const line of tail(result.output).split('\n')) console.log(`       ${line}`);
    }
  }

  const passed = results.filter((result) => result.ok).length;
  const ok = passed === results.length;
  if (!ok) failures += 1;
  report.push({ ...gate, ok, passed, total: results.length });
  console.log('');
}

const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
const summary = report
  .map((gate) => `${gate.id} ${gate.ok ? 'PASS' : 'FAIL'} (${gate.passed}/${gate.total})`)
  .join(' · ');

console.log('─'.repeat(72));
console.log(summary);
console.log('─'.repeat(72));

if (failures > 0) {
  console.error(`\n✗ contract:gates — ${failures} de ${report.length} gates en rojo (${seconds}s)`);
  process.exit(1);
}

console.log(`\n✓ contract:gates verde: ${report.length}/${report.length} gates · ${seconds}s`);
