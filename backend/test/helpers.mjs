/**
 * Helpers de los tests de integración.
 *
 * Los tests corren contra la API y la base REALES del compose (no hay mocks ni
 * contenedores efímeros todavía): lo que se prueba es el mismo stack que se
 * levanta a mano. El comando exacto está en el mensaje de error de
 * `assertStackUp()` y en `backend/README.md`.
 *
 * Aislamiento: cada archivo guarda los `session_id` que existían al empezar y
 * borra sólo los que creó. Nunca se trunca una tabla ni se borra una sesión
 * ajena.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import pg from 'pg';

const execFileAsync = promisify(execFile);

export const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3000';
export const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://nearbyig:nearbyig@localhost:5432/nearbyig';

const COMPOSE_HINT =
  'Levantá el stack y corré los tests dentro de él:\n' +
  '  docker compose -f compose.yml -f compose.dev.yml up --build -d\n' +
  '  docker compose -f compose.yml -f compose.dev.yml exec api npm run test:integration';

export async function withDb(fn) {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export async function assertStackUp() {
  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    if (!response.ok) throw new Error(`/health respondió ${response.status}`);
  } catch (error) {
    throw new Error(`No hay API en ${API_BASE_URL}.\n${COMPOSE_HINT}\nCausa: ${error.message}`);
  }
  try {
    await withDb((client) => client.query('SELECT 1'));
  } catch (error) {
    throw new Error(`No hay base en DATABASE_URL=${DATABASE_URL}.\n${COMPOSE_HINT}\nCausa: ${error.message}`);
  }
}

/**
 * Request JSON contra la API. Devuelve siempre `{ status, headers, body }`,
 * incluso para errores: los tests comparan status y `body.code`.
 */
export async function api(path, options = {}) {
  const headers = { ...(options.headers ?? {}) };
  if (options.token !== undefined) headers.authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let body = null;
  if (text !== '') {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { status: response.status, headers: response.headers, body };
}

export async function openSession(body) {
  return api('/auth/demo-session', { method: 'POST', body: body ?? {} });
}

/**
 * `POST /auth/takeover` — desalojo explícito del slot.
 *
 * El body se manda tal cual (no se rellena): un takeover sin slot es un caso de
 * validación que los tests tienen que poder provocar.
 */
export async function takeover(token, body) {
  return api('/auth/takeover', { method: 'POST', token, body });
}

export async function logout(token) {
  return api('/auth/logout', { method: 'POST', token });
}

export async function createStreamTicket(token) {
  return api('/auth/stream-ticket', { method: 'POST', token });
}

export async function resetSelf(token) {
  return api('/demo/reset/self', { method: 'POST', token });
}

export async function resetGlobal() {
  return api('/demo/reset', { method: 'POST' });
}

export async function listProfiles(token, regionKey) {
  const query = regionKey === undefined ? '' : `?regionKey=${encodeURIComponent(regionKey)}`;
  return api(`/demo/profiles${query}`, { token });
}

/** Slots ocupados por sesiones vivas de una región, ordenados. */
export async function activeSlots(regionKey) {
  return withDb(async (client) => {
    const { rows } = await client.query(
      `SELECT demo_slot
         FROM sessions
        WHERE region_key = $1
          AND revoked_at IS NULL
          AND expires_at > now()
          AND demo_slot IS NOT NULL
        ORDER BY demo_slot`,
      [regionKey],
    );
    return rows.map((row) => row.demo_slot);
  });
}

/** Fila cruda de una sesión, para mirar `revoked_at` y el hash de un ticket. */
export async function sessionRow(sessionId) {
  return withDb(async (client) => {
    const { rows } = await client.query('SELECT * FROM sessions WHERE session_id = $1', [sessionId]);
    return rows[0];
  });
}

/**
 * `session_id` de un JWT de sesión, sin verificarlo.
 *
 * Los tests miran la fila de la sesión para probar el desalojo (`revoked_at`) y
 * los tickets; el `sid` está en el token y decodificarlo evita adivinar por
 * `region_key`/`demo_slot` cuál fila es de quién. No se verifica la firma porque
 * el token lo emitió el server: acá no se está probando la firma.
 */
export function sessionIdOf(token) {
  const payload = token.split('.')[1];
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  if (typeof claims.sid !== 'string') throw new Error('el token no lleva `sid`');
  return claims.sid;
}

export async function streamTicketsOf(sessionId) {
  return withDb(async (client) => {
    const { rows } = await client.query(
      'SELECT ticket_hash, issued_at, expires_at, consumed_at FROM stream_tickets WHERE session_id = $1',
      [sessionId],
    );
    return rows;
  });
}

/**
 * Inserta una sesión ya vencida y sin revocar en un slot libre.
 *
 * Es el estado que deja el paso del tiempo: el índice único parcial sólo mira
 * `revoked_at`, así que la fila sigue ocupando el slot. Sirve para probar que
 * el claim la limpia en vez de responder 409 para siempre.
 */
export async function insertExpiredSession(regionKey, demoSlot) {
  return withDb(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO sessions (region_key, profile_id, demo_slot, source_type, token_id, issued_at, expires_at)
       VALUES ($1, $2, $3, 'human', gen_random_uuid(), now() - interval '3 hours', now() - interval '1 hour')
       RETURNING session_id`,
      [regionKey, `${regionKey}-expired-${demoSlot}`, demoSlot],
    );
    return rows[0].session_id;
  });
}

/** Inserta un invitado (no ocupa slot) sin pasar por los 10 slots. */
export async function insertGuestSession(regionKey) {
  return withDb(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO sessions (region_key, profile_id, demo_slot, source_type, token_id, expires_at)
       VALUES ($1, $2, NULL, 'guest', gen_random_uuid(), now() + interval '2 hours')
       RETURNING session_id`,
      [regionKey, `guest-test-${Math.random().toString(16).slice(2, 10)}`],
    );
    return rows[0].session_id;
  });
}

