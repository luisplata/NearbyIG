import { Body, Controller, Get, Header, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentSession } from '../auth/current-session.decorator';
import { DemoSessionGuard } from '../auth/demo-session.guard';
import type { AuthContext } from '../auth/session.types';
import { PingsService } from './pings.service';
import type { Match, Ping, PingList } from './pings.types';

/**
 * `contract/paths/pings.yaml` — el flujo de conexión de S4.
 *
 *   POST /pings                  → 201 Ping (accepted si el destino es un bot)
 *   GET  /pings?box=inbox|sent   → 200 PingList, más nuevo primero
 *   POST /pings/:pingId/accept   → 200 Match
 *   POST /pings/:pingId/reject   → 204, sin body
 *
 * El body y los parámetros se reciben como `unknown` a propósito: el shape que
 * sale por HTTP está en `contract/schemas/pings.yaml` y validarlo con decoradores
 * sería una segunda copia que se desincroniza sin que ningún gate la vea. La
 * validación vive en el service, cerca del SQL que la necesita.
 *
 * Todo hereda `demoSession`: sin token es 401 `UNAUTHENTICATED`. La bandeja lleva
 * `cache-control: no-store` porque es una foto del estado de un perfil y no se
 * cachea en ningún intermediario.
 */
@Controller('pings')
@UseGuards(DemoSessionGuard)
export class PingsController {
  constructor(private readonly pings: PingsService) {}

  @Post()
  @Header('cache-control', 'no-store')
  create(@Body() body: unknown, @CurrentSession() session: AuthContext): Promise<Ping> {
    return this.pings.create(session, body);
  }

  @Get()
  @Header('cache-control', 'no-store')
  list(
    @Query('box') box: unknown,
    @CurrentSession() session: AuthContext,
  ): Promise<PingList> {
    return this.pings.list(session, box);
  }

  @Post(':pingId/accept')
  @HttpCode(200)
  @Header('cache-control', 'no-store')
  accept(
    @Param('pingId') pingId: string,
    @CurrentSession() session: AuthContext,
  ): Promise<Match> {
    return this.pings.accept(session, pingId);
  }

  @Post(':pingId/reject')
  @HttpCode(204)
  @Header('cache-control', 'no-store')
  async reject(
    @Param('pingId') pingId: string,
    @CurrentSession() session: AuthContext,
  ): Promise<void> {
    await this.pings.reject(session, pingId);
  }
}
