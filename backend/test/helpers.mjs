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
