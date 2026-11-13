import { afterEach, describe, expect, it, vi } from 'vitest';

import { createLiveController } from '../src/live/controller';
import type { LiveSettings } from '../src/live/config';
import {
  clearStoredVisibility,
  readStoredVisibility,
  writeStoredVisibility,
  type PreferenceStore,
} from '../src/live/config';
import type { Visibility } from '../src/live/types';

const SETTINGS: LiveSettings = { baseUrl: '/api' };

const SESSION = {
  token: 'tok-ghost',
  expiresAt: '2026-11-13T12:00:00.000Z',
  regionKey: 'mx',
  profileId: 'mx-p04',
  demoSlot: 4,
  sourceType: 'human',
};

function row(profileId: string, overrides: Record<string, unknown> = {}) {
  return {
    profileId,
    regionKey: 'mx',
    demoSlot: null,
    sourceType: profileId.includes('-b') ? 'bot' : 'human',
    nickname: profileId.includes('-b') ? 'Fran' : 'Nico',
    initials: 'NI',
    intention: 'friendship',
    gender: 'male',
    verified: false,
    online: true,
    inUse: false,
    distanceM: 320,
    bearingDeg: 118,
    photoId: 'ph02',
    instagramHandle: 'nico.andando',
    statusKey: 'status.p02',
    bioKey: 'bio.p02',
    ...overrides,
  };
}

/**
 * Backend de mentira con estado de presencia: recuerda la visibilidad vigente
 * (ausente = conservar), igual que el contrato. Lo que se verifica no es el
 * server, es **qué manda el cliente** en cada `PUT`.
 */
function makeServer() {
  const bodies: Record<string, unknown>[] = [];
  let visibility: Visibility = 'visible';

  const routes: Record<string, (_url: string, body?: string) => { status: number; body: string }> = {
    'POST /api/auth/demo-session': () => ({ status: 201, body: JSON.stringify(SESSION) }),
    'POST /api/auth/stream-ticket': () => ({ status: 201, body: '{"ticket":"t1"}' }),
    'PUT /api/presence': (_url, body) => {
      const parsed = body === undefined ? {} : (JSON.parse(body) as Record<string, unknown>);
      const next = parsed['visibility'];
      if (next === 'ghost' || next === 'visible') {
        visibility = next;
      }
      bodies.push(parsed);
      return {
        status: 200,
        body: JSON.stringify({
          profileId: SESSION.profileId,
          regionKey: 'mx',
          zoneKey: 'cdmx',
          online: true,
          visibility,
          fallbackRequired: false,
        }),
      };
    },
    'GET /api/demo/profiles': () => ({
      status: 200,
      body: JSON.stringify({ profiles: [row('mx-p02'), row(SESSION.profileId, { demoSlot: 4 })] }),
    }),
    'GET /api/discovery': () => ({
      status: 200,
      body: JSON.stringify({ results: [row('mx-p02'), row('mx-p02-b1', { distanceM: 900 })] }),
    }),
    'GET /api/me': () => ({ status: 404, body: '{"code":"NOT_FOUND"}' }),
    'GET /api/events/poll': () => ({
      status: 200,
      body: JSON.stringify({ events: [], nextCursor: null, hasMore: false }),
    }),
    'GET /api/pings': () => ({ status: 200, body: '{"pings":[]}' }),
    'GET /api/blocks': () => ({ status: 200, body: '{"blocks":[]}' }),
    'GET /api/notifications': () => ({
      status: 200,
      body: '{"notifications":[],"unreadCount":0}',
    }),
  };

  const fetchImpl = async (url: string, init?: { method?: string; body?: string }) => {
    const method = init?.method ?? 'GET';
    const base = url.split('?')[0];
    const route = routes[`${method} ${base}`];
    if (route === undefined) {
      return { ok: false, status: 404, text: async () => '{"code":"NOT_FOUND"}' };
    }
    const result = route(url, init?.body);
    return {
      ok: result.status >= 200 && result.status < 300,
      status: result.status,
      text: async () => result.body,
    };
  };

  return { fetchImpl, bodies, current: () => visibility };
}

