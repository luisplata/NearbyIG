-- 005_pings.sql — pings y matches (Sprint 4).
--
-- Dos tablas y una máquina de estados:
--
--   1. `matches` — el par aceptado. Es uno por par **no dirigido**, y eso no lo
--      garantiza la aplicación: lo garantiza `UNIQUE (region_key, profile_a_id,
--      profile_b_id)` con el par ordenado (`a < b`). Dos pings aceptados en
--      direcciones opuestas no pueden producir dos matches ni con una carrera.
--   2. `pings` — la propuesta unidireccional. Nace `pending` y sale sólo hacia
--      `accepted` (con `match_id`), `rejected` o `expired`. `pending` es el único
--      estado del que se sale; los otros tres son terminales.
--
-- **Un pendiente por par dirigido.** `A → B` y `B → A` son pings distintos, pero
-- `A → B` no puede tener dos pendientes: el índice único parcial
-- `pings_pending_pair_key` es la autoridad, no un `SELECT` previo. La carrera
-- entre dos envíos simultáneos la resuelve Postgres y el server traduce el
-- `23505` a `409 PING_DUPLICATE`.
--
-- **No hay FK a `profiles` en el destinatario.** Un ping puede apuntar a un
-- humano del catálogo (`mx-p01`) o a un bot (`mx-p01-b1`), y un bot no tiene
-- fila de catálogo: es una proyección de su dueño (`bots`). Una FK simple no
-- puede expresar "humano o bot" y partirlo en dos columnas obligaría a media
-- tabla polimórfica. El emisor sí tiene FK: `from_profile_id` es siempre un
-- humano del catálogo (un invitado no tiene perfil y el server le responde 403).
--
-- **TTL.** `expires_at` se escribe al crear (24 h). El vencimiento es perezoso:
-- se aplica al leer la bandeja y al intentar resolver, no con un cron. Un ping
-- vencido sólo importa cuando alguien lo mira.
--
-- **Geometría: ninguna.** Un ping no guarda ni proyecta coordenadas: la cercanía
-- la resolvió `GET /discovery` antes de que el cliente eligiera a quién
-- pinguear. `distanceM`/`bearingDeg` tampoco: la distancia de hace horas no dice
-- nada y el contrato no la publica.

CREATE TABLE matches (
  match_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region_key   text NOT NULL REFERENCES regions (region_key) ON DELETE CASCADE,
  -- El par ordenado (`a < b`) es lo que hace único al match. Cualquiera de los
  -- dos lados puede ser un bot (`<owner>-b1`), por eso no hay FK.
  profile_a_id text NOT NULL CHECK (length(profile_a_id) > 0),
  profile_b_id text NOT NULL CHECK (length(profile_b_id) > 0),
  created_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT matches_pair_order_chk CHECK (profile_a_id < profile_b_id),
  CONSTRAINT matches_pair_key UNIQUE (region_key, profile_a_id, profile_b_id)
);

-- "los matches de un perfil" es la única lectura que S5 va a pedir (`GET
-- /matches`); hoy no existe, pero el índice es lo que evita un seq scan el día
-- que exista. Dos índices porque el par está ordenado y el perfil puede caer en
-- cualquiera de las dos columnas.
CREATE INDEX matches_profile_a_idx ON matches (region_key, profile_a_id);
CREATE INDEX matches_profile_b_idx ON matches (region_key, profile_b_id);

CREATE TABLE pings (
  ping_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region_key     text NOT NULL REFERENCES regions (region_key) ON DELETE CASCADE,
  from_profile_id text NOT NULL CHECK (length(from_profile_id) > 0),
  to_profile_id   text NOT NULL CHECK (length(to_profile_id) > 0),
  status         text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz NOT NULL,
  -- Cuándo salió de `pending`. Nulo si y sólo si sigue pendiente: así el estado
  -- no puede mentir sobre la hora en que se resolvió.
  resolved_at    timestamptz,
  -- El match que nació de este ping. Nulo si y sólo si el ping no fue aceptado.
  match_id       uuid REFERENCES matches (match_id),

  -- El emisor es un humano del catálogo: los invitados no tienen perfil y el
  -- server les responde 403 antes de llegar acá. La FK es la red, no la regla.
  CONSTRAINT pings_from_fk FOREIGN KEY (region_key, from_profile_id)
    REFERENCES profiles (region_key, profile_id) ON DELETE CASCADE,

  -- Nadie se pinguea a sí mismo.
  CONSTRAINT pings_self_chk CHECK (from_profile_id <> to_profile_id),
  -- Invertir el reloj de un ping es un estado que la API no puede producir.
  CONSTRAINT pings_expiry_chk CHECK (expires_at > created_at),
  -- `pending` ⇔ sin resolver. Las dos columnas cuentan la misma historia.
  CONSTRAINT pings_resolved_chk CHECK ((status = 'pending') = (resolved_at IS NULL)),
  -- Aceptado ⇔ con match. Un ping `rejected`/`expired` nunca tiene match.
  CONSTRAINT pings_accepted_match_chk CHECK ((status = 'accepted') = (match_id IS NOT NULL))
);

-- Un solo pendiente por par dirigido. Es la regla del contrato y la razón por la
-- que el segundo ping es 409 PING_DUPLICATE: el índice decide, no el server.
CREATE UNIQUE INDEX pings_pending_pair_key
  ON pings (region_key, from_profile_id, to_profile_id)
  WHERE status = 'pending';

-- Las dos bandejas: inbox (`to_profile_id`) y sent (`from_profile_id`), más
-- nuevo primero. El orden del índice es el `ORDER BY` de la query.
CREATE INDEX pings_inbox_idx ON pings (region_key, to_profile_id, created_at DESC);
CREATE INDEX pings_sent_idx ON pings (region_key, from_profile_id, created_at DESC);

-- El barrido perezoso de vencidos (`status = 'pending' AND expires_at <= now()`).
CREATE INDEX pings_pending_expiry_idx ON pings (expires_at) WHERE status = 'pending';

-- `Ping.matchId` en la bandeja y, mañana, el match → sus pings.
CREATE INDEX pings_match_idx ON pings (match_id);