/** Todas las sesiones, con todas sus columnas: el reset global las borra. */
export async function snapshotSessions() {
  return withDb(async (client) => {
    const { rows } = await client.query('SELECT * FROM sessions ORDER BY session_id');
    return rows;
  });
}

/**
 * Reinserta las sesiones que había antes de un test destructivo.
 *
 * Un reset global borra filas ajenas y el suite corre contra la base real; el
 * token es un JWT sin estado, así que reponer la fila repone la sesión exacta.
 */
export async function restoreSessions(rows) {
  if (rows.length === 0) return;
  await withDb(async (client) => {
    for (const row of rows) {
      await client.query(
        `INSERT INTO sessions (session_id, region_key, profile_id, demo_slot, source_type,
                               token_id, issued_at, expires_at, revoked_at, last_seen_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (session_id) DO NOTHING`,
        [
          row.session_id,
          row.region_key,
          row.profile_id,
          row.demo_slot,
          row.source_type,
          row.token_id,
          row.issued_at,
          row.expires_at,
          row.revoked_at,
          row.last_seen_at,
        ],
      );
    }
  });
}

export async function countRows(table) {
  return withDb(async (client) => {
    const { rows } = await client.query(`SELECT count(*)::int AS count FROM ${table}`);
    return rows[0].count;
  });
}

/**
 * `PUT /presence`. El body se manda tal cual (no se rellena): los casos de
 * validación tienen que poder provocarse desde el test.
 */
export async function updatePresence(token, body) {
  return api('/presence', { method: 'PUT', token, body });
}

export async function clearPresence(token) {
  return api('/presence', { method: 'DELETE', token });
}

/**
 * `GET /events/poll`. El cursor y el limit se mandan tal cual (vacíos incluidos):
 * los casos de validación tienen que poder provocarse desde el test.
 */
export async function pollEvents(token, { cursor, limit } = {}) {
  const params = new URLSearchParams();
  if (cursor !== undefined) params.set('cursor', cursor);
  if (limit !== undefined) params.set('limit', String(limit));
  const query = params.toString();
  return api(`/events/poll${query === '' ? '' : `?${query}`}`, { token });
}

/**
 * `GET /discovery`. Los filtros se mandan tal cual —incluidos valores inválidos y
 * repetidos— porque los casos de validación tienen que poder provocarse.
 *
 * Un valor de array se manda repetido a propósito: es el pedido ambiguo que el
 * server tiene que rechazar, no "el primero".
 */
export async function listDiscovery(token, filters = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (Array.isArray(value)) for (const entry of value) params.append(key, String(entry));
    else params.set(key, String(value));
  }
  const query = params.toString();
  return api(`/discovery${query === '' ? '' : `?${query}`}`, { token });
}

/**
 * `POST /pings`. El body se manda tal cual: los casos de validación tienen que
 * poder provocarse desde el test.
 */
export async function createPing(token, body) {
  return api('/pings', { method: 'POST', token, body });
}

