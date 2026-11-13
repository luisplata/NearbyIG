import { Body, Controller, Delete, Header, HttpCode, Put, UseGuards } from '@nestjs/common';
import { CurrentSession } from '../auth/current-session.decorator';
import { DemoSessionGuard } from '../auth/demo-session.guard';
import type { AuthContext } from '../auth/session.types';
import { PresenceService } from './presence.service';
import type { PresenceState } from './presence.types';

/**
 * `contract/paths/presence.yaml`: un solo path item con dos verbos.
 *
 *   PUT    /presence  → 200 `PresenceState` (punto privado **o** `demoZoneKey`)
 *   DELETE /presence  → 204, o 409 `PRESENCE_STALE`
 *
 * Las dos heredan `demoSession`: la presencia es de la sesión, no del navegador.
 * `cache-control: no-store` porque el body de la respuesta es estado de una
 * sesión y no se cachea en ningún intermediario (el punto de entrada tampoco se
 * guarda en ningún caché: el request es un `PUT`).
 */
@Controller('presence')
@UseGuards(DemoSessionGuard)
export class PresenceController {
  constructor(private readonly presence: PresenceService) {}

  @Put()
  @HttpCode(200)
  @Header('cache-control', 'no-store')
  update(@Body() body: unknown, @CurrentSession() session: AuthContext): Promise<PresenceState> {
    return this.presence.update(session, body);
  }

  /** 204 sin body: el contrato no declara content para el éxito. */
  @Delete()
  @HttpCode(204)
  @Header('cache-control', 'no-store')
  async clear(@CurrentSession() session: AuthContext): Promise<void> {
    await this.presence.clear(session);
  }
}
