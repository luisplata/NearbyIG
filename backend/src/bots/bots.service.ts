import { Inject, Injectable, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import type { AuthContext } from '../auth/session.types';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/env';
import { PG_POOL } from '../db/database.module';
import type { VisibleSubjects } from '../events/events.types';

/**
 * Predicado de "el dueño del bot está **vivo**": una presencia viva de una sesión
 * viva del mismo perfil. Es el mismo `expires_at > now()` que usa la lectura de
 * presencia (S2-A).
 *
 * Éste es el predicado de **existencia** (reconciliación y movimiento): un dueño
 * en ghost conserva sus bots. Si se usara el de visibilidad para borrarlos, el
 * tick los recrearía en la pasada siguiente —`presence_anchors` no filtra
 * ghost— y el dueño vería sus bots parpadear en su propio radar.
 */
const OWNER_ALIVE = `
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

/**
 * Predicado de "el dueño del bot está **visible**": vivo y con
 * `visibility = 'visible'`.
 *
 * Es el que decide qué bots ven los demás (discovery y stream) y a qué bot se le
 * puede pinguear. En ghost, el humano es invisible y sus bots también. El dueño
 * se los sigue viendo porque `visibleBotIds` incluye los propios sin este
 * predicado (ver ahí).
 */
const OWNER_VISIBLE = `
  EXISTS (
    SELECT 1
      FROM presence p
      JOIN sessions s ON s.session_id = p.session_id
     WHERE p.region_key = b.region_key
       AND s.profile_id = b.owner_profile_id
       AND p.expires_at > now()
       AND p.visibility = 'visible'
       AND s.revoked_at IS NULL
       AND s.expires_at > now()
  )`;

/**
 * Predicado de "el par del observador (`$2`) con el dueño no está bloqueado, en
 * ninguna dirección".
 *
 * Un bloqueo es asimétrico en la fila y simétrico en el efecto: si cualquiera de
 * los dos bloqueó al otro, el par deja de verse. El dueño del bot es siempre un
 * humano canónico (`blocks` guarda al dueño, no al bot), así que comparar
 * `owner_profile_id` alcanza.
 */
const NOT_BLOCKED_WITH_OBSERVER = `
  NOT EXISTS (
    SELECT 1
      FROM blocks bl
     WHERE bl.region_key = b.region_key
       AND (
            (bl.blocker_profile_id = $2 AND bl.blocked_profile_id = b.owner_profile_id)
         OR (bl.blocker_profile_id = b.owner_profile_id AND bl.blocked_profile_id = $2)
       )
  )`;

/**
 * Cuánto puede alejarse la persona del ancla usada antes de resembrar el loop.
 *
 * Es **menor que el radio mínimo del loop** (300 m): mientras el desplazamiento
 * no supere el umbral, el círculo sigue rodeando a la persona. Un `PUT
 * /presence` llega en cada latido del navegador (cada pocos segundos, con metros
 * de ruido del GPS), así que resembrar en cada cambio resetearía
 * `waypoint_index` y `leg_started_at` en bucle y el radar vería saltos. El
 * umbral es la histéresis que separa "ruido de GPS" de "me mudé".
 *
 * 250 m y no 300: en el peor caso la posición de un waypoint queda a
 * 900 − 449 − desplazamiento del dueño, y con 300 eso son 151 m, debajo del piso
 * de 200 m que impone `bots_distance_m_check`. Con 250 el peor caso es 201 m.
 */
const ANCHOR_DRIFT_M = 250;

/**
 * Fila de la conciliación: el dueño humano con presencia viva y zona cuyos bots
 * faltan, están en otra zona o quedaron lejos de su persona. Todo lo demás se
 * descarta en PostGIS, así que TypeScript nunca ve el ancla ni la distancia.
 */
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
 * no en TypeScript: acá nunca entra ni sale una coordenada. El ancla es **la
 * persona**, no la ciudad: si el dueño tiene presencia con GPS, el bot orbita a
 * ~900–1200 m de su punto con un radio de 300–450 m; si eligió una zona demo
 * (sin coordenada), el ancla es el centroide de esa zona
 * (`ST_PointOnSurface`). `presence_anchors` es la única definición de ese punto.
 *
 * **Lo que sale.** `distanceM`/`bearingDeg` contra la presencia del dueño (o el
 * centroide si no tiene GPS). La referencia sigue siendo fija para el mismo
 * `seq` — el dueño no cambia mientras el evento existe —, así que el payload no
 * depende de quién lo lee y SSE y polling entregan el mismo objeto.
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
   * Reconciliar (en vez de "crear si falta") resuelve tres cambios de estado con
   * la misma regla: el humano se muda de zona demo, el humano pasa de zona demo
   * a GPS (o al revés) y el humano se mueve lo suficiente como para que el loop
   * deje de rodearlo. En los tres casos sus bots viejos no pueden quedarse donde
   * estaban, así que se retiran y se vuelven a sembrar alrededor del ancla
   * nueva. El caso "me moví 30 m" no resembra: ver `ANCHOR_DRIFT_M`.
   *
   * La decisión entera vive en PostGIS, en una sola consulta: cuántos bots hay,
   * en qué zona y a qué distancia quedó el ancla guardada de la presencia
   * actual. El `NOT (...)` la expresa como "no está consistente", que es lo que
   * el loop de abajo consume.
   */
  async reconcile(): Promise<number> {
    const { rows } = await this.pool.query<LiveOwnershipRow>(
      `SELECT a.region_key, a.zone_key, a.profile_id
         FROM presence_anchors a
        WHERE a.source_type = 'human'
          AND NOT (
            (SELECT count(*)
               FROM bots b
              WHERE b.region_key = a.region_key
                AND b.owner_profile_id = a.profile_id) = $1
            AND NOT EXISTS (
              SELECT 1
                FROM bots b
               WHERE b.region_key = a.region_key
                 AND b.owner_profile_id = a.profile_id
                 AND (b.zone_key <> a.zone_key
                      OR ST_Distance(b.anchor::geography, a.anchor::geography) > $2::float8)
            )
          )
        ORDER BY a.region_key, a.profile_id`,
      [this.config.botsPerHuman, ANCHOR_DRIFT_M],
    );

    let created = 0;
    for (const row of rows) {
      await this.removeOwnerBots(row.region_key, row.profile_id);
      for (let index = 1; index <= this.config.botsPerHuman; index += 1) {
        await this.createBot(row.region_key, row.zone_key, row.profile_id, index);
        created += 1;
      }
    }

    const { rowCount } = await this.pool.query(
      `DELETE FROM bots b WHERE NOT (${OWNER_ALIVE})`,
    );
    if ((rowCount ?? 0) > 0) {
      this.logger.log(`bots retirados sin dueño vivo: ${rowCount}`);
    }
    return created;
  }

  /**
   * Avanza un waypoint a los bots que ya cumplieron su tramo y devuelve los que
   * se movieron. El que emite es el ticker: acá no se escribe el log.
   *
   * `distanceM`/`bearingDeg` se miden **desde la presencia del dueño** (o el
   * centroide de su zona si no tiene GPS), que es el mismo ancla con el que se
   * sembró el loop. Antes se medían contra el centroide: un `profile.moved` de
   * un bot del norte de Bogotá decía "a 9 km de mí" cuando el bot está a 1 km de
   * su dueño. La referencia sigue siendo fija para el mismo `seq` (el dueño no
   * se mueve mientras el evento existe), así que SSE y polling no divergen.
   *
   * `least/greatest` proyecta a la banda del contrato (200–5000) igual que
   * discovery. No es decorativo: un dueño que se movió 250 m (por debajo del
   * umbral de resembrado) puede dejar un waypoint a 201 m, pero nunca a 151, y
   * el `CHECK` de la tabla no admite ese valor.
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
                b.owner_profile_id,
                ((b.waypoint_index + 1) % 4)::smallint AS next_index
           FROM bots b
          WHERE b.leg_started_at <= now() - make_interval(secs => $1)
            AND ${OWNER_ALIVE}
       ), moved AS (
         UPDATE bots b
            SET waypoint_index = d.next_index,
                position       = w.point,
                leg_started_at = now(),
                distance_m = least(
                  5000,
                  greatest(
                    200,
                    round(ST_Distance(a.ref::geography, w.point::geography))::int
                  )
                ),
                bearing_deg = (
                  (round(degrees(ST_Azimuth(a.ref, w.point)))::int % 360) + 360
                ) % 360,
                updated_at = now()
           FROM due d
           JOIN bot_waypoints w
             ON w.region_key = d.region_key
            AND w.bot_profile_id = d.bot_profile_id
            AND w.waypoint_index = d.next_index
           JOIN LATERAL (
             -- La presencia viva del dueño, con el mismo desempate que la vista
             -- presence_anchors; el centroide de su zona es el fallback de la
             -- zona demo y de la carrera en la que la presencia vence dentro del
             -- tick.
             SELECT coalesce(a.anchor, ST_PointOnSurface(z.polygon)) AS ref
               FROM zones z
               LEFT JOIN presence_anchors a
                      ON a.region_key = d.region_key
                     AND a.profile_id = d.owner_profile_id
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
   * **Los propios entran siempre (v0.5).** Ni el ghost ni un bloqueo los
   * esconden de su dueño: en ghost la sesión sigue viendo, y "sus bots incluidos"
   * es lo que mantiene el radar propio con la densidad prometida. Para los
   * demás, `OWNER_VISIBLE` exige `visibility = 'visible'` y el par no bloqueado.
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
          AND (
               b.owner_profile_id = $2
            OR (${OWNER_VISIBLE} AND ${NOT_BLOCKED_WITH_OBSERVER})
          )
        ORDER BY (b.owner_profile_id = $2) DESC, b.bot_profile_id
        LIMIT $3`,
      [regionKey, observerProfileId, this.config.observerBotCap],
    );
    return rows.map((row) => row.bot_profile_id);
  }

  /**
   * Sujetos visibles para un observador: los humanos de su región (menos él,
   * menos los que están en ghost y menos el par bloqueado) y los bots visibles de
   * `visibleBotIds` (propios incluidos, cap 6).
   *
   * El humano no se ve a sí mismo, pero sí ve sus bots: son la densidad que la
   * demo promete y lo que el radar dibuja alrededor del propio punto.
   */
  async visibleSubjects(session: AuthContext): Promise<VisibleSubjects> {
    const [humans, bots] = await Promise.all([
      // Humanos de la región, menos uno mismo, menos los que están en ghost y
      // menos el par bloqueado (en cualquier dirección). No se filtra por
      // presencia viva: un humano sin presencia tiene que seguir en la lista
      // para que su `profile.presence online:false` llegue —si se filtrara por
      // "vivo", el aviso de que se fue nunca saldría—.
      this.pool.query<{ profile_id: string }>(
        `SELECT p.profile_id
           FROM profiles p
          WHERE p.region_key = $1
            AND p.source_type = 'human'
            AND p.profile_id <> $2
            AND NOT EXISTS (
              SELECT 1
                FROM presence pr
                JOIN sessions s ON s.session_id = pr.session_id
               WHERE pr.region_key = p.region_key
                 AND s.profile_id = p.profile_id
                 AND pr.expires_at > now()
                 AND pr.visibility = 'ghost'
                 AND s.revoked_at IS NULL
                 AND s.expires_at > now()
            )
            AND NOT EXISTS (
              SELECT 1
                FROM blocks bl
               WHERE bl.region_key = p.region_key
                 AND (
                      (bl.blocker_profile_id = $2 AND bl.blocked_profile_id = p.profile_id)
                   OR (bl.blocker_profile_id = p.profile_id AND bl.blocked_profile_id = $2)
                 )
            )
          ORDER BY p.profile_id`,
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
   * reinicie. `$3` es la distancia del centro al ancla, `$4` la fase (también el
   * rumbo del desplazamiento), `$5` el `profileId` del bot y `$8` el radio del
   * loop.
   *
   * **El ancla es la persona.** `presence_anchors` devuelve su punto privado si
   * tiene GPS y el centroide de su zona si eligió una zona demo; el `coalesce`
   * con el centroide cubre además la carrera en la que la presencia vence entre
   * la conciliación y este `INSERT`. No se recorta el punto al polígono: la
   * geometría de un bot no tiene por qué caer dentro de la zona, sólo a una
   * distancia razonable de la persona. Recortar era lo que dejaba a un humano
   * del borde con sus bots apilados en el centroide.
   */
  private async createBot(
    regionKey: string,
    zoneKey: string,
    ownerProfileId: string,
    botIndex: number,
  ): Promise<void> {
    const seed = hashSeed(`${regionKey}:${ownerProfileId}:${botIndex}`);
    const offsetM = 900 + (seed % 301); // 900–1200 m de la persona
    const radiusM = 300 + ((seed >>> 9) % 150); // 300–449 m de radio
    const phaseDeg = (seed >>> 17) % 360;
    const botProfileId = `${ownerProfileId}-b${botIndex}`;

    await this.pool.query(
      `WITH zone AS (
         SELECT ST_PointOnSurface(polygon) AS centroid
           FROM zones
          WHERE region_key = $1 AND zone_key = $2
       ), anchor AS (
         SELECT coalesce(a.anchor, z.centroid) AS point
           FROM zone z
           LEFT JOIN presence_anchors a
                  ON a.region_key = $1
                 AND a.profile_id = $6
       ), center AS (
         SELECT a.point AS anchor,
                ST_Project(a.point::geography, $3::float8, radians($4::float8))::geometry AS point
           FROM anchor a
       ), start AS (
         SELECT c.anchor,
                c.point AS center,
                ST_Project(c.point::geography, $8::float8, radians($4::float8))::geometry AS point
           FROM center c
       ), inserted AS (
         INSERT INTO bots (
           region_key, bot_profile_id, owner_profile_id, bot_index, zone_key,
           anchor, center, position, waypoint_index, distance_m, bearing_deg
         )
         SELECT $1, $5, $6, $7, $2,
                s.anchor,
                s.center,
                s.point,
                0,
                least(
                  5000,
                  greatest(
                    200,
                    round(ST_Distance(s.anchor::geography, s.point::geography))::int
                  )
                ),
                (
                  (round(degrees(ST_Azimuth(s.anchor, s.point)))::int % 360) + 360
                ) % 360
           FROM start s
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