/** `GET /pings?box=`. `box` se manda tal cual (vacíos incluidos). */
export async function listPings(token, box) {
  const query = box === undefined ? '' : `?box=${encodeURIComponent(box)}`;
  return api(`/pings${query}`, { token });
}

export async function acceptPing(token, pingId) {
  return api(`/pings/${encodeURIComponent(pingId)}/accept`, { method: 'POST', token });
}

export async function rejectPing(token, pingId) {
  return api(`/pings/${encodeURIComponent(pingId)}/reject`, { method: 'POST', token });
}

/** Vence un ping sin esperar 24 h: mueve `expires_at` al pasado. */
export async function expirePing(pingId) {
  await withDb((client) =>
    client.query(
      `UPDATE pings
          SET created_at = now() - interval '2 days',
              expires_at = now() - interval '1 day'
        WHERE ping_id = $1`,
      [pingId],
    ),
  );
}

/** Borra los pings y matches de un escenario. Pings primero por la FK. */
export async function deletePingsOf(regionKey, profileIds) {
  await withDb(async (client) => {
    await client.query(
      `DELETE FROM pings
        WHERE region_key = $1
          AND (from_profile_id = ANY($2::text[]) OR to_profile_id = ANY($2::text[]))`,
      [regionKey, profileIds],
    );
    await client.query(
      `DELETE FROM matches
        WHERE region_key = $1
          AND (profile_a_id = ANY($2::text[]) OR profile_b_id = ANY($2::text[]))`,
      [regionKey, profileIds],
    );
  });
}

/** Cantidad de matches del par no dirigido, para probar "uno por par". */
export async function countMatchesOf(regionKey, firstProfileId, secondProfileId) {
  const [a, b] = [firstProfileId, secondProfileId].sort();
  return withDb(async (client) => {
    const { rows } = await client.query(
      `SELECT count(*)::int AS count
         FROM matches
        WHERE region_key = $1 AND profile_a_id = $2 AND profile_b_id = $3`,
      [regionKey, a, b],
    );
    return rows[0].count;
  });
}

/** `GET /matches` — la bandeja de matches del perfil de la sesión. */
export async function listMatches(token) {
  return api('/matches', { token });
}

/** `GET /matches/{matchId}/messages`. El cursor se manda tal cual (vacíos incluidos). */
export async function listMessages(token, matchId, cursor) {
  const query = cursor === undefined ? '' : `?cursor=${encodeURIComponent(cursor)}`;
  return api(`/matches/${encodeURIComponent(matchId)}/messages${query}`, { token });
}

/** `POST /matches/{matchId}/messages`. El body se manda tal cual. */
export async function sendMessage(token, matchId, body) {
  return api(`/matches/${encodeURIComponent(matchId)}/messages`, { method: 'POST', token, body });
}

/** `POST /matches/{matchId}/read` — marca leída la conversación (204). */
export async function markMatchRead(token, matchId) {
  return api(`/matches/${encodeURIComponent(matchId)}/read`, { method: 'POST', token });
}

/** `GET /me` — el perfil de la propia sesión. */
export async function getMe(token) {
  return api('/me', { token });
}

/** Filas de `messages` de un match, sin body ni identidad: sólo conteos y orden. */
export async function messageRowsOf(matchId) {
  return withDb(async (client) => {
    const { rows } = await client.query(
      `SELECT message_seq::text AS seq, sender_profile_id, body
         FROM messages
        WHERE match_id = $1
        ORDER BY message_seq`,
      [matchId],
    );
    return rows.map((row) => ({ seq: Number(row.seq), sender: row.sender_profile_id, body: row.body }));
  });
}

/**
 * Inserta mensajes directo en la base, sin pasar por la API.
 *
 * Sirve para probar la paginación con más de una página sin mandar 100+ requests
 * (que además chocarían con el rate limit del endpoint): el cursor tiene que
 * moverse sobre filas que existen, no sobre filas que el test podría haber
 * mandado más rápido.
 */
export async function insertMessages(matchId, regionKey, senderProfileId, bodies) {
  await withDb(async (client) => {
    for (const [index, body] of bodies.entries()) {
      await client.query(
        `INSERT INTO messages (region_key, match_id, sender_profile_id, client_message_id, body)
         VALUES ($1, $2, $3, $4, $5)`,
        [regionKey, matchId, senderProfileId, `bulk-${index}`, body],
      );
    }
  });
}

