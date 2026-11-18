/**
 * Firma de release para el `.aab` que se sube a Play, versionada como config
 * plugin.
 *
 * Por qué vive acá y no en `android/`: ese directorio es salida de CNG
 * (`prebuild`) — está gitignored y se regenera en cada build, también en CI. Un
 * `signingConfigs { release { … } }` escrito a mano ahí no existe en el runner,
 * el `.aab` sale firmado con la debug key y Play lo rechaza recién al subirlo.
 *
 * Por qué brace-matching y no regex: el template de Expo escribe el literal
 * `signingConfig signingConfigs.debug` DOS veces (buildType debug y buildType
 * release). Un replace global dejaría la release apuntando al keystore de debug
 * —el bug que este plugin existe para evitar—; un replace del primero rompe
 * debug. Acá se appendea un bloque `release { … }` al final de `signingConfigs`
 * y otro al final de `buildTypes`: Gradle configura el mismo build type dos
 * veces y gana la última asignación, así que el template queda intacto.
 *
 * El gate son las variables de entorno, no los secrets: `android.yml` compila
 * sin ellas (APK del piloto) y ese run tiene que seguir verde. `ANDROID_KEYSTORE_PATH`
 * no está en el gate porque la deriva el workflow al decodificar el base64.
 */

const MARKER = '// @nearbyig/release-signing';

/**
 * Las que tienen que existir para que haya algo que firmar. Si falta una, el
 * prebuild deja `build.gradle` byte-idéntico y avisa una sola vez.
 */
const REQUIRED = [
  'ANDROID_KEYSTORE_BASE64',
  'ANDROID_KEYSTORE_PASSWORD',
  'ANDROID_KEY_ALIAS',
  'ANDROID_KEY_PASSWORD',
];

/**
 * 1 en cada carácter "estructural" (fuera de comentarios y strings), 0 adentro.
 *
 * Necesario porque el template tiene `//` y `"…"` con llaves y con paréntesis
 * que, contados a ciegas, desalinean el brace-matching. Groovy no anida strings
 * de la misma comilla, así que el estado es lineal.
 */
function codeMask(text) {
  const mask = new Uint8Array(text.length).fill(1);
  let index = 0;

  while (index < text.length) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '/' && next === '/') {
      while (index < text.length && text[index] !== '\n') mask[index++] = 0;
      continue;
    }

    if (char === '/' && next === '*') {
      mask[index++] = 0;
      mask[index++] = 0;
      while (index < text.length && !(text[index] === '*' && text[index + 1] === '/')) {
        mask[index++] = 0;
      }
      if (index < text.length) {
        mask[index++] = 0;
        mask[index++] = 0;
      }
      continue;
    }

    if (char === "'" || char === '"') {
      const quote = char;
      mask[index++] = 0;
      while (index < text.length) {
        if (text[index] === '\\') {
          mask[index++] = 0;
          if (index < text.length) mask[index++] = 0;
          continue;
        }
        const isEnd = text[index] === quote;
        mask[index++] = 0;
        if (isEnd) break;
      }
      continue;
    }

    index++;
  }

  return mask;
}

/** Sangría de la línea donde arranca `index` (vacía si el token no abre línea). */
function indentAt(text, index) {
  const lineStart = text.lastIndexOf('\n', index - 1) + 1;
  const lead = /^[ \t]*/.exec(text.slice(lineStart, index));
  return lead ? lead[0] : '';
}

/** Índice de la `}` que cierra la `{` de `open`, salteando comentarios y strings. */
function matchBrace(text, mask, open, limit) {
  let depth = 0;

  for (let index = open; index < limit; index++) {
    if (mask[index] !== 1) continue;

    const char = text[index];
    if (char === '{') depth++;
    else if (char === '}' && --depth === 0) return index;
  }

  return -1;
}

/**
 * Localiza `name { … }` dentro de `[from, to)`.
 *
 * No exige que el nombre abra línea: un template minificado (`android {
 * signingConfigs { … } }`) tiene que funcionar igual. El prefijo `[^\w$.]` evita
 * los falsos positivos que importan: `signingConfigs.release` y
 * `signingConfig signingConfigs.debug` no van seguidos de `{`.
 */
