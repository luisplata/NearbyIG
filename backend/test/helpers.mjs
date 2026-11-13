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

export async function listProfiles(token, regionKey) {
  const query = regionKey === undefined ? '' : `?regionKey=${encodeURIComponent(regionKey)}`;
  return api(`/demo/profiles${query}`, { token });
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
