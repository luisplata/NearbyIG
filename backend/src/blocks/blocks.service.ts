import { Inject, Injectable, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import type { AuthContext, SourceType } from '../auth/session.types';
import { AppProblemError } from '../common/problem';
import { isRecord, rejectUnknownKeys, validationFailed } from '../common/validation';
import { PG_POOL } from '../db/database.module';
import type { PingPeer } from '../pings/pings.types';
import type { Block, BlockList } from './blocks.types';

/** Un `profileId` de bot: `<owner>-b1` / `<owner>-b2`. */
const BOT_PROFILE_ID = /-b[12]$/;

/** El humano detrás de un `profileId`: el mismo si no es bot, el dueño si lo es. */
function canonicalProfileId(profileId: string): string {
  return profileId.replace(BOT_PROFILE_ID, '');
}

/** `profileId` del body: obligatorio, string, sin campos de más. */
function parseProfileId(body: unknown): string {
  if (!isRecord(body)) {
    throw validationFailed('body debe ser un objeto JSON con profileId.');
  }
  rejectUnknownKeys(body, ['profileId']);
  const value = body['profileId'];
  if (typeof value !== 'string' || value.trim() === '') {
    throw validationFailed('profileId es obligatorio y debe ser un string no vacío.');
  }
  return value;
}

interface BlockRow {
  profile_id: string;
  created_at: Date;
}

interface BlockListRow extends BlockRow {
  peer_nickname: string;
  peer_initials: string;
  peer_intention: string;
  peer_photo_id: string;
  peer_source_type: SourceType;
}

/**
 * Bloqueo (Sprint 5, delta v0.5) — `contract/paths/blocks.yaml`.
 *
 * **Una fila, dos direcciones de efecto.** `A` bloquea a `B` y se guarda
 * `A → B`; la lectura (discovery, stream, pings, chat) excluye el par en las dos
 * direcciones. Guardar la dirección es lo que permite que `GET /blocks` liste
 * "lo que yo bloqueé" sin revelar "quién me bloqueó".
 *
 * **Un bot se canoniza a su dueño.** Los bots no tienen identidad propia: son
 * una proyección de la persona. Bloquear `mx-p03-b1` guarda `mx-p03`; bloquear
 * al dueño esconde los dos bots por la misma vía (`blocks` no guarda bots).
 *
 * **Idempotente.** `POST` sobre un par ya bloqueado devuelve la fila original
 * (`ON CONFLICT DO NOTHING` + `SELECT`), y `DELETE` sobre un par sin bloqueo
 * responde 204. El cliente que reintenta no distingue un no-op de un error.
 *
 * **Invitados.** Un invitado de relleno no tiene perfil: `403 PROFILE_REQUIRED`.
 * Bloquear con un id que no existe en la región es `404 PROFILE_NOT_FOUND`, y
 * bloquearse a sí mismo es `422 VALIDATION_FAILED`.
 *
 * **Sin PII nueva.** La tabla guarda dos `profileId` y una fecha. Los logs no
 * llevan ids: sólo región y conteo.
 */
@Injectable()
export class BlocksService {
  private readonly logger = new Logger(BlocksService.name);

  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /** `GET /blocks`: los bloqueos propios, más reciente primero. */
  async list(session: AuthContext): Promise<BlockList> {
    this.assertHasProfile(session);

    const { rows } = await this.pool.query<BlockListRow>(
      `SELECT b.blocked_profile_id AS profile_id,
              b.created_at,
              p.nickname        AS peer_nickname,
              p.initials        AS peer_initials,
              p.intention       AS peer_intention,
              p.photo_id        AS peer_photo_id,
              p.source_type     AS peer_source_type
         FROM blocks b
         -- Un bloqueo apunta siempre a un humano del catálogo (el server
         -- canoniza bots antes de insertar), así que el JOIN es directo. Un
         -- perfil que ya no está no se dibuja, igual que en la bandeja de pings.
         JOIN profiles p
           ON p.region_key = b.region_key
          AND p.profile_id = b.blocked_profile_id
        WHERE b.region_key = $1
          AND b.blocker_profile_id = $2
        ORDER BY b.created_at DESC, b.blocked_profile_id
        LIMIT 100`,
      [session.regionKey, session.profileId],
    );

    this.logger.debug(`bloqueos propios region=${session.regionKey} filas=${rows.length}`);
    return {
      blocks: rows.map((row) => ({
        block: { profileId: row.profile_id, createdAt: row.created_at.toISOString() },
        peer: toPeer(row),
      })),
    };
  }

  /**
   * `POST /blocks` → 201 `Block`.
   *
   * El `createdAt` es el del bloqueo original: repetir la llamada no lo mueve.
   * Por eso el `INSERT … ON CONFLICT DO NOTHING` y el `SELECT` posterior: el
   * `RETURNING` no devuelve filas cuando el conflicto ocurre.
   */
  async create(session: AuthContext, body: unknown): Promise<Block> {
    this.assertHasProfile(session);
    const requested = parseProfileId(body);
    const target = canonicalProfileId(requested);
    if (target === session.profileId) {
      throw validationFailed('No podés bloquearte a vos mismo.');
    }

    await this.assertProfileExists(session.regionKey, target);

    const inserted = await this.pool.query<BlockRow>(
      `INSERT INTO blocks (region_key, blocker_profile_id, blocked_profile_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (region_key, blocker_profile_id, blocked_profile_id) DO NOTHING
       RETURNING blocked_profile_id AS profile_id, created_at`,
      [session.regionKey, session.profileId, target],
    );

    if (inserted.rows[0] !== undefined) {
      this.logger.log(`bloqueo creado region=${session.regionKey}`);
      return { profileId: inserted.rows[0].profile_id, createdAt: inserted.rows[0].created_at.toISOString() };
    }

    const existing = await this.pool.query<BlockRow>(
      `SELECT blocked_profile_id AS profile_id, created_at
         FROM blocks
        WHERE region_key = $1
          AND blocker_profile_id = $2
          AND blocked_profile_id = $3`,
      [session.regionKey, session.profileId, target],
    );
    const row = existing.rows[0];
    if (row === undefined) {
      throw new AppProblemError('INTERNAL', 'El bloqueo no se pudo leer después del conflicto.');
    }
    this.logger.debug(`bloqueo idempotente region=${session.regionKey}`);
    return { profileId: row.profile_id, createdAt: row.created_at.toISOString() };
  }

  /**
   * `DELETE /blocks/{profileId}` → 204.
   *
   * Idempotente: si no había bloqueo, también 204. No se exige que el perfil
   * exista en el catálogo (un seed nuevo podría haberlo borrado): el bloqueo es
   * una fila propia y borrarla no puede fallar por un recurso que ya no está.
   */
  async remove(session: AuthContext, rawProfileId: unknown): Promise<void> {
    this.assertHasProfile(session);
    if (typeof rawProfileId !== 'string' || rawProfileId.trim() === '') {
      throw validationFailed('profileId del path no puede estar vacío.');
    }
    const target = canonicalProfileId(rawProfileId);
    if (target === session.profileId) {
      throw validationFailed('No podés desbloquearte a vos mismo: nunca estuviste bloqueado.');
    }

    const { rowCount } = await this.pool.query(
      `DELETE FROM blocks
        WHERE region_key = $1
          AND blocker_profile_id = $2
          AND blocked_profile_id = $3`,
      [session.regionKey, session.profileId, target],
    );
    this.logger.log(`bloqueo retirado region=${session.regionKey} existia=${(rowCount ?? 0) > 0}`);
  }

  /** El invitado de relleno no tiene perfil que bloquear. */
  private assertHasProfile(session: AuthContext): void {
    if (session.sourceType !== 'human') {
      throw new AppProblemError(
        'PROFILE_REQUIRED',
        'La sesión actual no tiene un perfil propio: un invitado no puede bloquear ni desbloquear.',
      );
    }
  }

  /** `404 PROFILE_NOT_FOUND` si el humano canonizado no está en la región. */
  private async assertProfileExists(regionKey: string, profileId: string): Promise<void> {
    const { rowCount } = await this.pool.query(
      `SELECT 1 FROM profiles
        WHERE region_key = $1 AND profile_id = $2 AND source_type = 'human'`,
      [regionKey, profileId],
    );
    if ((rowCount ?? 0) === 0) {
      throw new AppProblemError(
        'PROFILE_NOT_FOUND',
        'El perfil a bloquear no existe en esta región.',
      );
    }
  }
}

function toPeer(row: BlockListRow): PingPeer {
  return {
    profileId: row.profile_id,
    nickname: row.peer_nickname,
    initials: row.peer_initials,
    intention: row.peer_intention,
    photoId: row.peer_photo_id,
    sourceType: row.peer_source_type,
  };
}
