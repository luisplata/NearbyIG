-- 006_chat.sql — mensajes y acuses de lectura (Sprint 4, delta v0.4).
--
-- Dos tablas y una regla de integridad:
--
--   1. `messages` — la conversación de un match. Cada fila es inmutable: un
--      mensaje no se edita ni se borra (el reset global vacía la tabla entera).
--   2. `match_reads` — hasta dónde leyó cada lado. Es un **watermark**, no una
--      fila por mensaje: el badge de "no leídos" es una cuenta, no un registro
--      auditable, y guardar un recibo por mensaje multiplicaría las filas por
--      cada lectura de la demo.
--
-- **El par (region_key, match_id) es la FK, no `match_id` solo.** `matches` de
-- 005 tiene `PRIMARY KEY (match_id)` y no puede sostener una FK compuesta. En
-- vez de editar 005 —ya aplicada— se agrega acá el único `(region_key,
-- match_id)`: con eso un mensaje no puede apuntar a un match de otra región, y
-- la garantía la da Postgres, no un `SELECT` previo del server. El índice que
-- crea ese UNIQUE sirve además a "todos los mensajes de este match".
--
-- **Idempotencia por (match, emisor, clientMessageId).** Es la clave que hace
-- que reintentar `POST /matches/{matchId}/messages` no duplique. Va con el
-- emisor adentro a propósito: dos personas pueden usar el mismo
-- `clientMessageId` en la misma conversación sin pisarse; con sólo
-- `(match_id, client_message_id)` el segundo vería el mensaje del primero.
--
-- **Orden estable.** `message_seq bigint GENERATED ALWAYS AS IDENTITY` es el
-- orden canónico y el cursor de la página: monotónico, independiente del reloj
-- y sin empates. `created_at` es lo que el cliente muestra y lo que ordena a
-- ojo, pero dos mensajes del mismo milisegundo se desempatan por `message_seq`.
--
-- **`last_read_seq` es un número, no una FK.** El watermark puede apuntar a un
-- `seq` que ya no existe (reset global) sin romper nada: leer de nuevo lo
-- recalcula. Una FK acá convertiría "marcar leído" en un 409 inventado.
--
-- **Sin geometría y sin PII extra.** Un mensaje guarda quién lo escribió y qué
-- dijo: no hay coordenadas, ni distancia, ni ubicación. Los logs no escriben ni
-- el body ni el `profileId` (ver `backend/README.md`).

-- El único compuesto que hace posible la FK de abajo. `matches` ya tiene el
-- `match_id` como PK; esto agrega la región al par.
ALTER TABLE matches
  ADD CONSTRAINT matches_region_match_key UNIQUE (region_key, match_id);

-- Los dos tipos de evento que este módulo emite. 003 dejó el CHECK en los dos de
-- S2 a propósito ("se amplía en la migración que los emita, no antes"): ésta es
-- esa migración. `ping.received` y `match.created` siguen afuera porque todavía
-- no tienen productor; su migración los sumará cuando existan.
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_event_type_check;
ALTER TABLE events
  ADD CONSTRAINT events_event_type_check
  CHECK (event_type IN ('profile.moved', 'profile.presence', 'message.created', 'typing.started'));

CREATE TABLE messages (
  -- Orden canónico y cursor. `GENERATED ALWAYS` evita que alguien escriba uno a
  -- mano y rompa el orden de una conversación.
  message_seq      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  message_id       uuid NOT NULL DEFAULT gen_random_uuid(),
  region_key       text NOT NULL REFERENCES regions (region_key) ON DELETE CASCADE,
  match_id         uuid NOT NULL,
  sender_profile_id text NOT NULL CHECK (length(sender_profile_id) > 0),
  -- Clave de idempotencia del emisor. El server no la interpreta: la compara.
  client_message_id text NOT NULL CHECK (length(client_message_id) BETWEEN 1 AND 100),
  -- El body se recorta en los bordes antes del INSERT; vacío es 422 en el
  -- server y no llega acá. El tope es el `maxLength` de `MessageCreate`.
  body             text NOT NULL CHECK (length(btrim(body)) > 0 AND length(body) <= 2000),
  created_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT messages_id_key UNIQUE (message_id),
  -- Un mensaje pertenece al match **de su región**: la FK compuesta lo impone.
  CONSTRAINT messages_match_fk FOREIGN KEY (region_key, match_id)
    REFERENCES matches (region_key, match_id) ON DELETE CASCADE,
  -- Reintentar el mismo pedido devuelve la misma fila, no una segunda.
  CONSTRAINT messages_client_key UNIQUE (match_id, sender_profile_id, client_message_id)
);

-- La única lectura por conversación: "los mensajes de este match, en orden".
CREATE INDEX messages_match_idx ON messages (match_id, message_seq);

CREATE TABLE match_reads (
  match_id     uuid NOT NULL REFERENCES matches (match_id) ON DELETE CASCADE,
  -- El perfil que leyó. No hay FK a `profiles`: un bot (`<owner>-b1`) también
  -- es parte de un match y no tiene fila de catálogo.
  profile_id   text NOT NULL CHECK (length(profile_id) > 0),
  -- Mayor `message_seq` leído. 0 = todavía no leyó nada del otro lado.
  last_read_seq bigint NOT NULL DEFAULT 0 CHECK (last_read_seq >= 0),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, profile_id)
);

-- `GET /matches` pregunta por el watermark del observador en cada fila.
CREATE INDEX match_reads_profile_idx ON match_reads (profile_id);