/** `id` del envelope → `seq`. Sólo para comparar, igual que hace el cliente. */
export function seqOfId(id) {  const match = /^[a-z]{2}:([0-9]{12})$/.exec(id ?? '');
  if (match === null) throw new Error(`id de evento inesperado: ${JSON.stringify(id)}`);
  return Number(match[1]);
}

/** Mayor `seq` del log de una región: el borde para congelar una comparación. */
export async function maxEventSeq(regionKey) {
  return withDb(async (client) => {
    const { rows } = await client.query(
      'SELECT coalesce(max(seq), 0)::text AS seq FROM events WHERE region_key = $1',
      [regionKey],
    );
    return Number(rows[0].seq);
  });
}

/** Filas del log de una región, sin geometría (el payload es el del contrato). */
export async function eventRowsIn(regionKey) {
  return withDb(async (client) => {
    const { rows } = await client.query(
      `SELECT seq::text AS seq, event_type, payload
         FROM events
        WHERE region_key = $1
        ORDER BY seq`,
      [regionKey],
    );
    return rows.map((row) => ({ seq: Number(row.seq), type: row.event_type, payload: row.payload }));
  });
}

/**
 * Filas de `bots` de una región, **sin** centro ni posición: el test mira
 * identidad, zona y métricas, nunca la geometría privada.
 */
export async function botRows(regionKey) {
  return withDb(async (client) => {
    const { rows } = await client.query(
      `SELECT bot_profile_id, owner_profile_id, bot_index, zone_key,
              waypoint_index, distance_m, bearing_deg
         FROM bots
        WHERE region_key = $1
        ORDER BY bot_profile_id`,
      [regionKey],
    );
    return rows;
  });
}

/**
 * Vence el tramo de todos los bots de una región: en el próximo tick el mundo
 * avanza un waypoint sin esperar los 5 s reales. Es el equivalente de
 * `expirePresence` para el ticker.
 */
export async function expireBotLegs(regionKey) {
  await withDb((client) =>
    client.query(
      `UPDATE bots SET leg_started_at = now() - interval '1 hour' WHERE region_key = $1`,
      [regionKey],
    ),
  );
}

/**
 * Geometría de los bots de una región **como distancias**, nunca coordenadas.
 *
 * `ref` es el punto esperado del dueño (su presencia con GPS o el centroide de
 * su zona demo) y se recalcula acá a propósito, sin usar la vista
 * `presence_anchors`: el test tiene que tener su propia definición de dónde
 * debería estar el ancla. Si las tres distancias son 0/900–1200/300–1700, el
 * bot está donde tiene que estar sin que el test mire un `lng` o un `lat`.
 *
 * `created_ms` sale como número (epoch en ms) porque es lo que distingue
 * "resembró" de "siguió el mismo loop": un avance de waypoint no lo toca.
 */
export async function botAnchorRows(regionKey) {
  return withDb(async (client) => {
    const { rows } = await client.query(
      `SELECT b.bot_profile_id,
              b.owner_profile_id,
              b.zone_key,
              b.waypoint_index,
              (extract(epoch FROM b.created_at) * 1000)::bigint::text AS created_ms,
              round(ST_Distance(b.anchor::geography, ref.point::geography))::int AS anchor_to_ref_m,
              round(ST_Distance(b.center::geography, ref.point::geography))::int AS center_to_ref_m,
              round(ST_Distance(b.position::geography, ref.point::geography))::int AS position_to_ref_m
         FROM bots b
         JOIN LATERAL (
           SELECT coalesce(pr.point, ST_PointOnSurface(z.polygon)) AS point
             FROM presence pr
             JOIN sessions s ON s.session_id = pr.session_id
             LEFT JOIN zones z
               ON z.region_key = pr.region_key AND z.zone_key = pr.zone_key
            WHERE pr.region_key = b.region_key
              AND s.profile_id = b.owner_profile_id
              AND pr.zone_key IS NOT NULL
              AND pr.expires_at > now()
              AND s.revoked_at IS NULL
              AND s.expires_at > now()
            ORDER BY pr.expires_at DESC, s.session_id
            LIMIT 1
         ) ref ON true
        WHERE b.region_key = $1
        ORDER BY b.bot_profile_id`,
      [regionKey],
    );
    return rows.map((row) => ({ ...row, created_ms: Number(row.created_ms) }));
  });
}

