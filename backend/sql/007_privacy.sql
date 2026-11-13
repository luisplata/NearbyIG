-- 007_privacy.sql — privacidad, seguridad y reset (Sprint 5, delta v0.5).
--
-- Cinco piezas, una por idea:
--
--   1. `presence.visibility` — el ghost real: "online pero invisible". La
--      presencia sigue viva (el dueño se ve a sí mismo y sus bots orbitan) pero
--      toda lectura ajena filtra `visibility = 'visible'`.
--   2. `blocks` — el bloqueo, con una fila unidireccional y efecto simétrico.
--   3. `reports` — el registro del reporte, sin consola de moderación.
--   4. `notifications` — la campana persistida: ping, match y mensaje.
--   5. `matches.bot_zone_key` — la zona en la que nació una conversación con un
--      bot. Si el dueño se muda de zona el bot se vuelve a sembrar en otra y la
--      conversación queda legible pero cerrada (`MATCH_CLOSED`).
--
-- **Nada de PII nueva.** `blocks` y `reports` guardan `profileId`, que ya es la
-- identidad pública del catálogo; no hay nombres, fotos ni texto libre. Un
-- reporte no guarda el motivo del denunciante en claro más allá del enum
-- cerrado. Ni una coordenada: `visibility` es una preferencia y el resto son
-- referencias.
--
-- **`profileId` canonizado.** En `blocks`/`reports`/`notifications` el perfil es
-- el humano: si el cliente bloquea o reporta un bot (`<owner>-b1`), el server
-- guarda al dueño. Por eso no hay FK a `profiles`: un bot no tiene fila de
-- catálogo y una FK simple obligaría a media tabla polimórfica. La integridad la
-- da el server (resuelve contra la región antes de insertar) y el reset borra
-- por perfil.
--
-- Rollback: `007_privacy.down.sql` dropea las cuatro tablas, las dos columnas y
-- no toca catálogo ni sesiones. Documentado y probado en
-- `backend/test/integration/migrations-seeds.test.mjs` (ver README, "Rollback").

-- 1. Ghost: preferencia de la sesión, no estado de la conexión.
--
-- El default `visible` es lo que mantiene a S1–S4 igual: una fila histórica sin
-- la columna se lee como visible. `online` sigue siendo `true` en ghost; lo que
-- cambia es a quién se le muestra.
ALTER TABLE presence
  ADD COLUMN visibility text NOT NULL DEFAULT 'visible'
  CHECK (visibility IN ('visible', 'ghost'));

-- 2. Bloqueo.
--
-- La PK es el par dirigido: un bloqueo por (bloqueador, bloqueado). Repetir
-- `POST /blocks` es `ON CONFLICT DO NOTHING` y la respuesta sale del `SELECT`
-- posterior: idempotente sin una segunda fila.
--
-- El efecto es simétrico en la lectura (discovery y stream excluyen el par en
-- las dos direcciones), pero la fila guarda **quién** bloqueó. Sin la dirección,
-- `GET /blocks` no podría listar "lo que yo bloqueé" sin exponer el bloqueo
-- ajeno, y un bloqueo ajeno es información que el bloqueado no debe ver.
CREATE TABLE blocks (
  region_key        text NOT NULL REFERENCES regions (region_key) ON DELETE CASCADE,
  blocker_profile_id text NOT NULL CHECK (length(blocker_profile_id) > 0),
  blocked_profile_id text NOT NULL CHECK (length(blocked_profile_id) > 0),
  created_at        timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (region_key, blocker_profile_id, blocked_profile_id),
  -- Nadie se bloquea a sí mismo. El server responde 422 antes de llegar acá; el
  -- CHECK es la red, no la regla.
  CONSTRAINT blocks_self_chk CHECK (blocker_profile_id <> blocked_profile_id)
);

-- La lectura "¿este par está bloqueado en cualquier dirección?" se resuelve por
-- (region, bloqueador, bloqueado) para una dirección y por este índice para la
-- otra. Sin el segundo, discovery pagaría un seq scan por el lado del bloqueado.
CREATE INDEX blocks_blocked_idx ON blocks (region_key, blocked_profile_id);

