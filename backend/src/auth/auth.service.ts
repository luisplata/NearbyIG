import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/env';
import { AppProblemError } from '../common/problem';
import { PG_POOL } from '../db/database.module';
import {
  asOptionalRecord,
  optionalInteger,
  parseRegionKey,
  rejectUnknownKeys,
  validationFailed,
} from '../common/validation';
import { issueSessionToken } from './jwt';
import type { DemoSession, SourceType } from './session.types';

interface SlotRow {
  demo_slot: number;
  profile_id: string;
}

interface Claim {
  readonly profileId: string;
  readonly demoSlot: number | null;
  readonly sourceType: SourceType;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '23505';
}

/**
 * Apertura de sesión demo.
 *
 * El slot es la identidad del perfil (1..10 por región): dos navegadores no
 * pueden quedarse con el mismo. La carrera la resuelve el índice único parcial
 * `sessions_active_slot_key`, no el chequeo previo; el chequeo existe sólo para
 * responder 409 con un mensaje útil en el caso normal.
 *
 * Invitados: si los 10 slots están vivos, el siguiente entra con `sourceType:
 * guest` y `demoSlot: null`. Un invitado no ocupa slot y no es descubrible.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async createDemoSession(body: unknown): Promise<DemoSession> {
    const record = asOptionalRecord(body);
    rejectUnknownKeys(record, ['regionKey', 'demoSlot']);
    const requestedRegion = parseRegionKey(record['regionKey'], { required: false });
    const requestedSlot = optionalInteger(record, 'demoSlot', 1, 10);

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const regionKey = requestedRegion ?? this.config.defaultRegionKey;
      const region = await client.query('SELECT 1 FROM regions WHERE region_key = $1', [regionKey]);
      if (region.rowCount === 0) {
        throw validationFailed(`regionKey "${regionKey}" no existe en el catálogo demo.`);
      }

      const claim = await this.claim(client, regionKey, requestedSlot);
      const tokenId = randomUUID();
      const expiresAt = new Date(Date.now() + this.config.sessionTtlSeconds * 1_000);
      const inserted = await client.query<{ session_id: string }>(
        `INSERT INTO sessions (region_key, profile_id, demo_slot, source_type, token_id, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING session_id`,
        [regionKey, claim.profileId, claim.demoSlot, claim.sourceType, tokenId, expiresAt],
      );
      const sessionId = inserted.rows[0]?.session_id;
      if (sessionId === undefined) throw new Error('INSERT de sesión sin RETURNING');
      await client.query('COMMIT');

      const token = issueSessionToken(
        {
          sessionId,
          regionKey,
          profileId: claim.profileId,
          demoSlot: claim.demoSlot,
          sourceType: claim.sourceType,
          tokenId,
          ttlSeconds: this.config.sessionTtlSeconds,
        },
        this.config.jwtSecret,
      );
      this.logger.log(
        `sesión demo abierta region=${regionKey} slot=${claim.demoSlot ?? 'guest'} source=${claim.sourceType}`,
      );
      return {
        token,
        expiresAt: expiresAt.toISOString(),
        regionKey,
        profileId: claim.profileId,
        demoSlot: claim.demoSlot,
        sourceType: claim.sourceType,
      };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppProblemError(
          'PROFILE_IN_USE',
          'El slot demo pedido ya está ocupado por otra sesión viva. Probá con otro slot o cerrá la otra sesión.',
        );
      }
      throw error;
    } finally {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ya se hizo COMMIT o la conexión se cayó */
      }
      client.release();
    }
  }

  private async claim(client: PoolClient, regionKey: string, requestedSlot: number | undefined): Promise<Claim> {
    if (requestedSlot !== undefined) {
      const { rows } = await client.query<SlotRow & { occupied: boolean }>(
        `SELECT p.demo_slot,
                p.profile_id,
                EXISTS (
                  SELECT 1 FROM sessions s
                   WHERE s.region_key = p.region_key
                     AND s.demo_slot = p.demo_slot
                     AND s.revoked_at IS NULL
                     AND s.expires_at > now()
                ) AS occupied
           FROM profiles p
          WHERE p.region_key = $1 AND p.demo_slot = $2 AND p.source_type = 'human'`,
        [regionKey, requestedSlot],
      );
      const row = rows[0];
      if (row === undefined) {
        throw validationFailed(`El slot ${requestedSlot} no tiene perfil en la región ${regionKey}.`);
      }
      if (row.occupied) {
        throw new AppProblemError(
          'PROFILE_IN_USE',
          `El slot ${requestedSlot} de la región ${regionKey} ya está ocupado por otra sesión viva.`,
        );
      }
      return { profileId: row.profile_id, demoSlot: row.demo_slot, sourceType: 'human' };
    }

    const { rows } = await client.query<SlotRow>(
      `SELECT p.demo_slot, p.profile_id
         FROM profiles p
        WHERE p.region_key = $1
          AND p.demo_slot IS NOT NULL
          AND p.source_type = 'human'
          AND NOT EXISTS (
            SELECT 1 FROM sessions s
             WHERE s.region_key = p.region_key
               AND s.demo_slot = p.demo_slot
               AND s.revoked_at IS NULL
               AND s.expires_at > now()
          )
        ORDER BY p.demo_slot
        LIMIT 1`,
      [regionKey],
    );
    const row = rows[0];
    if (row === undefined) {
      // Los 10 slots están vivos: se entra como invitado, no con error.
      return {
        profileId: `guest-${randomUUID().slice(0, 8)}`,
        demoSlot: null,
        sourceType: 'guest',
      };
    }
    return { profileId: row.profile_id, demoSlot: row.demo_slot, sourceType: 'human' };
  }
}
