import { Inject, Injectable, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import type { AuthContext } from '../auth/session.types';
import { BotsService } from '../bots/bots.service';
import { validationFailed } from '../common/validation';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/env';
import { PG_POOL } from '../db/database.module';
import { toProfileSummary, type ProfileRow, type ProfileSummary } from '../profiles/profiles.service';
import type { DiscoveryFilters, DiscoveryResult } from './discovery.types';

/** Default del contrato: cubre la región entera. */
const DEFAULT_RADIUS_M = 5_000;
const MIN_RADIUS_M = 200;
const MAX_RADIUS_M = 5_000;

/**
 * Filas por respuesta. Es el `maxItems: 10` de `DiscoveryResult`, no un límite
 * de paginación: el contrato declara que una página es el resultado entero y no
 * hay cursor. Con bots el conjunto visible puede pasar de 10 (9 humanos +
 * 6 bots), así que el tope se aplica acá y corta por distancia.
 */
const PAGE_SIZE = 10;

/**
 * Banda del contrato para `distanceM` (`ProfileSummary.distanceM`, 200–5000).
 *
 * Se proyecta el entero medido a esa banda porque el schema congelado no tiene
 * otro lugar donde poner "a 30 m": el cliente valida contra 200–5000 y un valor
 * fuera de rango es un response inválido. El clamp es **monótono** (no
 * reordena) y el orden se calcula sobre la medida real, así que dos perfiles a
 * 30 m y 180 m quedan empatados en 200 y el desempate lo hace `profileId`.
 */
const CONTRACT_DISTANCE_MIN_M = 200;
const CONTRACT_DISTANCE_MAX_M = 5_000;

const INTENTIONS = ['networking', 'friendship', 'activities'] as const;
const GENDERS = ['female', 'male', 'nonbinary'] as const;

/**
 * Un parámetro de query escalar. Repetido (`?radiusM=1&radiusM=2`) llega como
 * array: es un pedido ambiguo, no "el primero".
 */
function single(value: unknown, name: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    throw validationFailed(`${name} viene repetido: mandá un solo valor.`);
  }
  return value;
}

function parseRadius(raw: unknown): number {
  const value = single(raw, 'radiusM');
  if (value === undefined || value === '') return DEFAULT_RADIUS_M;
  // Sólo dígitos: `Number('1e3')` sería 1000 y `Number(' ')` sería 0, y un radio
  // que depende de cómo se escribió el número no es un radio.
  if (!/^[0-9]+$/.test(value)) {
    throw validationFailed(`radiusM debe ser un entero entre ${MIN_RADIUS_M} y ${MAX_RADIUS_M}.`);
  }
  const radiusM = Number(value);
  if (radiusM < MIN_RADIUS_M || radiusM > MAX_RADIUS_M) {
    // 422, no clamp: el contrato dice explícitamente que fuera de rango falla.
    throw validationFailed(`radiusM debe estar entre ${MIN_RADIUS_M} y ${MAX_RADIUS_M} metros.`);
  }
  return radiusM;
}

function parseEnum<T extends string>(raw: unknown, name: string, allowed: readonly T[]): T | undefined {
  const value = single(raw, name);
  if (value === undefined || value === '') return undefined;
  if (!allowed.includes(value as T)) {
    throw validationFailed(`${name} debe ser uno de: ${allowed.join(', ')}.`);
  }
  return value as T;
}

/**
 * `verified`/`online`. Sólo `true` filtra (el contrato lo dice así: "sólo
 * perfiles verificados **cuando es `true`**"), así que `false` y ausente son el
 * mismo caso: sin filtro. Un valor que no es `true`/`false` es 422 en vez de
 * "cualquier cosa truthy".
 */
function parseFlag(raw: unknown, name: string): boolean {
  const value = single(raw, name);
  if (value === undefined || value === '') return false;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw validationFailed(`${name} debe ser "true" o "false".`);
}

