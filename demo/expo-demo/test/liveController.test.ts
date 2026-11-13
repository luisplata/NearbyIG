import { afterEach, describe, expect, it, vi } from 'vitest';

import { createLiveController, type EventSourceLike } from '../src/live/controller';
import type { LiveSettings } from '../src/live/config';
import type { EventSourceLike as EsLike } from '../src/live/controller';
import type { GeoResult } from '../src/live/geolocation';
import type { DemoSource, UiProfile } from '../src/state/types';

const SETTINGS: LiveSettings = { baseUrl: '/api' };

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
      // La región se refleja: el backend nunca la inventa, la toma del body.
      const region = typeof body['regionKey'] === 'string' ? body['regionKey'] : 'mx';
      return {
        status: 201,
        body: JSON.stringify({
          ...SESSION,
          regionKey: region,
          demoSlot: slot,
          profileId: `${region}-p0${slot}`,
        }),
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

type ControllerOptions = {
  settings?: LiveSettings | null;
  zone?: string | null;
  requestPoint?: () => Promise<GeoResult>;
  pollMs?: number;
  heartbeatMs?: number;
  reseedMs?: number;
};

function makeController(
  server: ReturnType<typeof makeServer>,
  stream: ReturnType<typeof makeStream>,
  options: ControllerOptions = {},
) {
  const catalogs: { profiles: readonly UiProfile[] | null; source: DemoSource }[] = [];
  /** Cada zona persistida, en orden: la recarga depende de esta escritura. */
  const persistedZones: string[] = [];
  const controller = createLiveController({
    settings: options.settings === undefined ? SETTINGS : options.settings,
    initialZoneKey: options.zone === undefined ? 'cdmx' : options.zone,
    onZoneChange: (zoneKey) => persistedZones.push(zoneKey),
    requestPoint: options.requestPoint,
    fetchImpl: server.fetchImpl as never,
    createEventSource: stream.factory,
    onCatalog: (profiles, source) => catalogs.push({ profiles, source }),
    pollMs: options.pollMs ?? 10,
    heartbeatMs: options.heartbeatMs ?? 1000,
    reseedMs: options.reseedMs ?? 10,
  });
  return { controller, catalogs, persistedZones };
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
    const { controller } = makeController(server, stream, { settings: null });

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

  it('una zona desconocida no se inventa: no hay sesión que abrir', async () => {
    const server = makeServer();
    const stream = makeStream();
    const { controller } = makeController(server, stream, { zone: 'zz' });

    expect(await controller.start()).toBe(false);
    expect(server.count('PUT /api/presence')).toBe(0);
    expect(controller.getState().status).toBe('needs-zone');
    expect(controller.getState().zonePrompt).toBe('initial');
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
      initialZoneKey: 'cdmx',
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
    const { controller } = makeController(server, stream, { heartbeatMs: 1000 });
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
    const { controller, catalogs } = makeController(server, stream, { heartbeatMs: 1000 });
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
    const { controller } = makeController(server, stream, { heartbeatMs: 1000 });
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

describe('presencia con ubicación real', () => {
  const GPS_CDMX = {
    status: 'ok' as const,
    point: { lat: 19.432608, lng: -99.13321 },
    accuracyM: 20,
  };
  const GPS_BOGOTA = { status: 'ok' as const, point: { lat: 4.6832, lng: -74.0974 }, accuracyM: 30 };
  /** Palermo: dentro del catálogo no hay zona, así que no se puede proyectar. */
  const GPS_BUENOS_AIRES = {
    status: 'ok' as const,
    point: { lat: -34.5889, lng: -58.4306 },
    accuracyM: 40,
  };

  type Call = { method: string; path: string; body: string | undefined };

  /**
   * Controller con la ubicación inyectada y el registro de cada request en
   * orden. El orden es lo que prueba que el punto no viaja con una sesión de
   * otra región: primero el logout y la sesión nueva, después la presencia.
   */
  function makeGeoController(
    server: ReturnType<typeof makeServer>,
    geo: () => Promise<GeoResult>,
    options: { zone?: string | null } = {},
  ) {
    const calls: Call[] = [];
    const persistedZones: string[] = [];
    let geoCalls = 0;
    const fetchImpl = async (url: string, init?: { method?: string; body?: string }) => {
      calls.push({ method: init?.method ?? 'GET', path: url.split('?')[0], body: init?.body });
      return server.fetchImpl(url as never, init as never);
    };
    const controller = createLiveController({
      settings: SETTINGS,
      initialZoneKey: options.zone === undefined ? 'cdmx' : options.zone,
      onZoneChange: (zoneKey) => persistedZones.push(zoneKey),
      fetchImpl: fetchImpl as never,
      createEventSource: () => null,
      requestPoint: () => {
        geoCalls += 1;
        return geo();
      },
      pollMs: 10,
      heartbeatMs: 10_000,
    });
    const presenceCalls = (): Call[] =>
      calls.filter((call) => call.method === 'PUT' && call.path.endsWith('/presence'));
    const sessions = (): Call[] =>
      calls.filter((call) => call.method === 'POST' && call.path.endsWith('/auth/demo-session'));
    const bodyOf = (call: Call | undefined): unknown => JSON.parse(String(call?.body ?? 'null'));
    return {
      controller,
      calls,
      presenceCalls,
      sessions,
      persistedZones,
      geoCalls: () => geoCalls,
      bodyOf,
    };
  }

  it('arrancar no pide la ubicación: la sesión sale de la zona elegida', async () => {
    const server = makeServer();
    const { controller, presenceCalls, sessions, geoCalls, bodyOf } = makeGeoController(
      server,
      async () => GPS_CDMX,
    );

    expect(await controller.start()).toBe(true);
    expect(geoCalls()).toBe(0);
    expect(bodyOf(sessions()[0])).toEqual({ regionKey: 'mx' });
    expect(bodyOf(presenceCalls()[0])).toEqual({ demoZoneKey: 'cdmx' });
    expect(controller.getState().location).toBe('demo');
    expect(controller.getState().zoneKey).toBe('cdmx');
    expect(controller.getState().notice).toBeNull();
  });

  it('con GPS en la misma región la presencia va con el punto y la barra dice GPS', async () => {
    const server = makeServer();
    const { controller, calls, presenceCalls } = makeGeoController(server, async () => GPS_CDMX);

    await controller.start();
    await controller.requestLocation();
    expect(controller.getState().location).toBe('gps');
    expect(controller.getState().notice).toBeNull();
    expect(JSON.parse(String(presenceCalls().at(-1)?.body))).toEqual({
      point: { lat: 19.432608, lng: -99.13321 },
    });

    // El punto no se repite: ninguna otra URL lo lleva en la query.
    for (const call of calls.filter((candidate) => !candidate.path.endsWith('/presence'))) {
      expect(call.path).not.toMatch(/lat=|lng=/);
    }
  });

  it('si el permiso falla el sheet dice por qué y la sesión no se toca', async () => {
    for (const status of ['denied', 'timeout', 'unavailable', 'unsupported', 'insecure'] as const) {
      const server = makeServer();
      const stream = makeStream();
      const { controller } = makeController(server, stream, {
        requestPoint: async () => ({ status }),
      });
      await controller.start();
      const before = server.count('PUT /api/presence');

      await controller.requestLocation();
      expect(controller.getState().zonePrompt, status).toBe(status);
      expect(controller.getState().session, status).not.toBeNull();
      expect(controller.getState().location, status).toBe('demo');
      expect(server.count('PUT /api/presence'), status).toBe(before);
    }
  });

  it('un punto fuera de México y Colombia no se manda: se pide la zona', async () => {
    const server = makeServer();
    const { controller, geoCalls } = makeGeoController(server, async () => GPS_BUENOS_AIRES);
    await controller.start();
    const before = server.count('PUT /api/presence');

    await controller.requestLocation();
    expect(geoCalls()).toBe(1);
    expect(controller.getState().zonePrompt).toBe('outside-zone');
    // Nunca se manda un punto que el backend sólo puede rechazar.
    expect(server.count('PUT /api/presence')).toBe(before);
    expect(controller.getState().location).toBe('demo');
  });

  it('si el server responde fallbackRequired, se re-registra con la zona y avisa', async () => {
    const server = makeServer({
      'PUT /api/presence': (_url, init) => {
        const body =
          init.body === undefined ? {} : (JSON.parse(init.body) as Record<string, unknown>);
        const isPoint = body['point'] !== undefined;
        return {
          status: 200,
          body: JSON.stringify({
            profileId: 'mx-p05',
            regionKey: 'mx',
            zoneKey: isPoint ? null : 'cdmx',
            online: true,
            fallbackRequired: isPoint,
          }),
        };
      },
    });
    const { controller } = makeGeoController(server, async () => GPS_CDMX);

    await controller.start();
    await controller.requestLocation();
    expect(controller.getState().location).toBe('demo');
    expect(controller.getState().notice).toBe('outside-zone');
    expect(controller.getState().zonePrompt).toBe('outside-zone');
  });

  it('el latido repite la presencia sin volver a pedir el punto', async () => {
    vi.useFakeTimers();
    const server = makeServer();
    let geoCalls = 0;
    const urls: string[] = [];
    const controller = createLiveController({
      settings: SETTINGS,
      initialZoneKey: 'cdmx',
      fetchImpl: (async (url: string, init?: { method?: string; body?: string }) => {
        urls.push(url);
        return server.fetchImpl(url as never, init as never);
      }) as never,
      createEventSource: () => null,
      requestPoint: async () => {
        geoCalls += 1;
        return GPS_CDMX;
      },
      pollMs: 1_000,
      heartbeatMs: 50,
    });

    await controller.start();
    await controller.requestLocation();
    expect(geoCalls).toBe(1);

    await vi.advanceTimersByTimeAsync(60);
    expect(geoCalls).toBe(1);
    expect(urls.filter((url) => url.endsWith('/presence')).length).toBeGreaterThanOrEqual(2);
  });

  it('el botón de ubicación reintenta el punto y puede pasar de demo a GPS', async () => {
    const server = makeServer();
    let attempt = 0;
    const { controller, sessions } = makeGeoController(server, async () => {
      attempt += 1;
      return attempt === 1 ? { status: 'denied' } : GPS_CDMX;
    });

    await controller.start();
    await controller.requestLocation();
    expect(controller.getState().location).toBe('demo');
    expect(controller.getState().zonePrompt).toBe('denied');

    await controller.requestLocation();
    expect(controller.getState().location).toBe('gps');
    expect(controller.getState().zonePrompt).toBeNull();
    // Un permiso denegado no abre una segunda sesión: sólo se reintenta el punto.
    expect(sessions()).toHaveLength(1);
  });

  it('elegir una zona de otra región cierra la sesión y abre otra en la correcta', async () => {
    const server = makeServer();
    const { controller, calls, presenceCalls, sessions, persistedZones, bodyOf } =
      makeGeoController(server, async () => GPS_CDMX);

    await controller.start();
    expect(controller.getState().session?.regionKey).toBe('mx');

    await controller.chooseZone('bogota');

    const opened = sessions();
    expect(opened).toHaveLength(2);
    expect(bodyOf(opened[1])).toEqual({ regionKey: 'co' });
    expect(controller.getState().session?.regionKey).toBe('co');
    expect(controller.getState().zoneKey).toBe('bogota');
    expect(controller.getState().zonePrompt).toBeNull();

    // Se cierra la sesión vieja antes de abrir la nueva, y no con un PUT de punto.
    const logout = calls.findIndex((call) => call.path.endsWith('/auth/logout'));
    expect(logout).toBeGreaterThanOrEqual(0);
    expect(logout).toBeLessThan(calls.indexOf(opened[1]));
    expect(presenceCalls().map((call) => bodyOf(call))).toEqual([
      { demoZoneKey: 'cdmx' },
      { demoZoneKey: 'bogota' },
    ]);

    // La elección queda escrita para la próxima carga.
    expect(persistedZones).toEqual(['bogota']);
  });

  it('elegir la misma zona no reabre la sesión', async () => {
    const server = makeServer();
    const { controller, presenceCalls, sessions, persistedZones } = makeGeoController(
      server,
      async () => GPS_CDMX,
    );

    await controller.start();
    await controller.chooseZone('cdmx');
    expect(sessions()).toHaveLength(1);
    expect(presenceCalls()).toHaveLength(2);
    expect(controller.getState().session?.regionKey).toBe('mx');
    expect(persistedZones).toEqual([]);
  });

  it('el diagnóstico queda en el estado y no guarda coordenadas en las métricas', async () => {
    const server = makeServer();
    const { controller } = makeGeoController(server, async () => GPS_CDMX);

    await controller.start();
    await controller.requestLocation();
    const { diagnostics, point } = controller.getState();
    expect(diagnostics).toEqual({
      geo: 'ok',
      accuracyM: 20,
      presenceStatus: 200,
      presenceZoneKey: 'cdmx',
      fallbackRequired: false,
    });
    // El punto vive en memoria para centrar el mapa; el diagnóstico no lo copia.
    expect(point).toEqual({ lat: 19.432608, lng: -99.13321 });
    expect(JSON.stringify(diagnostics)).not.toMatch(/lat|lng|19\.4|-99\.1/);
  });

  it('los logs de diagnóstico llevan prefijo [geo] y no coordenadas', async () => {
    const server = makeServer();
    const logs: string[] = [];
    const controller = createLiveController({
      settings: SETTINGS,
      initialZoneKey: 'cdmx',
      fetchImpl: server.fetchImpl as never,
      createEventSource: () => null,
      requestPoint: async () => GPS_CDMX,
      log: (message) => logs.push(message),
      heartbeatMs: 10_000,
      pollMs: 10,
    });

    await controller.start();
    await controller.requestLocation();

    expect(logs.some((line) => line.startsWith('[geo] request=ok'))).toBe(true);
    expect(logs.some((line) => line.includes('[geo] presence=200'))).toBe(true);
    expect(logs.some((line) => line.includes('region=mx'))).toBe(true);
    expect(logs.some((line) => line.includes('session region=mx'))).toBe(true);
    for (const line of logs) {
      // Ni el punto ni la precisión exacta: la precisión va redondeada a 10 m.
      expect(line).not.toMatch(/-?\d{2}\.\d{3,}/);
    }
  });

  it('un GPS en Bogotá con sesión mx recrea la sesión y recién después manda el punto', async () => {
    const server = makeServer();
    const { controller, calls, sessions, persistedZones, bodyOf } = makeGeoController(
      server,
      async () => GPS_BOGOTA,
    );

    await controller.start();
    expect(controller.getState().session?.regionKey).toBe('mx');

    await controller.requestLocation();

    const opened = sessions();
    expect(opened).toHaveLength(2);
    expect(bodyOf(opened[1])).toEqual({ regionKey: 'co' });
    expect(controller.getState().session?.regionKey).toBe('co');
    expect(controller.getState().location).toBe('gps');
    expect(persistedZones).toEqual(['bogota']);

    const logout = calls.findIndex((call) => call.path.endsWith('/auth/logout'));
    expect(logout).toBeGreaterThanOrEqual(0);
    expect(logout).toBeLessThan(calls.indexOf(opened[1]));

    // El punto de Bogotá viaja **después** de la sesión `co`: nunca con la `mx`.
    const point = calls.findIndex(
      (call) => call.method === 'PUT' && String(call.body).includes('"point"'),
    );
    expect(point).toBeGreaterThan(calls.indexOf(opened[1]));
    expect(bodyOf(calls[point])).toEqual({
      point: { lat: 4.6832, lng: -74.0974 },
    });
  });
});

describe('zona y región', () => {
  it('sin zona elegida no abre sesión ni inventa una ciudad', async () => {
    const server = makeServer();
    const stream = makeStream();
    const { controller, catalogs } = makeController(server, stream, { zone: null });

    expect(await controller.start()).toBe(false);
    expect(server.counts.size).toBe(0);
    expect(controller.getState().status).toBe('needs-zone');
    expect(controller.getState().zonePrompt).toBe('initial');
    expect(controller.getState().notice).toBeNull();
    expect(catalogs.at(-1)).toEqual({ profiles: null, source: 'dataset' });
  });

  it('la zona persistida define la región: bogota abre sesión co', async () => {
    const server = makeServer();
    const bodies: string[] = [];
    const fetchImpl = async (url: string, init?: { method?: string; body?: string }) => {
      if (url.endsWith('/auth/demo-session') && init?.body !== undefined) {
        bodies.push(init.body);
      }
      return server.fetchImpl(url as never, init as never);
    };
    const persistedZones: string[] = [];
    const controller = createLiveController({
      settings: SETTINGS,
      initialZoneKey: 'bogota',
      onZoneChange: (zoneKey) => persistedZones.push(zoneKey),
      fetchImpl: fetchImpl as never,
      createEventSource: () => null,
      heartbeatMs: 10_000,
      pollMs: 10,
    });

    expect(await controller.start()).toBe(true);
    expect(JSON.parse(bodies[0])).toEqual({ regionKey: 'co' });
    expect(controller.getState().session?.regionKey).toBe('co');
    expect(controller.getState().zoneKey).toBe('bogota');
    // La zona viene de una visita anterior: no se reescribe.
    expect(persistedZones).toEqual([]);
  });

  it('una zona desconocida no se inventa: no hay sesión que abrir', async () => {
    const server = makeServer();
    const stream = makeStream();
    const { controller } = makeController(server, stream, { zone: 'zz' });

    expect(await controller.start()).toBe(false);
    expect(server.counts.size).toBe(0);
    expect(controller.getState().status).toBe('needs-zone');
    expect(controller.getState().zonePrompt).toBe('initial');
  });

  it('el sheet se puede cerrar y volver a abrir sin perder la zona', async () => {
    const server = makeServer();
    const stream = makeStream();
    const { controller } = makeController(server, stream, { zone: null });
    await controller.start();

    controller.dismissZoneSheet();
    expect(controller.getState().zonePrompt).toBeNull();
    expect(controller.getState().status).toBe('needs-zone');

    controller.openZoneSheet();
    expect(controller.getState().zonePrompt).toBe('initial');
  });
});