/** Waypoints del loop de un dueño que caen fuera del polígono de su zona. */
export async function botWaypointsOutsideZone(regionKey, ownerProfileId) {
  return withDb(async (client) => {
    const { rows } = await client.query(
      `SELECT count(*)::int AS outside
         FROM bot_waypoints w
         JOIN bots b
           ON b.region_key = w.region_key AND b.bot_profile_id = w.bot_profile_id
         JOIN zones z
           ON z.region_key = b.region_key AND z.zone_key = b.zone_key
        WHERE w.region_key = $1
          AND b.owner_profile_id = $2
          AND NOT ST_Covers(z.polygon, w.point)`,
      [regionKey, ownerProfileId],
    );
    return rows[0].outside;
  });
}

/** Distancia del punto privado de una sesión al centroide de su zona. */
export async function presenceToCentroidM(sessionId) {
  return withDb(async (client) => {
    const { rows } = await client.query(
      `SELECT round(ST_Distance(p.point::geography, ST_PointOnSurface(z.polygon)::geography))::int AS distance_m
         FROM presence p
         JOIN zones z ON z.region_key = p.region_key AND z.zone_key = p.zone_key
        WHERE p.session_id = $1`,
      [sessionId],
    );
    return rows[0]?.distance_m;
  });
}

/** Espera activa de una condición async, con timeout: el ticker es asíncrono. */
export async function waitFor(check, { timeoutMs = 10_000, intervalMs = 200, label = 'condición' } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await check();
    if (last) return last;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`timeout esperando ${label} (${timeoutMs} ms)`);
}

/**
 * Abre `GET /events` con un ticket y junta frames hasta `untilSeq` (o `maxMs`).
 *
 * Devuelve status, headers y frames `{ id, type, data }` sin el preámbulo. Si el
 * status no es 200, devuelve el `Problem` en `body` — el stream y el error tienen
 * que poder distinguirse desde el test.
 */
