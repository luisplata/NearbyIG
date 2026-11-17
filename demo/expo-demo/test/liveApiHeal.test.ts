import { describe, expect, it, vi } from 'vitest';

import type { FetchLike } from '../src/live/api';
import { createLiveController } from '../src/live/controller';

/**
 * Auto-reparación del override guardado, de punta a punta en el controlador.
 *
 * El caso real: `localStorage['nearbyig.api']` apunta a un túnel apagado, el host
 * no resuelve y —como el storage gana sobre el build— la demo se queda sin salida.
 * Acá se fija el contrato: un fallo **de red** descarta el override y reintenta
 * una sola vez contra la base del build; un segundo fallo sigue el camino de
 * siempre y nunca hay una tercera llamada.
 */

const DEAD = 'https://tunel-viejo.ngrok-free.app';
const BUILD = 'https://api.ejemplo.test';

const SESSION = {
  token: 'tok-1',
  expiresAt: '2026-11-13T12:00:00.000Z',
  regionKey: 'mx',
  profileId: 'mx-p05',
  demoSlot: 5,
  sourceType: 'human',
};

/** `'network'` = el `fetch` rechaza antes de tener respuesta (host muerto). */
type Reply = { status: number; body: string } | 'network';

function makeFetch(reply: (url: string) => Reply) {
  const calls: string[] = [];
  const fetchImpl: FetchLike = async (url) => {
    calls.push(url);
    const result = reply(url);
    if (result === 'network') {
      throw new TypeError('Failed to fetch');
    }
    return {
      ok: result.status >= 200 && result.status < 300,
      status: result.status,
      text: async () => result.body,
    };
  };
  return { fetchImpl, calls };
}

/** Respuestas mínimas para que una sesión completa cierre contra la base viva. */
function alive(url: string): Reply {
  const path = url.slice(BUILD.length);
  if (path === '/auth/demo-session') {
    return { status: 201, body: JSON.stringify(SESSION) };
  }
  if (path === '/auth/logout') {
    return { status: 204, body: '' };
  }
  if (path === '/presence') {
    return {
      status: 200,
      body: JSON.stringify({
        profileId: 'mx-p05',
        regionKey: 'mx',
        zoneKey: 'cdmx',
        online: true,
        fallbackRequired: false,
      }),
    };
  }
  if (path === '/discovery') {
    return { status: 200, body: '{"results":[]}' };
  }
  if (path === '/demo/profiles') {
    return { status: 200, body: '{"profiles":[]}' };
  }
  if (path.startsWith('/events/poll')) {
    return { status: 200, body: '{"events":[],"nextCursor":null,"hasMore":false}' };
  }
  if (path === '/me') {
    return { status: 404, body: '{"code":"NOT_FOUND"}' };
  }
  return { status: 200, body: '{"blocks":[],"notifications":[],"matches":[],"unreadCount":0}' };
}

type Options = {
  origin?: 'storage' | 'query' | 'env';
  buildBase?: string | null;
  clearStoredApi?: () => void;
};

function makeController(fetchImpl: FetchLike, options: Options = {}) {
  return createLiveController({
    settings: { baseUrl: DEAD },
    apiBaseOrigin: options.origin ?? 'storage',
    buildApiBase: options.buildBase === undefined ? BUILD : options.buildBase,
    clearStoredApi: options.clearStoredApi ?? ((): void => undefined),
    initialZoneKey: 'cdmx',
    fetchImpl,
    // Nada de latidos durante el test: el único pedido que importa es el de sesión.
    heartbeatMs: 60_000,
    pollMs: 60_000,
    reseedMs: 60_000,
  });
}

const sessionCalls = (calls: readonly string[]): string[] =>
  calls.filter((url) => url.endsWith('/auth/demo-session'));

describe('override muerto en el storage', () => {
  it('la primera llamada falla por red: se borra el override y se reintenta contra el build', async () => {
    const clearStoredApi = vi.fn();
    const fetch = makeFetch((url) => (url.startsWith(BUILD) ? alive(url) : 'network'));
    const controller = makeController(fetch.fetchImpl, { clearStoredApi });

    const started = await controller.start();

    expect(started).toBe(true);
    // Exactamente dos: el muerto y el del build. No se reintenta nada más.
    expect(sessionCalls(fetch.calls)).toEqual([
      `${DEAD}/auth/demo-session`,
      `${BUILD}/auth/demo-session`,
    ]);
    expect(clearStoredApi).toHaveBeenCalledTimes(1);
    expect(controller.getSettings()?.baseUrl).toBe(BUILD);

    const state = controller.getState();
    expect(state.session?.profileId).toBe('mx-p05');
    // Sin `EventSource` en el test el transporte es polling: conectado igual.
    expect(state.status).toBe('polling');
    expect(state.notice).toBeNull();

    await controller.stop();
  });

  it('si el reintento también falla por red, queda `offline` y no hay tercera llamada', async () => {
    const clearStoredApi = vi.fn();
    const fetch = makeFetch(() => 'network');
    const controller = makeController(fetch.fetchImpl, { clearStoredApi });

    const started = await controller.start();

    expect(started).toBe(false);
    expect(sessionCalls(fetch.calls)).toEqual([
      `${DEAD}/auth/demo-session`,
      `${BUILD}/auth/demo-session`,
    ]);
    expect(clearStoredApi).toHaveBeenCalledTimes(1);
    const state = controller.getState();
    expect(state.status).toBe('offline');
    expect(state.notice).toBe('unreachable');
    expect(state.session).toBeNull();
  });

  it('un error HTTP con respuesta no descarta el override: el host existe', async () => {
    const clearStoredApi = vi.fn();
    const fetch = makeFetch((url) =>
      url.startsWith(BUILD) ? alive(url) : { status: 500, body: '{"code":"INTERNAL"}' },
    );
    const controller = makeController(fetch.fetchImpl, { clearStoredApi });

    const started = await controller.start();

    expect(started).toBe(false);
    expect(sessionCalls(fetch.calls)).toEqual([`${DEAD}/auth/demo-session`]);
    expect(clearStoredApi).not.toHaveBeenCalled();
    const state = controller.getState();
    expect(state.status).toBe('offline');
    expect(state.error).toBe('INTERNAL');
  });

  it('un `?api=` explícito no se repara: la base la eligió el usuario', async () => {
    const clearStoredApi = vi.fn();
    const fetch = makeFetch((url) => (url.startsWith(BUILD) ? alive(url) : 'network'));
    const controller = makeController(fetch.fetchImpl, { origin: 'query', clearStoredApi });

    expect(await controller.start()).toBe(false);
    expect(sessionCalls(fetch.calls)).toEqual([`${DEAD}/auth/demo-session`]);
    expect(clearStoredApi).not.toHaveBeenCalled();
    expect(controller.getSettings()?.baseUrl).toBe(DEAD);
  });
});
