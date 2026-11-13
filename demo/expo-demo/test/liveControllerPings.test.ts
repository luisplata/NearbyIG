import { afterEach, describe, expect, it, vi } from 'vitest';

import { createLiveController } from '../src/live/controller';
import type { LiveSettings } from '../src/live/config';

const SETTINGS: LiveSettings = { baseUrl: '/api' };

const SESSION = {
  token: 'tok-1',
  expiresAt: '2026-11-13T12:00:00.000Z',
  regionKey: 'mx',
  profileId: 'mx-p04',
  demoSlot: 4,
  sourceType: 'human',
};

const ROW = (profileId: string, overrides: Record<string, unknown> = {}) => ({
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
});

type Ping = {
  id: string;
  fromProfileId: string;
  toProfileId: string;
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
  createdAt: string;
  expiresAt: string;
  matchId: string | null;
};

/**
 * Backend de mentira con la máquina de estados de pings: un pendiente por par,
 * el bot acepta solo y el accept devuelve un match. No es una segunda
 * implementación de la lógica: es el mínimo para que el controller ejerza los
 * caminos reales (pending, accepted, 409, accept, reject).
 */
function makePingServer() {
  const pings: Ping[] = [];
  let seq = 0;
  let nextId = 1;

  const list = (box: 'inbox' | 'sent') => {
    const mine = SESSION.profileId;
    return {
      pings: pings
        .filter((ping) =>
          box === 'inbox' ? ping.toProfileId === mine : ping.fromProfileId === mine,
        )
        .map((ping) => {
          const peerId = box === 'inbox' ? ping.fromProfileId : ping.toProfileId;
          return {
            ping,
            peer: {
              profileId: peerId,
              nickname: peerId.includes('-b') ? 'Fran' : 'Nico',
              initials: 'NI',
              intention: 'friendship',
              photoId: 'ph02',
              sourceType: peerId.includes('-b') ? 'bot' : 'human',
            },
          };
        }),
    };
  };

  const routes: Record<string, (url: string, body?: string) => { status: number; body: string }> = {
    'POST /api/auth/demo-session': () => ({ status: 201, body: JSON.stringify(SESSION) }),
    'POST /api/auth/stream-ticket': () => ({ status: 201, body: '{"ticket":"t1"}' }),
    'PUT /api/presence': () => ({
      status: 200,
      body: JSON.stringify({
        profileId: SESSION.profileId,
        regionKey: 'mx',
        zoneKey: 'cdmx',
        online: true,
        fallbackRequired: false,
      }),
    }),
    'GET /api/demo/profiles': () => ({
      status: 200,
      body: JSON.stringify({
        profiles: [ROW('mx-p02'), ROW('mx-p02-b1'), ROW(SESSION.profileId, { demoSlot: 4 })],
      }),
    }),
    'GET /api/discovery': () => ({
      status: 200,
      body: JSON.stringify({ results: [ROW('mx-p02'), ROW('mx-p02-b1', { distanceM: 900 })] }),
    }),
    'GET /api/me': () => ({ status: 404, body: '{"code":"NOT_FOUND"}' }),
    'GET /api/events/poll': () => ({
      status: 200,
      body: JSON.stringify({ events: [], nextCursor: null, hasMore: false }),
    }),
    'GET /api/pings': (url) => ({
      status: 200,
      body: JSON.stringify(list(url.includes('box=sent') ? 'sent' : 'inbox')),
    }),
    'POST /api/pings': (_url, body) => {
      const target = JSON.parse(String(body))['targetProfileId'] as string;
      if (pings.some((ping) => ping.toProfileId === target && ping.status === 'pending')) {
        return {
          status: 409,
          body: '{"code":"PING_DUPLICATE","title":"Ping duplicate"}',
        };
      }
      seq += 1;
      const isBot = target.includes('-b');
      const ping: Ping = {
        id: `ping-${nextId}`,
        fromProfileId: SESSION.profileId,
        toProfileId: target,
        status: isBot ? 'accepted' : 'pending',
        createdAt: new Date(2026, 0, 1, 12, seq).toISOString(),
        expiresAt: '2026-12-31T00:00:00.000Z',
        matchId: isBot ? `match-${nextId}` : null,
      };
      nextId += 1;
      pings.push(ping);
      return { status: 201, body: JSON.stringify(ping) };
    },
    'POST /api/pings/accept': (url) => {
      const id = url.split('/pings/')[1].replace('/accept', '');
      const ping = pings.find((candidate) => candidate.id === id);
      if (ping === undefined) {
        return { status: 404, body: '{"code":"PING_NOT_FOUND"}' };
      }
      if (ping.status !== 'pending') {
        return { status: 409, body: '{"code":"PING_RESOLVED"}' };
      }
      ping.status = 'accepted';
      ping.matchId = `match-${ping.id}`;
      return {
        status: 200,
        body: JSON.stringify({
          id: ping.matchId,
          profileIds: [ping.fromProfileId, ping.toProfileId].sort(),
          createdAt: '2026-11-13T16:20:00.000Z',
        }),
      };
    },
    'POST /api/pings/reject': (url) => {
      const id = url.split('/pings/')[1].replace('/reject', '');
      const ping = pings.find((candidate) => candidate.id === id);
      if (ping === undefined) {
        return { status: 404, body: '{"code":"PING_NOT_FOUND"}' };
      }
      ping.status = 'rejected';
      return { status: 204, body: '' };
    },
  };

  const counts = new Map<string, number>();
  const fetchImpl = async (url: string, init?: { method?: string; body?: string }) => {
    const method = init?.method ?? 'GET';
    const base = url.split('?')[0];
    counts.set(`${method} ${base}`, (counts.get(`${method} ${base}`) ?? 0) + 1);
    const key = `${method} ${base}`;
    const route = routes[key] ?? routeForPingAction(method, base);
    if (route === undefined) {
      return { ok: false, status: 404, text: async () => '{"code":"NOT_FOUND"}' };
    }
    const { status, body } = route(url, init?.body);
    return { ok: status >= 200 && status < 300, status, text: async () => body };
  };

  /** accept/reject viven en el mismo controller de Nest con `:pingId`. */
  function routeForPingAction(method: string, base: string) {
    if (method !== 'POST') {
      return undefined;
    }
    if (base.endsWith('/accept')) {
      return routes['POST /api/pings/accept'];
    }
    if (base.endsWith('/reject')) {
      return routes['POST /api/pings/reject'];
    }
    return undefined;
  }

  return { fetchImpl, pings, list, count: (key: string) => counts.get(key) ?? 0 };
}

