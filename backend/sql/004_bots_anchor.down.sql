-- 004_bots_anchor.down.sql — vuelve al ancla de zona.
--
-- Revierte las dos piezas de `004`: la vista `presence_anchors` y la columna
-- `bots.anchor`. El ticker vuelve a sembrar contra el centroide de la zona en la
-- pasada siguiente; no se pierde catálogo, ni sesiones, ni presencia.

DROP VIEW IF EXISTS presence_anchors;

-- `ALTER TABLE IF EXISTS`: este down corre también en `--rollback-all` después
-- de 008, que se llevó `bots`. Sin el `IF EXISTS` la cadena de rollback revienta
-- con "relation bots does not exist".
ALTER TABLE IF EXISTS bots DROP COLUMN IF EXISTS anchor;
