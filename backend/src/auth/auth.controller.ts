import { Body, Controller, Header, HttpCode, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import type { DemoSession } from './session.types';

/**
 * Superficie de auth de Sprint 1.
 *
 * Sólo `POST /auth/demo-session` en este batch: es lo que hace verificable a
 * `GET /demo/profiles` (el contrato le exige `demoSession`). Logout, ticket de
 * stream y takeover de slot llegan en el siguiente batch de S1.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** `security: []` en el contrato: es la única operation pública. */
  @Post('demo-session')
  @HttpCode(201)
  @Header('cache-control', 'no-store')
  createDemoSession(@Body() body: unknown): Promise<DemoSession> {
    return this.auth.createDemoSession(body);
  }
}
