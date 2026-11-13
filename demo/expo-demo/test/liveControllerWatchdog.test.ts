import { afterEach, describe, expect, it, vi } from 'vitest';

import { createLiveController, type EventSourceLike } from '../src/live/controller';
import type { LiveSettings } from '../src/live/config';
import { liveStatusText, liveTransportText } from '../src/live/status';

const SETTINGS: LiveSettings = { baseUrl: '/api' };

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
  verified: true,
  online: true,
  inUse: false,
  distanceM: 240,
  bearingDeg: 32,
  photoId: 'ph01',
  instagramHandle: 'vale.works',
  statusKey: 'status.p01',
  bioKey: 'bio.p01',
};

/** Backend mínimo: lo justo para abrir sesión y pollear. */
function makeServer() {
  const counts = new Map<string, number>();
  let pollCalls = 0;
  const fetchImpl = async (url: string, init?: { method?: string }) => {
    const method = init?.method ?? 'GET';
    const key = `${method} ${url.split('?')[0]}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    const respond = (status: number, payload: unknown) => ({
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(payload),
    });
    switch (key) {
      case 'POST /api/auth/demo-session':
        return respond(201, SESSION);
      case 'POST /api/auth/stream-ticket':
        return respond(201, { ticket: 'ticket-1' });
      case 'PUT /api/presence':
        return respond(200, {
          profileId: SESSION.profileId,
          regionKey: 'mx',
          zoneKey: 'cdmx',
          online: true,
          fallbackRequired: false,
        });
      case 'GET /api/demo/profiles':
        return respond(200, { profiles: [PROFILE] });
      case 'GET /api/discovery':
        return respond(200, { results: [PROFILE] });
      case 'GET /api/me':
        return { ok: false, status: 404, text: async () => '{"code":"NOT_FOUND"}' };
      case 'GET /api/events/poll':
        pollCalls += 1;
        return respond(200, { events: [], nextCursor: null, hasMore: false });
      case 'GET /api/pings':
        return respond(200, { pings: [] });
      case 'GET /api/matches':
        return respond(200, { matches: [] });
      default:
        return { ok: false, status: 404, text: async () => '{"code":"NOT_FOUND"}' };
    }
  };
  return { fetchImpl, pollCalls: () => pollCalls };
}

type Stub = EventSourceLike & {
  open: () => void;
  fail: () => void;
  emit: (type: string, data: string) => void;
  closed: boolean;
};

function makeStream() {
  const instances: Stub[] = [];
  const factory = (): EventSourceLike | null => {
    const listeners = new Map<string, ((event: { data?: string }) => void)[]>();
    const stub: Stub = {
      closed: false,
      onopen: null,
      onerror: null,
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
  options: { stallMs?: number; tickMs?: number; pollMs?: number } = {},
) {
  return createLiveController({
    settings: SETTINGS,
    initialZoneKey: 'cdmx',
    fetchImpl: server.fetchImpl as never,
    createEventSource: stream.factory,
    pollMs: options.pollMs ?? 1_000,
    heartbeatMs: 600_000,
    reseedMs: 600_000,
    pingsMs: 600_000,
    streamStallMs: options.stallMs ?? 25_000,
    watchdogTickMs: options.tickMs ?? 5_000,
  });
}

const movedEvent = (seq: number, distanceM: number) =>
  JSON.stringify({
    id: `mx:${String(seq).padStart(12, '0')}`,
    type: 'profile.moved',
    occurredAt: '2026-11-13T09:00:00.000Z',
    payload: { profileId: 'mx-p01', distanceM, bearingDeg: 90 },
  });

afterEach(() => {
  vi.useRealTimers();
});

describe('watchdog del transporte', () => {
  it('stream abierto y mudo: a los 25 s cae a polling y la barra lo dice', async () => {
    vi.useFakeTimers();
    const server = makeServer();
    const stream = makeStream();
    const controller = makeController(server, stream);

    expect(await controller.start()).toBe(true);
    stream.instances[0].open();
    expect(controller.getState().status).toBe('live');
    expect(controller.getState().transport).toBe('sse');

    await vi.advanceTimersByTimeAsync(24_000);
    expect(controller.getState().status).toBe('live');
    expect(controller.getState().transport).toBe('sse');

    await vi.advanceTimersByTimeAsync(2_000);
    const state = controller.getState();
    expect(state.status).toBe('polling');
    expect(state.transport).toBe('polling');
    // Lo que la barra dice, que es lo que el usuario ve: estado y transporte.
    expect(liveStatusText('live', state)).toBe('en vivo por polling');
    expect(liveTransportText(state)).toBe('polling');
    // El transporte viejo está cerrado: no quedan dos activos.
    expect(stream.instances[0].closed).toBe(true);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(server.pollCalls()).toBeGreaterThanOrEqual(1);
    await controller.stop();
  });

  it('los frames reinician la cuenta: 60 s de vida no degradan', async () => {
    vi.useFakeTimers();
    const server = makeServer();
    const stream = makeStream();
    const controller = makeController(server, stream);

    await controller.start();
    stream.instances[0].open();

    for (let seq = 1; seq <= 6; seq += 1) {
      await vi.advanceTimersByTimeAsync(10_000);
      stream.instances[0].emit('profile.moved', movedEvent(seq, 300 + seq));
    }

    expect(controller.getState().status).toBe('live');
    expect(controller.getState().transport).toBe('sse');
    expect(controller.getState().discovery[0].distanceM).toBe(306);
    expect(stream.instances[0].closed).toBe(false);
    await controller.stop();
  });

  it('sin `onopen` el stream tampoco entrega: también cae a polling', async () => {
    vi.useFakeTimers();
    const server = makeServer();
    const stream = makeStream();
    const controller = makeController(server, stream);

    await controller.start();
    expect(controller.getState().status).toBe('connecting');
    expect(controller.getState().transport).toBe('none');

    await vi.advanceTimersByTimeAsync(26_000);
    const state = controller.getState();
    expect(state.status).toBe('polling');
    expect(state.transport).toBe('polling');
    expect(stream.instances[0].closed).toBe(true);
    await controller.stop();
  });

  it('un frame suelto por minuto no alcanza: pasados los 25 s igual degrada', async () => {
    vi.useFakeTimers();
    const server = makeServer();
    const stream = makeStream();
    const controller = makeController(server, stream);

    await controller.start();
    stream.instances[0].open();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(controller.getState().transport).toBe('polling');
    await controller.stop();
  });

  it('mientras el SSE entrega no hay ni un request de polling', async () => {
    vi.useFakeTimers();
    const server = makeServer();
    const stream = makeStream();
    const controller = makeController(server, stream);

    await controller.start();
    stream.instances[0].open();

    for (let seq = 1; seq <= 3; seq += 1) {
      await vi.advanceTimersByTimeAsync(5_000);
      stream.instances[0].emit('profile.moved', movedEvent(seq, 500 + seq));
    }

    expect(controller.getState().transport).toBe('sse');
    expect(server.pollCalls()).toBe(0);
    await controller.stop();
  });

  it('los frames de un stream ya cerrado no se aplican: un solo transporte manda', async () => {
    vi.useFakeTimers();
    const server = makeServer();
    const stream = makeStream();
    const controller = makeController(server, stream);

    await controller.start();
    stream.instances[0].open();
    await vi.advanceTimersByTimeAsync(26_000);
    expect(controller.getState().transport).toBe('polling');

    // El EventSource viejo todavía puede disparar un listener: el controller lo
    // ignora porque ya no es `source`.
    stream.instances[0].emit('profile.moved', movedEvent(99, 4_900));
    expect(controller.getState().discovery[0].distanceM).toBe(240);
    expect(controller.getState().lastSeq).toBe(0);
    await controller.stop();
  });

  it('si el stream falla con onerror se degrada sin esperar al watchdog', async () => {
    vi.useFakeTimers();
    const server = makeServer();
    const stream = makeStream();
    const controller = makeController(server, stream);

    await controller.start();
    stream.instances[0].open();
    stream.instances[0].fail();

    expect(controller.getState().transport).toBe('polling');
    expect(controller.getState().notice).toBe('degraded');
    expect(liveStatusText('live', controller.getState())).toBe('en vivo por polling');
    expect(stream.instances[0].closed).toBe(true);
    await controller.stop();
  });

  it('el umbral y el tick son configurables: 2 s y 500 ms en vez de 25 s', async () => {
    vi.useFakeTimers();
    const server = makeServer();
    const stream = makeStream();
    const controller = makeController(server, stream, { stallMs: 2_000, tickMs: 500 });

    await controller.start();
    stream.instances[0].open();
    await vi.advanceTimersByTimeAsync(1_500);
    expect(controller.getState().transport).toBe('sse');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(controller.getState().transport).toBe('polling');
    await controller.stop();
  });
});