/**
 * `GET /discovery` — quién está cerca de la sesión.
 *
 * **Qué se ve.** Los humanos de la región con presencia viva y zona derivada
 * (menos el propio perfil) y **los bots visibles del observador, propios
 * incluidos**. El negocio cierra así: con dos humanos en la misma región cada
 * uno ve 1 humano + 2 bots propios + 2 del otro = **5 perfiles** (plan §4 y §5).
 * Los bots propios no son un caso especial acá: `BotsService.visibleBotIds` es
 * la única definición de "bots visibles" y el stream de eventos usa la misma, así
 * que discovery nunca muestra un bot que el stream no mueve.
 *
 * **Un bot no es una copia de su dueño.** `profileId` es estable
 * (`<owner>-b1|b2`) y el slot es el del dueño, pero la identidad de display
 * (nickname, iniciales, foto, instagram, estado, bio, intención, género,
 * verificado) la presta **otro perfil de la región**, elegido de forma
 * determinista. Heredar la fila del dueño mostraba a la misma persona tres veces
 * en el radar (el humano y sus dos bots). La regla completa, con el orden de
 * candidatos y la rotación por slot, vive en el comentario de `bots_visible`.
 *
 * **Exclusiones, todas de lectura.**
 *
 * | Excluido | Cómo |
 * |---|---|
 * | el propio humano | `profile_id <> $2` (los bots propios sí entran) |
 * | pausados / ghost | sin presencia viva **o** `visibility = 'ghost'` no hay fila visible |
 * | fuera de región | `zone_key IS NOT NULL` + `region_key` de la sesión |
 * | dueño de bot en ghost | `OWNER_VISIBLE` dentro de `visibleBotIds` |
 * | bloqueados | `blocks` en cualquier dirección, en humanos y en bots (v0.5) |
 *
 * **Geometría: el frame es el observador, no el ancla de zona.** `distanceM` y
 * `bearingDeg` se miden desde la presencia de la sesión. El origen del radar es
 * el observador: su punto privado o, si eligió zona demo sin GPS, el ancla de esa
 * zona (no hay mejor origen para quien dijo "estoy en CDMX"). El sujeto, en
 * cambio, se ubica en su punto privado o —si también eligió zona demo— en el
 * ancla de **su** zona más su vector de catálogo (`distance_m`/`bearing_deg`),
 * que es la posición con la que el mock dibuja ese perfil: sin eso, dos personas
 * que eligen la misma zona caen en el mismo punto y el radar se aplana en el piso
 * de 200 m. Es la deuda de S2-B corregida en la proyección que el cliente usa
 * para el radar. El stream de eventos **no** se toca en esto: un log compartido y
 * append-only no puede llevar una medida por receptor sin guardar una coordenada
 * o romper el replay (detalle en README, "Frames de distancia").
 *
 * **Sin presencia viva no hay descubrimiento.** No es un error que el contrato
 * declare: si la sesión no está en el mapa, no tiene origen y la respuesta es
 * `results: []`. Ver sin ser visto es exactamente lo que un ghost no debe poder
 * hacer.
 *
 * **Nunca una coordenada.** El SELECT proyecta la lista blanca de
 * `ProfileSummary` y las dos medidas ya redondeadas; `geo` (el punto del
 * observador) y `bots.position` sólo existen dentro de la consulta.
 */
@Injectable()
export class DiscoveryService {
  private readonly logger = new Logger(DiscoveryService.name);

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly bots: BotsService,
    // `botsPerHuman` es lo que separa la rotación de caras entre dueños
    // contiguos: con dos bots por humano, el dueño del slot `s` arranca en la
    // posición `(s - 1) * botsPerHuman` de la lista de candidatos.
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /**
   * `DiscoveryQuery` + `?`: valida y aplica defaults. Fuera de rango es 422.
   *
   * Los parámetros que no están en el contrato se **ignoran** (no son 422):
   * OpenAPI trata un query de más como ausente, y el resto de la API
   * (`/demo/profiles`, `/events/poll`) hace lo mismo. El body sí es estricto,
   * porque ahí `additionalProperties: false` es parte del contrato.
   */
  parseFilters(query: Record<string, unknown>): DiscoveryFilters {
    return {
      radiusM: parseRadius(query['radiusM']),
      intention: parseEnum(query['intention'], 'intention', INTENTIONS),
      gender: parseEnum(query['gender'], 'gender', GENDERS),
      verified: parseFlag(query['verified'], 'verified'),
      online: parseFlag(query['online'], 'online'),
    };
  }

