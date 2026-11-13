import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/**
 * `X-Request-Id` de entrada o uno nuevo. Es lo que viaja en `Problem.requestId`
 * y en cada línea de log: permite pegarle un log a una request sin adivinar por
 * timestamp.
 *
 * Se acepta el header del cliente sólo si tiene forma segura; si no, se ignora.
 * El request id nunca se loguea junto a credenciales: el `Authorization` no se
 * toca en ningún punto.
 */
export const REQUEST_ID_HEADER = 'x-request-id';
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,128}$/;

export interface RequestWithContext extends Request {
  requestId: string;
}

export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header(REQUEST_ID_HEADER);
  const requestId = incoming !== undefined && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();
  (req as RequestWithContext).requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);
  next();
}

export function getRequestId(req: unknown): string {
  const candidate = (req as { requestId?: unknown } | undefined)?.requestId;
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : randomUUID();
}
