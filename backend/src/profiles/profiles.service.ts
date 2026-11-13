import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../db/database.module';
import type { SourceType } from '../auth/session.types';

/** Fila de `profiles` tal como vuelve de SQL. Es la lista blanca de lo que se
 * puede proyectar: la geometría de las zonas no entra en este SELECT ni por
 * casualidad.
 *
 * `in_use` no es una columna: lo calcula el `EXISTS` del SELECT contra
 * `sessions`. Es lo único de esta fila que es estado y no catálogo. */
export interface ProfileRow {
  profile_id: string;
  region_key: string;
  demo_slot: number | null;
  source_type: SourceType;
  nickname: string;
  initials: string;
  intention: string;
  gender: string;
  verified: boolean;
  online: boolean;
  in_use: boolean;
  distance_m: number;
  bearing_deg: number;
  photo_id: string;
  instagram_handle: string;
  status_key: string;
  bio_key: string;
}

/** `ProfileSummary` de `contract/schemas/profile.yaml`: 16 campos, ni uno más. */
export interface ProfileSummary {
  readonly profileId: string;
  readonly regionKey: string;
  readonly demoSlot: number | null;
  readonly sourceType: SourceType;
  readonly nickname: string;
  readonly initials: string;
  readonly intention: string;
  readonly gender: string;
  readonly verified: boolean;
  readonly online: boolean;
  readonly inUse: boolean;
  readonly distanceM: number;
  readonly bearingDeg: number;
  readonly photoId: string;
  readonly instagramHandle: string;
  readonly statusKey: string;
  readonly bioKey: string;
}

/**
 * `SelfProfile` de `contract/schemas/profile.yaml`: once campos, ni uno más.
 *
 * No lleva `distanceM`/`bearingDeg` (no hay distancia a sí mismo), `online` (la
 * sesión está viva por construcción), `inUse` (es la propia), `gender`,
 * `verified` ni `bioKey`: el dataset tampoco se los da al `self`.
 */
export interface SelfProfile {
  readonly profileId: string;
  readonly regionKey: string;
  readonly demoSlot: number | null;
  readonly sourceType: SourceType;
  readonly nickname: string;
  readonly initials: string;
  readonly intention: string;
  readonly photoId: string;
  readonly instagramHandle: string;
  readonly statusKey: string;
}

/** Fila de `profiles` para el perfil propio: la lista blanca de `SelfProfile`. */
interface SelfProfileRow {
  profile_id: string;
  region_key: string;
  demo_slot: number | null;
  source_type: SourceType;
  nickname: string;
  initials: string;
  intention: string;
  photo_id: string;
  instagram_handle: string;
  status_key: string;
}

export function toProfileSummary(row: ProfileRow): ProfileSummary {
  return {
    profileId: row.profile_id,
    regionKey: row.region_key,
    demoSlot: row.demo_slot,
    sourceType: row.source_type,
    nickname: row.nickname,
    initials: row.initials,
    intention: row.intention,
    gender: row.gender,
    verified: row.verified,
    online: row.online,
    inUse: row.in_use,
    distanceM: row.distance_m,
    bearingDeg: row.bearing_deg,
    photoId: row.photo_id,
    instagramHandle: row.instagram_handle,
    statusKey: row.status_key,
    bioKey: row.bio_key,
  };
}

@Injectable()
export class ProfilesService {
  private readonly logger = new Logger(ProfilesService.name);

  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async listByRegion(regionKey: string): Promise<ProfileSummary[]> {
    const { rows } = await this.pool.query<ProfileRow>(
      `SELECT p.profile_id, p.region_key, p.demo_slot, p.source_type, p.nickname, p.initials,
              p.intention, p.gender, p.verified, p.online, p.distance_m, p.bearing_deg,
              p.photo_id, p.instagram_handle, p.status_key, p.bio_key,
              -- inUse del contrato v0.2: la misma condicion que hace que un
              -- claim sobre este slot reciba 409. El índice único parcial
              -- (sessions_active_slot_key) garantiza a lo sumo una fila viva
              -- por slot, asi que el EXISTS no puede devolver media ocupacion.
              -- Una fila vencida sin revocar no cuenta como viva: el claim la
              -- revoca antes de reclamar el slot, asi que el cliente no ve
              -- "en uso" un slot que puede tomar.
              EXISTS (
                SELECT 1 FROM sessions s
                 WHERE s.region_key = p.region_key
                   AND s.demo_slot = p.demo_slot
                   AND s.revoked_at IS NULL
                   AND s.expires_at > now()
              ) AS in_use
         FROM profiles p
        WHERE p.region_key = $1
        ORDER BY p.demo_slot ASC`,
      [regionKey],
    );
    this.logger.debug(`perfiles region=${regionKey} filas=${rows.length}`);
    return rows.map(toProfileSummary);
  }

  /**
   * `GET /me` — el perfil de la propia sesión.
   *
   * Devuelve `undefined` cuando no hay fila: un invitado (los 10 slots ocupados)
   * nunca tuvo perfil de catálogo y un seed regenerado puede haber borrado el que
   * la sesión reclamó. En los dos casos el controller responde `404
   * PROFILE_NOT_FOUND`: inventar un nickname para un invitado sería mentir sobre
   * quién es.
   */
  async findSelf(regionKey: string, profileId: string): Promise<SelfProfile | undefined> {
    const { rows } = await this.pool.query<SelfProfileRow>(
      `SELECT p.profile_id, p.region_key, p.demo_slot, p.source_type, p.nickname,
              p.initials, p.intention, p.photo_id, p.instagram_handle, p.status_key
         FROM profiles p
        WHERE p.region_key = $1
          AND p.profile_id = $2`,
      [regionKey, profileId],
    );
    const row = rows[0];
    if (row === undefined) return undefined;
    return {
      profileId: row.profile_id,
      regionKey: row.region_key,
      demoSlot: row.demo_slot,
      sourceType: row.source_type,
      nickname: row.nickname,
      initials: row.initials,
      intention: row.intention,
      photoId: row.photo_id,
      instagramHandle: row.instagram_handle,
      statusKey: row.status_key,
    };
  }
}