export async function openEventStream(ticket, options = {}) {
  const { lastEventId, untilSeq, maxMs = 8_000 } = options;
  const controller = new AbortController();
  const url = new URL(`${API_BASE_URL}/events`);
  url.searchParams.set('ticket', ticket);
  const headers = {};
  if (lastEventId !== undefined) headers['last-event-id'] = lastEventId;
  const timer = setTimeout(() => controller.abort(), maxMs);
  const startedAt = Date.now();

  try {
    const response = await fetch(url, { headers, signal: controller.signal });
    if (response.status !== 200) {
      const text = await response.text();
      return {
        status: response.status,
        headers: response.headers,
        body: text === '' ? null : JSON.parse(text),
        frames: [],
        elapsedMs: Date.now() - startedAt,
      };
    }

    const frames = [];
    let buffer = '';
    let head = '';
    try {
      for await (const chunk of response.body) {
        buffer += Buffer.from(chunk).toString('utf8');
        if (head === '') head = buffer.slice(0, 64);
        let boundary = buffer.indexOf('\n\n');
        while (boundary >= 0) {
          const block = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const frame = parseSseFrame(block);
          if (frame !== null) frames.push(frame);
          boundary = buffer.indexOf('\n\n');
        }
        if (untilSeq !== undefined && frames.some((frame) => seqOfId(frame.id) >= untilSeq)) break;
      }
    } catch (error) {
      if (!controller.signal.aborted) throw error;
    }

    return {
      status: response.status,
      headers: response.headers,
      head,
      frames,
      elapsedMs: Date.now() - startedAt,
    };
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

/** Un bloque `id/event/data` del stream; `null` para keepalive y comentarios. */
function parseSseFrame(block) {
  if (block.startsWith(':')) return null;
  const field = (name) => {
    const line = block.split('\n').find((candidate) => candidate.startsWith(`${name}: `));
    return line === undefined ? undefined : line.slice(name.length + 2);
  };
  const id = field('id');
  const type = field('event');
  const data = field('data');
  if (id === undefined || type === undefined || data === undefined) return null;
  return { id, type, data: JSON.parse(data) };
}

/**
 * Fila de `presence` de una sesión, **sin** la coordenada.
 *
 * El punto se queda en la base: lo que el test necesita saber es si hay punto y
 * si la fila está viva, no dónde es. El valor exacto lo lee `storedPoint`, que
 * existe sólo para probar el redondeo a 6 decimales.
 */
export async function presenceRow(sessionId) {
  return withDb(async (client) => {
    const { rows } = await client.query(
      `SELECT region_key, zone_key, point IS NOT NULL AS has_point,
              expires_at > now() AS live,
              round(extract(epoch FROM (expires_at - now())))::int AS remaining_s
         FROM presence
        WHERE session_id = $1`,
      [sessionId],
    );
    return rows[0];
  });
}

/** Coordenada guardada, leída del punto privado y redondeada a 6 decimales. */
export async function storedPoint(sessionId) {
  return withDb(async (client) => {
    const { rows } = await client.query(
      `SELECT round(ST_X(point)::numeric, 6)::float8 AS lng,
              round(ST_Y(point)::numeric, 6)::float8 AS lat
         FROM presence
        WHERE session_id = $1`,
      [sessionId],
    );
    const row = rows[0];
    return row === undefined ? undefined : { lat: row.lat, lng: row.lng };
  });
}

/**
 * Envejece la presencia de una sesión para probar el TTL sin dormir 12 s.
 *
 * Mueve `created_at` y `expires_at` juntos para no violar
 * `presence_expiry_chk` (`expires_at > created_at`): es exactamente el estado
 * que deja el paso del tiempo, una fila creada hace 30 s que venció hace 18 s.
 */
export async function expirePresence(sessionId) {
  await withDb((client) =>
    client.query(
      `UPDATE presence
          SET created_at = now() - interval '30 seconds',
              expires_at = now() - interval '18 seconds'
        WHERE session_id = $1`,
      [sessionId],
    ),
  );
}

/**
 * Empuja el vencimiento de las presencias del escenario.
 *
 * El TTL de 12 s es del contrato y se prueba en `presence.test.mjs`; acá sirve
 * para que un test del mundo (bots, eventos) no dependa de la duración de la
 * suite. No cambia la semántica de lectura: `expires_at > now()` sigue siendo la
 * única autoridad y el reloj se mueve igual, sólo que más tarde.
 */
export async function extendPresence(sessionIds, seconds = 120) {
  if (sessionIds.length === 0) return;
  await withDb((client) =>
    client.query(
      `UPDATE presence
          SET expires_at = now() + make_interval(secs => $2::int)
        WHERE session_id = ANY($1::uuid[])`,
      [sessionIds, seconds],
    ),
  );
}

/** Filas de `presence` de una región (para probar que no hay duplicados). */export async function presenceRowsIn(regionKey) {
  return withDb(async (client) => {
    const { rows } = await client.query(
      `SELECT session_id, zone_key, expires_at > now() AS live
         FROM presence
        WHERE region_key = $1`,
      [regionKey],
    );
    return rows;
  });
}

/**
 * Apunta la sesión a un `profile_id` que no está en el catálogo.
 *
 * Es el estado que deja un seed regenerado debajo de una sesión viva: la fila de
 * `sessions` sigue (el token sirve) pero el perfil ya no existe. Se muta la fila
 * en vez de borrar un perfil del catálogo para no romper el resto del suite.
 */
export async function pointSessionToMissingProfile(sessionId, profileId) {
  await withDb((client) =>
    client.query('UPDATE sessions SET profile_id = $2 WHERE session_id = $1', [sessionId, profileId]),
  );
}

/** SRID y tipo de la columna de geometría de `presence`. */
export async function presenceGeometryColumn() {
  return withDb(async (client) => {
    const { rows } = await client.query(
      `SELECT srid, type FROM geometry_columns
        WHERE f_table_name = 'presence' AND f_geometry_column = 'point'`,
    );
    return rows[0];
  });
}


export async function snapshotSessionIds() {
  return withDb(async (client) => {
    const { rows } = await client.query('SELECT session_id FROM sessions');
    return rows.map((row) => row.session_id);
  });
}

/** Borra las sesiones creadas desde el snapshot; deja intactas las previas. */
export async function deleteSessionsCreatedSince(snapshot) {
  await withDb((client) =>
    client.query('DELETE FROM sessions WHERE NOT (session_id = ANY($1::uuid[]))', [snapshot]),
  );
}

/** Corre un script `.mjs` del backend con el mismo `node` y `DATABASE_URL`. */
export async function runScript(script, args = []) {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [script, ...args], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL },
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    return {
      code: typeof error.code === 'number' ? error.code : 1,
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? String(error.message),
    };
  }
}

export const PROFILE_FIELDS = [
  'bearingDeg',
  'bioKey',
  'demoSlot',
  'distanceM',
  'gender',
  'inUse',
  'initials',
  'instagramHandle',
  'intention',
  'nickname',
  'online',
  'photoId',
  'profileId',
  'regionKey',
  'sourceType',
  'statusKey',
  'verified',
];

export const PROBLEM_FIELDS = ['code', 'detail', 'requestId', 'status', 'title', 'type'];
