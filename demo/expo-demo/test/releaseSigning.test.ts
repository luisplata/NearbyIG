import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import withReleaseSigningModule from '../plugins/withReleaseSigning';

/**
 * El plugin de firma se prueba sobre TEXTO, no con Expo: `applySigning` es
 * pura. Si esto se rompe, el `.aab` que se sube a Play sale firmado con la
 * debug key y el rechazo aparece al subirlo, no acá.
 *
 * Las aserciones de ubicación PARSEAN el resultado (buscan el bloque y cuentan
 * llaves) en vez de mirar strings sueltos: `signingConfig signingConfigs.release`
 * fuera de `buildTypes` no firma nada, aunque el `grep` lo encuentre.
 */

/**
 * El plugin es CommonJS (`module.exports = fn` con props colgadas). TypeScript
 * no ve esas props sobre el export, así que la forma se declara una sola vez acá.
 */
type ReleaseSigningPlugin = {
  (config: unknown): unknown;
  applySigning: (contents: string, env?: Record<string, string | undefined>) => string;
  MARKER: string;
};

const withReleaseSigning = withReleaseSigningModule as unknown as ReleaseSigningPlugin;
const { MARKER, applySigning } = withReleaseSigning;

const ROOT = process.cwd();

/**
 * El gate mira la ruta y las tres credenciales; el base64 lo decodifica el
 * workflow. Los valores salen de una constante a propósito: un literal al lado
 * de una clave llamada `PASSWORD` hace saltar a los scanners de secretos, y un
 * falso positivo en cada PR enseña a ignorar el check.
 */
const FAKE_CREDENTIAL = 'valor-de-prueba';
const FULL_ENV: Record<string, string> = {
  ANDROID_KEYSTORE_PATH: '/tmp/fake-keystore.jks',
  ANDROID_KEYSTORE_PASSWORD: FAKE_CREDENTIAL,
  ANDROID_KEY_ALIAS: 'upload',
  ANDROID_KEY_PASSWORD: FAKE_CREDENTIAL,
};

/** Recorte del template real de Expo: 4 espacios, `debug { … }` en los dos bloques. */
const TEMPLATE = [
  'android {',
  '    signingConfigs {',
  '        debug {',
  "            storeFile file('debug.keystore')",
  '        }',
  '    }',
  '    buildTypes {',
  '        debug {',
  '            signingConfig signingConfigs.debug',
  '        }',
  '        release {',
  '            signingConfig signingConfigs.debug',
  '        }',
  '    }',
  '}',
  '',
].join('\n');

/** Mismo template con dos espacios: la indentación se deriva, no se hardcodea. */
const TEMPLATE_TWO_SPACES = [
  'android {',
  '  signingConfigs {',
  '    debug {',
  "      storeFile file('debug.keystore')",
  '    }',
  '  }',
  '  buildTypes {',
  '    debug {',
  '      signingConfig signingConfigs.debug',
  '    }',
  '  }',
  '}',
  '',
].join('\n');

/** Devuelve el texto completo del bloque `name { … }`, contando llaves. */
function blockBody(text: string, name: string): string {
  const start = text.indexOf(`${name} {`);
  expect(start, `falta el bloque ${name} en el resultado`).toBeGreaterThanOrEqual(0);

  let depth = 0;
  for (let index = start + name.length; index < text.length; index++) {
    if (text[index] === '{') depth++;
    else if (text[index] === '}' && --depth === 0) return text.slice(start, index + 1);
  }

  throw new Error(`el bloque ${name} quedó sin cerrar`);
}

