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
  /**
   * Bots que arrastra cada humano de la demo: el plan fija 2.
   *
   * Fijo en código por la misma razón que el TTL: no es una perilla de
   * operación, es la densidad que el plan promete (`§4`).
   */
  readonly botsPerHuman: number;
  /** Cap de bots por observador: el plan fija 6 (`§12`, "densidad excesiva"). */
  readonly observerBotCap: number;
  /** Segundos que un bot tarda en pisar el siguiente waypoint. */
  readonly botLegSeconds: number;
  /** Cadencia del ticker de movimiento (ms). */
  readonly worldTickMs: number;
  /**
   * Eventos retenidos por región: debajo de eso, el cursor está `CURSOR_EXPIRED`.
   *
   * Con la densidad tope de la demo (10 humanos × 2 bots, un waypoint cada 5 s)
   * son ~4 eventos/s: 5000 da ~20 minutos de ventana para que un cliente que se
   * cayó pueda reanudar sin perder el hilo. Más retención es más tabla; menos,
   * más `410` en la cara del cliente.
   */
  readonly eventRetention: number;
  /**
   * Keepalive del SSE: el contrato fija 15 s (`paths/events.yaml`).
   *
   * Un proxy que corta una conexión ociosa a los 30-60 s es la norma; 15 s deja
   * dos latidos dentro de esa ventana.
   */
  readonly sseHeartbeatMs: number;
  /** Región que se usa cuando `POST /auth/demo-session` no recibe body. */
  readonly defaultRegionKey: string;
  /**
   * Orígenes de navegador permitidos por CORS, ya normalizados.
   *
   * Una allowlist y no `*`: la demo expone sesiones y pide `Authorization`, así
   * que "cualquier origen" es una puerta abierta que además impide razonar sobre
   * quién llama. Lista vacía = CORS apagado (el navegador no puede llamar la API;
   * `curl` y el backend sí).
   */
  readonly corsAllowedOrigins: readonly string[];
}

export const DEV_JWT_SECRET = 'dev-only-insecure-jwt-secret-change-me';
export const DEV_DATABASE_URL = 'postgres://nearbyig:nearbyig@localhost:5432/nearbyig';

/**
 * Orígenes del front local, que es lo que la demo necesita para correr sin
 * configuración:
 *
 *   * `8081` — `expo start` (Expo web dev, el camino principal del plan),
 *   * `4173` — `npx serve@14 site -l 4173` (el export servido, `demo/README.md`),
 *   * `8080` — el puerto de un `http.server`/`serve` cualquiera sobre el export.
 *
 * El origen de GitHub Pages no está acá a propósito: es de S6, cambia por
 * despliegue y se agrega por entorno (`CORS_ALLOWED_ORIGINS=https://usuario.github.io`).
 */
export const DEV_CORS_ORIGINS: readonly string[] = [
  'http://localhost:8081',
  'http://localhost:4173',
  'http://localhost:8080',
];

/** `scheme://host[:port]`, sin path ni barra final: es lo que manda el browser. */
const ORIGIN_PATTERN = /^https?:\/\/[a-z0-9.-]+(?::[0-9]{1,5})?$/i;

const NODE_ENVS: readonly NodeEnv[] = ['development', 'test', 'production'];

function parseNodeEnv(raw: string | undefined): NodeEnv {
  const value = (raw ?? 'development').trim();
  if (!NODE_ENVS.includes(value as NodeEnv)) {
    throw new Error(`NODE_ENV inválido: "${value}". Valores: ${NODE_ENVS.join(', ')}`);
  }
  return value as NodeEnv;
}

/**
 * `CORS_ALLOWED_ORIGINS` → lista de orígenes.
 *
 * En desarrollo y test el default son los tres puertos del front local. En
 * producción **no hay default**: mientras nadie declare el origen de la demo
 * pública (S6), el navegador no puede llamar la API y el boot lo avisa. Un
 * default de conveniencia en producción sería un origen que nadie eligió.
 *
 * `*` se rechaza explícitamente: aceptarlo convertiría la allowlist en su
 * contrario sin cambiar el nombre de la variable. Un origen con path o barra
 * final también: el browser manda `scheme://host[:port]` y nada más, así que
 * "casi el mismo string" sólo produce 403 imposibles de diagnosticar.
 */
function parseCorsOrigins(raw: string | undefined, isProduction: boolean): readonly string[] {
  const value = raw?.trim() ?? '';
  if (value === '') return isProduction ? [] : DEV_CORS_ORIGINS;

  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin !== '');

  for (const origin of origins) {
    if (origin === '*') {
      throw new Error('CORS_ALLOWED_ORIGINS no admite "*": declaré los orígenes, uno por coma.');
    }
    if (!ORIGIN_PATTERN.test(origin)) {
      throw new Error(
        `origen inválido en CORS_ALLOWED_ORIGINS: "${origin}". Forma: scheme://host[:port], sin path ni barra final.`,
      );
    }
  }
  return origins;
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
    botsPerHuman: 2,
    observerBotCap: 6,
    botLegSeconds: 5,
    worldTickMs: 2_000,
    eventRetention: 5_000,
    sseHeartbeatMs: 15_000,
    defaultRegionKey: (env.DEFAULT_REGION_KEY?.trim() || 'mx').toLowerCase(),
    corsAllowedOrigins: parseCorsOrigins(env.CORS_ALLOWED_ORIGINS, isProduction),
  };
}
