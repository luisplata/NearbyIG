import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../db/database.module';
import type { SourceType } from '../auth/session.types';

/**
 * Fila de `profiles` tal como vuelve de SQL. Es la lista blanca de lo que se
 * puede proyectar: la geometría de las zonas no entra en este SELECT ni por
 * casualidad.
 */
interface ProfileRow {
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
  readonly distanceM: number;
  readonly bearingDeg: number;
  readonly photoId: string;
  readonly instagramHandle: string;
  readonly statusKey: string;
  readonly bioKey: string;
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
      `SELECT profile_id, region_key, demo_slot, source_type, nickname, initials,
              intention, gender, verified, online, distance_m, bearing_deg,
              photo_id, instagram_handle, status_key, bio_key
         FROM profiles
        WHERE region_key = $1
        ORDER BY demo_slot ASC`,
      [regionKey],
    );
    this.logger.debug(`perfiles region=${regionKey} filas=${rows.length}`);
    return rows.map(toProfileSummary);
  }
}
