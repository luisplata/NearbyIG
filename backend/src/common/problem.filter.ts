import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppProblemError, type ErrorCode, type ProblemBody } from './problem';
import { getRequestId } from './request-context';

/**
 * Único shape de error de la API: `application/problem+json` con `Problem`.
 *
 * Todo lo que el server decide lanzar es `AppProblemError`. Las excepciones de
 * Nest (ruta inexistente, body mal parseado) caen acá y se traducen con
 * `STATUS_TO_CODE`; cualquier otra cosa es 500 `INTERNAL` sin filtrar el stack
 * al cliente (el stack queda en el log).
 */
const STATUS_TO_CODE: Readonly<Record<number, ErrorCode>> = {
  400: 'VALIDATION_FAILED',
  401: 'UNAUTHENTICATED',
  403: 'REGION_MISMATCH',
  404: 'PROFILE_NOT_FOUND',
  409: 'PROFILE_IN_USE',
  410: 'CURSOR_EXPIRED',
  422: 'VALIDATION_FAILED',
  429: 'RATE_LIMITED',
  501: 'NOT_IMPLEMENTED',
};

/**
 * El contrato no tiene 400: `errors.yaml` declara que un pedido mal formado es
 * `VALIDATION_FAILED` (422). Express/Nest, en cambio, responde 400 cuando el
 * body no es JSON parseable (o no es un objeto), 413 cuando supera el límite de
 * 100 KB y 415 cuando el charset no se soporta. Traducir esos tres a 422 es lo
 * que mantiene el contrato cerrado: mismo `code` ⇒ mismo status, siempre.
 */
const NORMALIZED_STATUS: Readonly<Record<number, number>> = {
  400: 422,
  413: 422,
  415: 422,
};

@Catch()
export class ProblemFilter implements ExceptionFilter {
  private readonly logger = new Logger('ProblemFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request & { requestId?: string }>();
    const response = http.getResponse<Response>();
    const requestId = getRequestId(request);
    const problem = this.toProblem(exception, requestId);

    const route = `${request.method} ${request.path}`;
    if (problem.status >= 500) {
      this.logger.error(
        `[${requestId}] ${route} -> ${problem.status} ${problem.code}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(`[${requestId}] ${route} -> ${problem.status} ${problem.code}`);
    }

    response
      .status(problem.status)
      .type('application/problem+json')
      .send(JSON.stringify(problem));
  }

  private toProblem(exception: unknown, requestId: string): ProblemBody {
    if (exception instanceof AppProblemError) {
      return exception.toBody(requestId);
    }
    if (exception instanceof HttpException) {
      const rawStatus = exception.getStatus();
      if (rawStatus >= 400 && rawStatus < 500) {
        const status = NORMALIZED_STATUS[rawStatus] ?? rawStatus;
        const code = STATUS_TO_CODE[status] ?? 'VALIDATION_FAILED';
        return {
          type: 'about:blank',
          title: exception.name.replace(/Exception$/, ''),
          status,
          code,
          requestId,
          detail: 'El pedido no pudo procesarse.',
        };
      }
    }
    return {
      type: 'about:blank',
      title: 'Internal server error',
      status: 500,
      code: 'INTERNAL',
      requestId,
      detail: 'Error inesperado. Reportá el requestId si el problema persiste.',
    };
  }
}
