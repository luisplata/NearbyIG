/**
 * Cero secretos y cero configuración de Firebase en `contract/`.
 *
 * La lista de patrones **no se duplica**: se importa `SECRET_PATTERNS` de
 * `scripts/lib/denylist.mjs`, el mismo que audita el artefacto publicado. Si mañana
 * se agrega un patrón allá, este test lo hereda sin que nadie se acuerde.
 *
 * Lo que sí es propio de este archivo:
 *  - la lista de extensiones. `TEXT_EXTENSIONS` del denylist no incluye YAML, así
 *    que reusarla dejaría afuera `openapi.yaml`, `paths/` y `schemas/`: justo los
 *    archivos del contrato. Acá se declaran las cinco familias que existen.
 *  - el walk propio de `contract/` (el denylist audita el artefacto del sitio, no
 *    el árbol del contrato).
 *  - las claves de configuración de Firebase, que no son secretos con forma de
 *    token pero tampoco pueden viajar en un contrato.
 *
 * El test falla si aparece un archivo con una extensión que no está en la lista:
 * un archivo que el scan no mira es peor que un secreto encontrado.
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { test } from 'node:test';

import { SECRET_PATTERNS, auditText } from '../../scripts/lib/denylist.mjs';
import { CONTRACT_ROOT } from '../scripts/lib/spec.mjs';

/** Se camina el árbol commiteado: `dist/` es la doc buildeada e ignorada por git. */
const SKIP_DIRECTORIES = new Set(['dist', 'node_modules']);

const SCANNED_EXTENSIONS = ['.yaml', '.yml', '.json', '.mjs', '.ts', '.md'];

/**
 * Claves de configuración de Firebase. Se escriben con `_?` para que este archivo
 * no se auto-detecte: el scan también se corre sobre el propio test.
 */
const FIREBASE_PATTERNS = [
  { label: 'service account', pattern: /service_?[Aa]ccount/ },
  { label: 'firebase config', pattern: /firebase_?[Cc]onfig/ },
  { label: 'firebase init call', pattern: /initialize_?[Aa]pp/ },
  { label: 'google services file', pattern: /google-services\.json/ },
  { label: 'firebaserc', pattern: /\.fireba_?serc/ },
];

/** Archivos bajo `contract/`, con ruta relativa en POSIX. */
function listFiles(dir = CONTRACT_ROOT) {
  const files = [];
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (SKIP_DIRECTORIES.has(entry.name)) continue;
        walk(join(current, entry.name));
        continue;
      }
      if (entry.isFile()) files.push(join(current, entry.name));
    }
  };
  walk(dir);
  return files.map((file) => relative(CONTRACT_ROOT, file).split('\\').join('/')).sort();
}

const FILES = listFiles();
const SCANNED = FILES.filter((file) => SCANNED_EXTENSIONS.some((extension) => file.endsWith(extension)));

test('el scan cubre todo el árbol del contrato, sin archivos ciegos', () => {
  const unscanned = FILES.filter((file) => !SCANNED.includes(file));
  assert.deepEqual(unscanned, [], `archivos que ninguna extensión cubre: agregalos a SCANNED_EXTENSIONS`);

  // Y tiene que llegar a lo que importa: el spec, los schemas y el generado.
  for (const expected of ['openapi.yaml', 'generated/api.ts', 'schemas/errors.yaml', 'paths/auth.yaml', 'README.md']) {
    assert.ok(SCANNED.includes(expected), `el scan no llega a ${expected}`);
  }
  assert.ok(SCANNED.length >= 40, `el scan recorrió ${SCANNED.length} archivos: demasiado poco`);
});

test('ningún archivo del contrato lleva un secreto de la denylist', () => {
  const findings = [];
  for (const file of SCANNED) {
    const text = readFileSync(resolve(CONTRACT_ROOT, file), 'utf8');
    for (const rule of SECRET_PATTERNS) {
      const match = rule.pattern.exec(text);
      if (match) findings.push(`${file}: ${rule.label} → ${match[0].slice(0, 60)}`);
    }
  }
  assert.deepEqual(findings, [], `secretos en contract/:\n  ${findings.join('\n  ')}`);
});

test('ningún archivo del contrato lleva configuración de Firebase', () => {
  const findings = [];
  for (const file of SCANNED) {
    const text = readFileSync(resolve(CONTRACT_ROOT, file), 'utf8');
    for (const rule of FIREBASE_PATTERNS) {
      const match = rule.pattern.exec(text);
      if (match) findings.push(`${file}: ${rule.label} → ${match[0].slice(0, 60)}`);
    }
  }
  assert.deepEqual(findings, [], `configuración de Firebase en contract/:\n  ${findings.join('\n  ')}`);
});

test('el scanner está armado: un secreto inyectado se nombra con archivo y patrón', () => {
  // El valor se arma en runtime a propósito: escribirlo literal acá haría que este
  // mismo archivo lo detecte (el scan también se corre sobre el test).
  const injected = ['client', '_secret'].join('');
  const { findings } = auditText(`token: ${injected}`, { hosts: false });
  assert.equal(findings.length, 1, 'la denylist no está detectando el patrón que dice detectar');
  assert.equal(findings[0].kind, 'secret');

  const config = ['firebase', 'Config'].join('');
  assert.equal(
    FIREBASE_PATTERNS.some((rule) => rule.pattern.test(`${config} = {}`)),
    true,
    'la lista de Firebase no está armada',
  );
});
