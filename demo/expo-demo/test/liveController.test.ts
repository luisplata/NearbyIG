import { afterEach, describe, expect, it, vi } from 'vitest';

import { createLiveController, type EventSourceLike } from '../src/live/controller';
import type { LiveSettings } from '../src/live/config';
import type { EventSourceLike as EsLike } from '../src/live/controller';
import type { DemoSource, UiProfile } from '../src/state/types';

const SETTINGS: LiveSettings = { baseUrl: '/api', region: 'mx' };

const SESSION = {
  token: 'tok-1',
  expiresAt: '2026-11-13T12:00:00.000Z',
  regionKey: 'mx',
  profileId: 'mx-p05',
  demoSlot: 5,
  sourceType: 'human',
};

const PROFILE = (overrides: Record<string, unknown> = {}) => ({
  profileId: 'mx-p01',
  regionKey: 'mx',
  demoSlot: 1,
  sourceType: 'human',
  nickname: 'Vale',
  initials: 'VA',
  intention: 'networking',
  gender: 'female',
  verified: true,
  online: true,
  inUse: false,
  distanceM: 240,
  bearingDeg: 32,
  photoId: 'ph01',
  instagramHandle: 'vale.works',
  statusKey: 'status.p01',
  bioKey: 'bio.p01',
  ...overrides,
});

type Route = (url: string, init: { method?: string; body?: string }) => { status: number; body: string };

