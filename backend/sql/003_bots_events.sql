-- 003_bots_events.sql — bots derivados y log de eventos (Sprint 2, S2-B).
--
-- Tres piezas, una por idea:
--
--   1. `bots` + `bot_waypoints` — los 2 bots que cada humano vivo arrastra. No
--      son catálogo ni sesiones: son estado derivado del perfil humano, con
--      `profileId` estable (`<owner>-b1`, `<owner>-b2`) para que un logout y un
--      nuevo login del mismo slot devuelvan los mismos bots.
--   2. `event_seq` — el contador monotónico por región. Es la única autoridad
--      del orden: `id = <regionKey>:<seq:012d>`. `occurredAt` es informativo y no
--      ordena (ver `contract/schemas/events.yaml`).
--   3. `events` — el log del que cuelgan las dos proyecciones (SSE y polling) y
--      el que sostiene `Last-Event-ID` / `cursor` y la retención.
--
-- Geometría: `bots.center`, `bots.position` y `bot_waypoints.point` son
-- `geometry(Point, 4326)` y son **privadas**. La API no las proyecta nunca:
-- publica `distanceM`/`bearingDeg` (en `bots`, recalculados en cada waypoint) y
-- el envelope del evento sólo lleva `profileId` + esas dos medidas. Mover un bot
-- no saca una coordenada del server.
--
-- Waypoints: 4 por bot (`waypoint_index` 0..3), un loop cerrado alrededor de
-- `center`. El ticker avanza un índice por vuelta (`bot_waypoints` →
-- `bots.waypoint_index`) y recalcula `distanceM`/`bearingDeg` contra el ancla de
-- la zona (`ST_PointOnSurface(zones.polygon)`), que es la misma referencia
-- estable con la que se escribieron los valores estáticos del catálogo.

CREATE TABLE bots (
  region_key      text NOT NULL REFERENCES regions (region_key) ON DELETE CASCADE,
  -- `profileId` del bot dentro de la región. Estable y distinto del humano:
  -- `<owner_profile_id>-b<bot_index>`.
  bot_profile_id  text NOT NULL CHECK (length(bot_profile_id) > 0),
  -- Dueño: un perfil humano del catálogo. Si el seed regenera el catálogo, los
  -- bots se van con él (ON DELETE CASCADE), no quedan huérfanos.
  owner_profile_id text NOT NULL,
  bot_index       smallint NOT NULL CHECK (bot_index BETWEEN 1 AND 2),
  -- Zona del humano en el momento del spawn: los bots se mueven dentro de ella.
  zone_key        text NOT NULL,
  -- Centro del loop (privado) y posición actual (privada).
  center          geometry(Point, 4326) NOT NULL,
  position        geometry(Point, 4326) NOT NULL,
  waypoint_index  smallint NOT NULL CHECK (waypoint_index BETWEEN 0 AND 3),
  -- Lo único que sale: distancia y rumbo contra el ancla de la zona.
  distance_m      integer NOT NULL CHECK (distance_m BETWEEN 200 AND 5000),
  bearing_deg     integer NOT NULL CHECK (bearing_deg BETWEEN 0 AND 359),
  -- Cuándo se pisó el waypoint actual: el ticker avanza los que ya cumplieron
  -- `leg_s` y no necesita una fila de agenda por bot.
  leg_started_at  timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (region_key, bot_profile_id),
  -- Dos bots por humano, ni uno más ni uno menos, y un solo bot por índice.
  CONSTRAINT bots_owner_index_key UNIQUE (region_key, owner_profile_id, bot_index),
  CONSTRAINT bots_owner_fk FOREIGN KEY (region_key, owner_profile_id)
    REFERENCES profiles (region_key, profile_id) ON DELETE CASCADE,
  -- El bot vive en la zona de su dueño: una zona de otra región no existe como
  -- par (region_key, zone_key) en `zones`.
  CONSTRAINT bots_zone_fk FOREIGN KEY (region_key, zone_key)
    REFERENCES zones (region_key, zone_key) ON DELETE CASCADE
);

-- Reconciliación del ticker: "los bots de este dueño", "los bots de esta región".
CREATE INDEX bots_owner_idx ON bots (region_key, owner_profile_id);
CREATE INDEX bots_leg_idx ON bots (leg_started_at);

CREATE TABLE bot_waypoints (
  region_key     text NOT NULL,
  bot_profile_id text NOT NULL,
  waypoint_index smallint NOT NULL CHECK (waypoint_index BETWEEN 0 AND 3),
  point          geometry(Point, 4326) NOT NULL,
  PRIMARY KEY (region_key, bot_profile_id, waypoint_index),
  CONSTRAINT bot_waypoints_bot_fk FOREIGN KEY (region_key, bot_profile_id)
    REFERENCES bots (region_key, bot_profile_id) ON DELETE CASCADE
);

-- Contador por región. `UPDATE … RETURNING` es la asignación: dos requests
-- concurrentes no pueden llevarse el mismo `seq` porque el `UPDATE` serializa la
-- fila. No hay `SEQUENCE` global a propósito: el contrato ordena por región.
CREATE TABLE event_seq (
  region_key text PRIMARY KEY REFERENCES regions (region_key) ON DELETE CASCADE,
  last_seq   bigint NOT NULL CHECK (last_seq >= 0)
);

-- Log de eventos. `payload` es el del contrato, ya cerrado: sólo `profileId` y
-- las medidas del tipo. Nunca una coordenada (el guard de geometría del contrato
-- y el test de serialización lo verifican del lado del cliente).
CREATE TABLE events (
  region_key text NOT NULL REFERENCES regions (region_key) ON DELETE CASCADE,
  seq        bigint NOT NULL CHECK (seq > 0),
  -- S2 emite dos de los seis tipos del enum. Los otros cuatro están declarados
  -- en el contrato y esperan a S4/S5: el CHECK se amplía en la migración que los
  -- emita, no antes (así nadie los emite por accidente).
  event_type text NOT NULL CHECK (event_type IN ('profile.moved', 'profile.presence')),
  -- Informativo: el orden lo da `seq`. Se guarda con ms porque el contrato lo
  -- exige en el envelope.
  occurred_at timestamptz NOT NULL DEFAULT now(),
  payload    jsonb NOT NULL,
  PRIMARY KEY (region_key, seq)
);

-- Retención: el ticker borra lo que sobra (`seq <= last_seq - retención`), así
-- que el log no crece sin control y `CURSOR_EXPIRED` tiene un borde concreto.
CREATE INDEX events_region_occurred_idx ON events (region_key, occurred_at);
