import { AppProblemError } from './problem';

/**
 * Validación a mano de la entrada, con el `Problem` del contrato.
 *
 * No hay `class-validator`/`ValidationPipe`: el shape que tiene que salir por
 * HTTP está en `contract/schemas`, y un DTO con decoradores sería una segunda
 * copia de ese shape que se desincroniza sin que ningún gate la vea. Acá se
 * valida lo justo (forma, rango, campos desconocidos) y se falla con
 * `VALIDATION_FAILED` (422), que es el `code` declarado para esos casos.
 */
export const REGION_KEY_PATTERN = /^[a-z]{2}$/;

/**
 * Forma de un `profileId` de la demo: `mx-p01`, `<dueño>-b1|b2`, `guest-ab12cd34`.
 *
 * **Por qué se valida la forma y no sólo el tipo.** Un `profileId` termina como
 * parámetro de `pg` en un `WHERE profile_id = $2`. Todo lo que no sea un id
 * plausible (`\0`, `%`, espacios, 70 KB de basura) no puede existir en el
 * catálogo: dejarlo llegar a Postgres convierte una validación en un 500 real
 * (`invalid byte sequence for encoding "UTF8": 0x00` en el NUL) y, en el mejor
 * caso, en un 404 que miente sobre lo que se mandó. Acá es `422`.
 *
 * 64 caracteres cubren de sobra los ids del catálogo (los más largos son
 * `<región>-pNN-bN`, 9) y los invitados (`guest-` + 8 hex).
 */
export const PROFILE_ID_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;

/**
 * `profileId` de body o path. `field` se usa en el mensaje porque el mismo
 * validador sirve para `targetProfileId`, `profileId` y el parámetro del path.
 */
export function parseProfileId(value: unknown, field = 'profileId'): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw validationFailed(`${field} es obligatorio y debe ser un string no vacío.`);
  }
  if (!PROFILE_ID_PATTERN.test(value)) {
    throw validationFailed(
      `${field} no tiene forma de profileId de la demo (minúsculas, dígitos y "-", empezando con letra).`,
    );
  }
  return value;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validationFailed(detail: string): AppProblemError {
  return new AppProblemError('VALIDATION_FAILED', detail);
}

/** Body opcional: `undefined`/`null`/`{}` se tratan como "sin preferencias". */
export function asOptionalRecord(value: unknown, name = 'body'): Record<string, unknown> {
  if (value === undefined || value === null) return {};
  if (!isRecord(value)) throw validationFailed(`${name} debe ser un objeto JSON.`);
  return value;
}

export function rejectUnknownKeys(record: Record<string, unknown>, allowed: readonly string[]): void {
  const unknown = Object.keys(record).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw validationFailed(`Campos no permitidos: ${unknown.join(', ')}.`);
  }
}

export function optionalString(record: Record<string, unknown>, field: string): string | undefined {
  const value = record[field];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw validationFailed(`${field} debe ser un string.`);
  return value;
}

export function optionalInteger(
  record: Record<string, unknown>,
  field: string,
  min: number,
  max: number,
): number | undefined {
  const value = record[field];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw validationFailed(`${field} debe ser un entero entre ${min} y ${max}.`);
  }
  return value;
}

/**
 * Número obligatorio y finito dentro de un rango.
 *
 * `typeof value === 'number'` ya descarta strings ("19.43") y `Number.isFinite`
 * descarta `NaN`/`Infinity`, que en JSON entran como `null` pero en un body
 * construido a mano pueden llegar igual. El rango es el del schema: un body que
 * lo viola es `VALIDATION_FAILED`, no un recorte silencioso.
 */
export function requiredNumber(
  record: Record<string, unknown>,
  field: string,
  min: number,
  max: number,
): number {
  const value = record[field];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw validationFailed(`${field} debe ser un número.`);
  }
  if (value < min || value > max) {
    throw validationFailed(`${field} debe estar entre ${min} y ${max}.`);
  }
  return value;
}

/**
 * `regionKey` de query o body. Un valor repetido (`?regionKey=mx&regionKey=co`)
 * llega como array y es inválido, no "el primero".
 */
export function parseRegionKey(value: unknown, options: { required: boolean; field?: string }): string | undefined {
  const field = options.field ?? 'regionKey';
  if (value === undefined || value === null || value === '') {
    if (options.required) throw validationFailed(`${field} es obligatorio.`);
    return undefined;
  }
  if (typeof value !== 'string' || !REGION_KEY_PATTERN.test(value)) {
    throw validationFailed(`${field} debe cumplir ^[a-z]{2}$ (por ejemplo "mx" o "co").`);
  }
  return value;
}
