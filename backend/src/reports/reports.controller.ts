import { Body, Controller, Header, HttpCode, Post, UseGuards } from '@nestjs/common';
import { CurrentSession } from '../auth/current-session.decorator';
import { DemoSessionGuard } from '../auth/demo-session.guard';
import type { AuthContext } from '../auth/session.types';
import { ReportsService } from './reports.service';
import type { ReportReceipt } from './reports.types';

/**
 * `contract/paths/reports.yaml` — una sola operation.
 *
 *   POST /reports → 202 `ReportReceipt`
 *
 * 202 y no 201: el reporte se acepta en un registro que no produce un recurso
 * consultable (no hay `GET /reports`). El body llega como `unknown` y se valida
 * en el service, igual que en el resto de la API.
 */
@Controller('reports')
@UseGuards(DemoSessionGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post()
  @HttpCode(202)
  @Header('cache-control', 'no-store')
  create(@Body() body: unknown, @CurrentSession() session: AuthContext): Promise<ReportReceipt> {
    return this.reports.create(session, body);
  }
}
