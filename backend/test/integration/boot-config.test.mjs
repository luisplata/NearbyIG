import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { describe, test } from 'node:test';

/**
 * Arranque de producción: la configuración falla **cerrada**.
 *
 * Estos casos no se pueden probar contra la API del compose (que corre en
 * `development`): lo que se verifica es justamente el proceso real con
 * `NODE_ENV=production`, sus validaciones de env y la decisión de CORS con el
 * origen de GitHub Pages. Cada test levanta un `node dist/main.js` efímero en un
 * puerto propio, espera `/health` (o el exit) y lo apaga.
 *
 * Es el gate de S6: sin `CORS_ALLOWED_ORIGINS`, el navegador no puede llamar la
 * API (CORS apagado, no `*`); con el origen declarado, el preflight responde; y
 * `*` o un secreto corto abortan el boot en vez de degradar la demo.
 */

const BASE_ENV = {
  PATH: process.env.PATH,
  NODE_ENV: 'production',
  // Secreto de desarrollo: 45 caracteres, suficiente para el mínimo de 32.
  JWT_SECRET: 'dev-only-insecure-jwt-secret-change-me',
  DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://nearbyig:nearbyig@db:5432/nearbyig',
  DEFAULT_REGION_KEY: 'mx',
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Levanta la API con `env` y devuelve el hijo y su salida acumulada. */
function start(env) {
  const child = spawn(process.execPath, ['dist/main.js'], {
    cwd: '/app',
    env: { ...BASE_ENV, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    output += chunk.toString();
  });

  const exited = new Promise((resolve) => {
    child.on('exit', (code, signal) => resolve({ code, signal }));
  });

  return {
    child,
    exited,
    output: () => output,
    stop: async () => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
      await exited;
    },
  };
}

/** Espera a que el proceso muera por sí solo (config inválida). */
async function expectExit(env, expectedText, label) {
  const api = start(env);
  const result = await Promise.race([
    api.exited,
    sleep(15_000).then(() => ({ code: 'timeout' })),
  ]);
  if (result.code === 'timeout') {
    await api.stop();
    assert.fail(`${label}: el proceso no abortó. Salida:\n${api.output()}`);
  }
  assert.notEqual(result.code, 0, `${label}: exit inesperado 0`);
  assert.match(api.output(), expectedText, `${label}: el mensaje no nombra la causa`);
}

/** Espera `/health` 200 y devuelve la base. */
async function expectUp(env, port, label) {
  const api = start({ ...env, PORT: String(port) });
  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (api.child.exitCode !== null) {
      assert.fail(`${label}: la API murió al arrancar. Salida:\n${api.output()}`);
    }
    try {
      const response = await fetch(`${base}/health`);
      if (response.ok) return { api, base };
    } catch {
      /* todavía no escucha */
    }
    await sleep(200);
  }
  await api.stop();
  assert.fail(`${label}: /health no respondió en 20 s. Salida:\n${api.output()}`);
}

/** Preflight de un `PUT /presence` desde `origin`. */
async function preflight(base, origin) {
  return fetch(`${base}/presence`, {
    method: 'OPTIONS',
    headers: {
      origin,
      'access-control-request-method': 'PUT',
      'access-control-request-headers': 'authorization,content-type',
    },
  });
}

