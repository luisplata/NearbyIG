-- Rollback de 003_bots_events.
--
-- Se van las cuatro tablas de la migración, en orden inverso a las
-- dependencias: los waypoints apuntan a `bots`, y `bots` apunta a `profiles` y
-- `zones` (no al revés, así que el catálogo no se toca).
--
-- Qué se pierde: el estado derivado y el log. Los bots se regeneran en el
-- siguiente tick a partir de las presencias vivas, y el log de la demo no es
-- histórico (la retención ya lo recorta). `regions`, `zones`, `profiles`,
-- `sessions`, `stream_tickets` y `presence` quedan intactas.
--
-- Un `003` revertido deja la API de S2-B sin `GET /events` (500 al consultar),
-- que es el estado honesto de un esquema que ya no soporta la operación: se
-- vuelve a aplicar con `npm run migrate`.

DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS event_seq;
DROP TABLE IF EXISTS bot_waypoints;
DROP TABLE IF EXISTS bots;
