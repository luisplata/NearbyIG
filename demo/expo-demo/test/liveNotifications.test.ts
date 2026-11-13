import { describe, expect, it, vi } from 'vitest';

import { createLiveApi } from '../src/live/api';
import { createLiveController } from '../src/live/controller';
import type { LiveSettings } from '../src/live/config';
import {
  isUnread,
  sortNotifications,
  toNotificationRows,
  unreadNotifications,
  type NotificationRow,
} from '../src/live/notifications';
import type { LiveNotification, LivePingPeer } from '../src/live/types';

const SETTINGS: LiveSettings = { baseUrl: '/api' };

const SESSION = {
  token: 'tok-notif',
  expiresAt: '2026-11-13T12:00:00.000Z',
  regionKey: 'mx',
  profileId: 'mx-p09',
  demoSlot: 9,
  sourceType: 'human',
};

function peer(profileId: string): LivePingPeer {
  return {
    profileId,
    nickname: profileId === 'mx-p10' ? 'Mica' : 'Nico',
    initials: 'MI',
    intention: 'friendship',
    photoId: 'ph02',
    sourceType: 'human',
  };
}

function notification(
  id: string,
  kind: LiveNotification['kind'],
  overrides: Partial<LiveNotification> = {},
): LiveNotification {
  return {
    id,
    kind,
    createdAt: '2026-11-13T17:00:00.000Z',
    readAt: null,
    peer: peer('mx-p10'),
    pingId: kind === 'ping.received' ? `ping-${id}` : null,
    matchId: kind === 'ping.received' ? null : `match-${id}`,
    messageId: kind === 'message.created' ? `msg-${id}` : null,
    ...overrides,
  };
}

function row(profileId: string) {
  return {
    profileId,
    regionKey: 'mx',
    demoSlot: null,
    sourceType: 'human',
    nickname: 'Nico',
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
  };
}

/**
 * Backend de mentira con la campana persistida: `readAt` es el estado y
 * `unreadCount` cuenta las no leídas del perfil, no la página. Marcar sin ids
 * apaga todo; con ids, sólo las nombradas (y los ajenos se ignoran).
 */
function makeServer() {
  const notifications: LiveNotification[] = [
    notification('n1', 'message.created', {
      createdAt: '2026-11-13T17:03:00.000Z',
    }),
    notification('n2', 'ping.received', { createdAt: '2026-11-13T17:02:00.000Z' }),
    notification('n3', 'match.created', {
      createdAt: '2026-11-13T17:01:00.000Z',
      readAt: '2026-11-13T17:01:30.000Z',
    }),
  ];
  const unread = () => notifications.filter((item) => item.readAt === null).length;
  const readCalls: (string[] | null)[] = [];

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
    'GET /api/demo/profiles': () => ({
      status: 200,
      body: JSON.stringify({ profiles: [row('mx-p10'), row(SESSION.profileId)] }),
    }),
    'GET /api/discovery': () => ({ status: 200, body: JSON.stringify({ results: [row('mx-p10')] }) }),
    'GET /api/me': () => ({ status: 404, body: '{"code":"NOT_FOUND"}' }),
    'GET /api/events/poll': () => ({
      status: 200,
      body: JSON.stringify({ events: [], nextCursor: null, hasMore: false }),
    }),
    'GET /api/pings': () => ({ status: 200, body: '{"pings":[]}' }),
    'GET /api/blocks': () => ({ status: 200, body: '{"blocks":[]}' }),
    'GET /api/notifications': () => ({
      status: 200,
      body: JSON.stringify({ notifications, unreadCount: unread() }),
    }),
    'POST /api/notifications/read': (_url, body) => {
      const parsed = body === undefined ? null : (JSON.parse(body) as { notificationIds?: string[] });
      const ids = parsed?.notificationIds ?? null;
      readCalls.push(ids);
      const now = '2026-11-13T17:10:00.000Z';
      let marked = 0;
      for (const item of notifications) {
        if (ids !== null && !ids.includes(item.id)) {
          continue;
        }
        if (item.readAt === null) {
          item.readAt = now;
          marked += 1;
        }
      }
      return { status: 200, body: JSON.stringify({ marked, unreadCount: unread() }) };
    },
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

  return { fetchImpl, notifications, unread, readCalls };
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

describe('cliente de notificaciones', () => {
  it('GET /notifications parsea la lista y el unreadCount del server', async () => {
    const server = makeServer();
    const api = createLiveApi({ baseUrl: '/api', fetchImpl: server.fetchImpl as never });
    const list = await api.listNotifications();
    expect(list.notifications.map((item) => item.id)).toEqual(['n1', 'n2', 'n3']);
    expect(list.unreadCount).toBe(2);
  });

  it('un kind desconocido se descarta y el contador no se inventa', async () => {
    const api = createLiveApi({
      baseUrl: '/api',
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            notifications: [
              { ...notification('n1', 'ping.received'), kind: 'inventado' },
              notification('n2', 'match.created'),
            ],
            unreadCount: 9,
          }),
      }),
    });
    const list = await api.listNotifications();
    expect(list.notifications.map((item) => item.id)).toEqual(['n2']);
    expect(list.unreadCount).toBe(9);
  });

  it('sin body marca todas; con ids, sólo las nombradas', async () => {
    const server = makeServer();
    const api = createLiveApi({ baseUrl: '/api', fetchImpl: server.fetchImpl as never });

    const all = await api.readNotifications();
    expect(all).toEqual({ marked: 2, unreadCount: 0 });
    expect(server.readCalls.at(-1)).toBeNull();

    // Idempotente: la segunda vuelta no marca nada.
    expect(await api.readNotifications()).toEqual({ marked: 0, unreadCount: 0 });
  });
});

