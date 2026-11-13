import { Controller, Get, HttpCode, Res } from '@nestjs/common';
import type { Response } from 'express';
import { HealthService, type LivenessBody, type ReadinessBody } from './health.service';

const VERSION = process.env.npm_package_version ?? '0.1.0';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** Liveness: no consulta la base a propósito — si la DB se cae, el proceso está vivo igual. */
  @Get()
  @HttpCode(200)
  liveness(): LivenessBody {
    return this.health.liveness(VERSION);
  }

  /** Readiness: 200 si la base contesta, 503 si no. Es lo que usa el healthcheck del compose. */
  @Get('ready')
  async readiness(@Res({ passthrough: true }) response: Response): Promise<ReadinessBody> {
    const body = await this.health.readiness();
    response.status(body.status === 'ready' ? 200 : 503);
    response.setHeader('cache-control', 'no-store');
    return body;
  }
}
