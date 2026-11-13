-- Rollback de 006_chat.
--
-- Se va, en orden inverso a las dependencias: los eventos del chat, el CHECK de
-- `events` que esta migración amplió, `match_reads` (apunta a `matches`),
-- `messages` (apunta al par `(region_key, match_id)`) y al final el único
-- compuesto que esta migración agregó a `matches`.
--
-- Qué se pierde: mensajes, acuses de lectura y los dos tipos de evento del chat,
-- que son estado de demo efímero (el reset global los borra de todos modos). Los
-- matches de 005 quedan; un match sin mensajes es exactamente lo que v0.3
-- entregaba. Los eventos se borran **antes** de volver al CHECK de dos tipos:
-- dejarlos haría fallar el `ALTER TABLE`.
--
-- Un `006` revertido deja el chat sin superficie de datos: `GET /matches`
-- devuelve 500 al consultar `messages`, que es el estado honesto de un esquema
-- que ya no soporta la operación. Se vuelve a aplicar con `npm run migrate`.

DELETE FROM events WHERE event_type IN ('message.created', 'typing.started');

ALTER TABLE events DROP CONSTRAINT IF EXISTS events_event_type_check;
ALTER TABLE events
  ADD CONSTRAINT events_event_type_check
  CHECK (event_type IN ('profile.moved', 'profile.presence'));

DROP TABLE IF EXISTS match_reads;
DROP TABLE IF EXISTS messages;

ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_region_match_key;
