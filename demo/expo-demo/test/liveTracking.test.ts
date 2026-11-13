import { afterEach, describe, expect, it, vi } from 'vitest';

import { createLiveController } from '../src/live/controller';
import { TRACK_OPTIONS, type GeoResult } from '../src/live/geolocation';
import { distanceM, MOVED_MIN_M, movedEnough } from '../src/live/track';

/**
 * Seguimiento de la posición propia, contra el controlador real con `fetch`
 * falso y timers falsos.
 *
 * Lo que se prueba es la promesa que el usuario ve: **el punto se mueve**. Antes
 * el `PUT /presence` se mandaba una sola vez al abrir la sesión y el radar
 * mostraba a la persona siempre en el mismo lugar. Ahora hay una lectura cada
 * 10 s, pero la red sólo se toca cuando el movimiento supera los 10 m: los tests
 * cuentan requests, no "que se haya llamado una función".
 */

const SETTINGS = { baseUrl: '/api' };

const SESSION = {
  token: 'tok-1',
  expiresAt: '2026-11-13T12:00:00.000Z',
  regionKey: 'mx',
  profileId: 'mx-p05',
  demoSlot: 5,
  sourceType: 'human',
};

const PROFILE = {
  profileId: 'mx-p01',
  regionKey: 'mx',
  demoSlot: 1,
  sourceType: 'human',
  nickname: 'Vale',
  initials: 'VA',
  intention: 'networking',
  gender: 'female',
  verified: false,
  online: true,
  inUse: false,
  distanceM: 240,
  bearingDeg: 32,
  photoId: 'ph01',
  instagramHandle: 'vale.works',
  statusKey: 'status.p01',
  bioKey: 'bio.p01',
};

type Call = { method: string; path: string; body: string | undefined };
type Route = (url: string, init: { method?: string; body?: string }) => { status: number; body: string };

function makeServer() {
  /**
   * La visibilidad es estado del server: un PUT que la omite la conserva. El
   * fake lo modela de verdad, porque ése es justamente el comportamiento que el
   * seguimiento necesita (no sacar a nadie de ghost con un latido de posición).
   */
  let visibility = 'visible';

  const routes: Record<string, Route> = {
    'POST /api/auth/demo-session': () => ({ status: 201, body: JSON.stringify(SESSION) }),
    'POST /api/auth/logout': () => ({ status: 204, body: '' }),
    'PUT /api/presence': (_url, init) => {
      const body =
        init.body === undefined ? {} : (JSON.parse(init.body) as Record<string, unknown>);
      if (body['visibility'] === 'ghost' || body['visibility'] === 'visible') {
        visibility = body['visibility'];
      }
      return {
        status: 200,
        body: JSON.stringify({
          profileId: 'mx-p05',
          regionKey: 'mx',
          zoneKey: 'cdmx',
          online: true,
          visibility,
          fallbackRequired: false,
        }),
      };
    },
    'GET /api/discovery': () => ({ status: 200, body: JSON.stringify({ results: [PROFILE] }) }),
    'GET /api/demo/profiles': () => ({
      status: 200,
      body: JSON.stringify({ profiles: [PROFILE] }),
    }),
    'GET /api/pings': () => ({ status: 200, body: JSON.stringify({ pings: [] }) }),
    'GET /api/matches': () => ({ status: 200, body: JSON.stringify({ matches: [] }) }),
    'GET /api/notifications': () => ({
      status: 200,
      body: JSON.stringify({ notifications: [], unreadCount: 0 }),
    }),
    'GET /api/events/poll': () => ({
      status: 200,
      body: JSON.stringify({ events: [], nextCursor: null, hasMore: false }),
    }),
  };

  const fetchImpl = async (url: string, init?: { method?: string; body?: string }) => {
    const method = init?.method ?? 'GET';
    const route = routes[`${method} ${url.split('?')[0]}`];
    if (route === undefined) {
      return { ok: false, status: 404, text: async () => '{"code":"NOT_FOUND"}' };
    }
    const { status, body } = route(url, init ?? {});
    return { ok: status >= 200 && status < 300, status, text: async () => body };
  };

  return { fetchImpl };
}

/** Punto de partida: el centro de CDMX. */
const A = { lat: 19.432608, lng: -99.13321 };

