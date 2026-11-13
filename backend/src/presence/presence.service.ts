import { Inject, Injectable, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import type { AuthContext } from '../auth/session.types';
import { BotsService } from '../bots/bots.service';
import { AppProblemError } from '../common/problem';
import {
  asOptionalRecord,
  isRecord,
  rejectUnknownKeys,
  requiredNumber,
  validationFailed,
} from '../common/validation';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/env';
import { PG_POOL } from '../db/database.module';
import { EventsService } from '../events/events.service';
import type { PresenceState, PresenceUpdate, Visibility } from './presence.types';

const ZONE_KEY_PATTERN = /^[a-z][a-z0-9-]*$/;

/**
 * `visibility` del body (v0.5): opcional, `visible` o `ghost`.
 *
 * Ausente es `null` y **no** `'visible'`: el contrato dice que omitirla conserva
 * la vigente, así el heartbeat de posición (cada pocos segundos) no puede sacar a
 * alguien de ghost por no repetir el campo. `null` también es lo que el SQL usa
 * para "dejá la que estaba" (`coalesce($7, presence.visibility)`).
 */
function parseVisibility(record: Record<string, unknown>): Visibility | null {
  const value = record['visibility'];
  if (value === undefined) return null;
  if (value !== 'visible' && value !== 'ghost') {
    throw validationFailed('visibility debe ser "visible" o "ghost".');
  }
  return value as Visibility;
}

/**
 * Predicado de presencia viva (`TTL` de 12 s).
 *
 * **Decisión: filtro de lectura, no barrido.** `expires_at` es la única
 * autoridad y toda consulta que cuente presencias agrega esta condición. No hay
 * cron ni job de limpieza porque:
 *
 *   1. el filtro es exacto en el instante de leer; un barrido siempre llega
 *      tarde (una presencia vencida seguiría contando hasta la próxima pasada);
 *   2. la tabla tiene a lo sumo una fila por sesión viva (≤ 20 humanos + bots en
 *      la demo), así que no hay nada que compactar;
 *   3. la fila se reusa por upsert en el siguiente `PUT` y se borra en cascada
 *      cuando la sesión se cierra o se resetea, así que tampoco crece sin
 *      control.
 *
 * Cuando llegue Sprint 5 (reset y ghost) el barrido puede sumarse como red de
 * seguridad, pero no es lo que define si una presencia está viva.
 */
const LIVE_PRESENCE = 'expires_at > now()';

/**
 * Redondeo a 6 decimales, como pide el contrato.
 *
 * Los vértices de `contract/catalog/zones.json` vienen con 6 decimales y
 * `ST_Covers` es exacto: redondear el punto antes de evaluar hace que dos
 * pedidos con "el mismo" punto (el navegador manda 15 decimales ruidosos) caigan
 * siempre en la misma zona, y que el borde no dependa del ruido del GPS.
 */
function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/**
 * `PresenceUpdate` del contrato: **exactamente uno** de `point` o
 * `demoZoneKey`.
 *
 * Los errores de forma son `VALIDATION_FAILED` (422). `ZONE_UNKNOWN` no se
 * decide acá: una `demoZoneKey` bien formada que no está en el catálogo de la
 * región es estado, y lo resuelve el service contra `zones`.
 */
function parsePresenceUpdate(body: unknown): PresenceUpdate {
  const record = asOptionalRecord(body);
  rejectUnknownKeys(record, ['point', 'demoZoneKey', 'visibility']);
  const visibility = parseVisibility(record);

  const hasPoint = record['point'] !== undefined;
  const hasZone = record['demoZoneKey'] !== undefined;
  if (hasPoint === hasZone) {
    throw validationFailed(
      'El body tiene que traer exactamente uno de `point` o `demoZoneKey`: ni los dos ni ninguno.',
    );
  }

  if (hasZone) {
    const demoZoneKey = record['demoZoneKey'];
    if (typeof demoZoneKey !== 'string' || !ZONE_KEY_PATTERN.test(demoZoneKey)) {
      throw validationFailed('demoZoneKey debe cumplir ^[a-z][a-z0-9-]*$ (por ejemplo "cdmx").');
    }
    return { kind: 'zone', demoZoneKey, visibility };
  }

  const point = record['point'];
  if (!isRecord(point)) throw validationFailed('point debe ser un objeto { lat, lng }.');
  rejectUnknownKeys(point, ['lat', 'lng']);
  // El orden importa sólo para el mensaje: `lat` primero es como se lee un punto.
  const lat = requiredNumber(point, 'lat', -90, 90);
  const lng = requiredNumber(point, 'lng', -180, 180);
  return { kind: 'point', lat: round6(lat), lng: round6(lng), visibility };
}

interface PresenceRow {
  region_key: string;
  zone_key: string | null;
  visibility: Visibility;
  prior_live: boolean;
  prior_visibility: Visibility | null;
}

/**
 * Presencia de la sesión: registrar (`PUT`) y apagar (`DELETE`).
 *
 * La región **nunca** viene del body: es la de la sesión. Eso hace que un punto
 * de otra región no pueda mudar la presencia de región por la puerta de atrás;
 * cae en el fallback (`zoneKey: null`, `fallbackRequired: true`) y el cliente
 * ofrece el selector de zona demo, que es lo que pide el plan ("movimiento fuera
 * de la región → fallback a zona demo, sin logout").
 *
 * No hay lectura de presencia en este batch: `GET /discovery` (Sprint 3) es el
 * consumidor, y ya tiene el predicado de TTL listo en `LIVE_PRESENCE`.
 */
@Injectable()
export class PresenceService {
  private readonly logger = new Logger(PresenceService.name);

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly bots: BotsService,
    private readonly events: EventsService,
  ) {}

  /**
   * `PUT /presence` → 200 `PresenceState`.
   *
   * Un segundo `PUT` **reemplaza** la presencia anterior (upsert por
   * `session_id`): una sesión tiene una sola presencia viva, y es lo que evita
   * el estado duplicado cuando el navegador se mueve.
   *
   * **Ghost (v0.5).** `visibility: ghost` deja la fila viva y con la posición
   * que el cliente mandó; lo que cambia es el filtro de lectura de los demás
   * (discovery, stream, pings). Los bots **no** se borran: el dueño se sigue
   * viendo a sí mismo y sus bots orbitan alrededor suyo. Apagar todo es
   * `DELETE /presence`, no ghost.
   *
   * Omitir `visibility` conserva la vigente (`coalesce($7, presence.visibility)`),
   * así el heartbeat de posición del cliente no saca a nadie de ghost.
   */
  async update(session: AuthContext, body: unknown): Promise<PresenceState> {
    const update = parsePresenceUpdate(body);

    // `404 PROFILE_NOT_FOUND` del contrato: la sesión es válida pero su perfil
    // ya no está en el catálogo (se regeneró el seed debajo). Un invitado no
    // está en `profiles` por diseño, así que el chequeo no lo alcanza.
    await this.assertProfileInCatalog(session);

    const zoneKey =
      update.kind === 'zone'
        ? await this.requireZone(session.regionKey, update.demoZoneKey)
        : await this.deriveZone(session.regionKey, update.lat, update.lng);

    const lng = update.kind === 'point' ? update.lng : null;
    const lat = update.kind === 'point' ? update.lat : null;

    // `ST_MakePoint` es strict: con `lng`/`lat` NULL devuelve NULL, así que el
    // mismo INSERT sirve para los dos caminos y la columna queda NULL cuando la
    // sesión eligió una zona demo (no hubo coordenada que guardar).
    //
    // `prior` y `upserted` van en la misma sentencia para saber, sin una segunda
    // consulta ni una carrera, si la presencia **ya estaba viva**: sólo una
    // transición a online emite `profile.presence`. Mover el punto de una
    // presencia viva no es un cambio de estado.
    // `$7` es `null` cuando el body no trae `visibility`: en el INSERT cae al
    // default (`visible`) y en el UPDATE conserva la fila. La misma sentencia
    // resuelve las dos cosas, sin una lectura previa ni una carrera.
    const { rows } = await this.pool.query<PresenceRow>(
      `WITH prior AS (
         SELECT (expires_at > now()) AS live, visibility
           FROM presence
          WHERE session_id = $1
       ), upserted AS (
         INSERT INTO presence (session_id, region_key, zone_key, point, expires_at, visibility)
         VALUES ($1, $2, $3,
                 ST_SetSRID(ST_MakePoint($4, $5), 4326),
                 now() + make_interval(secs => $6::int),
                 coalesce($7::text, 'visible'))
         ON CONFLICT (session_id) DO UPDATE
            SET region_key = EXCLUDED.region_key,
                zone_key   = EXCLUDED.zone_key,
                point      = EXCLUDED.point,
                expires_at = EXCLUDED.expires_at,
                visibility = coalesce($7::text, presence.visibility)
         RETURNING region_key, zone_key, visibility
       )
       SELECT u.region_key, u.zone_key, u.visibility,
              coalesce((SELECT live FROM prior), false) AS prior_live,
              (SELECT visibility FROM prior) AS prior_visibility
         FROM upserted u`,
      [
        session.sessionId,
        session.regionKey,
        zoneKey,
        lng,
        lat,
        this.config.presenceTtlSeconds,
        update.visibility,
      ],
    );

    const row = rows[0];
    if (row === undefined) throw new Error('INSERT de presencia sin RETURNING');

    // El evento de presencia es del humano, no de la zona. Se emite sólo en un
    // cambio de visibilidad **observable por los demás**:
    //
    //   visible → visible : nada (mover el punto no es un cambio de estado)
    //   ghost   → visible : online:true (reaparece)
    //   visible → ghost   : online:false (desaparece, pero sigue online)
    //   ghost   → ghost   : nada (ni un aviso de que existe)
    //   (sin fila viva) → ghost : nada: avisar "online" de un fantasma es
    //                             justo la fuga que ghost evita
    //
    // `online:false` de un ghost es la forma de que el radar de los demás lo
    // saque sin revelar que sigue conectado. El filter de `readRows` deja pasar
    // siempre los `online:false` para que ese aviso llegue aunque el sujeto ya
    // no esté en `visibleSubjects`.
    const wasVisible = row.prior_live && row.prior_visibility === 'visible';
    const isVisible = row.visibility === 'visible';
    if (isVisible && !wasVisible) {
      await this.events.append(row.region_key, 'profile.presence', {
        profileId: session.profileId,
        online: true,
      });
    } else if (!isVisible && wasVisible) {
      await this.events.append(row.region_key, 'profile.presence', {
        profileId: session.profileId,
        online: false,
      });
    }

    // Sin coordenadas en el log: sólo la proyección (región, zona, fallback).
    this.logger.log(
      `presencia registrada region=${row.region_key} zone=${row.zone_key ?? 'none'} fallback=${row.zone_key === null} visibility=${row.visibility}`,
    );

    return {
      profileId: session.profileId,
      regionKey: row.region_key,
      zoneKey: row.zone_key,
      online: true,
      visibility: row.visibility,
      fallbackRequired: row.zone_key === null,
    };
  }

  /**
   * `DELETE /presence` → 204, o 409 `PRESENCE_STALE` si no había presencia viva.
   *
   * Idempotente **en el resultado** (nunca deja una presencia a medio apagar y
   * llamarlo dos veces no crea nada), no en el status: el contrato distingue
   * "apagué mi presencia" de "no había nada que apagar" justamente para que el
   * cliente no invente una sesión nueva por un 204 fantasma.
   *
   * La fila vencida no se borra acá: no cuenta como presencia (el filtro es
   * `expires_at > now()`) y el siguiente `PUT` la reusa por upsert.
   */
  async clear(session: AuthContext): Promise<void> {
    const { rows, rowCount } = await this.pool.query<{ region_key: string }>(
      `DELETE FROM presence
        WHERE session_id = $1
          AND ${LIVE_PRESENCE}
        RETURNING region_key`,
      [session.sessionId],
    );

    if ((rowCount ?? 0) === 0) {
      throw new AppProblemError(
        'PRESENCE_STALE',
        `La sesión no tiene presencia viva en ${session.regionKey}: nunca se registró, ya se apagó o venció.`,
      );
    }

    // Ghost/pausa: sin presencia, los 2 bots propios dejan de existir para los
    // demás. La lectura ya los filtra por la presencia viva del dueño (efecto
    // inmediato); borrar las filas acá evita además que el radar de S3 los
    // encuentre en la ventana hasta el próximo tick del mundo.
    await this.bots.removeOwnerBots(session.regionKey, session.profileId);
    await this.events.append(rows[0]?.region_key ?? session.regionKey, 'profile.presence', {
      profileId: session.profileId,
      online: false,
    });

    this.logger.log(`presencia apagada region=${session.regionKey}`);
  }

  /** `404 PROFILE_NOT_FOUND` para una sesión humana cuyo perfil ya no existe. */
  private async assertProfileInCatalog(session: AuthContext): Promise<void> {
    if (session.sourceType !== 'human') return;
    const { rowCount } = await this.pool.query(
      'SELECT 1 FROM profiles WHERE region_key = $1 AND profile_id = $2',
      [session.regionKey, session.profileId],
    );
    if ((rowCount ?? 0) === 0) {
      throw new AppProblemError(
        'PROFILE_NOT_FOUND',
        `El perfil de la sesión ya no está en el catálogo de ${session.regionKey}. Abrí una sesión nueva.`,
      );
    }
  }

  /**
   * `demoZoneKey` → `zoneKey`, o 422 `ZONE_UNKNOWN`.
   *
   * La zona de **otra** región es `ZONE_UNKNOWN` y no `REGION_MISMATCH`: para
   * esta sesión esa zona no es una opción del selector, es una clave que no
   * existe. El status es uno y el `Problem.code` es el discriminante.
   */
  private async requireZone(regionKey: string, demoZoneKey: string): Promise<string> {
    const { rows } = await this.pool.query<{ zone_key: string }>(
      'SELECT zone_key FROM zones WHERE region_key = $1 AND zone_key = $2',
      [regionKey, demoZoneKey],
    );
    const row = rows[0];
    if (row === undefined) {
      throw new AppProblemError(
        'ZONE_UNKNOWN',
        `La zona demo "${demoZoneKey}" no existe en la región ${regionKey}.`,
      );
    }
    return row.zone_key;
  }

  /**
   * Punto privado → `zoneKey` derivada, o `null` si no cae en ninguna zona.
   *
   * `ST_Covers` contra los polígonos **de la región de la sesión**. Si el punto
   * cae en un polígono de la otra región (Bogotá desde una sesión `mx`), el
   * filtro por región lo deja afuera y la respuesta es fallback: la sesión no
   * cambia de región por mandar un punto, porque la región es parte de su
   * identidad (JWT + fila de `sessions`) y mudarla en silencio dejaría a la
   * misma sesión con dos presencias en dos regiones. Para cambiar de región se
   * abre una sesión nueva.
   *
   * `ST_MakePoint` toma (lng, lat): es el orden de las coordenadas en 4326 y el
   * mismo que usan los vértices posicionales del catálogo.
   */
  private async deriveZone(regionKey: string, lat: number, lng: number): Promise<string | null> {
    const { rows } = await this.pool.query<{ zone_key: string }>(
      `SELECT z.zone_key
         FROM zones z
        WHERE z.region_key = $1
          AND ST_Covers(z.polygon, ST_SetSRID(ST_MakePoint($2, $3), 4326))
        ORDER BY z.zone_key
        LIMIT 1`,
      [regionKey, lng, lat],
    );
    return rows[0]?.zone_key ?? null;
  }
}