let logged: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  // El plugin loguea a propósito (en CI se lee el log del prebuild).
  logged = vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('applySigning: gate por variables de entorno', () => {
  it('inyecta el bloque de firma cuando están las cuatro variables', () => {
    const result = applySigning(TEMPLATE, FULL_ENV);

    expect(result).not.toBe(TEMPLATE);
    expect(result.split(MARKER).length - 1).toBe(1);
    expect(logged).toHaveBeenCalled();
  });

  it.each(Object.keys(FULL_ENV))('no escribe nada si falta %s', (name) => {
    const env = { ...FULL_ENV };
    delete env[name];
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Byte-idéntico: `android.yml` compila sin secrets y ese run tiene que seguir verde.
    expect(applySigning(TEMPLATE, env)).toBe(TEMPLATE);
    // Un solo warning con todas las que faltan, no uno por variable.
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('trata la variable vacía como ausente', () => {
    const env = { ...FULL_ENV, ANDROID_KEY_PASSWORD: '' };
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(applySigning(TEMPLATE, env)).toBe(TEMPLATE);
  });
});

describe('applySigning: forma del resultado', () => {
  it('deja el bloque dentro de signingConfigs y la asignación dentro de buildTypes', () => {
    const result = applySigning(TEMPLATE, FULL_ENV);
    const signing = blockBody(result, 'signingConfigs');
    const buildTypes = blockBody(result, 'buildTypes');

    // El keystore de upload vive en signingConfigs…
    expect(signing).toContain(MARKER);
    expect(signing).toContain('release {');
    expect(signing).toContain('storeFile file(System.getenv("ANDROID_KEYSTORE_PATH"))');
    expect(signing).toContain('keyAlias System.getenv("ANDROID_KEY_ALIAS")');
    // …y la asignación al build type release, en buildTypes.
    expect(buildTypes).toContain('release {');
    expect(buildTypes).toContain('signingConfig signingConfigs.release');

    // Al revés no firma: si la asignación cayera en signingConfigs, Gradle la
    // ignora y el .aab sale debug.
    expect(signing).not.toContain('signingConfig signingConfigs.release');
    expect(buildTypes).not.toContain('storeFile file(System.getenv');
  });

  it('no toca las líneas del template: los dos signingConfigs.debug siguen ahí', () => {
    // El literal aparece dos veces (buildType debug y release). Un replace
    // global —la alternativa descartada— habría corrompido uno de los dos.
    const result = applySigning(TEMPLATE, FULL_ENV);

    expect(result.split('signingConfig signingConfigs.debug').length - 1).toBe(2);
  });

  it('es idempotente: la segunda pasada no agrega otro bloque', () => {
    // `prebuild` corre más de una vez por run; sin esto el bloque se duplica.
    const once = applySigning(TEMPLATE, FULL_ENV);
    const twice = applySigning(once, FULL_ENV);

    expect(twice).toBe(once);
    expect(twice.split(MARKER).length - 1).toBe(1);
  });

  it('deriva la indentación del template en vez de hardcodear 8 espacios', () => {
    const result = applySigning(TEMPLATE_TWO_SPACES, FULL_ENV);

    // `signingConfigs` está a 2 → `release {` a 4 y el marcador a 6.
    expect(result).toContain(`\n    release {\n      ${MARKER}`);
    // Ninguna línea del resultado puede arrancar con 8 espacios: no hay nivel 4.
    expect(result).not.toMatch(/^ {8}/m);
  });

  it('maneja un template con CRLF sin mezclar finales de línea', () => {
    // `prebuild` en Windows escribe CRLF; un bloque LF-only deja el archivo mixto.
    const crlf = TEMPLATE.replace(/\n/g, '\r\n');
    const result = applySigning(crlf, FULL_ENV);

    expect(result).toContain(`\r\n        release {\r\n`);
    expect(result.split('\n').length).toBe(result.split('\r\n').length);
  });

  it('falla ruidoso si el template no tiene signingConfigs', () => {
    const withoutSigning = [
      'android {',
      '    buildTypes {',
      '        debug {',
      '        }',
      '    }',
      '}',
      '',
    ].join('\n');

    expect(() => applySigning(withoutSigning, FULL_ENV)).toThrow(/signingConfigs/);
  });

  it('falla ruidoso si el template no tiene buildTypes', () => {
    const withoutBuildTypes = [
      'android {',
      '    signingConfigs {',
      '        debug {',
      '        }',
      '    }',
      '}',
      '',
    ].join('\n');

    expect(() => applySigning(withoutBuildTypes, FULL_ENV)).toThrow(/buildTypes/);
  });

  it('funciona con el template minificado en una sola línea', () => {
    // El formato del template no es parte del contrato con Expo: el plugin
    // ancla por bloques, no por líneas.
    const result = applySigning(
      'android { signingConfigs { debug {} } buildTypes { debug {} } }',
      FULL_ENV,
    );

    expect(result).toContain(MARKER);
    expect(blockBody(result, 'buildTypes')).toContain('signingConfig signingConfigs.release');
  });
});

describe('plugin registrado en el proyecto', () => {
  it('el archivo del plugin existe en disco', () => {
    // Expo no compila el plugin: una ruta rota se descubre en `prebuild`, en CI.
    expect(existsSync(join(ROOT, 'plugins', 'withReleaseSigning.js'))).toBe(true);
  });

  it('es un config plugin y expone la función pura para testearlo', () => {
    expect(typeof withReleaseSigning).toBe('function');
    expect(typeof applySigning).toBe('function');
    expect(MARKER).toBe('// @nearbyig/release-signing');
  });
});