/** `meters` al norte de la latitud base (un grado de latitud ≈ 111.195 m). */
function north(meters: number): { lat: number; lng: number } {
  return { lat: A.lat + meters / 111_194.9, lng: A.lng };
}

const ok = (point: { lat: number; lng: number }): GeoResult => ({
  status: 'ok',
  point,
  accuracyM: 10,
});

/** Cola de lecturas del GPS: cada vuelta del seguimiento consume una. */
function queue(...results: GeoResult[]): () => Promise<GeoResult> {
  let index = 0;
  return () => {
    const next = results[Math.min(index, results.length - 1)];
    index += 1;
    return Promise.resolve(next);
  };
}

function makeTrackingController(options: {
  geo: () => Promise<GeoResult>;
  heartbeatMs?: number;
  trackMs?: number;
}) {
  const server = makeServer();
  const calls: Call[] = [];
  const geoOptions: unknown[] = [];
  const logs: string[] = [];
  let geoCalls = 0;

  const fetchImpl = async (url: string, init?: { method?: string; body?: string }) => {
    calls.push({ method: init?.method ?? 'GET', path: url.split('?')[0], body: init?.body });
    return server.fetchImpl(url as never, init as never);
  };

  const controller = createLiveController({
    settings: SETTINGS,
    initialZoneKey: 'cdmx',
    fetchImpl: fetchImpl as never,
    // Sin `EventSource`: polling, que es el camino que también corre en el celular.
    createEventSource: () => null,
    requestPoint: (geoOptionsArg) => {
      geoCalls += 1;
      geoOptions.push(geoOptionsArg);
      return options.geo();
    },
    log: (message) => logs.push(message),
    heartbeatMs: options.heartbeatMs ?? 60_000,
    trackMs: options.trackMs ?? 10_000,
    // El polling no aporta a estos tests y sí suma ruido a los contadores.
    pollMs: 60_000,
  });

  const presence = (): Call[] =>
    calls.filter((call) => call.method === 'PUT' && call.path.endsWith('/presence'));
  const presenceBodies = (): Record<string, unknown>[] =>
    presence().map((call) => JSON.parse(String(call.body ?? 'null')) as Record<string, unknown>);
  const count = (method: string, suffix: string): number =>
    calls.filter((call) => call.method === method && call.path.endsWith(suffix)).length;

  return {
    controller,
    presence,
    presenceBodies,
    count,
    geoCalls: () => geoCalls,
    geoOptions,
    logs,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('umbral de movimiento', () => {
  it('15 m mueven el punto; 5 m no', () => {
    expect(distanceM(A, north(15))).toBeGreaterThanOrEqual(MOVED_MIN_M);
    expect(distanceM(A, north(5))).toBeLessThan(MOVED_MIN_M);
    expect(movedEnough(north(15), A)).toBe(true);
    expect(movedEnough(north(5), A)).toBe(false);
  });

  it('el mismo punto no es un movimiento y no hay punto previo al arrancar', () => {
    expect(movedEnough(A, A)).toBe(false);
    expect(distanceM(A, A)).toBe(0);
    expect(movedEnough(north(1), null)).toBe(true);
  });

  it('un punto inválido nunca cuenta como "el mismo lugar"', () => {
    expect(distanceM(A, { lat: Number.NaN, lng: A.lng })).toBe(Number.POSITIVE_INFINITY);
    expect(movedEnough({ lat: Number.NaN, lng: A.lng }, A)).toBe(true);
  });
});

describe('seguimiento de la posición propia', () => {
  it('con 15 m entre lecturas manda un PUT por cambio y un solo refresh cada vez', async () => {
    vi.useFakeTimers();
    const B = north(15);
    const C = north(30);
    const { controller, presenceBodies, count, geoCalls, geoOptions } = makeTrackingController({
      geo: queue(ok(A), ok(B), ok(C)),
    });

    await controller.start();
    await controller.requestLocation();
    // El gesto pidió una lectura fresca: sin caché ni seguimiento todavía.
    expect(geoOptions[0]).toBeUndefined();
    expect(presenceBodies()).toEqual([{ demoZoneKey: 'cdmx' }, { point: A }]);
    const discoveryAfterGesture = count('GET', '/api/discovery');

    await vi.advanceTimersByTimeAsync(10_000);
    await vi.advanceTimersByTimeAsync(10_000);

    expect(geoCalls()).toBe(3);
    // La lectura del seguimiento usa las opciones laxas: no puede quedar colgada.
    expect(geoOptions[1]).toEqual(TRACK_OPTIONS);
    expect(presenceBodies()).toEqual([
      { demoZoneKey: 'cdmx' },
      { point: A },
      { point: B },
      { point: C },
    ]);
    // Un refresh por cambio, no dos: el latido de 60 s no se metió en el medio.
    expect(count('GET', '/api/discovery')).toBe(discoveryAfterGesture + 2);
    expect(controller.getState().point).toEqual(C);
    expect(controller.getState().location).toBe('gps');
  });

  it('con 5 m no se gasta ni un request; con 15 m sí', async () => {
    vi.useFakeTimers();
    const { controller, presenceBodies, count, geoCalls } = makeTrackingController({
      geo: queue(ok(A), ok(north(5)), ok(north(15))),
    });

    await controller.start();
    await controller.requestLocation();
    const discovery = count('GET', '/api/discovery');

    await vi.advanceTimersByTimeAsync(10_000);
    // Se leyó el GPS, pero no hubo `PUT /presence` ni refresh.
    expect(geoCalls()).toBe(2);
    expect(presenceBodies()).toHaveLength(2);
    expect(count('GET', '/api/discovery')).toBe(discovery);
    expect(controller.getState().point).toEqual(A);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(presenceBodies().at(-1)).toEqual({ point: north(15) });
    expect(count('GET', '/api/discovery')).toBe(discovery + 1);
  });

  it('el seguimiento no manda `visibility`: el ghost se mantiene', async () => {
    vi.useFakeTimers();
    const { controller, presenceBodies } = makeTrackingController({
      geo: queue(ok(A), ok(north(15))),
    });

    await controller.start();
    await controller.requestLocation();
    const ghost = await controller.setVisibility('ghost');
    expect(ghost.ok).toBe(true);
    // El cambio explícito sí la manda; es el único que puede.
    expect(presenceBodies().at(-1)).toEqual({ point: A, visibility: 'ghost' });

    await vi.advanceTimersByTimeAsync(10_000);

    const tracked = presenceBodies().at(-1);
    expect(tracked).toEqual({ point: north(15) });
    expect(tracked).not.toHaveProperty('visibility');
    expect(controller.getState().visibility).toBe('ghost');
  });

  it('si el permiso se revoca a mitad de sesión cae a zona demo y no rompe', async () => {
    vi.useFakeTimers();
    const { controller, presenceBodies, geoCalls } = makeTrackingController({
      geo: queue(ok(A), { status: 'denied' }),
    });

    await controller.start();
    await controller.requestLocation();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(presenceBodies().at(-1)).toEqual({ demoZoneKey: 'cdmx' });
    const state = controller.getState();
    expect(state.location).toBe('demo');
    expect(state.point).toBeNull();
    expect(state.zonePrompt).toBe('denied');
    expect(state.session).not.toBeNull();
    expect(state.status).not.toBe('offline');

    // El seguimiento quedó apagado: no hay más lecturas ni más PUTs.
    expect(geoCalls()).toBe(2);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(geoCalls()).toBe(2);
    expect(presenceBodies()).toHaveLength(3);
  });

  it('cerrar la sesión corta el seguimiento: ni timers huérfanos ni lecturas', async () => {
    vi.useFakeTimers();
    const { controller, geoCalls } = makeTrackingController({
      geo: queue(ok(A), ok(north(15))),
    });

    await controller.start();
    await controller.requestLocation();
    expect(geoCalls()).toBe(1);

    await controller.stop();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(geoCalls()).toBe(1);
    expect(controller.getState().point).toBeNull();
  });

  it('volver a la zona demo apaga el seguimiento', async () => {
    vi.useFakeTimers();
    const { controller, geoCalls } = makeTrackingController({
      geo: queue(ok(A), ok(north(15))),
    });

    await controller.start();
    await controller.requestLocation();
    expect(controller.getState().location).toBe('gps');

    await controller.chooseZone('cdmx');
    expect(controller.getState().location).toBe('demo');
    await vi.advanceTimersByTimeAsync(30_000);
    expect(geoCalls()).toBe(1);
  });

  it('una lectura que vuelve tarde no escribe sobre la zona nueva', async () => {
    vi.useFakeTimers();
    let resolveLate: (result: GeoResult) => void = () => undefined;
    const late = new Promise<GeoResult>((resolve) => {
      resolveLate = resolve;
    });
    let reads = 0;
    const { controller, presenceBodies } = makeTrackingController({
      geo: () => {
        reads += 1;
        return reads === 1 ? Promise.resolve(ok(A)) : late;
      },
      trackMs: 10_000,
    });

    await controller.start();
    await controller.requestLocation();
    // La vuelta de los 10 s queda esperando al proveedor.
    await vi.advanceTimersByTimeAsync(10_000);

    // Mientras espera, el usuario vuelve a la zona demo.
    await controller.chooseZone('cdmx');
    expect(controller.getState().location).toBe('demo');

    // El proveedor contesta tarde, con un punto a 100 m: no se escribe nada.
    resolveLate(ok(north(100)));
    await vi.advanceTimersByTimeAsync(0);

    expect(presenceBodies()).toEqual([
      { demoZoneKey: 'cdmx' },
      { point: A },
      { demoZoneKey: 'cdmx' },
    ]);
    expect(controller.getState().point).toBeNull();
  });

  it('sin gesto de ubicación no hay seguimiento que gastar', async () => {    vi.useFakeTimers();
    const { controller, geoCalls, presenceBodies } = makeTrackingController({
      geo: queue(ok(A)),
    });

    await controller.start();
    await vi.advanceTimersByTimeAsync(30_000);

    expect(geoCalls()).toBe(0);
    expect(presenceBodies()).toEqual([{ demoZoneKey: 'cdmx' }]);
  });
});

describe('refresh completo (pull-to-refresh y botón)', () => {
  it('toca presencia, discovery y bandejas, y no saca a nadie de ghost', async () => {
    const { controller, count, presenceBodies } = makeTrackingController({ geo: queue(ok(A)) });

    await controller.start();
    await controller.requestLocation();
    expect((await controller.setVisibility('ghost')).ok).toBe(true);
    const before = presenceBodies().length;

    await controller.refreshAll();

    // La presencia se renueva con el último punto enviado y sin `visibility`.
    expect(presenceBodies()).toHaveLength(before + 1);
    expect(presenceBodies().at(-1)).toEqual({ point: A });
    expect(controller.getState().visibility).toBe('ghost');

    for (const path of ['/api/discovery', '/api/pings', '/api/matches', '/api/notifications']) {
      expect(count('GET', path), path).toBeGreaterThan(0);
    }
    expect(controller.getState().status).not.toBe('offline');
  });

  it('sin sesión no inventa requests', async () => {
    const { controller, count } = makeTrackingController({ geo: queue(ok(A)) });
    await controller.refreshAll();
    expect(count('PUT', '/api/presence')).toBe(0);
    expect(count('GET', '/api/discovery')).toBe(0);
  });
});

describe('latido vs seguimiento', () => {
  it('el PUT del seguimiento rearma el latido: no lo duplica y no deja hueco de TTL', async () => {
    vi.useFakeTimers();
    const B = north(15);
    const { controller, presenceBodies } = makeTrackingController({
      geo: queue(ok(A), ok(B)),
      heartbeatMs: 8_000,
      trackMs: 10_000,
    });

    await controller.start();
    await controller.requestLocation();
    expect(presenceBodies()).toHaveLength(2);

    // El latido de los 8 s mantiene viva la presencia con el mismo punto.
    await vi.advanceTimersByTimeAsync(8_000);
    expect(presenceBodies()).toHaveLength(3);
    expect(presenceBodies().at(-1)).toEqual({ point: A });

    // A los 10 s el seguimiento manda el punto nuevo y rearma el latido.
    await vi.advanceTimersByTimeAsync(2_000);
    expect(presenceBodies()).toHaveLength(4);
    expect(presenceBodies().at(-1)).toEqual({ point: B });

    // Justo antes de los 8 s rearmados no hay una segunda escritura del punto.
    await vi.advanceTimersByTimeAsync(7_000);
    expect(presenceBodies()).toHaveLength(4);

    // Un segundo después, el keep-alive vuelve: la TTL sigue cubierta.
    await vi.advanceTimersByTimeAsync(1_000);
    expect(presenceBodies()).toHaveLength(5);
    expect(presenceBodies().at(-1)).toEqual({ point: B });
  });
});
