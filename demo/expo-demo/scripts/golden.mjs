#!/usr/bin/env node
/**
 * Regenera `demo/shared/golden/expected.json` desde el reducer Expo.
 *
 * Por qué un wrapper y no un prefijo de entorno en el comando: la forma
 * `VAR=1 comando` no existe en Windows (ni en cmd ni en PowerShell), y el repo se
 * desarrolla en Windows. Acá la bandera se fija en el `env` del proceso hijo, así que
 * el mismo comando corre en las tres plataformas.
 *
 * Por qué `process.execPath` + `vitest.mjs` y no `npx` ni `node_modules/.bin/vitest`:
 * `npx` resuelve contra el registry y mete ruido de versión; en Windows el binario es
 * `vitest.cmd` y exige `shell: true` con quoting frágil. `process.execPath` es el
 * mismo Node que corre este script y `vitest.mjs` es el `bin` de `vitest/package.json`.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const vitest = join(root, 'node_modules', 'vitest', 'vitest.mjs');

if (!existsSync(vitest)) {
  console.error('[golden] falta demo/expo-demo/node_modules/vitest: corré npm --prefix demo/expo-demo ci.');
  process.exit(1);
}

const result = spawnSync(process.execPath, [vitest, 'run', 'test/reducer.golden.test.ts'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, UPDATE_GOLDEN: '1' },
});

if (result.error) {
  console.error('[golden] no se pudo lanzar vitest: ' + result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
