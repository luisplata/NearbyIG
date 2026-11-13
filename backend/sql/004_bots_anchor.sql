-- 004_bots_anchor.sql — el ancla de un bot es la persona, no el centroide.
--
-- Bug: los bots nacían alrededor de `ST_PointOnSurface(zones.polygon)`, el
-- centroide de la zona, y sus `distanceM`/`bearingDeg` se medían contra ese
-- mismo punto. `GET /discovery` mide desde el punto real del observador, así que
-- un humano lejos del centroide (el norte de Bogotá, por ejemplo) veía sus
-- propios bots a kilómetros y fuera del radio del radar. Los bots de una persona
-- tienen que nacer alrededor de esa persona.
--
-- Dos piezas, una por idea:
--
--   1. `bots.anchor` — el punto con el que se sembró el loop. Es privado (una
--      geometría, nunca sale en un payload ni en un log) y es lo que permite
--      decidir si un cambio de ubicación obliga a resembrar: se compara contra
--      la presencia viva en PostGIS, sin que TypeScript vea una coordenada.
--      Sin esta columna el ancla usada sería irrecuperable: `bots.center` está
--      a 900–1200 m de ella y `bots.position` se mueve por los waypoints.
--   2. `presence_anchors` — la definición única de "el punto de un perfil": su
--      punto privado si tiene GPS, el centroide de su zona si eligió una zona
--      demo. Reconciliación, waypoints y métricas la comparten. Tener dos
--      definiciones del ancla es exactamente el bug que esta migración corrige.
--
-- Backfill de `bots.anchor`: el centroide de la zona, que es el ancla con la que
-- se sembraron todas las filas existentes. No inventa un cambio: la primera
-- pasada del ticker resembrará sólo a los dueños con GPS y lejos de él.
--
-- Rollback (`004_bots_anchor.down.sql`): dropea la vista y la columna. Los bots
-- siguen existiendo y el ticker los vuelve a sembrar con el ancla de zona de
-- antes; no hay datos de catálogo ni de sesiones que se pierdan.

ALTER TABLE bots ADD COLUMN anchor geometry(Point, 4326);

UPDATE bots b
   SET anchor = ST_PointOnSurface(z.polygon)
  FROM zones z
 WHERE z.region_key = b.region_key
   AND z.zone_key = b.zone_key;

ALTER TABLE bots ALTER COLUMN anchor SET NOT NULL;

-- Una fila por perfil con presencia viva y zona: la más reciente. El criterio de
-- desempate (`expires_at DESC, session_id`) es el mismo con el que discovery
-- elige la presencia de un perfil, así el ancla del bot y la posición del dueño
-- no pueden discrepar.
CREATE VIEW presence_anchors AS
SELECT DISTINCT ON (p.region_key, s.profile_id)
       p.region_key,
       s.profile_id,
       s.source_type,
       p.zone_key,
       coalesce(p.point, ST_PointOnSurface(z.polygon)) AS anchor
  FROM presence p
  JOIN sessions s ON s.session_id = p.session_id
  LEFT JOIN zones z
         ON z.region_key = p.region_key
        AND z.zone_key = p.zone_key
 WHERE p.zone_key IS NOT NULL
   AND p.expires_at > now()
   AND s.revoked_at IS NULL
   AND s.expires_at > now()
 ORDER BY p.region_key, s.profile_id, p.expires_at DESC, s.session_id;

COMMENT ON VIEW presence_anchors IS
  'Punto de referencia de cada perfil con presencia viva: su punto privado (GPS) o el centroide de su zona demo. Una fila por perfil; geometría privada, nunca se proyecta en la API.';
