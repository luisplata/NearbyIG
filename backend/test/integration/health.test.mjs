import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import { api, assertStackUp, PROBLEM_FIELDS } from '../helpers.mjs';

/**
 * `/health` y `/health/ready` viven fuera del contrato a propósito: no son
 * dominio de la demo, son lo que el compose usa para decidir si reiniciar o
 * enrutar tráfico. Estos tests fijan el contrato interno.
 */
describe('health', () => {
  before(async () => {
    await assertStackUp();
  });

  test('GET /health responde 200 sin tocar la base', async () => {
    const { status, body, headers } = await api('/health');
    assert.equal(status, 200);
    assert.equal(body.status, 'ok');
    assert.equal(body.service, 'nearbyig-api');
    assert.equal(typeof body.uptimeSeconds, 'number');
    assert.ok(Number.isFinite(Date.parse(body.timestamp)));
    assert.ok(headers.get('x-request-id'));
  });

  test('GET /health/ready responde 200 con la base arriba', async () => {
    const { status, body } = await api('/health/ready');
    assert.equal(status, 200);
    assert.equal(body.status, 'ready');
    assert.equal(body.checks.db.status, 'up');
    assert.equal(typeof body.checks.db.latencyMs, 'number');
  });

  test('respeta el X-Request-Id del cliente', async () => {
    const requestId = 'test-request-id-0001';
    const { headers } = await api('/health', { headers: { 'x-request-id': requestId } });
    assert.equal(headers.get('x-request-id'), requestId);
  });

  test('una ruta inexistente devuelve Problem, no el default de Nest', async () => {
    const { status, body, headers } = await api('/no-existe');
    assert.equal(status, 404);
    assert.match(headers.get('content-type') ?? '', /application\/problem\+json/);
    assert.deepEqual(Object.keys(body).sort(), PROBLEM_FIELDS);
    assert.equal(body.status, 404);
    assert.equal(body.requestId.length > 0, true);
  });
});