function makeController(server: ReturnType<typeof makePingServer>, onNewPings?: (count: number) => void) {
  const controller = createLiveController({
    settings: SETTINGS,
    initialZoneKey: 'cdmx',
    fetchImpl: server.fetchImpl as never,
    createEventSource: () => null,
    pollMs: 60_000,
    heartbeatMs: 60_000,
    reseedMs: 60_000,
    pingsMs: 60_000,
    onNewPings,
  });
  return controller;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('pings reales en el controller', () => {
  it('arranca, lee las dos bandejas y no avisa de pings viejos', async () => {
    const server = makePingServer();
    const toasts: number[] = [];
    const controller = makeController(server, (count) => toasts.push(count));
    await controller.start();
    await controller.refreshPings();

    const state = controller.getState();
    expect(state.session?.profileId).toBe('mx-p04');
    expect(state.pings).toEqual([]);
    expect(state.sentPings).toEqual([]);
    expect(state.pingsAt).not.toBeNull();
    expect(server.count('GET /api/pings')).toBeGreaterThanOrEqual(2);
    expect(toasts).toEqual([]);
    await controller.stop();
  });

  it('ping a un humano queda pending y se refleja en enviados', async () => {
    const server = makePingServer();
    const controller = makeController(server);
    await controller.start();

    const result = await controller.sendPing('mx-p02');
    expect(result).toEqual({ ok: true, code: null, status: 'pending', matchId: null });

    const sent = controller.getState().sentPings;
    expect(sent).toHaveLength(1);
    expect(sent[0]!.ping.status).toBe('pending');
    expect(sent[0]!.peer.profileId).toBe('mx-p02');
    await controller.stop();
  });

  it('ping a un bot vuelve accepted con matchId (acepta solo)', async () => {
    const server = makePingServer();
    const controller = makeController(server);
    await controller.start();

    const result = await controller.sendPing('mx-p02-b1');
    expect(result.ok).toBe(true);
    expect(result.status).toBe('accepted');
    expect(result.matchId).toBe('match-1');
    expect(controller.getState().pingError).toBeNull();
    await controller.stop();
  });

  it('el duplicado es 409 y se explica con su código', async () => {
    const server = makePingServer();
    const controller = makeController(server);
    await controller.start();
    await controller.sendPing('mx-p02');

    const duplicate = await controller.sendPing('mx-p02');
    expect(duplicate.ok).toBe(false);
    expect(duplicate.code).toBe('PING_DUPLICATE');
    expect(controller.getState().pingError).toBe('PING_DUPLICATE');
    await controller.stop();
  });

  it('aceptar un ping recibido crea el match y la fila queda accepted', async () => {
    const server = makePingServer();
    const controller = makeController(server);
    await controller.start();

    // Otro perfil pinguea a mi sesión: la fila aparece en el inbox.
    server.pings.push({
      id: 'ping-in',
      fromProfileId: 'mx-p02',
      toProfileId: SESSION.profileId,
      status: 'pending',
      createdAt: '2026-11-13T16:30:00.000Z',
      expiresAt: '2026-12-31T00:00:00.000Z',
      matchId: null,
    });

    const toasts: number[] = [];
    // Un controller nuevo con el aviso conectado ve el ping como nuevo.
    const watched = makeController(server, (count) => toasts.push(count));
    await watched.start();
    await watched.refreshPings();

    const match = await watched.acceptPing('ping-in');
    expect(match.ok).toBe(true);
    expect(match.matchId).toBe('match-ping-in');

    const inbox = watched.getState().pings;
    expect(inbox[0]!.ping.status).toBe('accepted');
    expect(inbox[0]!.ping.matchId).toBe('match-ping-in');
    await watched.stop();
    await controller.stop();
  });

  it('rechazar deja la fila rejected y no crea match', async () => {
    const server = makePingServer();
    const controller = makeController(server);
    await controller.start();
    server.pings.push({
      id: 'ping-in',
      fromProfileId: 'mx-p02',
      toProfileId: SESSION.profileId,
      status: 'pending',
      createdAt: '2026-11-13T16:30:00.000Z',
      expiresAt: '2026-12-31T00:00:00.000Z',
      matchId: null,
    });
    await controller.refreshPings();

    const result = await controller.rejectPing('ping-in');
    expect(result).toEqual({ ok: true, code: null, status: 'rejected', matchId: null });
    expect(controller.getState().pings[0]!.ping.status).toBe('rejected');
    await controller.stop();
  });

  it('un ping nuevo avisa una vez: el mismo refresh no vuelve a avisar', async () => {
    const server = makePingServer();
    const toasts: number[] = [];
    const controller = makeController(server, (count) => toasts.push(count));
    await controller.start();
    await controller.refreshPings();

    server.pings.push({
      id: 'ping-in',
      fromProfileId: 'mx-p02',
      toProfileId: SESSION.profileId,
      status: 'pending',
      createdAt: '2026-11-13T16:30:00.000Z',
      expiresAt: '2026-12-31T00:00:00.000Z',
      matchId: null,
    });
    await controller.refreshPings();
    expect(toasts).toEqual([1]);

    await controller.refreshPings();
    expect(toasts).toEqual([1]);
    await controller.stop();
  });

  it('sin `/me` el perfil propio sale del catálogo con fallback explícito', async () => {
    const server = makePingServer();
    const controller = makeController(server);
    await controller.start();
    // `start()` no espera el perfil propio: se resuelve un instante después.
    await vi.waitFor(() => {
      expect(controller.getState().selfSource).not.toBeNull();
    });
    const state = controller.getState();
    expect(state.selfSource).toBe('catalog');
    expect(state.self?.profileId).toBe('mx-p04');
    await controller.stop();
  });
});
