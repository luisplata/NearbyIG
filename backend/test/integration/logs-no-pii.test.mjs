import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';

/**
 * Logs sin PII.
 *
 * No hay forma de leer el stdout del proceso de la API desde el test (corren en
 * procesos distintos y el log lo escribe Nest), así que el chequeo viable es
 * estático sobre los **call sites**: se recorren todas las llamadas a
 * `logger.*`/`console.*` de `src/`, se les quita el texto literal y se miran
 * las expresiones que se interpolan. Eso es exactamente lo que puede filtrar un
 * token, un ticket, una coordenada o un identificador personal.
 *
 * El texto literal no se evalúa a propósito: un mensaje como "ticket emitido"
 * es prosa, no un dato. Lo que importa es qué variable entra al mensaje.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '..', '..', 'src');

/** Palabras que no pueden aparecer en un identificador interpolado. */
const FORBIDDEN_WORDS = new Set([
  'token',
  'ticket',
  'authorization',
  'password',
  'secret',
  'lat',
  'lng',
  'lon',
  'latitude',
  'longitude',
  'coordinate',
  'coordinates',
  'point',
  'email',
  'handle',
  'nickname',
  'instagram',
]);

/** Compuestos que el split camelCase no separa solo (`profileId` → `profile`, `id`). */
const FORBIDDEN_IDENTIFIERS = new Set([
  'profileid',
  'instagramhandle',
  'sessiontoken',
  'streamticket',
  'authtoken',
]);

const LOG_CALL =
  /(?:console|logger|Logger)\b[^\n;]{0,80}?\.(?:log|debug|info|warn|error|verbose|trace)\s*\(/g;

function filesUnder(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...filesUnder(full));
    else if (entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

/** Índice del cierre de un bloque que abre en `open` (`{{`, `((`, `[`...). */
function matchClose(text, open) {
  const pairs = { '{': '}', '(': ')', '[': ']' };
  const opener = text[open];
  const closer = pairs[opener];
  assert.ok(closer !== undefined, `matchClose: no sé cerrar "${opener}"`);
  let depth = 0;
  let i = open;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      i = skipQuoted(text, i);
      continue;
    }
    if (ch === opener) depth += 1;
    else if (ch === closer) {
      depth -= 1;
      if (depth === 0) return i;
    }
    i += 1;
  }
  return -1;
}

/** Salta un literal (comillas simples, dobles o template) y devuelve el índice siguiente. */
function skipQuoted(text, start) {
  const quote = text[start];
  let i = start + 1;
  while (i < text.length) {
    if (text[i] === '\\') {
      i += 2;
      continue;
    }
    if (quote === '`' && text[i] === '$' && text[i + 1] === '{') {
      const end = matchClose(text, i + 1);
      i = end === -1 ? text.length : end + 1;
      continue;
    }
    if (text[i] === quote) return i + 1;
    i += 1;
  }
  return text.length;
}

/**
 * Texto del argumento sin literales, conservando lo que está dentro de `${}`.
 * Es lo que se puede ejecutar: el resto es copy.
 */
function executablePart(text) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "'" || ch === '"') {
      i = skipQuoted(text, i);
      out += ' ';
      continue;
    }
    if (ch === '`') {
      out += ' ';
      i += 1;
      while (i < text.length && text[i] !== '`') {
        if (text[i] === '\\') {
          i += 2;
          continue;
        }
        if (text[i] === '$' && text[i + 1] === '{') {
          const end = matchClose(text, i + 1);
          out += ` ${executablePart(text.slice(i + 2, end))} `;
          i = end === -1 ? text.length : end + 1;
          continue;
        }
        i += 1;
      }
      i += 1;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/** Identificadores de una expresión, ya normalizados a palabras. */
function forbiddenIn(code) {
  const hits = [];
  for (const identifier of code.match(/[A-Za-z_$][A-Za-z0-9_$]*/g) ?? []) {
    const lowered = identifier.toLowerCase();
    if (FORBIDDEN_IDENTIFIERS.has(lowered)) hits.push(identifier);
    const words = identifier
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .split(/[_\s$]+/)
      .filter((word) => word !== '');
    for (const word of words) {
      if (FORBIDDEN_WORDS.has(word.toLowerCase())) hits.push(identifier);
    }
  }
  return [...new Set(hits)];
}

/** Todos los call sites de log del árbol, con el identificador prohibido si lo hay. */
function scan(root) {
  const findings = [];
  let callSites = 0;
  for (const file of filesUnder(root)) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(LOG_CALL)) {
      const open = match.index + match[0].length - 1;
      const close = matchClose(source, open);
      const args = close === -1 ? source.slice(open + 1) : source.slice(open + 1, close);
      callSites += 1;
      const hits = forbiddenIn(executablePart(args));
      if (hits.length > 0) {
        const line = source.slice(0, match.index).split('\n').length;
        findings.push(`${relative(root, file)}:${line} interpola ${hits.join(', ')}`);
      }
    }
  }
  return { callSites, findings };
}

describe('logs sin PII', () => {
  test('ninguna llamada a log interpola tokens, tickets, coordenadas ni identidad personal', () => {
    const { callSites, findings } = scan(SRC);
    assert.ok(callSites >= 8, `el escáner tiene que ver el árbol entero (vio ${callSites} call sites)`);
    assert.deepEqual(findings, [], `logs con datos sensibles:\n${findings.join('\n')}`);
  });

  test('el filtro de errores loguea el path, no la URL con query', () => {
    const source = readFileSync(resolve(SRC, 'common', 'problem.filter.ts'), 'utf8');
    assert.match(source, /request\.path/);
    assert.doesNotMatch(
      source,
      /request\.(url|originalUrl)/,
      'la query puede llevar ?ticket= y terminaría en el log',
    );
  });

  test('el server no usa console.* (sólo el Logger de Nest)', () => {
    const offenders = filesUnder(SRC)
      .filter((file) => /\bconsole\s*\./.test(readFileSync(file, 'utf8')))
      .map((file) => relative(SRC, file));
    assert.deepEqual(offenders, []);
  });

  test('el escáner se detecta a sí mismo cuando hay una fuga', () => {
    const leaked = scanFixture('this.logger.log(`sesión ${session.token}`);');
    assert.deepEqual(leaked.findings.length, 1);
    assert.match(leaked.findings[0], /token/);

    const concatenated = scanFixture('this.logger.log(mensaje + perfil.nickname);');
    assert.deepEqual(concatenated.findings.length, 1);

    const prose = scanFixture("this.logger.log('ticket emitido');");
    assert.deepEqual(prose.findings, []);

    const clean = scanFixture('this.logger.log(`slot ${claim.demoSlot} region=${regionKey}`);');
    assert.deepEqual(clean.findings, []);
  });
});

/** Corre el mismo análisis sobre un snippet, sin tocar el filesystem. */
function scanFixture(source) {
  const findings = [];
  let callSites = 0;
  for (const match of source.matchAll(LOG_CALL)) {
    const open = match.index + match[0].length - 1;
    const close = matchClose(source, open);
    const args = close === -1 ? source.slice(open + 1) : source.slice(open + 1, close);
    callSites += 1;
    const hits = forbiddenIn(executablePart(args));
    if (hits.length > 0) findings.push(`fixture interpola ${hits.join(', ')}`);
  }
  return { callSites, findings };
}
