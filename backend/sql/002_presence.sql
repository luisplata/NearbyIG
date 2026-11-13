-- 002_presence.sql — presencia de la sesión (Sprint 2).
--
-- Una fila por sesión (`session_id` es la PK): la presencia es **estado de
-- sesión**, no historial. Un segundo `PUT /presence` reemplaza la anterior por
-- upsert, así que nunca hay dos presencias vivas para el mismo navegador ni un
-- estado duplicado cuando la sesión cambia de punto o de zona.
--
-- `point` es `geometry(Point, 4326)` y es lo único privado de la tabla: guarda
-- el punto que mandó el cliente. Es NULL cuando la sesión eligió `demoZoneKey`
-- (no mandó coordenada y no se inventa una). La API **nunca** proyecta esta
-- columna: resuelve `zone_key` con `ST_Covers` contra `zones.polygon` y devuelve
-- sólo `regionKey`/`zoneKey`/`fallbackRequired`.
--
-- TTL de 12 s: `expires_at` es la única autoridad. No hay cron ni job de
-- barrido; toda lectura filtra `expires_at > now()` (ver `presence.service.ts`).
-- La fila queda —el siguiente `PUT` la reusa por upsert y el reset la borra en
-- cascada con la sesión— pero deja de contar en el instante en que vence.

CREATE TABLE presence (
  -- La sesión es el sujeto: si se cierra o se resetea, la presencia se va con
  -- ella (ON DELETE CASCADE), sin dejar filas huérfanas.
  session_id uuid PRIMARY KEY REFERENCES sessions (session_id) ON DELETE CASCADE,
  region_key text NOT NULL REFERENCES regions (region_key) ON DELETE CASCADE,
  zone_key   text CHECK (zone_key ~ '^[a-z][a-z0-9-]*$'),
  point      geometry(Point, 4326),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,

  -- La zona derivada siempre es de la región de la presencia. Con `zone_key`
  -- NULL el FK no se evalúa (MATCH SIMPLE), que es exactamente lo que hace
  -- falta en el fallback: hay región y hay punto, pero no hay zona.
  CONSTRAINT presence_zone_fk FOREIGN KEY (region_key, zone_key)
    REFERENCES zones (region_key, zone_key) ON DELETE CASCADE,

  -- O hay zona derivada, o hay punto privado. Las dos NULL sería una presencia
  -- sin posición y sin zona, que no se puede descubrir ni dibujar.
  CONSTRAINT presence_position_chk CHECK (zone_key IS NOT NULL OR point IS NOT NULL),

  -- Invertir el reloj de una fila (expiración con `expires_at` en el pasado)
  -- no es un estado que la API pueda producir.
  CONSTRAINT presence_expiry_chk CHECK (expires_at > created_at)
);

-- Descubrimiento (Sprint 3) lee por región y opcionalmente por zona: "quién
-- está en mx", "quién está en cdmx".
CREATE INDEX presence_region_zone_idx ON presence (region_key, zone_key);

-- El filtro de TTL de toda lectura (`expires_at > now()`).
CREATE INDEX presence_expires_at_idx ON presence (expires_at);

-- Distancia/rumbo server-side de Sprint 3 (`ST_DWithin`), sobre el punto
-- privado. Mismo tipo de índice que `zones_polygon_gix`.
CREATE INDEX presence_point_gix ON presence USING GIST (point);
