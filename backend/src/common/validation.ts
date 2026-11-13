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
