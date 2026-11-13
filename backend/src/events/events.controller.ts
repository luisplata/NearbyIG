import { Controller, Get, Header, Inject, Logger, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentSession } from '../auth/current-session.decorator';
import { DemoSessionGuard } from '../auth/demo-session.guard';
import type { AuthContext } from '../auth/session.types';
import { StreamTicketsService } from '../auth/stream-tickets.service';
import { AppProblemError } from '../common/problem';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/env';
import { EventsService, type EventCursor } from './events.service';
import type { EventsPage } from './events.types';

/** Preámbulo del stream: el navegador reintenta a los 5 s si se corta. */
const SSE_PREAMBLE = 'retry: 5000\n\n';
/** Cada cuánto mira el log el canal vivo. El replay no espera: va en el acto. */
const LIVE_POLL_MS = 250;

/**
 * `contract/paths/events.yaml`: dos proyecciones del mismo log.
 *
 *   GET /events       → `text/event-stream`, autenticado con `streamTicket` en la
 *                       query (única operation con ese scheme).
 *   GET /events/poll  → `EventsPage`, autenticado con `demoSession`.
 *
 * El SSE **no** tiene una segunda implementación del replay: abre con el
 * preámbulo `retry: 5000`, pagina con `EventsService.readPage` y sigue paginando
 * en vivo. Eso es lo que hace que paridad y dedupe sean estructurales: el mismo
 * cursor devuelve el mismo `id`, el mismo `event:` y el mismo `data:` por los dos
 * caminos, porque hay un solo camino.
 *
 * El ticket se consume acá, una vez, antes de escribir un solo byte de stream: un
 * ticket reusado o vencido tiene que salir como `401` JSON, no como un stream
 * vacío que el cliente interprete como "no hay eventos".
 */
@Controller('events')
export class EventsController {
  private readonly logger = new Logger(EventsController.name);

  constructor(
    private readonly events: EventsService,
    private readonly streamTickets: StreamTicketsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get()
  async stream(
    @Query('ticket') ticket: unknown,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const session = await this.streamTickets.consume(readTicket(ticket));
    const cursor = await this.events.resolveCursor(
      session.regionKey,
      readLastEventId(request.headers['last-event-id']),
    );

    response.status(200);
    response.setHeader('content-type', 'text/event-stream; charset=utf-8');
    response.setHeader('cache-control', 'no-cache');
    response.setHeader('connection', 'keep-alive');
    // nginx y el proxy de Docker bufferean por defecto: sin esto el stream sale
    // en bloque y el cliente cree que no hay eventos.
    response.setHeader('x-accel-buffering', 'no');
    response.flushHeaders();
    response.write(SSE_PREAMBLE);

    let closed = false;
    let liveTimer: NodeJS.Timeout | undefined;
    let heartbeat: NodeJS.Timeout | undefined;

    const stop = (): void => {
      if (closed) return;
      closed = true;
      if (liveTimer !== undefined) clearTimeout(liveTimer);
      if (heartbeat !== undefined) clearInterval(heartbeat);
    };
    // El cliente puede irse sin mandar nada: `aborted` en la request, `close` en
    // la response. Los dos cortan el bombeo y el keepalive.
    request.on('aborted', stop);
    request.on('close', stop);
    response.on('close', stop);

    heartbeat = setInterval(() => {
      if (!closed) response.write(': keepalive\n\n');
    }, this.config.sseHeartbeatMs);
    heartbeat.unref();

    let liveCursor: EventCursor | null = cursor;

    const pump = async (): Promise<void> => {
      if (closed) return;
      try {
        const page: EventsPage = await this.events.readPage(session, liveCursor, 100);
        if (closed) return;

        for (const event of page.events) {
          response.write(
            `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
          );
        }

        if (page.nextCursor !== null && page.events.length > 0) {
          liveCursor = { id: page.nextCursor, seq: seqOf(page.nextCursor) };
        }

        // `hasMore` ⇒ hay otra página ya: no se espera el turno del reloj.
        if (page.hasMore) {
          void pump();
          return;
        }
      } catch (error) {
        // Con los headers ya escritos no hay `Problem` posible: se cierra el
        // stream y el cliente reintenta con `retry: 5000` y su `Last-Event-ID`.
        this.logger.warn(
          `stream cerrado por error region=${session.regionKey}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        stop();
        response.end();
        return;
      }

      liveTimer = setTimeout(() => {
        void pump();
      }, LIVE_POLL_MS);
      liveTimer.unref();
    };

    void pump();
  }

  /** Paginación del mismo log. `demoSession`, no `streamTicket`. */
  @Get('poll')
  @UseGuards(DemoSessionGuard)
  @Header('cache-control', 'no-store')
  async poll(
    @Query('cursor') rawCursor: unknown,
    @Query('limit') rawLimit: unknown,
    @CurrentSession() session: AuthContext,
  ): Promise<EventsPage> {
    const cursor = await this.events.resolveCursor(session.regionKey, rawCursor);
    const limit = this.events.parseLimit(rawLimit);
    return this.events.readPage(session, cursor, limit);
  }
}

/**
 * El ticket viaja en la query porque `EventSource` no puede mandar headers. Un
 * valor repetido llegaría como array: no es un ticket, así que se consume el
 * string vacío (que no existe en la tabla) y la respuesta es `401 TICKET_EXPIRED`,
 * igual que si no viniera.
 */
function readTicket(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** `Last-Event-ID` es un header: repetido no existe, pero un array se ignora. */
function readLastEventId(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') return value;
  return Array.isArray(value) ? value[0] : undefined;
}

/** `seq` del `id` ya validado por `resolveCursor`. */
function seqOf(id: string): number {
  const match = /^[a-z]{2}:([0-9]{12})$/.exec(id);
  if (match === null) throw new AppProblemError('VALIDATION_FAILED', `cursor inválido: ${id}`);
  return Number(match[1]);
}