describe('arranque de producción: config y CORS fallan cerrados', () => {
  test('sin DATABASE_URL el proceso aborta nombrando la variable', async () => {
    await expectExit({ DATABASE_URL: '' }, /DATABASE_URL es obligatoria en producción/, 'sin DB');
  });

  test('sin JWT_SECRET el proceso aborta', async () => {
    await expectExit({ JWT_SECRET: '' }, /JWT_SECRET es obligatoria en producción/, 'sin JWT');
  });

  test('un JWT_SECRET corto aborta', async () => {
    await expectExit({ JWT_SECRET: 'corto' }, /al menos 32 caracteres/, 'JWT corto');
  });

  test('CORS_ALLOWED_ORIGINS="*" aborta el boot', async () => {
    await expectExit(
      { CORS_ALLOWED_ORIGINS: '*' },
      /no admite "\*"/,
      'CORS comodín',
    );
  });

  test('un origen con path o barra final aborta el boot', async () => {
    await expectExit(
      { CORS_ALLOWED_ORIGINS: 'https://luisplata.github.io/NearbyIG/' },
      /origen inválido en CORS_ALLOWED_ORIGINS/,
      'CORS con path',
    );
  });

  test('DEMO_RESET_TOKEN corto aborta el boot', async () => {
    await expectExit(
      { DEMO_RESET_TOKEN: 'corto' },
      /DEMO_RESET_TOKEN debe tener al menos 24 caracteres/,
      'reset token corto',
    );
  });

  test('sin CORS_ALLOWED_ORIGINS el boot vive, pero no responde CORS a Pages', async () => {
    const { api, base } = await expectUp({}, 3311, 'CORS apagado');
    try {
      const response = await preflight(base, 'https://luisplata.github.io');
      assert.equal(
        response.headers.get('access-control-allow-origin'),
        null,
        'sin allowlist el preflight de Pages no puede recibir ACAO',
      );

      const health = await fetch(`${base}/health/ready`);
      assert.equal(health.status, 200, 'la API sigue operativa para curl y el healthcheck');
    } finally {
      await api.stop();
    }
  });

  test('con el origen de Pages, el preflight de Pages pasa y el de un tercero no', async () => {
    const { api, base } = await expectUp(
      { CORS_ALLOWED_ORIGINS: 'https://luisplata.github.io' },
      3312,
      'CORS de Pages',
    );
    try {
      const allowed = await preflight(base, 'https://luisplata.github.io');
      assert.equal(
        allowed.headers.get('access-control-allow-origin'),
        'https://luisplata.github.io',
      );
      assert.match(allowed.headers.get('access-control-allow-methods') ?? '', /PUT/);
      assert.match(allowed.headers.get('access-control-allow-headers') ?? '', /authorization/i);

      const foreign = await preflight(base, 'https://evil.example');
      assert.equal(
        foreign.headers.get('access-control-allow-origin'),
        null,
        'un origen ajeno no puede recibir ACAO',
      );
    } finally {
      await api.stop();
    }
  });

  test('el reset global en producción sin DEMO_RESET_TOKEN responde 401', async () => {
    const { api, base } = await expectUp({}, 3313, 'reset cerrado');
    try {
      const response = await fetch(`${base}/demo/reset`, { method: 'POST' });
      const body = await response.json();
      assert.equal(response.status, 401, JSON.stringify(body));
      assert.equal(body.code, 'UNAUTHENTICATED');
      assert.match(body.detail, /DEMO_RESET_TOKEN/);
    } finally {
      await api.stop();
    }
  });

  test('el reset global en producción con token exige el Bearer correcto', async () => {
    const token = 'operador-de-prueba-con-32-caracteres';
    const { api, base } = await expectUp(
      { DEMO_RESET_TOKEN: token, CORS_ALLOWED_ORIGINS: 'https://luisplata.github.io' },
      3314,
      'reset con token',
    );
    try {
      const anonymous = await fetch(`${base}/demo/reset`, { method: 'POST' });
      assert.equal(anonymous.status, 401, 'sin token no ejecuta');

      const wrong = await fetch(`${base}/demo/reset`, {
        method: 'POST',
        headers: { authorization: 'Bearer no-es-el-token' },
      });
      assert.equal(wrong.status, 401, 'token incorrecto no ejecuta');

      const foreignOrigin = await fetch(`${base}/demo/reset`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, origin: 'https://evil.example' },
      });
      assert.equal(foreignOrigin.status, 401, 'un origen ajeno no ejecuta ni con token');

      const ok = await fetch(`${base}/demo/reset`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, origin: 'https://luisplata.github.io' },
      });
      const body = await ok.json();
      assert.equal(ok.status, 200, JSON.stringify(body));
      assert.equal(body.scope, 'global');
    } finally {
      await api.stop();
    }
  });
});
