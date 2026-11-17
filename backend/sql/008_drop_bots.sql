-- 008_drop_bots.sql — se va la población sintética y su vocabulario.
--
-- La aplicación ya dejó de escribir y de leer todo esto (slices 2–4 del change
-- `remove-bots`): esta migración es el último paso, el que borra el
-- almacenamiento. El orden importa y es explícito, no `CASCADE`:
--
--   (a) purgar las filas de los dos tipos de evento que nadie emite;
--   (b) dejar el CHECK de `events` en los dos tipos vivos;
--   (c) `matches.bot_zone_key` — la zona de un match con bot, sin objeto;
--   (d) `presence_anchors` — su único consumidor era el servicio de bots;
--   (e) `bot_waypoints` antes que `bots` (la FK apunta al revés);
--   (f) `bots` — la tabla de la población derivada;
--   (g) `source_type` de `profiles` y `sessions` a `('human', 'guest')`.
--
-- **(a) antes de (b)** por el precedente de `006_chat.down.sql`: un CHECK nuevo
-- valida las filas existentes, así que hay que sacar las que lo violarían antes
-- de angostarlo.
--
-- **(g) es el último lugar donde `'bot'` sobrevive.** Dejarlo "documentado como
-- muerto" permitiría filas que el contrato ya rechaza (`SourceType` es
-- `{human, guest}` desde 0.6.0) y que ninguna superficie puede proyectar.
--
-- Cada paso usa `IF EXISTS`: el gate de rollback de
-- `test/integration/migrations-seeds.test.mjs` vuelve a correr este archivo
-- después de bajar 004, y ahí el esquema ya viene sin la vista y sin la columna.
--
-- Rollback: `008_drop_bots.down.sql` recrea la estructura **vacía** post-007
-- (bots, waypoints, ancla, vista, columna y los dos CHECKs). No restaura filas:
-- eran estado derivado que el ticker volvía a sembrar.

-- (a) Tipos de evento sin productor. `profile.moved` lo emitía el ticker del
-- mundo y `typing.started` la respuesta automática; ninguno existe ya.
DELETE FROM events WHERE event_type IN ('profile.moved', 'typing.started');

-- (b) El log sólo admite lo que el server escribe.
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_event_type_check;
ALTER TABLE events
  ADD CONSTRAINT events_event_type_check
  CHECK (event_type IN ('profile.presence', 'message.created'));

-- (c) La zona en la que nació una conversación con un bot. Sin bots no hay
-- conversación que cerrar por cambio de zona: el match sigue abierto mientras el
-- peer esté en el catálogo (`ChatService.resolveAccess`).
ALTER TABLE matches DROP COLUMN IF EXISTS bot_zone_key;

-- (d) Vista de anclas: una fila por perfil con presencia viva, usada por la
-- reconciliación y por el movimiento de los bots. Ningún otro consumidor.
DROP VIEW IF EXISTS presence_anchors;

-- (e) y (f) Los waypoints primero: `bot_waypoints` referencia `bots`.
DROP TABLE IF EXISTS bot_waypoints;
DROP TABLE IF EXISTS bots;

-- (g) `'bot'` no es un tipo de sesión ni de perfil en ningún lado del esquema.
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_source_type_check;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_source_type_check
  CHECK (source_type IN ('human', 'guest'));

ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_source_type_check;
ALTER TABLE sessions
  ADD CONSTRAINT sessions_source_type_check
  CHECK (source_type IN ('human', 'guest'));
