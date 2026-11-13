import { Controller, Headers, Header, HttpCode, Post, UseGuards } from '@nestjs/common';
import { CurrentSession } from '../auth/current-session.decorator';
import { TeardownSessionGuard } from '../auth/teardown-session.guard';
import type { AuthContext } from '../auth/session.types';
import { ResetService, type ResetGlobalResult, type ResetSelfResult } from './reset.service';

/**
 * Reset de la demo. Fuera del contrato (ver `ResetService` y el README).
 *
 *   POST /demo/reset        global, sin sesión: comando de operación de §11
 *   POST /demo/reset/self   la propia sesión, Bearer, idempotente
 *
 * El global no pide credencial **de sesión** a propósito: se usa desde una
 * terminal limpia, igual que `docker compose down -v`, y sólo destruye estado
 * efímero de demo (nunca el catálogo ni el volumen). Desde S7 sí pasa por la
 * política de operador de `ResetService`: origen permitido, `DEMO_RESET_TOKEN`
 * cuando está configurado (obligatorio en producción) y uno cada 10 s.
 */
@Controller('demo')
export class ResetController {
  constructor(private readonly reset: ResetService) {}

  @Post('reset')
  @HttpCode(200)
  @Header('cache-control', 'no-store')
  resetGlobal(
    @Headers('origin') origin: string | undefined,
    @Headers('authorization') authorization: string | undefined,
  ): Promise<ResetGlobalResult> {
    return this.reset.resetGlobal({ origin, authorization });
  }

  @Post('reset/self')
  @HttpCode(200)
  @Header('cache-control', 'no-store')
  @UseGuards(TeardownSessionGuard)
  resetSelf(@CurrentSession() session: AuthContext): Promise<ResetSelfResult> {
    return this.reset.resetSelf(session);
  }
}
