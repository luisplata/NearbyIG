import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import { isAllowedCorsOrigin, loadConfig } from '../../dist/config/env.js';
import { api, assertStackUp } from '../helpers.mjs';

/**
 * CORS — Sprint 3, S3-A.
 *
 * Lo que fija este archivo:
 *
 *  - un origen de la allowlist recibe `Access-Control-Allow-Origin` (y el
 *    preflight de `PUT`/`GET` con `Authorization` pasa);
 *  - un túnel de ngrok (el caso "probar en el móvil") también, pero **sólo en
 *    desarrollo**: el origen que importa es el de la página, no el de la API;
 *  - un origen de afuera **no** lo recibe: la allowlist no es decorativa;
 *  - el parseo de `CORS_ALLOWED_ORIGINS`: coma + espacios, `*` rechazado y
 *    producción sin default (el origen de Pages es de S6 y se declara por
 *    entorno).
 *
 * El parseo se prueba contra `dist/config/env.js` —el módulo que corre el
 * server— y no contra una copia: un test que reimplementa la regla no protege de
 * que la implementación cambie.
 */

const ALLOWED = 'http://localhost:8081';
/** Subdominio con el formato que emite ngrok (guiones y dígitos). */
const TUNNEL = 'https://abc123-1-2-3-4.ngrok-free.app';

/** Config mínima válida para producción: sin estas dos, `loadConfig` no arranca. */
const PROD_ENV = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgres://user:pass@db:5432/nearbyig',
  JWT_SECRET: 'x'.repeat(40),
};

describe('cors: allowlist del navegador', () => {
  before(async () => {
    await assertStackUp();
  });

  test('el preflight de un origen permitido devuelve los headers de CORS', async () => {
    const response = await api('/discovery', {
      method: 'OPTIONS',
      headers: {
        origin: ALLOWED,
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'authorization',
      },
    });

    assert.equal(response.status, 204, JSON.stringify(response.body));
    assert.equal(response.headers.get('access-control-allow-origin'), ALLOWED);
    assert.match(String(response.headers.get('access-control-allow-methods')), /GET/);
    assert.match(String(response.headers.get('access-control-allow-methods')), /PUT/);
    assert.match(String(response.headers.get('access-control-allow-headers')), /authorization/);
    // El `EventSource` manda `Last-Event-ID` al reconectar: si no está permitido,
    // el replay del stream se cae en el preflight.
    assert.match(String(response.headers.get('access-control-allow-headers')), /last-event-id/i);
    // Sin credenciales: la demo usa Bearer, no cookies.
    assert.equal(response.headers.get('access-control-allow-credentials'), null);

    // El caso del móvil: la página servida por un túnel de ngrok. El origen que
    // entra en CORS es el de la página, no el de la API.
    const config = loadConfig();
    if (config.corsAllowTunnelOrigins) {
      const tunnel = await api('/discovery', {
        method: 'OPTIONS',
        headers: {
          origin: TUNNEL,
          'access-control-request-method': 'GET',
          'access-control-request-headers': 'authorization',
        },
      });
      assert.equal(tunnel.status, 204, JSON.stringify(tunnel.body));
      assert.equal(
        tunnel.headers.get('access-control-allow-origin'),
        TUNNEL,
        'un túnel de ngrok en desarrollo tiene que poder llamar la API desde el móvil',
      );
      assert.equal(tunnel.headers.get('access-control-allow-credentials'), null);
      assert.match(String(tunnel.headers.get('access-control-allow-methods')), /PUT/);
    }
  });

  test('un origen fuera de la lista no recibe Access-Control-Allow-Origin', async () => {
    for (const origin of ['https://evil.example', 'http://localhost:9999']) {
      const response = await api('/health', { headers: { origin } });
      assert.equal(response.status, 200);
      assert.equal(
        response.headers.get('access-control-allow-origin'),
        null,
        `${origin}: la API habilitó un origen que no está en la allowlist`,
      );
    }

    // Y el origen permitido sí lo recibe en una request real, no sólo en el preflight.
    const allowed = await api('/health', { headers: { origin: 'http://localhost:4173' } });
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:4173');
    assert.match(String(allowed.headers.get('vary')), /origin/i, 'sin Vary: Origin un proxy cachea de más');
  });

  test('CORS_ALLOWED_ORIGINS: default local en dev, vacío en producción y sin `*`', () => {
    const dev = loadConfig({ NODE_ENV: 'development' });
    assert.deepEqual(dev.corsAllowedOrigins, [
      'http://localhost:8081',
      'http://localhost:4173',
      'http://localhost:8080',
    ]);
    // Los túneles se aceptan sólo en desarrollo/test: en producción la lista es
    // exactamente la declarada.
    assert.equal(dev.corsAllowTunnelOrigins, true);
    assert.equal(loadConfig({ NODE_ENV: 'test' }).corsAllowTunnelOrigins, true);
    assert.equal(loadConfig(PROD_ENV).corsAllowTunnelOrigins, false);

    // Producción no inventa un origen: S6 lo declara por entorno.
    assert.deepEqual(loadConfig(PROD_ENV).corsAllowedOrigins, []);
    assert.deepEqual(
      loadConfig({ ...PROD_ENV, CORS_ALLOWED_ORIGINS: ' http://localhost:8081 , https://usuario.github.io ' })
        .corsAllowedOrigins,
      ['http://localhost:8081', 'https://usuario.github.io'],
    );

    for (const invalid of ['*', 'localhost:8081', 'http://localhost:8081/', 'http://localhost:8081/app']) {
      assert.throws(
        () => loadConfig({ ...PROD_ENV, CORS_ALLOWED_ORIGINS: invalid }),
        /CORS_ALLOWED_ORIGINS/,
        `"${invalid}" tiene que fallar en el boot, no habilitar de más`,
      );
    }

    // La decisión por origen: allowlist exacta en producción, + túnel en dev.
    assert.equal(isAllowedCorsOrigin(ALLOWED, ['http://localhost:8081'], false), true);
    assert.equal(isAllowedCorsOrigin(TUNNEL, ['http://localhost:8081'], false), false);
    assert.equal(isAllowedCorsOrigin(TUNNEL, [], true), true);
    assert.equal(isAllowedCorsOrigin('https://evil.example', [], true), false);
    // Un túnel falso no pasa: el sufijo tiene que ser exactamente el del dominio.
    for (const fake of [
      'https://abc.ngrok-free.app.evil.example',
      'http://abc.ngrok-free.app',
      'https://ngrok-free.app',
      'https://abc.ngrok.io.evil',
    ]) {
      assert.equal(isAllowedCorsOrigin(fake, [], true), false, `${fake} no es un túnel válido`);
    }
  });
});
