import { Body, Controller, Header, HttpCode, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { CurrentSession } from './current-session.decorator';
import { DemoSessionGuard } from './demo-session.guard';
import { StreamTicketsService } from './stream-tickets.service';
import { TeardownSessionGuard } from './teardown-session.guard';
import type { AuthContext, DemoSession, StreamTicket } from './session.types';

/**
 * Superficie de auth de Sprint 1, tal como la declara `contract/paths/auth.yaml`:
 *
 *   POST /auth/demo-session   pública, 201 `DemoSession` (claim de slot)
 *   POST /auth/takeover       `demoSession`, 200 `DemoSession` (desalojo explícito)
 *   POST /auth/logout         `demoSession`, 204, idempotente
 *   POST /auth/stream-ticket  `demoSession`, 201 `StreamTicket` (30 s, un uso)
 *
 * El token viaja sólo en `Authorization` y nunca en la URL; el ticket existe
 * justamente porque `EventSource` no puede mandar headers, y viaja sólo en la
 * query de `GET /events` (S2).
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly streamTickets: StreamTicketsService,
  ) {}

  /** `security: []` en el contrato: es la única operation pública. */
  @Post('demo-session')
  @HttpCode(201)
  @Header('cache-control', 'no-store')
  createDemoSession(@Body() body: unknown): Promise<DemoSession> {
    return this.auth.createDemoSession(body);
  }

  /**
   * `POST /auth/takeover` (contrato v0.2): 200 y `DemoSession` nueva.
   *
   * `DemoSessionGuard` y no `TeardownSessionGuard`: el takeover **crea** una
   * sesión viva, así que la sesión que llama tiene que existir de verdad. Un
   * token revocado no puede desalojar a nadie.
   */
  @Post('takeover')
  @HttpCode(200)
  @Header('cache-control', 'no-store')
  @UseGuards(DemoSessionGuard)
  takeover(@Body() body: unknown, @CurrentSession() session: AuthContext): Promise<DemoSession> {
    return this.auth.takeover(session, body);
  }

  /**
   * `TeardownSessionGuard` y no `DemoSessionGuard`: ver el comentario del guard.
   * El contrato pide idempotencia y un 204 no lleva cuerpo.
   */
  @Post('logout')
  @HttpCode(204)
  @Header('cache-control', 'no-store')
  @UseGuards(TeardownSessionGuard)
  async logout(@CurrentSession() session: AuthContext): Promise<void> {
    await this.auth.logout(session.sessionId);
  }

  /** El valor del ticket no se cachea en ningún intermediario. */
  @Post('stream-ticket')
  @HttpCode(201)
  @Header('cache-control', 'no-store')
  @UseGuards(DemoSessionGuard)
  createStreamTicket(@CurrentSession() session: AuthContext): Promise<StreamTicket> {
    return this.streamTickets.issue(session);
  }
}
