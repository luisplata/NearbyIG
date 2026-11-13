import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/env';
import { AppProblemError } from '../common/problem';
import { PG_POOL } from '../db/database.module';
import { verifySessionToken } from './jwt';
import type { AuthContext, AuthenticatedRequest, SourceType } from './session.types';

const BEARER = /^Bearer\s+([A-Za-z0-9\-._~+/]+=*)$/i;

export function readBearerToken(header: string | string[] | undefined): string | undefined {
  const value = Array.isArray(header) ? header[0] : header;
  if (typeof value !== 'string') return undefined;
  const match = BEARER.exec(value.trim());
  return match?.[1];
}

interface SessionRow {
  session_id: string;
  region_key: string;
  profile_id: string;
  demo_slot: number | null;
  source_type: SourceType;
  revoked_at: Date | null;
  expires_at: Date;
}

/**
 * Guard de `demoSession`: verifica la firma y después la fila de `sessions`.
 *
 * La segunda verificación no es redundante: el JWT es válido por sí mismo
 * hasta su `exp`, pero el logout marca `revoked_at` y ese cambio tiene que
 * surtir efecto antes. Sin la consulta, un token robado viviría hasta vencer.
 */
@Injectable()
export class DemoSessionGuard implements CanActivate {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PG_POOL) private readonly pool: Pool,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = readBearerToken(request.headers['authorization']);
    if (token === undefined) {
      throw new AppProblemError(
        'UNAUTHENTICATED',
        'Falta el header Authorization con un bearer token de sesión demo.',
      );
    }

    const claims = verifySessionToken(token, this.config.jwtSecret);
    const { rows } = await this.pool.query<SessionRow>(
      `SELECT session_id, region_key, profile_id, demo_slot, source_type, revoked_at, expires_at
         FROM sessions
        WHERE session_id = $1`,
      [claims.sessionId],
    );
    const row = rows[0];
    if (row === undefined || row.revoked_at !== null || row.expires_at.getTime() <= Date.now()) {
      throw new AppProblemError(
        'UNAUTHENTICATED',
        'La sesión demo no existe, se cerró o venció. Abrí una sesión nueva.',
      );
    }

    const session: AuthContext = {
      sessionId: row.session_id,
      regionKey: row.region_key,
      profileId: row.profile_id,
      demoSlot: row.demo_slot,
      sourceType: row.source_type,
    };
    request.session = session;
    return true;
  }
}