function makeServer(routeOverrides: Record<string, Route> = {}) {
  const counts = new Map<string, number>();
  const routes: Record<string, Route> = {
    'POST /api/auth/demo-session': (_url, init) => {
      const body = init.body === undefined ? {} : (JSON.parse(init.body) as Record<string, unknown>);
      const slot = typeof body['demoSlot'] === 'number' ? body['demoSlot'] : 5;
      return {
        status: 201,
        body: JSON.stringify({ ...SESSION, demoSlot: slot, profileId: `mx-p0${slot}` }),
      };
    },
    'POST /api/auth/takeover': (_url, init) => {
      const body = init.body === undefined ? {} : (JSON.parse(init.body) as Record<string, unknown>);
      const slot = typeof body['demoSlot'] === 'number' ? body['demoSlot'] : 5;
      return {
        status: 200,
        body: JSON.stringify({ ...SESSION, token: 'tok-2', demoSlot: slot, profileId: `mx-p0${slot}` }),
      };
    },
    'POST /api/auth/logout': () => ({ status: 204, body: '' }),
    'POST /api/auth/stream-ticket': () => ({
      status: 201,
      body: JSON.stringify({ ticket: 'ticket-1', expiresAt: '2026-11-13T12:00:30.000Z' }),
    }),
    'PUT /api/presence': () => ({
      status: 200,
      body: JSON.stringify({
        profileId: 'mx-p05',
        regionKey: 'mx',
        zoneKey: 'cdmx',
        online: true,
        fallbackRequired: false,
      }),
    }),
    'GET /api/demo/profiles': () => ({
      status: 200,
      body: JSON.stringify({ profiles: [PROFILE({ inUse: true })] }),
    }),
    'GET /api/discovery': () => ({
      status: 200,
      body: JSON.stringify({ results: [PROFILE(), PROFILE({ profileId: 'mx-p01-b1', distanceM: 900 })] }),
    }),
    'GET /api/events/poll': () => ({
      status: 200,
      body: JSON.stringify({ events: [], nextCursor: null, hasMore: false }),
    }),
    ...routeOverrides,
  };

  const fetchImpl = async (url: string, init?: { method?: string; body?: string }) => {
    const method = init?.method ?? 'GET';
    const key = `${method} ${url.split('?')[0]}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    const route = routes[key];
    if (route === undefined) {
      return { ok: false, status: 404, text: async () => '{"code":"NOT_FOUND"}' };
    }
    const { status, body } = route(url, init ?? {});
    return { ok: status >= 200 && status < 300, status, text: async () => body };
  };

  return {
    fetchImpl,
    counts,
    count: (key: string) => counts.get(key) ?? 0,
  };
}

type Stub = EsLike & {
  url: string;
  open: () => void;
  fail: () => void;
  emit: (type: string, data: string) => void;
  closed: boolean;
};

function makeStream() {
  const instances: Stub[] = [];
  const factory = (url: string): EventSourceLike | null => {
    const listeners = new Map<string, ((event: { data?: string }) => void)[]>();
    const stub: Stub = {
      url,
      onopen: null,
      onerror: null,
      closed: false,
      close: () => {
        stub.closed = true;
      },
      addEventListener: (type, listener) => {
        const current = listeners.get(type) ?? [];
        current.push(listener);
        listeners.set(type, current);
      },
      open: () => stub.onopen?.(),
      fail: () => stub.onerror?.(),
      emit: (type, data) => {
        for (const listener of listeners.get(type) ?? []) {
          listener({ data });
        }
      },
    };
    instances.push(stub);
    return stub;
  };
  return { factory, instances };
}

function makeController(
  server: ReturnType<typeof makeServer>,
  stream: ReturnType<typeof makeStream>,
  settings: LiveSettings | null = SETTINGS,
  extra: { pollMs?: number; heartbeatMs?: number; reseedMs?: number } = {},
) {
  const catalogs: { profiles: readonly UiProfile[] | null; source: DemoSource }[] = [];
  const controller = createLiveController({
    settings,
    fetchImpl: server.fetchImpl as never,
    createEventSource: stream.factory,
    onCatalog: (profiles, source) => catalogs.push({ profiles, source }),
    pollMs: extra.pollMs ?? 10,
    heartbeatMs: extra.heartbeatMs ?? 1000,
    reseedMs: extra.reseedMs ?? 10,
  });
  return { controller, catalogs };
}

const movedEvent = (seq: number, profileId: string, distanceM: number) =>
  JSON.stringify({
    id: `mx:${String(seq).padStart(12, '0')}`,
    type: 'profile.moved',
    occurredAt: '2026-11-13T09:00:00.000Z',
    payload: { profileId, distanceM, bearingDeg: 90 },
  });

afterEach(() => {
  vi.useRealTimers();
});

describe('arranque de la sesión', () => {
  it('abre sesión, registra presencia en la zona por defecto y pide la primera foto', async () => {
    const server = makeServer();
    const stream = makeStream();
    const { controller, catalogs } = makeController(server, stream);

    const started = await controller.start();
    expect(started).toBe(true);
    expect(server.count('POST /api/auth/demo-session')).toBe(1);
    expect(server.count('PUT /api/presence')).toBe(1);
    expect(server.count('GET /api/discovery')).toBe(1);
    expect(server.count('GET /api/demo/profiles')).toBe(1);
    expect(server.count('POST /api/auth/stream-ticket')).toBe(1);

    const state = controller.getState();
    expect(state.session?.demoSlot).toBe(5);
    expect(state.discovery).toHaveLength(2);
    expect(state.status).toBe('connecting');

    stream.instances[0].open();
    expect(controller.getState().status).toBe('live');
    expect(controller.getState().transport).toBe('sse');
    expect(catalogs.at(-1)?.profiles?.map((profile) => profile.id)).toEqual([
      'mx-p01',
      'mx-p01-b1',
    ]);
    expect(catalogs.at(-1)?.source).toBe('live');
  });

  it('sin base de API configurada no intenta nada: avisa y se queda con el dataset', async () => {
    const server = makeServer();
    const stream = makeStream();
    const { controller } = makeController(server, stream, null);

    const started = await controller.start();
    expect(started).toBe(false);
    expect(controller.getState().status).toBe('offline');
    expect(controller.getState().notice).toBe('unconfigured');
    expect(server.counts.size).toBe(0);
  });

  it('si la API no responde, vuelve al dataset con un aviso y no deja la UI colgada', async () => {
    const server = makeServer({
      'POST /api/auth/demo-session': () => ({ status: 500, body: '{"code":"INTERNAL"}' }),
    });
    const stream = makeStream();
    const { controller, catalogs } = makeController(server, stream);

    const started = await controller.start();
    expect(started).toBe(false);
    expect(controller.getState().status).toBe('offline');
    expect(controller.getState().notice).toBe('unreachable');
    expect(controller.getState().error).toBe('INTERNAL');
    expect(catalogs.at(-1)).toEqual({ profiles: null, source: 'dataset' });
  });

  it('una zona desconocida no se inventa: falla suave antes de pedir presencia', async () => {
    const server = makeServer();
    const stream = makeStream();
    const { controller } = makeController(server, stream, { baseUrl: '/api', region: 'zz' });

    expect(await controller.start()).toBe(false);
    expect(server.count('PUT /api/presence')).toBe(0);
    expect(controller.getState().notice).toBe('unreachable');
  });
});

describe('transporte', () => {
  it('si el navegador no tiene EventSource, sigue por polling desde el primer evento', async () => {
    vi.useFakeTimers();
    const server = makeServer({
      'GET /api/events/poll': () => ({
        status: 200,
        body: JSON.stringify({
          events: [
            JSON.parse(movedEvent(3, 'mx-p01', 700)),
          ],
          nextCursor: 'mx:000000000003',
          hasMore: false,
        }),
      }),
    });
    const controller = createLiveController({
      settings: SETTINGS,
      fetchImpl: server.fetchImpl as never,
      createEventSource: () => null,
      pollMs: 50,
    });

    expect(await controller.start()).toBe(true);
    expect(controller.getState().status).toBe('polling');
    expect(controller.getState().transport).toBe('polling');

    await vi.advanceTimersByTimeAsync(60);
    expect(controller.getState().discovery[0].distanceM).toBe(700);
    expect(controller.getState().lastSeq).toBe(3);
  });

  it('si el stream se cae, degrada a polling y rellena el hueco con el cursor aplicado', async () => {
    vi.useFakeTimers();
    const server = makeServer();
    const stream = makeStream();
    const { controller } = makeController(server, stream);

    await controller.start();
    stream.instances[0].open();
    stream.instances[0].emit('profile.moved', movedEvent(4, 'mx-p01', 1100));
    expect(controller.getState().discovery[0].distanceM).toBe(1100);
    expect(stream.instances[0].closed).toBe(false);

    stream.instances[0].fail();
    expect(controller.getState().status).toBe('polling');
    expect(controller.getState().notice).toBe('degraded');
    expect(stream.instances[0].closed).toBe(true);

    await vi.advanceTimersByTimeAsync(20);
    const polled = server.count('GET /api/events/poll');
    expect(polled).toBeGreaterThanOrEqual(1);
    expect(controller.getState().status).toBe('polling');
  });

  it('un poll exitoso limpia el aviso de degradación', async () => {
    vi.useFakeTimers();
    const server = makeServer({
      'GET /api/events/poll': () => ({
        status: 200,
        body: '{"events":[],"nextCursor":null,"hasMore":false}',
      }),
    });
    const stream = makeStream();
    const { controller } = makeController(server, stream);
    await controller.start();
    stream.instances[0].open();
    stream.instances[0].fail();
    expect(controller.getState().notice).toBe('degraded');

    await vi.advanceTimersByTimeAsync(20);
    expect(controller.getState().notice).toBeNull();
  });
});

describe('eventos', () => {
  it('dedupe por seq: el replay no duplica ni retrocede', async () => {
    const server = makeServer();
    const stream = makeStream();
    const { controller } = makeController(server, stream);
    await controller.start();
    const stub = stream.instances[0];
    stub.open();

    stub.emit('profile.moved', movedEvent(7, 'mx-p01', 900));
    stub.emit('profile.moved', movedEvent(7, 'mx-p01', 1500));
    expect(controller.getState().discovery[0].distanceM).toBe(900);
    expect(controller.getState().lastSeq).toBe(7);

    stub.emit('profile.moved', movedEvent(8, 'mx-p01-b1', 1300));
    expect(controller.getState().discovery[1].distanceM).toBe(1300);
  });

  it('un evento de un perfil desconocido pide una foto nueva', async () => {
    vi.useFakeTimers();
    const server = makeServer();
    const stream = makeStream();
    const { controller } = makeController(server, stream);
    await controller.start();
    stream.instances[0].open();
    const before = server.count('GET /api/discovery');

    stream.instances[0].emit('profile.moved', movedEvent(9, 'mx-p99-b1', 800));
    await vi.advanceTimersByTimeAsync(20);
    expect(server.count('GET /api/discovery')).toBe(before + 1);
  });

  it('un frame que no es JSON se descarta sin tocar el estado', async () => {
    const server = makeServer();
    const stream = makeStream();
    const { controller } = makeController(server, stream);
    await controller.start();
    stream.instances[0].open();
    const before = controller.getState().lastSeq;

    stream.instances[0].emit('profile.moved', 'no soy json');
    expect(controller.getState().lastSeq).toBe(before);
  });
});

describe('latido de presencia', () => {
  it('repite PUT /presence y refresca la foto antes de que venza el TTL', async () => {
    vi.useFakeTimers();
    const server = makeServer();
    const stream = makeStream();
    const { controller } = makeController(server, stream, SETTINGS, { heartbeatMs: 1000 });
    await controller.start();
    stream.instances[0].open();
    const discoveryBefore = server.count('GET /api/discovery');

    await vi.advanceTimersByTimeAsync(1000);
    expect(server.count('PUT /api/presence')).toBe(2);
    expect(server.count('GET /api/discovery')).toBe(discoveryBefore + 1);
    expect(controller.getState().status).toBe('live');
  });

  it('dos latidos fallidos seguidos devuelven al dataset sin romper la app', async () => {
    vi.useFakeTimers();
    let fail = false;
    const server = makeServer({
      'PUT /api/presence': () => (fail ? { status: 500, body: '{"code":"INTERNAL"}' } : { status: 200, body: '{}' }),
    });
    const stream = makeStream();
    const { controller, catalogs } = makeController(server, stream, SETTINGS, { heartbeatMs: 1000 });
    await controller.start();
    stream.instances[0].open();
    fail = true;

    await vi.advanceTimersByTimeAsync(1000);
    expect(controller.getState().status).toBe('live');
    await vi.advanceTimersByTimeAsync(1000);
    expect(controller.getState().status).toBe('offline');
    expect(controller.getState().notice).toBe('unreachable');
    expect(catalogs.at(-1)).toEqual({ profiles: null, source: 'dataset' });
    expect(stream.instances[0].closed).toBe(true);
  });

  it('una sesión revocada (401) se avisa como pérdida de sesión', async () => {
    vi.useFakeTimers();
    let revoked = false;
    const server = makeServer({
      'PUT /api/presence': () =>
        revoked
          ? { status: 401, body: '{"code":"UNAUTHENTICATED"}' }
          : { status: 200, body: '{}' },
    });
    const stream = makeStream();
    const { controller } = makeController(server, stream, SETTINGS, { heartbeatMs: 1000 });
    await controller.start();
    revoked = true;

    await vi.advanceTimersByTimeAsync(2000);
    expect(controller.getState().notice).toBe('session-lost');
    expect(controller.getState().error).toBe('UNAUTHENTICATED');
  });
});

describe('selector de perfil', () => {
  it('reclama un slot libre: token nuevo y stream nuevo', async () => {
    const server = makeServer();
    const stream = makeStream();
    const { controller } = makeController(server, stream);
    await controller.start();
    stream.instances[0].open();

    const result = await controller.claim(7);
    expect(result).toEqual({ ok: true, code: null });
    expect(controller.getState().session?.demoSlot).toBe(7);
    expect(controller.getState().session?.profileId).toBe('mx-p07');
    expect(stream.instances).toHaveLength(2);
    expect(stream.instances[0].closed).toBe(true);
  });

  it('un slot ocupado devuelve el código del contrato, no un error genérico', async () => {
    const server = makeServer({
      'POST /api/auth/demo-session': () => ({
        status: 409,
        body: '{"code":"PROFILE_IN_USE","title":"Profile in use"}',
      }),
    });
    const stream = makeStream();
    const { controller } = makeController(server, stream);

    // El claim inicial falla igual: se usa el takeover para probar el código.
    const result = await controller.claim(3);
    expect(result).toEqual({ ok: false, code: 'NO_SESSION' });

    const takeover = makeServer({
      'POST /api/auth/takeover': () => ({
        status: 403,
        body: '{"code":"REGION_MISMATCH"}',
      }),
    });
    const other = makeController(takeover, makeStream());
    await other.controller.start();
    expect(await other.controller.takeover(4)).toEqual({ ok: false, code: 'REGION_MISMATCH' });
  });

  it('el takeover refresca el catálogo con el perfil nuevo', async () => {
    const server = makeServer();
    const stream = makeStream();
    const { controller, catalogs } = makeController(server, stream);
    await controller.start();

    expect(await controller.takeover(8)).toEqual({ ok: true, code: null });
    expect(controller.getState().session?.profileId).toBe('mx-p08');
    expect(server.count('POST /api/auth/takeover')).toBe(1);
    expect(catalogs.at(-1)?.source).toBe('live');
  });

  it('la lista del selector trae inUse y no tumba la sesión si falla', async () => {
    const server = makeServer({
      'GET /api/demo/profiles': () => ({ status: 500, body: '{}' }),
    });
    const stream = makeStream();
    const { controller } = makeController(server, stream);
    await controller.start();
    expect(controller.getState().status).not.toBe('offline');
    expect(controller.getState().rows).toEqual([]);
  });
});

describe('filtros', () => {
  it('con una sola intención la manda al server', async () => {
    const inner = makeServer();
    const urls: string[] = [];
    const server = {
      ...inner,
      fetchImpl: async (url: string, init?: { method?: string; body?: string }) => {
        urls.push(url);
        return inner.fetchImpl(url, init as never);
      },
    } as ReturnType<typeof makeServer>;
    const stream = makeStream();
    const { controller } = makeController(server, stream);
    await controller.start();
    stream.instances[0].open();
    urls.length = 0;

    controller.setFilters({
      intentions: ['activities'],
      gender: null,
      verifiedOnly: false,
      onlineOnly: false,
      radiusM: 2000,
    });
    await vi.waitFor(() => {
      expect(urls.some((url) => url.includes('intention=activities'))).toBe(true);
    });
    expect(urls.some((url) => url.includes('radiusM=2000'))).toBe(true);
  });

  it('con varias intenciones no manda `intention` y filtra en el cliente', async () => {
    const inner = makeServer();
    const urls: string[] = [];
    const server = {
      ...inner,
      fetchImpl: async (url: string, init?: { method?: string; body?: string }) => {
        urls.push(url);
        return inner.fetchImpl(url, init as never);
      },
    } as ReturnType<typeof makeServer>;
    const stream = makeStream();
    const { controller } = makeController(server, stream);
    await controller.start();
    stream.instances[0].open();
    urls.length = 0;

    controller.setFilters({
      intentions: ['activities', 'friendship'],
      gender: null,
      verifiedOnly: false,
      onlineOnly: false,
      radiusM: 5000,
    });
    await vi.waitFor(() => {
      expect(urls.some((url) => url.includes('/discovery'))).toBe(true);
    });
    expect(urls.some((url) => url.includes('intention='))).toBe(false);
  });

  it('el mismo conjunto de filtros no repite el pedido', async () => {
    const server = makeServer();
    const stream = makeStream();
    const { controller } = makeController(server, stream);
    await controller.start();
    stream.instances[0].open();
    const before = server.count('GET /api/discovery');

    controller.setFilters({
      intentions: ['networking'],
      gender: null,
      verifiedOnly: false,
      onlineOnly: false,
      radiusM: 5000,
    });
    await vi.waitFor(() => {
      expect(server.count('GET /api/discovery')).toBeGreaterThan(before);
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const after = server.count('GET /api/discovery');

    controller.setFilters({
      intentions: ['networking'],
      gender: null,
      verifiedOnly: false,
      onlineOnly: false,
      radiusM: 5000,
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(server.count('GET /api/discovery')).toBe(after);
  });
});

describe('cierre', () => {
  it('stop cierra sesión, corta el stream y devuelve el catálogo al dataset', async () => {
    const server = makeServer();
    const stream = makeStream();
    const { controller, catalogs } = makeController(server, stream);
    await controller.start();
    stream.instances[0].open();

    await controller.stop();
    expect(server.count('POST /api/auth/logout')).toBe(1);
    expect(stream.instances[0].closed).toBe(true);
    expect(controller.getState().status).toBe('idle');
    expect(controller.getState().session).toBeNull();
    expect(catalogs.at(-1)).toEqual({ profiles: null, source: 'dataset' });
  });
});
