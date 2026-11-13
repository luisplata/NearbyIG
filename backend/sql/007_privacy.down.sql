-- 007_privacy.down.sql — rollback de Sprint 5 (delta v0.5).
--
-- Deshace exactamente lo que sube `007_privacy.sql`, en orden inverso:
--
--   1. `matches.bot_zone_key` — se va la columna; los matches quedan, porque el
--      chat es de S4 y no depende de esta migración para leerse.
--   2. `notifications`, `reports`, `blocks` — se van las tablas. No hay FK de
--      otras tablas hacia ellas: ningún dato de S1–S4 se pierde.
--   3. `presence.visibility` — se va la columna; una presencia en ghost vuelve a
--      leerse como visible (es el default de S1–S4).
--
-- **Qué NO borra.** `regions`, `zones`, `profiles`, `sessions`, `presence`,
-- `bots`, `events`, `pings`, `matches`, `messages` y `match_reads` siguen
-- intactos: el rollback deshace la migración, no el reset de la demo. Si se
-- revierte con la demo viva, las sesiones abiertas siguen sirviendo y la única
-- diferencia es que la privacidad de S5 desaparece.
--
-- Probado en `backend/test/integration/migrations-seeds.test.mjs`: se aplica
-- 007, se verifica el esquema, se rollea y se vuelve a aplicar, comprobando que
-- las cuatro tablas y las dos columnas desaparecen y reaparecen.
--
-- El orden importa por las FK: `notifications` referencia `pings`, `matches` y
-- `messages`, así que se dropea antes que cualquier otra cosa. `blocks` y
-- `reports` no tienen dependencias.
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS reports;
DROP TABLE IF EXISTS blocks;

ALTER TABLE matches DROP COLUMN IF EXISTS bot_zone_key;
ALTER TABLE presence DROP COLUMN IF EXISTS visibility;
