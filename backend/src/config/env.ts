/**
 * Configuración del proceso, leída una sola vez al arrancar.
 *
 * Reglas:
 *   * En producción no hay defaults para secretos: si faltan, el proceso no
 *     arranca. Fallar al boot es más barato que fallar en la primera request.
 *   * En desarrollo los defaults son explícitos y apuntan a `localhost`
 *     (el `db` del compose). No hay secretos reales en el repo.
 */

export type NodeEnv = 'development' | 'test' | 'production';

export interface AppConfig {
  readonly nodeEnv: NodeEnv;
  readonly isProduction: boolean;
  readonly port: number;
  readonly databaseUrl: string;
  readonly jwtSecret: string;
  /** Vida del JWT y de la fila de `sessions`, en segundos. */
  readonly sessionTtlSeconds: number;
  /** Slots demo por región: el contrato fija 10. */
  readonly slotCount: number;
  /**
   * Vida del ticket de `GET /events`: el contrato fija 30 s.
   *
   * No se lee de `process.env` a propósito: un ticket que vive más que lo
   * declarado es una fuga silenciosa, y el valor no es una decisión de
   * operación sino del contrato.
   */
  readonly streamTicketTtlSeconds: number;
  /**
   * Vida de una presencia (`PUT /presence`): el plan fija 12 s.
   *
   * Igual que el ticket: no se lee de `process.env`. Una presencia que vive más
   * de lo declarado aparece en el radar de los demás sin que su dueño lo sepa,
   * así que no es una perilla de operación sino parte del contrato.
   */
  readonly presenceTtlSeconds: number;
  /** Región que se usa cuando `POST /auth/demo-session` no recibe body. */
  readonly defaultRegionKey: string;
}

export const DEV_JWT_SECRET = 'dev-only-insecure-jwt-secret-change-me';
export const DEV_DATABASE_URL = 'postgres://nearbyig:nearbyig@localhost:5432/nearbyig';

const NODE_ENVS: readonly NodeEnv[] = ['development', 'test', 'production'];

function parseNodeEnv(raw: string | undefined): NodeEnv {
  const value = (raw ?? 'development').trim();
  if (!NODE_ENVS.includes(value as NodeEnv)) {
    throw new Error(`NODE_ENV inválido: "${value}". Valores: ${NODE_ENVS.join(', ')}`);
  }
  return value as NodeEnv;
}

function parseInteger(name: string, raw: string | undefined, fallback: number, min: number, max: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} inválido: "${raw}". Entero entre ${min} y ${max}.`);
  }
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = parseNodeEnv(env.NODE_ENV);
  const isProduction = nodeEnv === 'production';

  const databaseUrl = env.DATABASE_URL?.trim() ?? '';
  if (databaseUrl === '' && isProduction) {
    throw new Error('DATABASE_URL es obligatoria en producción');
  }

  const jwtSecret = env.JWT_SECRET?.trim() ?? '';
  if (isProduction) {
    if (jwtSecret.length < 32) {
      throw new Error('JWT_SECRET es obligatoria en producción y debe tener al menos 32 caracteres');
    }
  }

  return {
    nodeEnv,
    isProduction,
    port: parseInteger('PORT', env.PORT, 3000, 1, 65_535),
    databaseUrl: databaseUrl === '' ? DEV_DATABASE_URL : databaseUrl,
    jwtSecret: jwtSecret === '' ? DEV_JWT_SECRET : jwtSecret,
    sessionTtlSeconds: parseInteger('SESSION_TTL_SECONDS', env.SESSION_TTL_SECONDS, 7200, 60, 86_400),
    slotCount: 10,
    streamTicketTtlSeconds: 30,
    presenceTtlSeconds: 12,
    defaultRegionKey: (env.DEFAULT_REGION_KEY?.trim() || 'mx').toLowerCase(),
  };
}