function makeController(
  server: ReturnType<typeof makeServer>,
  options: {
    initialVisibility?: Visibility;
    onChange?: (visibility: Visibility) => void;
  } = {},
) {
  return createLiveController({
    settings: SETTINGS,
    initialZoneKey: 'cdmx',
    initialVisibility: options.initialVisibility,
    onVisibilityChange: options.onChange,
    fetchImpl: server.fetchImpl as never,
    createEventSource: () => null,
    pollMs: 60_000,
    heartbeatMs: 8_000,
    reseedMs: 60_000,
    pingsMs: 60_000,
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('ghost en el borde live', () => {
  it('arranca visible y el primer PUT no manda visibility', async () => {
    const server = makeServer();
    const controller = makeController(server);
    await controller.start();

    expect(server.bodies[0]).toEqual({ demoZoneKey: 'cdmx' });
    expect(controller.getState().visibility).toBe('visible');
    await controller.stop();
  });

  it('con la preferencia persistida en ghost, el primer PUT la aplica', async () => {
    const server = makeServer();
    const controller = makeController(server, { initialVisibility: 'ghost' });
    await controller.start();

    expect(server.bodies[0]).toEqual({ demoZoneKey: 'cdmx', visibility: 'ghost' });
    expect(controller.getState().visibility).toBe('ghost');
    expect(server.current()).toBe('ghost');
    await controller.stop();
  });

  it('activar ghost manda visibility, persiste la elección y no toca discovery propio', async () => {
    const server = makeServer();
    const persisted: Visibility[] = [];
    const controller = makeController(server, { onChange: (value) => persisted.push(value) });
    await controller.start();

    const result = await controller.setVisibility('ghost');
    expect(result.ok).toBe(true);
    expect(server.bodies.at(-1)).toEqual({ demoZoneKey: 'cdmx', visibility: 'ghost' });
    expect(controller.getState().visibility).toBe('ghost');
    expect(persisted).toEqual(['ghost']);
    // El dueño sigue viendo su foto y sus bots: el server es quien esconde.
    expect(controller.getState().discovery.map((item) => item.profileId)).toEqual([
      'mx-p02',
      'mx-p02-b1',
    ]);
    await controller.stop();
  });

  it('el latido de posición NO manda visibility y no saca de ghost', async () => {
    vi.useFakeTimers();
    const server = makeServer();
    const controller = makeController(server);
    await controller.start();
    await controller.setVisibility('ghost');
    const before = server.bodies.length;

    await vi.advanceTimersByTimeAsync(8_000);

    const heartbeats = server.bodies.slice(before);
    expect(heartbeats.length).toBeGreaterThan(0);
    for (const body of heartbeats) {
      expect('visibility' in body).toBe(false);
    }
    expect(controller.getState().visibility).toBe('ghost');
    expect(server.current()).toBe('ghost');
    await controller.stop();
  });

  it('volver a visible es otro cambio explícito', async () => {
    const server = makeServer();
    const controller = makeController(server);
    await controller.start();
    await controller.setVisibility('ghost');
    const back = await controller.setVisibility('visible');

    expect(back.ok).toBe(true);
    expect(server.bodies.at(-1)).toEqual({ demoZoneKey: 'cdmx', visibility: 'visible' });
    expect(controller.getState().visibility).toBe('visible');
    await controller.stop();
  });

  it('sin sesión el cambio no miente: devuelve NO_SESSION y no toca el estado', async () => {
    const server = makeServer();
    const controller = makeController(server);
    const result = await controller.setVisibility('ghost');
    expect(result).toEqual({ ok: false, code: 'NO_SESSION' });
    expect(controller.getState().visibility).toBe('visible');
  });

  it('un 500 del server no mueve la visibilidad local', async () => {
    const server = makeServer();
    const controller = makeController(server);
    await controller.start();
    const calls: string[] = [];
    const failing = createLiveController({
      settings: SETTINGS,
      initialZoneKey: 'cdmx',
      fetchImpl: (async (url: string, init?: { method?: string; body?: string }) => {
        if (init?.method === 'PUT') {
          calls.push('presence');
          return { ok: false, status: 500, text: async () => '{"code":"INTERNAL"}' };
        }
        return server.fetchImpl(url, init);
      }) as never,
      createEventSource: () => null,
      pollMs: 60_000,
      heartbeatMs: 60_000,
      pingsMs: 60_000,
    });
    await failing.start();
    // Sin presencia registrada (el PUT falló), el cambio no puede aplicarse.
    const result = await failing.setVisibility('ghost');
    expect(result.ok).toBe(false);
    expect(failing.getState().visibility).toBe('visible');
    await failing.stop();
    await controller.stop();
  });
});

describe('preferencia de visibilidad persistida', () => {
  function fakeStore(): PreferenceStore & { dump: Map<string, string> } {
    const dump = new Map<string, string>();
    return {
      dump,
      getItem: (key) => dump.get(key) ?? null,
      setItem: (key, value) => {
        dump.set(key, value);
      },
      removeItem: (key) => {
        dump.delete(key);
      },
    };
  }

  it('round-trip del enum y default visible', () => {
    const store = fakeStore();
    expect(readStoredVisibility(store)).toBe('visible');
    writeStoredVisibility('ghost', store);
    expect(readStoredVisibility(store)).toBe('ghost');
    writeStoredVisibility('visible', store);
    expect(readStoredVisibility(store)).toBe('visible');
  });

  it('basura o un valor fuera del enum cae a visible', () => {
    const store = fakeStore();
    store.setItem('nearbyig.visibility', 'invisible');
    expect(readStoredVisibility(store)).toBe('visible');
    store.setItem('nearbyig.visibility', '');
    expect(readStoredVisibility(store)).toBe('visible');
  });

  it('borrar deja el default y sin storage no rompe', () => {
    const store = fakeStore();
    writeStoredVisibility('ghost', store);
    clearStoredVisibility(store);
    expect(readStoredVisibility(store)).toBe('visible');
    expect(readStoredVisibility(null)).toBe('visible');
    expect(() => writeStoredVisibility('ghost', null)).not.toThrow();
    expect(() => clearStoredVisibility(null)).not.toThrow();
  });

  it('la clave sólo guarda el enum: ni coordenadas ni token', () => {
    const store = fakeStore();
    writeStoredVisibility('ghost', store);
    const entry = [...store.dump.entries()][0];
    expect(entry?.[0]).toBe('nearbyig.visibility');
    expect(entry?.[1]).toBe('ghost');
    expect(entry?.[1]).not.toMatch(/lat|lng|token/i);
  });
});
