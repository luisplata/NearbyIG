-- 001_init.sql — esquema base de la demo (Sprint 1).
--
-- Convenciones:
--   * snake_case en la base, camelCase sólo en la proyección HTTP.
--   * Los enums del contrato (`Gender`, `Intention`, `SourceType`) se replican
--     como CHECK, no como tipos ENUM de Postgres: agregar un valor es un
--     `ALTER TABLE` chico y el valor vive en el mismo lugar que la tabla.
--   * La geometría vive acá en `geometry(Polygon, 4326)`. El contrato no la
--     transporta: ningún SELECT de la API la proyecta.
--   * `demo_slot` es la clave natural del catálogo: único por región y la base
--     para que los seeds sean idempotentes.

CREATE EXTENSION IF NOT EXISTS postgis;

-- Regiones demo: hoy `mx` y `co`. `default_zone_key` es lo que una sesión demo
-- usa cuando el cliente no elige zona.
CREATE TABLE regions (
  region_key       text PRIMARY KEY CHECK (region_key ~ '^[a-z]{2}$'),
  name_key         text NOT NULL CHECK (length(name_key) > 0),
  default_zone_key text NOT NULL CHECK (default_zone_key ~ '^[a-z][a-z0-9-]*$'),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Zonas demo con su polígono. `ST_Covers` (Sprint 2) consulta esta columna.
CREATE TABLE zones (
  region_key text NOT NULL REFERENCES regions (region_key) ON DELETE CASCADE,
  zone_key   text NOT NULL CHECK (zone_key ~ '^[a-z][a-z0-9-]*$'),
  name_key   text NOT NULL CHECK (length(name_key) > 0),
  polygon    geometry(Polygon, 4326) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (region_key, zone_key),
  CONSTRAINT zones_polygon_valid CHECK (ST_IsValid(polygon))
);

CREATE INDEX zones_polygon_gix ON zones USING GIST (polygon);

-- Catálogo de perfiles. `(region_key, profile_id)` es la identidad global y
-- `(region_key, demo_slot)` el slot demo. Los invitados NO están acá: no son
-- perfiles descubribles, son sesión de relleno.
CREATE TABLE profiles (
  region_key       text NOT NULL REFERENCES regions (region_key) ON DELETE CASCADE,
  profile_id       text NOT NULL CHECK (length(profile_id) > 0),
  demo_slot        smallint CHECK (demo_slot BETWEEN 1 AND 10),
  source_type      text NOT NULL CHECK (source_type IN ('human', 'bot', 'guest')),
  nickname         text NOT NULL CHECK (length(nickname) > 0),
  initials         text NOT NULL CHECK (length(initials) > 0),
  intention        text NOT NULL CHECK (intention IN ('networking', 'friendship', 'activities')),
  gender           text NOT NULL CHECK (gender IN ('female', 'male', 'nonbinary')),
  verified         boolean NOT NULL,
  online           boolean NOT NULL,
  distance_m       integer NOT NULL CHECK (distance_m BETWEEN 200 AND 5000),
  bearing_deg      integer NOT NULL CHECK (bearing_deg BETWEEN 0 AND 359),
  photo_id         text NOT NULL CHECK (length(photo_id) > 0),
  instagram_handle text NOT NULL CHECK (length(instagram_handle) > 0),
  status_key       text NOT NULL CHECK (length(status_key) > 0),
  bio_key          text NOT NULL CHECK (length(bio_key) > 0),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (region_key, profile_id),
  -- Un perfil por slot y región. Los invitados no ocupan slot (`demo_slot`
  -- NULL), y en Postgres los NULL no colisionan entre sí.
  CONSTRAINT profiles_region_slot_key UNIQUE (region_key, demo_slot),
  -- Invariante del contrato: `demoSlot == null` si y sólo si `guest`.
  CONSTRAINT profiles_guest_slot_chk CHECK ((source_type = 'guest') = (demo_slot IS NULL))
);

CREATE INDEX profiles_region_slot_idx ON profiles (region_key, demo_slot);

-- Sesiones demo. El JWT no guarda estado: guarda `session_id` (claim `sid`) y
-- esta tabla es la que decide si la sesión sigue viva (logout, expiración).
--
-- No hay FK a `profiles`: un invitado tiene `source_type = 'guest'` y
-- `demo_slot` NULL, y no existe fila de catálogo para él.
CREATE TABLE sessions (
  session_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region_key   text NOT NULL REFERENCES regions (region_key) ON DELETE CASCADE,
  profile_id   text NOT NULL CHECK (length(profile_id) > 0),
  demo_slot    smallint CHECK (demo_slot BETWEEN 1 AND 10),
  source_type  text NOT NULL CHECK (source_type IN ('human', 'bot', 'guest')),
  token_id     uuid NOT NULL UNIQUE,
  issued_at    timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz,
  last_seen_at timestamptz,
  CONSTRAINT sessions_expiry_chk CHECK (expires_at > issued_at),
  CONSTRAINT sessions_guest_slot_chk CHECK ((source_type = 'guest') = (demo_slot IS NULL))
);

-- Un solo slot vivo por región: la carrera entre dos navegadores la resuelve
-- el índice, no el `SELECT` previo.
CREATE UNIQUE INDEX sessions_active_slot_key
  ON sessions (region_key, demo_slot)
  WHERE revoked_at IS NULL AND demo_slot IS NOT NULL;

CREATE INDEX sessions_profile_idx ON sessions (region_key, profile_id);

-- Tickets de un solo uso para `GET /events` (Sprint 2). Se guarda el hash, no
-- el valor: el ticket viaja en la query y no queremos el secreto en la base.
CREATE TABLE stream_tickets (
  ticket_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_hash text NOT NULL UNIQUE CHECK (length(ticket_hash) = 64),
  session_id  uuid NOT NULL REFERENCES sessions (session_id) ON DELETE CASCADE,
  issued_at   timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  consumed_at timestamptz,
  CONSTRAINT stream_tickets_expiry_chk CHECK (expires_at > issued_at)
);

CREATE INDEX stream_tickets_session_idx ON stream_tickets (session_id);

-- Metadatos de la demo. Hoy guarda qué seed está aplicado (`seed_id` y
-- `contract_id`) para que `seed.mjs --check` detecte drift entre la base y el
-- contrato congelado. Es clave-valor a propósito: no es catálogo.
CREATE TABLE demo_meta (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
