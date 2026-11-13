-- 001_init.down.sql — rollback de `001_init.sql`.
--
-- Se corre desde `scripts/migrate.mjs --rollback` dentro de una transacción.
-- La extensión `postgis` NO se dropea: puede estar en uso fuera de este
-- esquema y recrearla exige privilegios de superusuario.

DROP TABLE IF EXISTS demo_meta;
DROP TABLE IF EXISTS stream_tickets;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS profiles;
DROP TABLE IF EXISTS zones;
DROP TABLE IF EXISTS regions;
