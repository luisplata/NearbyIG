/**
 * Errores HTTP con la forma del contrato (`Problem`, RFC 9457).
 *
 * El catálogo de códigos es cerrado: `ErrorCode` replica los 22 valores de
 * `contract/schemas/errors.yaml` y `ERROR_STATUS` la tabla `x-status`. No se
 * inventan códigos en el server; si hace falta uno nuevo, primero se agrega al
 * contrato (y sus gates lo exigen).
 */

export type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'TICKET_EXPIRED'
  | 'TICKET_REUSED'
  | 'REGION_MISMATCH'
  | 'CHAT_BLOCKED'
  | 'PING_FORBIDDEN'
  | 'PROFILE_REQUIRED'
  | 'PROFILE_NOT_FOUND'
  | 'MATCH_NOT_FOUND'
  | 'PING_NOT_FOUND'
  | 'PROFILE_IN_USE'
  | 'PRESENCE_STALE'
  | 'PING_DUPLICATE'
  | 'PING_RESOLVED'
  | 'MATCH_CLOSED'
  | 'CURSOR_EXPIRED'
  | 'PING_EXPIRED'
  | 'RATE_LIMITED'
  | 'REGION_UNAVAILABLE'
  | 'ZONE_UNKNOWN'
  | 'VALIDATION_FAILED'
  | 'INTERNAL'
  | 'NOT_IMPLEMENTED';

/** code → status, copiado de `contract/schemas/errors.yaml#/ErrorCode/x-status`. */
export const ERROR_STATUS: Readonly<Record<ErrorCode, number>> = {
  UNAUTHENTICATED: 401,
  TICKET_EXPIRED: 401,
  TICKET_REUSED: 401,
  REGION_MISMATCH: 403,
  CHAT_BLOCKED: 403,
  PING_FORBIDDEN: 403,
  PROFILE_REQUIRED: 403,
  PROFILE_NOT_FOUND: 404,
  MATCH_NOT_FOUND: 404,
  PING_NOT_FOUND: 404,
  PROFILE_IN_USE: 409,
  PRESENCE_STALE: 409,
  PING_DUPLICATE: 409,
  PING_RESOLVED: 409,
  MATCH_CLOSED: 409,
  CURSOR_EXPIRED: 410,
  PING_EXPIRED: 410,
  RATE_LIMITED: 429,
  REGION_UNAVAILABLE: 422,
  ZONE_UNKNOWN: 422,
  VALIDATION_FAILED: 422,
  INTERNAL: 500,
  NOT_IMPLEMENTED: 501,
};

const TITLE: Readonly<Record<ErrorCode, string>> = {
  UNAUTHENTICATED: 'Unauthenticated',
  TICKET_EXPIRED: 'Stream ticket expired',
  TICKET_REUSED: 'Stream ticket already used',
  REGION_MISMATCH: 'Region mismatch',
  CHAT_BLOCKED: 'Chat blocked',
  PING_FORBIDDEN: 'Ping forbidden',
  PROFILE_REQUIRED: 'Profile required',
  PROFILE_NOT_FOUND: 'Profile not found',
  MATCH_NOT_FOUND: 'Match not found',
  PING_NOT_FOUND: 'Ping not found',
  PROFILE_IN_USE: 'Profile in use',
  PRESENCE_STALE: 'Presence stale',
  PING_DUPLICATE: 'Ping duplicate',
  PING_RESOLVED: 'Ping already resolved',
  MATCH_CLOSED: 'Match closed',
  CURSOR_EXPIRED: 'Cursor expired',
  PING_EXPIRED: 'Ping expired',
  RATE_LIMITED: 'Rate limited',
  REGION_UNAVAILABLE: 'Region unavailable',
  ZONE_UNKNOWN: 'Zone unknown',
  VALIDATION_FAILED: 'Validation failed',
  INTERNAL: 'Internal server error',
  NOT_IMPLEMENTED: 'Not implemented',
};

export interface ProblemBody {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly code: ErrorCode;
  readonly requestId: string;
  readonly detail: string;
}

/**
 * Error deliberado del server. `status` sale de `ERROR_STATUS`, nunca de un
 * literal en el call site: así el status no puede desincronizarse del `code`.
 */
export class AppProblemError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly detail: string;
  readonly type: string;

  constructor(code: ErrorCode, detail: string, options?: { type?: string; cause?: unknown }) {
    super(`${code}: ${detail}`, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'AppProblemError';
    this.code = code;
    this.status = ERROR_STATUS[code];
    this.detail = detail;
    this.type = options?.type ?? 'about:blank';
  }

  toBody(requestId: string): ProblemBody {
    return {
      type: this.type,
      title: TITLE[this.code],
      status: this.status,
      code: this.code,
      requestId,
      detail: this.detail,
    };
  }
}
