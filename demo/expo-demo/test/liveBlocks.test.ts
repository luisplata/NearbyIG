import { describe, expect, it } from 'vitest';

import { createLiveApi, LiveApiError } from '../src/live/api';
import { createLiveController } from '../src/live/controller';
import type { LiveSettings } from '../src/live/config';
import { toBlockRows, isBlockedPeer, safetyErrorKey } from '../src/live/safety';
import type { LiveBlockItem } from '../src/live/types';

const SETTINGS: LiveSettings = { baseUrl: '/api' };

const SESSION = {
  token: 'tok-blocks',
  expiresAt: '2026-11-13T12:00:00.000Z',
  regionKey: 'mx',
  profileId: 'mx-p09',
  demoSlot: 9,
  sourceType: 'human',
};

function row(profileId: string, overrides: Record<string, unknown> = {}) {
  const bot = /-b\d$/.test(profileId);
  return {
    profileId,
    regionKey: 'mx',
    demoSlot: null,
    sourceType: bot ? 'bot' : 'human',
    nickname: bot ? 'Bot de Mica' : 'Nico',
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

/** Id canónico de un perfil: un bot pertenece a su dueño (`mx-p02-b1 → mx-p02`). */
function ownerOf(profileId: string): string {
  return profileId.replace(/-b\d$/, '');
}

/**
 * Backend de mentira con bloqueos y reportes del contrato v0.5: canoniza bots,
 * excluye el par de discovery y es idempotente. El objetivo es ejercer los
 * caminos reales del controller, no reimplementar el server.
 */
function makeServer() {
  const blocks = new Map<string, string>();
  const reports: { profileId: string; reason: string }[] = [];
  const all = [row('mx-p02'), row('mx-p02-b1', { distanceM: 900 }), row('mx-p03'), row(SESSION.profileId, { demoSlot: 9 })];

  const visible = () =>
    all.filter(
      (item) => item.profileId !== SESSION.profileId && !blocks.has(ownerOf(item.profileId)),
    );

  const listBlocks = () => ({
    blocks: [...blocks.entries()].map(([profileId, createdAt]) => ({
      block: { profileId, createdAt },
      peer: {
        profileId,
        nickname: 'Nico',
        initials: 'NI',
        intention: 'friendship',
        photoId: 'ph02',
        sourceType: 'human',
      },
    })),
  });

  const routes: Record<string, (_url: string, body?: string) => { status: number; body: string }> = {
    'POST /api/auth/demo-session': () => ({ status: 201, body: JSON.stringify(SESSION) }),
    'POST /api/auth/stream-ticket': () => ({ status: 201, body: '{"ticket":"t1"}' }),
    'PUT /api/presence': () => ({
      status: 200,
      body: JSON.stringify({
        profileId: SESSION.profileId,
        regionKey: 'mx',
        zoneKey: 'cdmx',
        online: true,
        visibility: 'visible',
        fallbackRequired: false,
      }),
    }),
    'GET /api/demo/profiles': () => ({ status: 200, body: JSON.stringify({ profiles: all }) }),
    'GET /api/discovery': () => ({ status: 200, body: JSON.stringify({ results: visible() }) }),
    'GET /api/me': () => ({ status: 404, body: '{"code":"NOT_FOUND"}' }),
    'GET /api/events/poll': () => ({
      status: 200,
      body: JSON.stringify({ events: [], nextCursor: null, hasMore: false }),
    }),
    'GET /api/pings': () => ({ status: 200, body: '{"pings":[]}' }),
    'GET /api/notifications': () => ({ status: 200, body: '{"notifications":[],"unreadCount":0}' }),
    'GET /api/blocks': () => ({ status: 200, body: JSON.stringify(listBlocks()) }),
    'POST /api/blocks': (_url, body) => {
      const requested = JSON.parse(String(body))['profileId'] as string;
      if (requested === SESSION.profileId) {
        return { status: 422, body: '{"code":"VALIDATION_FAILED"}' };
      }
      const canonical = ownerOf(requested);
      if (!blocks.has(canonical)) {
        blocks.set(canonical, '2026-11-13T17:48:37.874Z');
      }
      return { status: 201, body: JSON.stringify({ profileId: canonical, createdAt: blocks.get(canonical) }) };
    },
    'POST /api/reports': (_url, body) => {
      const parsed = JSON.parse(String(body)) as { profileId: string; reason: string };
      if (parsed.reason !== 'spam' && parsed.reason !== 'harassment') {
        return { status: 422, body: '{"code":"VALIDATION_FAILED"}' };
      }
      reports.push(parsed);
      return {
        status: 202,
        body: '{"reportId":"report-1","createdAt":"2026-11-13T17:48:37.927Z"}',
      };
    },
  };

  const fetchImpl = async (url: string, init?: { method?: string; body?: string }) => {
    const method = init?.method ?? 'GET';
    const base = url.split('?')[0];
    const deleteMatch = /^\/api\/blocks\/(.+)$/.exec(base);
    if (method === 'DELETE' && deleteMatch !== null) {
      blocks.delete(ownerOf(decodeURIComponent(deleteMatch[1]!)));
      return { ok: true, status: 204, text: async () => '' };
    }
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

  return { fetchImpl, blocks, reports };
}

function makeController(server: ReturnType<typeof makeServer>) {
  return createLiveController({
    settings: SETTINGS,
    initialZoneKey: 'cdmx',
    fetchImpl: server.fetchImpl as never,
    createEventSource: () => null,
    pollMs: 60_000,
    heartbeatMs: 60_000,
    pingsMs: 60_000,
    reseedMs: 60_000,
  });
}

describe('cliente de bloqueos y reportes', () => {
  it('POST /blocks devuelve el canonizado y GET /blocks proyecta el peer', async () => {
    const server = makeServer();
    const api = createLiveApi({ baseUrl: '/api', fetchImpl: server.fetchImpl as never });
    api.setToken(SESSION.token);

    const created = await api.createBlock('mx-p02-b1');
    expect(created.profileId).toBe('mx-p02');

    const blocks = await api.listBlocks();
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.block.profileId).toBe('mx-p02');
    expect(blocks[0]!.peer.profileId).toBe('mx-p02');
  });

  it('DELETE es 204 aunque el par no estuviera bloqueado', async () => {
    const server = makeServer();
    const api = createLiveApi({ baseUrl: '/api', fetchImpl: server.fetchImpl as never });
    await expect(api.deleteBlock('mx-p03')).resolves.toBeUndefined();
  });

  it('un 422 de auto-bloqueo llega como LiveApiError con su código', async () => {
    const server = makeServer();
    const api = createLiveApi({ baseUrl: '/api', fetchImpl: server.fetchImpl as never });
    await expect(api.createBlock(SESSION.profileId)).rejects.toMatchObject({
      status: 422,
      code: 'VALIDATION_FAILED',
    });
    await expect(api.createBlock(SESSION.profileId)).rejects.toBeInstanceOf(LiveApiError);
  });

  it('POST /reports devuelve sólo el acuse', async () => {
    const server = makeServer();
    const api = createLiveApi({ baseUrl: '/api', fetchImpl: server.fetchImpl as never });
    const receipt = await api.createReport('mx-p02', 'spam');
    expect(receipt).toEqual({ reportId: 'report-1', createdAt: '2026-11-13T17:48:37.927Z' });
    expect(server.reports).toEqual([{ profileId: 'mx-p02', reason: 'spam' }]);
  });
});

describe('adapter de bloqueos', () => {
  const items: LiveBlockItem[] = [
    {
      block: { profileId: 'mx-p02', createdAt: '2026-11-13T10:00:00.000Z' },
      peer: {
        profileId: 'mx-p02',
        nickname: 'Nico',
        initials: 'NI',
        intention: 'friendship',
        photoId: 'ph02',
        sourceType: 'human',
      },
    },
    {
      block: { profileId: 'mx-p03', createdAt: '2026-11-13T11:00:00.000Z' },
      peer: {
        profileId: 'mx-p03',
        nickname: 'Fran',
        initials: 'FR',
        intention: 'networking',
        photoId: 'ph03',
        sourceType: 'human',
      },
    },
  ];

  it('ordena por fecha descendente y descarta filas sin peer', () => {
    const rows = toBlockRows([
      ...items,
      {
        block: { profileId: '', createdAt: '2026-11-13T12:00:00.000Z' },
        peer: { ...items[0]!.peer, profileId: '' },
      },
    ]);
    expect(rows.map((row) => row.profileId)).toEqual(['mx-p03', 'mx-p02']);
  });

  it('un alias de bot cuenta como bloqueado sin repetir la regla de nombres', () => {
    const rows = toBlockRows(items);
    expect(isBlockedPeer(rows, {}, 'mx-p02')).toBe(true);
    expect(isBlockedPeer(rows, { 'mx-p02-b1': 'mx-p02' }, 'mx-p02-b1')).toBe(true);
    expect(isBlockedPeer(rows, { 'mx-p09-b1': 'mx-p09' }, 'mx-p09-b1')).toBe(false);
  });

  it('los códigos de error de la familia tienen copy propio', () => {
    expect(safetyErrorKey('PROFILE_REQUIRED')).toBe('errorGuest');
    expect(safetyErrorKey('VALIDATION_FAILED')).toBe('errorValidation');
    expect(safetyErrorKey('CHAT_BLOCKED')).toBe('errorBlocked');
    expect(safetyErrorKey('CUALQUIERA')).toBe('errorGeneric');
  });
});

describe('bloquear y reportar en el controller', () => {
  it('bloquear un bot canoniza al dueño, deja el alias y lo saca de discovery', async () => {
    const server = makeServer();
    const controller = makeController(server);
    await controller.start();
    expect(controller.getState().discovery.map((item) => item.profileId)).toContain('mx-p02-b1');

    const result = await controller.block('mx-p02-b1');
    expect(result).toEqual({ ok: true, code: null, profileId: 'mx-p02' });

    const state = controller.getState();
    expect(state.blockAliases['mx-p02-b1']).toBe('mx-p02');
    expect(state.blocks.map((item) => item.block.profileId)).toEqual(['mx-p02']);
    expect(state.discovery.map((item) => item.profileId)).toEqual(['mx-p03']);
    expect(state.blockError).toBeNull();
    await controller.stop();
  });

  it('desbloquear devuelve el par a discovery y limpia el alias', async () => {
    const server = makeServer();
    const controller = makeController(server);
    await controller.start();
    await controller.block('mx-p02-b1');
    const back = await controller.unblock('mx-p02-b1');

    expect(back.ok).toBe(true);
    const state = controller.getState();
    expect(state.blocks).toEqual([]);
    expect(state.blockAliases).toEqual({});
    expect(state.discovery.map((item) => item.profileId)).toContain('mx-p02-b1');
    await controller.stop();
  });

  it('un 422 deja el código y no agrega nada a la lista', async () => {
    const server = makeServer();
    const controller = makeController(server);
    await controller.start();
    const result = await controller.block(SESSION.profileId);
    expect(result).toEqual({ ok: false, code: 'VALIDATION_FAILED', profileId: null });
    expect(controller.getState().blockError).toBe('VALIDATION_FAILED');
    expect(controller.getState().blocks).toEqual([]);
    await controller.stop();
  });

  it('reportar registra el acuse una sola vez y no bloquea al reportado', async () => {
    const server = makeServer();
    const controller = makeController(server);
    await controller.start();
    const before = controller.getState().discovery.map((item) => item.profileId);

    const first = await controller.report('mx-p02', 'spam');
    const second = await controller.report('mx-p02', 'spam');
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(controller.getState().reported).toEqual(['mx-p02']);
    expect(controller.getState().reportError).toBeNull();
    expect(controller.getState().discovery.map((item) => item.profileId)).toEqual(before);
    expect(server.reports).toHaveLength(2);
    await controller.stop();
  });

  it('un motivo inválido es 422 y queda en reportError', async () => {
    const server = makeServer();
    const controller = makeController(server);
    await controller.start();
    const result = await controller.report('mx-p02', 'other');
    expect(result).toEqual({ ok: false, code: 'VALIDATION_FAILED' });
    expect(controller.getState().reportError).toBe('VALIDATION_FAILED');
    expect(controller.getState().reported).toEqual([]);
    await controller.stop();
  });

  it('sin sesión las acciones devuelven NO_SESSION', async () => {
    const server = makeServer();
    const controller = makeController(server);
    expect(await controller.block('mx-p02')).toEqual({
      ok: false,
      code: 'NO_SESSION',
      profileId: null,
    });
    expect(await controller.unblock('mx-p02')).toEqual({
      ok: false,
      code: 'NO_SESSION',
      profileId: null,
    });
    expect(await controller.report('mx-p02', 'spam')).toEqual({
      ok: false,
      code: 'NO_SESSION',
    });
  });
});