describe('adapter de notificaciones', () => {
  const rows: NotificationRow[] = toNotificationRows([
    notification('n1', 'message.created', { createdAt: '2026-11-13T17:01:00.000Z' }),
    notification('n2', 'ping.received', { createdAt: '2026-11-13T17:03:00.000Z' }),
    notification('n3', 'match.created', {
      createdAt: '2026-11-13T17:02:00.000Z',
      readAt: '2026-11-13T17:02:30.000Z',
    }),
  ]);

  it('orden más reciente primero y regla readAt === null', () => {
    expect(rows.map((item) => item.id)).toEqual(['n2', 'n3', 'n1']);
    expect(rows.map(isUnread)).toEqual([true, false, true]);
    expect(unreadNotifications(rows).map((item) => item.id)).toEqual(['n2', 'n1']);
  });

  it('ordena determinista con la misma fecha', () => {
    const sorted = sortNotifications(rows);
    expect(sorted.map((item) => item.id)).toEqual(['n2', 'n3', 'n1']);
  });

  it('descarta filas sin id, sin peer o con kind fuera del enum', () => {
    const invalid = toNotificationRows([
      { ...notification('', 'ping.received') },
      { ...notification('n4', 'ping.received'), peer: { ...peer(''), nickname: '' } },
      { ...notification('n5', 'ping.received'), kind: 'otro' as never },
      notification('n6', 'match.created'),
    ]);
    expect(invalid.map((item) => item.id)).toEqual(['n6']);
  });
});

describe('campana real en el controller', () => {
  it('al arrancar deja la lista y el unreadCount del server', async () => {
    const server = makeServer();
    const controller = makeController(server);
    await controller.start();
    // La campana no bloquea el arranque: se pide en paralelo y llega enseguida.
    await vi.waitFor(() => {
      expect(controller.getState().notifications).toHaveLength(3);
    });

    const state = controller.getState();
    expect(state.notifications.map((item) => item.id)).toEqual(['n1', 'n2', 'n3']);
    expect(state.unreadCount).toBe(2);
    expect(state.notificationsAt).not.toBeNull();
    await controller.stop();
  });

  it('marcar todas apaga el badge y deja readAt en cada fila', async () => {
    const server = makeServer();
    const controller = makeController(server);
    await controller.start();

    const result = await controller.markNotificationsRead();
    expect(result).toEqual({ ok: true, code: null, marked: 2 });
    expect(controller.getState().unreadCount).toBe(0);
    expect(controller.getState().notifications.every((item) => item.readAt !== null)).toBe(true);
    await controller.stop();
  });

  it('marcar una sola deja el resto sin leer', async () => {
    const server = makeServer();
    const controller = makeController(server);
    await controller.start();

    const result = await controller.markNotificationsRead(['n2']);
    expect(result.marked).toBe(1);
    expect(controller.getState().unreadCount).toBe(1);
    const byId = new Map(controller.getState().notifications.map((item) => [item.id, item.readAt]));
    expect(byId.get('n2')).not.toBeNull();
    expect(byId.get('n1')).toBeNull();
    await controller.stop();
  });

  it('sin sesión devuelve NO_SESSION y no toca el contador', async () => {
    const server = makeServer();
    const controller = makeController(server);
    expect(await controller.markNotificationsRead()).toEqual({
      ok: false,
      code: 'NO_SESSION',
      marked: 0,
    });
    expect(controller.getState().unreadCount).toBe(0);
  });
});
