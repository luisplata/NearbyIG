-- Rollback de 002_presence.
--
-- La tabla se va entera: es la única que la migración crea y nadie más la
-- referencia (`presence` referencia a `sessions` y `zones`, no al revés), así
-- que no hay que desarmar nada antes. Los índices y las constraints caen con
-- la tabla.
--
-- Reversible sin pérdida de catálogo: `regions`, `zones`, `profiles`,
-- `sessions` y `stream_tickets` quedan intactas. Lo único que se pierde es el
-- estado de presencia, que por definición vive 12 s.

DROP TABLE IF EXISTS presence;
