-- Rollback de 005_pings.
--
-- Se van las dos tablas de la migración, en orden inverso a las dependencias:
-- `pings.match_id` apunta a `matches`, así que primero cae `pings`.
--
-- Qué se pierde: pings y matches, que son estado de demo efímero (un ping vive
-- 24 h y el reset global los borra de todos modos). El catálogo, las sesiones, la
-- presencia y los bots quedan intactos.
--
-- Un `005` revertido deja la API de S4 sin superficie de pings: `POST/GET /pings`
-- devuelve 500 al consultar, que es el estado honesto de un esquema que ya no
-- soporta la operación. Se vuelve a aplicar con `npm run migrate`.

DROP TABLE IF EXISTS pings;
DROP TABLE IF EXISTS matches;