-- 3. Reportes.
--
-- Sin estado y sin consola: una fila por reporte, con el motivo del enum y la
-- fecha. No hay `resolved_at` ni `reviewer`: la demo registra la señal, no la
-- modera, y un estado que nadie va a mover sería una mentira en el esquema.
CREATE TABLE reports (
  report_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region_key          text NOT NULL REFERENCES regions (region_key) ON DELETE CASCADE,
  reporter_profile_id text NOT NULL CHECK (length(reporter_profile_id) > 0),
  -- Canonizado al humano: reportar un bot reporta a su dueño.
  reported_profile_id text NOT NULL CHECK (length(reported_profile_id) > 0),
  reason              text NOT NULL
                      CHECK (reason IN ('spam', 'harassment', 'inappropriate', 'impersonation', 'other')),
  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT reports_self_chk CHECK (reporter_profile_id <> reported_profile_id)
);

-- "reportes contra un perfil" y "reportes de un perfil" son las dos lecturas
-- que un análisis posterior pediría (y las que el reset usa para limpiar).
CREATE INDEX reports_reported_idx ON reports (region_key, reported_profile_id, created_at DESC);
CREATE INDEX reports_reporter_idx ON reports (region_key, reporter_profile_id);

-- 4. Notificaciones.
--
-- **Persistidas, no derivadas.** Se escriben en la misma transacción que el
-- hecho que las produce (crear un ping, aceptarlo, mandar un mensaje), así una
-- notificación leída sigue leída aunque cambie el estado del recurso.
--
-- **`read_at` es la única autoridad.** No hay `unread` booleano que pueda
-- contradecir la fecha; el cliente cuenta `read_at IS NULL`.
--
-- **Referencias con FK y CASCADE.** Una notificación de un ping que se borra
-- (reset global) se va con él; no queda una fila apuntando a un recurso muerto.
-- La FK es simple y no compuesta: `ping_id`/`message_id` son únicos por sí
-- mismos y el match ya arrastra su región.
CREATE TABLE notifications (
  notification_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region_key          text NOT NULL REFERENCES regions (region_key) ON DELETE CASCADE,
  -- El destinatario. Siempre un perfil con bandeja: un bot no recibe avisos
  -- (no los lee), así que el server no inserta notificaciones para `<owner>-b1`.
  recipient_profile_id text NOT NULL CHECK (length(recipient_profile_id) > 0),
  kind                text NOT NULL
                      CHECK (kind IN ('ping.received', 'match.created', 'message.created')),
  -- Quién lo provocó: la cara que dibuja la campana. Es el emisor del ping, el
  -- que aceptó, o el que escribió. Puede ser un bot (`<owner>-b1`), porque el
  -- bot contesta solo y el aviso tiene que mostrar de dónde viene.
  actor_profile_id    text NOT NULL CHECK (length(actor_profile_id) > 0),
  ping_id             uuid REFERENCES pings (ping_id) ON DELETE CASCADE,
  match_id            uuid REFERENCES matches (match_id) ON DELETE CASCADE,
  message_id          uuid REFERENCES messages (message_id) ON DELETE CASCADE,
  created_at          timestamptz NOT NULL DEFAULT now(),
  read_at             timestamptz,

  -- Cada tipo llena exactamente sus referencias: un aviso de mensaje sin
  -- `message_id` no se puede abrir y uno de ping con `match_id` mentiría sobre
  -- qué pasó.
  CONSTRAINT notifications_refs_chk CHECK (
    (kind = 'ping.received'
      AND ping_id IS NOT NULL AND match_id IS NULL AND message_id IS NULL)
    OR (kind = 'match.created'
      AND match_id IS NOT NULL AND ping_id IS NULL AND message_id IS NULL)
    OR (kind = 'message.created'
      AND match_id IS NOT NULL AND message_id IS NOT NULL AND ping_id IS NULL)
  )
);

-- La campana: "mis notificaciones, más nuevas primero".
CREATE INDEX notifications_inbox_idx
  ON notifications (region_key, recipient_profile_id, created_at DESC, notification_id DESC);
-- El badge: "cuántas me quedan sin leer". Parcial porque el contador sólo mira
-- las no leídas y con el tiempo la mayoría de las filas van a estar leídas.
CREATE INDEX notifications_unread_idx
  ON notifications (region_key, recipient_profile_id)
  WHERE read_at IS NULL;

-- 5. La zona en la que nació una conversación con un bot.
--
-- NULL para un match humano↔humano (la región de una persona no cambia) y para
-- los matches anteriores a esta migración (no hay dato para inventar). Con un
-- bot, es la `bots.zone_key` del momento de aceptar el ping: si el dueño cambia
-- de zona, `reconcile()` retira y vuelve a sembrar el bot en la zona nueva y el
-- valor deja de coincidir → `MATCH_CLOSED` al escribir. La conversación sigue
-- legible.
ALTER TABLE matches ADD COLUMN bot_zone_key text;
