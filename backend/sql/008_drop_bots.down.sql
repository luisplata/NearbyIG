-- 008_drop_bots.down.sql — vuelve a la estructura post-007, vacía.
--
-- El rollback de una migración que borra almacenamiento tiene que dejar el
-- esquema en el estado exacto en el que lo encontró, aunque sea sin filas: así
-- `--rollback-all` sigue bajando la cadena sin fallar (`004_bots_anchor.down.sql`
-- vuelve a tocar `bots`). No restaura datos: los bots y sus waypoints eran estado
-- derivado del humano vivo y el ticker los sembraba de nuevo.
--
-- Se recrea con los nombres de constraint originales (`003_bots_events.sql` +
-- `004_bots_anchor.sql`) para que un `up` posterior no choque con objetos
-- homónimos de otra forma.
--
-- Orden inverso al del `up`: primero el vocabulario, después la columna, la
-- vista y las tablas (bots antes que sus waypoints).

-- 1. `source_type` vuelve a admitir los tres valores del esquema viejo.
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_source_type_check;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_source_type_check
  CHECK (source_type IN ('human', 'bot', 'guest'));

ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_source_type_check;
ALTER TABLE sessions
  ADD CONSTRAINT sessions_source_type_check
  CHECK (source_type IN ('human', 'bot', 'guest'));

-- 2. El CHECK de `events` vuelve a los cuatro tipos de 006.
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_event_type_check;
ALTER TABLE events
  ADD CONSTRAINT events_event_type_check
  CHECK (event_type IN ('profile.moved', 'profile.presence', 'message.created', 'typing.started'));

-- 3. La columna de la zona de un match con bot.
ALTER TABLE matches ADD COLUMN IF NOT EXISTS bot_zone_key text;

-- 4. La vista de anclas, tal como la dejó 004.
CREATE VIEW presence_anchors AS
SELECT DISTINCT ON (p.region_key, s.profile_id)
       p.region_key,
       s.profile_id,
       s.source_type,
       p.zone_key,
       coalesce(p.point, ST_PointOnSurface(z.polygon)) AS anchor
  FROM presence p
  JOIN sessions s ON s.session_id = p.session_id
  LEFT JOIN zones z
         ON z.region_key = p.region_key
        AND z.zone_key = p.zone_key
 WHERE p.zone_key IS NOT NULL
   AND p.expires_at > now()
   AND s.revoked_at IS NULL
   AND s.expires_at > now()
 ORDER BY p.region_key, s.profile_id, p.expires_at DESC, s.session_id;

COMMENT ON VIEW presence_anchors IS
  'Punto de referencia de cada perfil con presencia viva: su punto privado (GPS) o el centroide de su zona demo. Una fila por perfil; geometría privada, nunca se proyecta en la API.';

-- 5. La tabla de bots, con `anchor` (agregada por 004), sus índices y sus FKs.
CREATE TABLE bots (
  region_key       text NOT NULL REFERENCES regions (region_key) ON DELETE CASCADE,
  bot_profile_id   text NOT NULL CHECK (length(bot_profile_id) > 0),
  owner_profile_id text NOT NULL,
  bot_index        smallint NOT NULL CHECK (bot_index BETWEEN 1 AND 2),
  zone_key         text NOT NULL,
  center           geometry(Point, 4326) NOT NULL,
  position         geometry(Point, 4326) NOT NULL,
  waypoint_index   smallint NOT NULL CHECK (waypoint_index BETWEEN 0 AND 3),
  distance_m       integer NOT NULL CHECK (distance_m BETWEEN 200 AND 5000),
  bearing_deg      integer NOT NULL CHECK (bearing_deg BETWEEN 0 AND 359),
  leg_started_at   timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  anchor           geometry(Point, 4326) NOT NULL,
  PRIMARY KEY (region_key, bot_profile_id),
  CONSTRAINT bots_owner_index_key UNIQUE (region_key, owner_profile_id, bot_index),
  CONSTRAINT bots_owner_fk FOREIGN KEY (region_key, owner_profile_id)
    REFERENCES profiles (region_key, profile_id) ON DELETE CASCADE,
  CONSTRAINT bots_zone_fk FOREIGN KEY (region_key, zone_key)
    REFERENCES zones (region_key, zone_key) ON DELETE CASCADE
);

CREATE INDEX bots_owner_idx ON bots (region_key, owner_profile_id);
CREATE INDEX bots_leg_idx ON bots (leg_started_at);

-- 6. Los waypoints, con la FK a `bots`.
CREATE TABLE bot_waypoints (
  region_key     text NOT NULL,
  bot_profile_id text NOT NULL,
  waypoint_index smallint NOT NULL CHECK (waypoint_index BETWEEN 0 AND 3),
  point          geometry(Point, 4326) NOT NULL,
  PRIMARY KEY (region_key, bot_profile_id, waypoint_index),
  CONSTRAINT bot_waypoints_bot_fk FOREIGN KEY (region_key, bot_profile_id)
    REFERENCES bots (region_key, bot_profile_id) ON DELETE CASCADE
);