function findBlock(text, mask, name, from, to) {
  const pattern = new RegExp(`(^|[^\\w$.])${name}[ \\t]*\\{`, 'g');
  pattern.lastIndex = from;

  let match;
  while ((match = pattern.exec(text)) !== null) {
    const start = match.index + match[1].length;
    if (start >= to) return null;

    const open = pattern.lastIndex - 1;
    if (mask[start] !== 1 || mask[open] !== 1) continue;

    const close = matchBrace(text, mask, open, to);
    // Bloque sin cerrar: no hay ancla confiable, mejor fallar que adivinar.
    if (close === -1) return null;

    return { start, open, close, indent: indentAt(text, start) };
  }

  return null;
}

/**
 * Paso de indentación del bloque, derivado del template.
 *
 * Se mide la primera línea hija (`debug {`) contra la del dueño. Hardcodear 8
 * espacios funciona con el template de hoy y rompe el día que Expo cambie el
 * formato o alguien pruebe con 2 espacios.
 */
function unitFor(text, block) {
  const body = text.slice(block.open + 1, block.close);
  const child = /\r?\n([ \t]+)\S/.exec(body);

  if (!child) return '    ';

  const childIndent = child[1];
  return childIndent.startsWith(block.indent) && childIndent.length > block.indent.length
    ? childIndent.slice(block.indent.length)
    : childIndent;
}

/**
 * `release { … }` de `signingConfigs`, con las líneas internas relativas al
 * hijo: sólo el primer nivel lleva `unit`; `insertBlock` pone el segundo.
 */
function signingLines(unit) {
  return [
    'release {',
    `${unit}${MARKER} — la escribe el plugin homónimo; no editar a mano.`,
    `${unit}storeFile file(System.getenv("ANDROID_KEYSTORE_PATH"))`,
    `${unit}storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")`,
    `${unit}keyAlias System.getenv("ANDROID_KEY_ALIAS")`,
    `${unit}keyPassword System.getenv("ANDROID_KEY_PASSWORD")`,
    '}',
  ];
}

/** `release { … }` de `buildTypes`: la línea que hace que el bundle se firme. */
function buildTypeLines(unit) {
  return ['release {', `${unit}signingConfig signingConfigs.release`, '}'];
}

/**
 * Inserta `lines` como últimas sentencias del bloque.
 *
 * Las líneas llegan relativas al hijo (`release {` y, adentro, `unit + …`); acá
 * se les pone la sangría real y se deja la `}` de cierre en su columna.
 */
function insertBlock(text, block, unit, lines, eol) {
  const childIndent = block.indent + unit;
  const lined = lines.map((line) => `${childIndent}${line}`).join(eol);
  const closeLineStart = text.lastIndexOf('\n', block.close - 1) + 1;
  const beforeClose = text.slice(closeLineStart, block.close);

  // Caso normal: la `}` está sola en su línea. Insertamos al inicio de esa
  // línea y terminamos en `eol`: la `}` conserva la sangría que ya tenía.
  if (/^[ \t]*$/.test(beforeClose)) {
    return { at: closeLineStart, text: `${lined}${eol}` };
  }

  // Template minificado: la `}` comparte línea con la última sentencia, así que
  // hay que abrir línea y devolverle a la `}` su columna.
  return { at: block.close, text: `${eol}${lined}${eol}${block.indent}` };
}

/**
 * Post-condición: relee el resultado y verifica que cada bloque tenga lo suyo.
 *
 * Un prebuild que "funcionó" pero dejó la asignación fuera de `buildTypes` es
 * peor que uno que falla: el `.aab` sale firmado con debug y la causa aparece
 * en Play. Preferimos romper ruidoso acá.
 */
