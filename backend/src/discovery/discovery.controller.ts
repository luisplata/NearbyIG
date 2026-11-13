import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import { CurrentSession } from '../auth/current-session.decorator';
import { DemoSessionGuard } from '../auth/demo-session.guard';
import type { AuthContext } from '../auth/session.types';
import { DiscoveryService } from './discovery.service';
import type { DiscoveryResult } from './discovery.types';

/**
 * `contract/paths/discovery.yaml` — `listDiscovery`.
 *
 *   GET /discovery?radiusM=&intention=&gender=&verified=&online= → 200
 *
 * Read-only, sin paginación y sin parámetro de región: el aislamiento regional
 * no se negocia con un query, la región es la de la sesión.
 *
 * `cache-control: no-store` porque la respuesta es una foto por sesión (orden y
 * medidas dependen de dónde está el observador) y no se cachea en ningún
 * intermediario.
 *
 * Hereda `demoSession`: sin token es 401 `UNAUTHENTICATED`, igual que el resto
 * de la superficie autenticada.
 */
@Controller('discovery')
@UseGuards(DemoSessionGuard)
export class DiscoveryController {
  constructor(private readonly discovery: DiscoveryService) {}

  @Get()
  @Header('cache-control', 'no-store')
  list(
    @Query() query: Record<string, unknown>,
    @CurrentSession() session: AuthContext,
  ): Promise<DiscoveryResult> {
    return this.discovery.list(session, this.discovery.parseFilters(query));
  }
}