  async list(session: AuthContext, filters: DiscoveryFilters): Promise<DiscoveryResult> {
    // El conjunto de bots sale de `BotsService` para que el cap de 6 y el filtro
    // de ghost no tengan una segunda copia que se desincronice del stream.
    const botIds = await this.bots.visibleBotIds(session.regionKey, session.profileId);

    const { rows } = await this.pool.query<ProfileRow>(
      `WITH observer AS (
         -- Presencia viva de la sesión: el punto privado o, si eligió zona demo,
         -- el ancla de esa zona (donde el cliente la dibuja). Sin presencia viva
         -- no hay fila y el resto de la consulta no devuelve nada.
         SELECT coalesce(p.point, ST_PointOnSurface(z.polygon)) AS ref,
                p.region_key
           FROM presence p
           LEFT JOIN zones z
             ON z.region_key = p.region_key AND z.zone_key = p.zone_key
          WHERE p.session_id = $1
            AND p.expires_at > now()
       ), humans AS (
         SELECT p.profile_id, p.region_key, p.demo_slot, p.source_type,
                p.nickname, p.initials, p.intention, p.gender, p.verified,
                p.photo_id, p.instagram_handle, p.status_key, p.bio_key,
                pos.point
           FROM profiles p
           -- Presencia viva del perfil, en su región y con zona: sin zona la
           -- presencia es un fallback (punto fuera de toda zona de la región) y
           -- ese perfil no está "en la región" para nadie.
           JOIN LATERAL (
             SELECT coalesce(
                      pr.point,
                      -- Presencia de zona demo (el flujo sin GPS): el perfil está
                      -- donde la demo lo dibuja dentro de esa zona, que es el
                      -- ancla más su vector de catálogo (distance_m /
                      -- bearing_deg). Sin esto, todos los que eligen la misma
                      -- zona caen en el mismo punto y el radar queda en el piso
                      -- de 200 m: el vector autorado es el único dato de posición
                      -- que existe, y es con el que el mock pinta el radar.
                      ST_Project(
                        ST_PointOnSurface(z.polygon)::geography,
                        p.distance_m::float8,
                        radians(p.bearing_deg::float8)
                      )::geometry
                    ) AS point
               FROM presence pr
               JOIN sessions s ON s.session_id = pr.session_id
               LEFT JOIN zones z
                 ON z.region_key = pr.region_key AND z.zone_key = pr.zone_key
              WHERE pr.region_key = p.region_key
                AND s.profile_id = p.profile_id
                AND pr.zone_key IS NOT NULL
                AND pr.expires_at > now()
                AND pr.visibility = 'visible'
                AND s.revoked_at IS NULL
                AND s.expires_at > now()
              ORDER BY pr.expires_at DESC, s.session_id
              LIMIT 1
           ) pos ON true
          WHERE p.region_key = (SELECT region_key FROM observer)
            AND p.source_type = 'human'
            AND p.profile_id <> $2
            -- Bloqueo (v0.5): desaparece en las dos direcciones. El bloqueo
            -- ajeno es invisible para el bloqueado, pero el efecto no.
            AND NOT EXISTS (
              SELECT 1
                FROM blocks bl
               WHERE bl.region_key = p.region_key
                 AND (
                      (bl.blocker_profile_id = $2 AND bl.blocked_profile_id = p.profile_id)
                   OR (bl.blocker_profile_id = p.profile_id AND bl.blocked_profile_id = $2)
                 )
            )
       ), live_humans AS (
         -- Quién está en la página **ahora**: presencia viva, con zona y sesión
         -- viva, en la región del observador. Es el mismo predicado que alimenta
         -- humans, así que un perfil de este conjunto es exactamente uno que el
         -- observador ya está viendo como humano.
         --
         -- Un bot no presta la cara de alguien que ya está en la página (sería
         -- el mismo perfil dos veces en el radar). Es la parte "si es posible" de
         -- la regla: si el catálogo no alcanza, prestar de un humano vivo está
         -- permitido; repetir al dueño, no.
         SELECT DISTINCT s.profile_id
           FROM presence pr
           JOIN sessions s ON s.session_id = pr.session_id
          WHERE pr.region_key = (SELECT region_key FROM observer)
            AND pr.zone_key IS NOT NULL
            AND pr.expires_at > now()
            AND s.revoked_at IS NULL
            AND s.expires_at > now()
       ), bots_visible AS (
         -- Un bot no tiene fila de catálogo. profileId y demoSlot siguen siendo
         -- los del dueño (<owner>-b1|b2 es la identidad estable que usan el
         -- cliente, los eventos y los matches), pero **la identidad de display
         -- la presta otro perfil de la región**. Heredar la fila del dueño era el
         -- bug: el radar mostraba a la misma persona tres veces (el humano y sus
         -- dos bots) con el mismo nombre y la misma foto.
         --
         -- **Regla de selección.** El donante sale del catálogo de la región
         -- (tabla profiles, humanos con slot), nunca del dueño, ordenado así:
         --
         --   1. primero los que hoy **no** están vivos (live_humans), para no
         --      duplicar a nadie que el observador ya ve;
         --   2. dentro de cada grupo, por distancia hacia adelante desde el slot
         --      del dueño con wrap de 10:
         --      (donor.demo_slot - o.demo_slot + 9) % 10.
         --
         -- El bot i del dueño toma el candidato
         -- ((demo_slot - 1) * botsPerHuman + (i - 1)) % total + 1. Sin la
         -- rotación por slot, dos dueños en slots contiguos (1 y 2) recibirían
         -- la misma pareja de caras (2,3 y 3,4) y volvería el problema que esto
         -- corrige; con ella, dueño 1 → posiciones 1,2 y dueño 2 → 3,4.
         --
         -- Garantías: el dueño queda excluido (profile_id <> o.profile_id), y
         -- los dos bots del mismo dueño toman posiciones consecutivas, así que
         -- con 10 slots (al menos 8 candidatos) nunca comparten nickname ni foto.
         -- Nada de random(): la cara es función del catálogo y del par
         -- (demo_slot, índice). Dos lecturas seguidas devuelven la misma fila.
         --
         -- La cara y los atributos que la acompañan viajan juntos: intención,
         -- género y verified también son del donante. La tarjeta del cliente
         -- pinta nombre, iniciales, foto, estado y el chip de intención en el
         -- mismo bloque, así que un "Nico" con género female o con el badge de
         -- un tercero sería una fila que se contradice sola. Lo que sigue siendo
         -- del dueño es la **posición** (el bot orbita a la persona), el slot y
         -- la existencia: sin presencia viva del dueño no hay fila.
         SELECT b.bot_profile_id AS profile_id, b.region_key, o.demo_slot, 'bot'::text AS source_type,
                d.nickname, d.initials, d.intention, d.gender, d.verified,
                d.photo_id, d.instagram_handle, d.status_key, d.bio_key,
                b.position AS point
           FROM bots b
           JOIN profiles o
             ON o.region_key = b.region_key AND o.profile_id = b.owner_profile_id
           LEFT JOIN LATERAL (
             SELECT c.profile_id
               FROM (
                 SELECT donor.profile_id,
                        row_number() OVER (
                          ORDER BY (live.profile_id IS NOT NULL),
                                   (donor.demo_slot - o.demo_slot + 9) % 10
                        ) AS candidate,
                        count(*) OVER () AS candidates
                   FROM profiles donor
                   LEFT JOIN live_humans live ON live.profile_id = donor.profile_id
                  WHERE donor.region_key = b.region_key
                    AND donor.source_type = 'human'
                    AND donor.demo_slot IS NOT NULL
                    AND donor.profile_id <> o.profile_id
               ) c
              WHERE c.candidate = (
                       ((o.demo_slot - 1) * $8::int + (b.bot_index - 1)) % c.candidates
                     ) + 1
           ) donor_pick ON true
           -- Fallback al dueño sólo si la región no tiene ningún otro perfil de
           -- catálogo: el bot no puede desaparecer de la página (los propios
           -- siempre entran). En una región con 10 perfiles nunca se usa.
           JOIN profiles d
             ON d.region_key = b.region_key
            AND d.profile_id = coalesce(donor_pick.profile_id, o.profile_id)
          WHERE b.region_key = (SELECT region_key FROM observer)
            AND b.bot_profile_id = ANY($3::text[])
       ), subjects AS (
         SELECT * FROM humans
         UNION ALL
         SELECT * FROM bots_visible
       )
       SELECT r.profile_id, r.region_key, r.demo_slot, r.source_type,
              r.nickname, r.initials, r.intention, r.gender, r.verified,
              -- Toda fila existe porque hay una presencia viva (propia o del
              -- dueño del bot): lo visible está online por construcción.
              true AS online,
              EXISTS (
                SELECT 1
                  FROM sessions s2
                 WHERE s2.region_key = r.region_key
                   AND s2.demo_slot = r.demo_slot
                   AND s2.revoked_at IS NULL
                   AND s2.expires_at > now()
              ) AS in_use,
              -- Redondeo half-up al metro y al grado: el mismo par
              -- sesión↔perfil devuelve siempre el mismo entero. La banda del
              -- schema (200–5000) se aplica acá por proyección monótona, no por
              -- filtro: el orden ya se calculó sobre la medida real.
              least(${CONTRACT_DISTANCE_MAX_M}, greatest(${CONTRACT_DISTANCE_MIN_M}, round(m.distance_m::numeric)::int)) AS distance_m,
              -- coalesce a 0 porque dos puntos idénticos no tienen rumbo
              -- (ST_Azimuth devuelve NULL) y la fila tiene que seguir siendo
              -- válida: dos presencias en el ancla de la misma zona demo se ven
              -- a 200 m al norte, no con bearingDeg null.
              coalesce((((round(degrees(ST_Azimuth(o.ref, r.point))::numeric)::int % 360) + 360) % 360), 0) AS bearing_deg,
              r.photo_id, r.instagram_handle, r.status_key, r.bio_key
         FROM subjects r
         CROSS JOIN observer o
         -- La medida vive en un LATERAL para calcularla una vez: filtra, ordena y
         -- se proyecta sobre el mismo número.
         CROSS JOIN LATERAL (
           SELECT ST_Distance(o.ref::geography, r.point::geography) AS distance_m
         ) m
        WHERE m.distance_m <= $4::int
          AND ($5::text IS NULL OR r.intention = $5::text)
          AND ($6::text IS NULL OR r.gender = $6::text)
          AND (NOT $7::boolean OR r.verified)
          -- online no entra en el WHERE: toda fila existe porque hay presencia
          -- viva (propia o del dueño), así que lo visible está online por
          -- construcción. Se valida igual en parseFilters (422 si no es
          -- true/false) y el contrato sólo filtra cuando es true.
        ORDER BY m.distance_m ASC, r.profile_id ASC
        LIMIT ${PAGE_SIZE}`,
      [
        session.sessionId,
        session.profileId,
        botIds,
        filters.radiusM,
        filters.intention ?? null,
        filters.gender ?? null,
        filters.verified,
        this.config.botsPerHuman,
      ],
    );

    // Sin coordenadas ni identificadores de sesión en el log: sólo el tamaño de
    // la página y los filtros que la achicaron.
    this.logger.debug(
      `discovery region=${session.regionKey} filas=${rows.length} radio=${filters.radiusM} bots_visibles=${botIds.length}`,
    );

    return { results: rows.map(toProfileSummary) };
  }
}