function assertApplied(contents) {
  const mask = codeMask(contents);
  const android = findBlock(contents, mask, 'android', 0, contents.length);
  if (!android) throw new Error('no quedó el bloque `android {` después del insert');

  const signing = findBlock(contents, mask, 'signingConfigs', android.open, android.close);
  const buildTypes = findBlock(contents, mask, 'buildTypes', android.open, android.close);

  if (!signing) throw new Error('no quedó el bloque `signingConfigs {` después del insert');
  if (!buildTypes) throw new Error('no quedó el bloque `buildTypes {` después del insert');

  const signingBody = contents.slice(signing.open, signing.close);
  const buildTypesBody = contents.slice(buildTypes.open, buildTypes.close);

  if (!signingBody.includes(MARKER)) {
    throw new Error('el bloque de firma no quedó dentro de `signingConfigs {`');
  }
  if (!signingBody.includes('storeFile file(System.getenv("ANDROID_KEYSTORE_PATH"))')) {
    throw new Error('el bloque de firma no quedó completo dentro de `signingConfigs {`');
  }
  if (!buildTypesBody.includes('signingConfig signingConfigs.release')) {
    throw new Error('`signingConfig signingConfigs.release` no quedó dentro de `buildTypes {`');
  }
}

/**
 * Puro y testeable sin Expo: `(contents, env) => contents`.
 *
 * Sin fs, sin estado global, sin side effects al importar. Devuelve el texto tal
 * cual cuando falta cualquiera de las cuatro variables — el build sin secrets
 * (`android.yml`) tiene que seguir produciendo su APK de debug.
 */
function applySigning(contents, env = process.env) {
  if (contents.includes(MARKER)) {
    console.log('[withReleaseSigning] firma de release ya presente; sin cambios');
    return contents;
  }

  const missing = REQUIRED.filter((name) => !env[name]);
  if (missing.length > 0) {
    // Un solo warning con todas las que faltan: en el log de CI se lee de una.
    console.warn(
      `[withReleaseSigning] faltan ${missing.join(', ')}; ` +
        'app/build.gradle queda con la firma de debug',
    );
    return contents;
  }

  const eol = contents.includes('\r\n') ? '\r\n' : '\n';
  const mask = codeMask(contents);
  const android = findBlock(contents, mask, 'android', 0, contents.length);
  if (!android) {
    throw new Error('[withReleaseSigning] no encontré el bloque `android {` en app/build.gradle');
  }

  const signing = findBlock(contents, mask, 'signingConfigs', android.open, android.close);
  if (!signing) {
    throw new Error(
      '[withReleaseSigning] no encontré el bloque `signingConfigs {` en app/build.gradle',
    );
  }

  const buildTypes = findBlock(contents, mask, 'buildTypes', android.open, android.close);
  if (!buildTypes) {
    throw new Error(
      '[withReleaseSigning] no encontré el bloque `buildTypes {` en app/build.gradle',
    );
  }

  const signingUnit = unitFor(contents, signing);
  const buildTypesUnit = unitFor(contents, buildTypes);

  // De mayor a menor: al revés, el primer insert corre el índice del segundo.
  const operations = [
    insertBlock(contents, signing, signingUnit, signingLines(signingUnit), eol),
    insertBlock(contents, buildTypes, buildTypesUnit, buildTypeLines(buildTypesUnit), eol),
  ].sort((left, right) => right.at - left.at);

  let result = contents;
  for (const operation of operations) {
    result = result.slice(0, operation.at) + operation.text + result.slice(operation.at);
  }

  assertApplied(result);
  console.log('[withReleaseSigning] firma de release inyectada en app/build.gradle');
  return result;
}

/**
 * Config plugin: sólo envuelve `applySigning` con el mod oficial de Gradle.
 *
 * `require` diferido a propósito: así este archivo se puede importar desde un
 * test de Node puro (o un `node -e`) sin cargar todo `expo/config-plugins`.
 */
module.exports = function withReleaseSigning(config) {
  const { withAppBuildGradle } = require('expo/config-plugins');

  return withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== 'groovy') {
      // Un template Kotlin DSL no tiene los mismos getters: fallar acá es más
      // barato que descubrirlo con un `.aab` sin firmar.
      throw new Error(
        `[withReleaseSigning] esperaba Groovy y encontré "${mod.modResults.language}"`,
      );
    }

    mod.modResults.contents = applySigning(mod.modResults.contents);
    return mod;
  });
};

module.exports.applySigning = applySigning;
module.exports.MARKER = MARKER;
module.exports.REQUIRED = REQUIRED;
