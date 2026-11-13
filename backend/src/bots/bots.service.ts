import { Inject, Injectable, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import type { AuthContext } from '../auth/session.types';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/env';
import { PG_POOL } from '../db/database.module';
import type { VisibleSubjects } from '../events/events.types';

/**
 * Predicado de "el dueño del bot está visible": una presencia viva de una sesión
 * viva del mismo perfil. Es el mismo `expires_at > now()` que usa la lectura de
 * presencia (S2-A), así que el ghost y el TTL apagan los bots por la misma vía y
 * sin borrar filas: la fila del bot puede seguir, lo que deja de existir es la
 * razón para mostrarlo.
 */
const OWNER_VISIBLE = `
  EXISTS (
    SELECT 1
      FROM presence p
      JOIN sessions s ON s.session_id = p.session_id
     WHERE p.region_key = b.region_key
       AND s.profile_id = b.owner_profile_id
       AND p.expires_at > now()
       AND s.revoked_at IS NULL
       AND s.expires_at > now()
  )`;

/** Fila de la conciliación: una presencia viva con zona, de una sesión humana. */
interface LiveOwnershipRow {
  region_key: string;
  zone_key: string;
  profile_id: string;
}

/** Bot que avanzó un waypoint: lo mínimo para emitir `profile.moved`. */
export interface MovedBot {
  readonly regionKey: string;
  readonly profileId: string;
  readonly distanceM: number;
  readonly bearingDeg: number;
}

/**
 * Bots derivados: dos por humano vivo, con waypoints y métricas sin coordenadas.
 *
 * **Modelo.** Un bot no es una entidad independiente: es una proyección del
 * perfil humano (`owner_profile_id`) con un `profileId` estable
 * (`<owner>-b1`, `<owner>-b2`), así que el mismo perfil que vuelve a entrar
 * recupera los mismos bots en vez de fabricar identidades nuevas. Existen
 * mientras el dueño tenga presencia viva; sin presencia no hay bots que mostrar
 * (ese es el ghost de S2 y el punto de enganche del de S5).
 *
 * **Geometría.** El centro del loop y los 4 waypoints se calculan **en PostGIS**,
 * no en TypeScript: acá nunca entra ni sale una coordenada. El bot orbita a
 * ~900–1200 m del ancla de la zona (`ST_PointOnSurface`) con un radio de
 * 300–450 m, así que su distancia al ancla queda siempre en el rango del
 * contrato (200–5000 m) sin recortes silenciosos.
 *
 * **Lo que sale.** `distanceM`/`bearingDeg` contra el ancla de la zona. Es la
 * misma referencia estable con la que están escritos los valores del catálogo,
 * así que el payload de un evento no depende de quién lo lee y SSE y polling
 * entregan el mismo objeto para el mismo `seq`.
 */
@Injectable()
export class BotsService {
  private readonly logger = new Logger(BotsService.name);

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /**
   * Conciliación de cada tick: garantiza los 2 bots de cada presencia humana viva
   * y borra los de los dueños que ya no están.
   *
   * Reconciliar (en vez de "crear si falta") resuelve el cambio de zona: si el
   * humano se muda de zona demo, sus bots viejos no pueden quedarse orbitando la
   * zona anterior, así que se retiran y se vuelven a sembrar en la nueva.
   */
  async reconcile(): Promise<number> {
    const { rows } = await this.pool.query<LiveOwnershipRow>(
      `SELECT p.region_key, p.zone_key, s.profile_id
         FROM presence p
         JOIN sessions s ON s.session_id = p.session_id
        WHERE p.expires_at > now()
          AND p.zone_key IS NOT NULL
          AND s.revoked_at IS NULL
          AND s.expires_at > now()
          AND s.source_type = 'human'
        ORDER BY p.region_key, s.profile_id`,
    );

    let created = 0;
    for (const row of rows) {
      const { rows: existing } = await this.pool.query<{ zone_key: string }>(
        'SELECT zone_key FROM bots WHERE region_key = $1 AND owner_profile_id = $2',
        [row.region_key, row.profile_id],
      );
      const consistent =
        existing.length === this.config.botsPerHuman &&
        existing.every((bot) => bot.zone_key === row.zone_key);
      if (consistent) continue;

      await this.removeOwnerBots(row.region_key, row.profile_id);
      for (let index = 1; index <= this.config.botsPerHuman; index += 1) {
        await this.createBot(row.region_key, row.zone_key, row.profile_id, index);
        created += 1;
      }
    }

    const { rowCount } = await this.pool.query(
      `DELETE FROM bots b WHERE NOT (${OWNER_VISIBLE})`,
    );
    if ((rowCount ?? 0) > 0) {
      this.logger.log(`bots retirados sin dueño vivo: ${rowCount}`);
    }
    return created;
  }

  /**
   * Avanza un waypoint a los bots que ya cumplieron su tramo y devuelve los que
   * se movieron. El que emite es el ticker: acá no se escribe el log.
   */
  async advanceDue(): Promise<readonly MovedBot[]> {
    const { rows } = await this.pool.query<{
      region_key: string;
      bot_profile_id: string;
      distance_m: number;
      bearing_deg: number;
    }>(
      `WITH due AS (
         SELECT b.region_key,
                b.bot_profile_id,
                b.zone_key,
                ((b.waypoint_index + 1) % 4)::smallint AS next_index
           FROM bots b
          WHERE b.leg_started_at <= now() - make_interval(secs => $1)
            AND ${OWNER_VISIBLE}
       ), moved AS (
         UPDATE bots b
            SET waypoint_index = d.next_index,
                position       = w.point,
                leg_started_at = now(),
                distance_m = round(
                  ST_Distance(a.point::geography, w.point::geography)
                )::int,
                bearing_deg = (
                  (round(degrees(ST_Azimuth(a.point, w.point)))::int % 360) + 360
                ) % 360,
                updated_at = now()
           FROM due d
           JOIN bot_waypoints w
             ON w.region_key = d.region_key
            AND w.bot_profile_id = d.bot_profile_id
            AND w.waypoint_index = d.next_index
           JOIN LATERAL (
             SELECT ST_PointOnSurface(z.polygon) AS point
               FROM zones z
              WHERE z.region_key = d.region_key
                AND z.zone_key = d.zone_key
           ) a ON true
          WHERE b.region_key = d.region_key
            AND b.bot_profile_id = d.bot_profile_id
         RETURNING b.region_key, b.bot_profile_id, b.distance_m, b.bearing_deg
       )
       SELECT region_key, bot_profile_id, distance_m, bearing_deg FROM moved
       ORDER BY region_key, bot_profile_id`,
      [this.config.botLegSeconds],
    );

    return rows.map((row) => ({
      regionKey: row.region_key,
      profileId: row.bot_profile_id,
      distanceM: row.distance_m,
      bearingDeg: row.bearing_deg,
    }));
  }

  /**
   * Bots visibles para un observador, **incluidos los propios**, cortados en el
   * cap de 6.
   *
   * **Por qué los propios.** El plan (§4, validación del Sprint 2) promete que
   * con dos humanos en la misma región cada uno ve "1 humano + 4 bots = 5
   * perfiles". Ese 5 sólo cierra si el observador ve **sus** 2 bots: 1 humano
   * ajeno + 2 propios + 2 del otro. Un bot es una proyección del dueño, no un
   * desconocido, y esconderlo convertiría la densidad prometida en 1 + 2.
   *
   * **Por qué `bot_profile_id` y no `profileId` del dueño.** Los bots propios
   * entran sólo como bots: el humano sigue sin verse a sí mismo (eso lo decide
   * `visibleSubjects`, que excluye al perfil propio y deja entrar a sus bots).
   *
   * **Prioridad.** Los propios se ordenan primero y después por
   * `bot_profile_id`, así el cap nunca los recorta y el corte sigue siendo
   * determinista: dos lecturas del mismo instante devuelven el mismo
   * subconjunto. Sin eso, la paridad SSE↔polling dependería del orden que
   * devuelva Postgres y un observador podría perder sus propios bots cuando la
   * región se llena.
   *
   * Esta es la **única** definición de "bots visibles": el stream
   * (`visibleSubjects`) y `GET /discovery` la comparten, así que discovery no
   * puede mostrar un bot que el stream no mueve.
   */
  async visibleBotIds(regionKey: string, observerProfileId: string): Promise<readonly string[]> {
    const { rows } = await this.pool.query<{ bot_profile_id: string }>(
      `SELECT b.bot_profile_id
         FROM bots b
        WHERE b.region_key = $1
          AND ${OWNER_VISIBLE}
        ORDER BY (b.owner_profile_id = $2) DESC, b.bot_profile_id
        LIMIT $3`,
      [regionKey, observerProfileId, this.config.observerBotCap],
    );
    return rows.map((row) => row.bot_profile_id);
  }

  /**
   * Sujetos visibles para un observador: los humanos de su región (menos él) y
   * los bots visibles de `visibleBotIds` (propios incluidos, cap 6).
   *
   * El humano no se ve a sí mismo, pero sí ve sus bots: son la densidad que la
   * demo promete y lo que el radar dibuja alrededor del propio punto.
   */
  async visibleSubjects(session: AuthContext): Promise<VisibleSubjects> {
    const [humans, bots] = await Promise.all([
      this.pool.query<{ profile_id: string }>(
        `SELECT profile_id
           FROM profiles
          WHERE region_key = $1
            AND source_type = 'human'
            AND profile_id <> $2
          ORDER BY profile_id`,
        [session.regionKey, session.profileId],
      ),
      this.visibleBotIds(session.regionKey, session.profileId),
    ]);

    return {
      humans: humans.rows.map((row) => row.profile_id),
      bots,
    };
  }

  /** Retira los bots de un dueño (reset propio, cambio de zona, limpieza). */
  async removeOwnerBots(regionKey: string, ownerProfileId: string): Promise<number> {
    const { rowCount } = await this.pool.query(
      'DELETE FROM bots WHERE region_key = $1 AND owner_profile_id = $2',
      [regionKey, ownerProfileId],
    );
    return rowCount ?? 0;
  }

  /**
   * Crea un bot con su loop de waypoints. Una sola sentencia: los dos `INSERT`
   * van en CTEs encadenadas y el `SELECT` final garantiza que se ejecuten.
   *
   * `$3..$5` son derivas deterministas del perfil (`hash(region:profile:index)`):
   * mismo perfil ⇒ mismo centro, mismo radio y misma fase, aunque la API se
   * reinicie. `$4` es el desplazamiento del centro respecto del ancla y `$5` la
   * fase inicial del primer waypoint.
   */
  private async createBot(
    regionKey: string,
    zoneKey: string,
    ownerProfileId: string,
    botIndex: number,
  ): Promise<void> {
    const seed = hashSeed(`${regionKey}:${ownerProfileId}:${botIndex}`);
    const offsetM = 900 + (seed % 301); // 900–1200 m del ancla
    const radiusM = 300 + ((seed >>> 9) % 150); // 300–449 m de radio
    const phaseDeg = (seed >>> 17) % 360;
    const botProfileId = `${ownerProfileId}-b${botIndex}`;

    await this.pool.query(
      `WITH zone AS (
         SELECT polygon, ST_PointOnSurface(polygon) AS anchor
           FROM zones
          WHERE region_key = $1 AND zone_key = $2
       ), center AS (
         SELECT CASE
                  WHEN ST_Covers(
                         zone.polygon,
                         ST_Project(zone.anchor::geography, $3::float8, radians($4::float8))::geometry
                       )
                    THEN ST_Project(zone.anchor::geography, $3::float8, radians($4::float8))::geometry
                  ELSE zone.anchor
                END AS point,
                zone.anchor AS anchor
           FROM zone
       ), inserted AS (
         INSERT INTO bots (
           region_key, bot_profile_id, owner_profile_id, bot_index, zone_key,
           center, position, waypoint_index, distance_m, bearing_deg
         )
         SELECT $1, $5, $6, $7, $2,
                c.point,
                ST_Project(c.point::geography, $8::float8, radians($4::float8))::geometry,
                0,
                round(
                  ST_Distance(
                    c.anchor::geography,
                    ST_Project(c.point::geography, $8::float8, radians($4::float8))::geometry::geography
                  )
                )::int,
                (
                  (round(
                     degrees(
                       ST_Azimuth(
                         c.anchor,
                         ST_Project(c.point::geography, $8::float8, radians($4::float8))::geometry
                       )
                     )
                   )::int % 360) + 360
                ) % 360
           FROM center c
         RETURNING region_key, bot_profile_id, center
       ), waypoints AS (
         INSERT INTO bot_waypoints (region_key, bot_profile_id, waypoint_index, point)
         SELECT i.region_key,
                i.bot_profile_id,
                k,
                ST_Project(
                  i.center::geography,
                  ($8::float8 * (CASE WHEN k % 2 = 0 THEN 1.0 ELSE 0.9 END))::float8,
                  radians(($4::float8 + k * 90)::float8)
                )::geometry
           FROM inserted i, generate_series(0, 3) AS k
         RETURNING 1 AS ok
       )
       SELECT region_key, bot_profile_id FROM inserted`,
      [regionKey, zoneKey, offsetM, phaseDeg, botProfileId, ownerProfileId, botIndex, radiusM],
    );
  }
}

/** FNV-1a de 32 bits: determinista y sin dependencias. */
function hashSeed(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}
