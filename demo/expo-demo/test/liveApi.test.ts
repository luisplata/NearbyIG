import { describe, expect, it } from 'vitest';

import { createLiveApi, LiveApiError, type FetchLike } from '../src/live/api';

type Call = { url: string; method: string; headers: Record<string, string>; body?: string };

/** `fetch` de mentira: registra el pedido y responde con lo que le pidan. */
function recorder(respond: (call: Call) => { status: number; body: string }) {
  const calls: Call[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    const call: Call = {
      url,
      method: init?.method ?? 'GET',
      headers: init?.headers ?? {},
      body: init?.body,
    };
    calls.push(call);
    const { status, body } = respond(call);
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => body,
    };
  };
  return { fetchImpl, calls };
}

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

describe('cliente de la API', () => {
  it('concatena la base sin barras dobles y no inventa hosts', async () => {
    const { fetchImpl, calls } = recorder(() => ({ status: 200, body: '{"profiles":[]}' }));
    const api = createLiveApi({ baseUrl: '/api', fetchImpl });
    await api.listProfiles('mx');
    expect(calls[0].url).toBe('/api/demo/profiles?regionKey=mx');
  });

  it('mandar el token es un header, nunca la query', async () => {
    const { fetchImpl, calls } = recorder((call) => {
      if (call.url.endsWith('/auth/demo-session')) {
        return { status: 201, body: JSON.stringify(SESSION) };
      }
      return { status: 200, body: '{"profiles":[]}' };
    });
    const api = createLiveApi({ baseUrl: 'http://host:3000', fetchImpl });
    const session = await api.openSession('mx');
    expect(session.token).toBe('tok-1');
    expect(session.demoSlot).toBe(5);
    await api.listProfiles('mx');
    expect(calls[1].headers['authorization']).toBe('Bearer tok-1');
    expect(calls[1].url).not.toContain('tok-1');
  });

  it('no cachea ni manda credenciales del navegador', async () => {
    const { fetchImpl, calls } = recorder(() => ({ status: 200, body: '{"results":[]}' }));
    const api = createLiveApi({ baseUrl: '/api', fetchImpl });
    await api.discovery({ radiusM: 5000 });
    expect(calls[0].headers['accept']).toBe('application/json');
    expect(calls[0].method).toBe('GET');
  });

  it('`inUse` y el resto de la fila llegan tal cual', async () => {
    const { fetchImpl } = recorder(() => ({
      status: 200,
      body: JSON.stringify({ profiles: [{ ...PROFILE, inUse: true }] }),
    }));
    const api = createLiveApi({ baseUrl: '/api', fetchImpl });
    const rows = await api.listProfiles('mx');
    expect(rows).toHaveLength(1);
    expect(rows[0].inUse).toBe(true);
    expect(rows[0].profileId).toBe('mx-p01');
  });

  it('la query de discovery sólo manda los filtros activos', async () => {
    const { fetchImpl, calls } = recorder(() => ({ status: 200, body: '{"results":[]}' }));
    const api = createLiveApi({ baseUrl: '/api', fetchImpl });
    await api.discovery({
      radiusM: 2000,
      intention: 'networking',
      verified: true,
      gender: undefined,
      online: undefined,
    });
    expect(calls[0].url).toBe('/api/discovery?radiusM=2000&intention=networking&verified=true');
  });

  it('un Problem del contrato se convierte en código, no en un status pelado', async () => {
    const { fetchImpl } = recorder(() => ({
      status: 409,
      body: JSON.stringify({ code: 'PROFILE_IN_USE', title: 'Profile in use' }),
    }));
    const api = createLiveApi({ baseUrl: '/api', fetchImpl });
    await expect(api.claimSlot('mx', 3)).rejects.toMatchObject({
      name: 'LiveApiError',
      status: 409,
      code: 'PROFILE_IN_USE',
    });
  });

  it('un error sin body no pierde el status', async () => {
    const { fetchImpl } = recorder(() => ({ status: 502, body: '' }));
    const api = createLiveApi({ baseUrl: '/api', fetchImpl });
    const error = await api.listProfiles('mx').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(LiveApiError);
    expect((error as LiveApiError).code).toBe('HTTP_502');
  });

  it('204 sin body no rompe el parseo', async () => {
    const { fetchImpl } = recorder((call) => {
      if (call.url.endsWith('/auth/demo-session')) {
        return { status: 201, body: JSON.stringify(SESSION) };
      }
      return { status: 204, body: '' };
    });
    const api = createLiveApi({ baseUrl: '/api', fetchImpl });
    await api.openSession('mx');
    await expect(api.logout()).resolves.toBeUndefined();
  });

  it('el ticket del stream viaja en la query, codificado', async () => {
    const api = createLiveApi({ baseUrl: '/api', fetchImpl: async () => ({ ok: true, status: 200, text: async () => '' }) });
    expect(api.streamUrl('a b/c+d')).toBe('/api/events?ticket=a%20b%2Fc%2Bd');
  });

  it('el polling omite el cursor cuando no hay nada aplicado', async () => {
    const { fetchImpl, calls } = recorder(() => ({
      status: 200,
      body: '{"events":[],"nextCursor":null,"hasMore":false}',
    }));
    const api = createLiveApi({ baseUrl: '/api', fetchImpl });
    const page = await api.poll(null);
    expect(calls[0].url).toBe('/api/events/poll?limit=100');
    expect(page).toEqual({ events: [], nextCursor: null, hasMore: false });

    await api.poll('mx:000000000007');
    expect(calls[1].url).toBe('/api/events/poll?cursor=mx%3A000000000007&limit=100');
  });

  it('el ticket del stream llega como string y vacío si el body no lo trae', async () => {
    const { fetchImpl } = recorder(() => ({ status: 201, body: '{"expiresAt":"x"}' }));
    const api = createLiveApi({ baseUrl: '/api', fetchImpl });
    expect(await api.streamTicket()).toBe('');
  });
});

describe('presencia', () => {
  it('con punto manda `point` y devuelve la proyección sin coordenadas', async () => {
    const { fetchImpl, calls } = recorder(() => ({
      status: 200,
      body: JSON.stringify({
        profileId: 'mx-p05',
        regionKey: 'mx',
        zoneKey: 'cdmx',
        online: true,
        fallbackRequired: false,
      }),
    }));
    const api = createLiveApi({ baseUrl: '/api', fetchImpl });
    const presence = await api.presence({ point: { lat: 19.432608, lng: -99.13321 } });

    expect(calls[0].method).toBe('PUT');
    expect(calls[0].url).toBe('/api/presence');
    expect(JSON.parse(String(calls[0].body))).toEqual({
      point: { lat: 19.432608, lng: -99.13321 },
    });
    expect(presence).toEqual({
      regionKey: 'mx',
      zoneKey: 'cdmx',
      online: true,
      visibility: 'visible',
      fallbackRequired: false,
      status: 200,
    });
  });

  it('con zona demo manda sólo `demoZoneKey`: nunca las dos cosas', async () => {
    const { fetchImpl, calls } = recorder(() => ({
      status: 200,
      body: JSON.stringify({
        profileId: 'mx-p05',
        regionKey: 'mx',
        zoneKey: 'cdmx',
        online: true,
        fallbackRequired: false,
      }),
    }));
    const api = createLiveApi({ baseUrl: '/api', fetchImpl });
    await api.presence({ demoZoneKey: 'cdmx' });
    expect(JSON.parse(String(calls[0].body))).toEqual({ demoZoneKey: 'cdmx' });
  });

  it('un punto fuera de zona se lee como fallback, no como error', async () => {
    const { fetchImpl } = recorder(() => ({
      status: 200,
      body: JSON.stringify({
        profileId: 'mx-p05',
        regionKey: 'mx',
        zoneKey: null,
        online: true,
        fallbackRequired: true,
      }),
    }));
    const api = createLiveApi({ baseUrl: '/api', fetchImpl });
    const presence = await api.presence({ point: { lat: -34.5889, lng: -58.4306 } });
    expect(presence.fallbackRequired).toBe(true);
    expect(presence.zoneKey).toBeNull();
  });
});

describe('cliente de chat', () => {
  const MESSAGE = {
    id: '11111111-1111-4111-8111-111111111111',
    matchId: '22222222-2222-4222-8222-222222222222',
    senderProfileId: 'mx-p05',
    clientMessageId: 'cm-1',
    body: 'hola',
    createdAt: '2026-11-13T17:00:00.000Z',
  };

  it('GET /matches devuelve la fila con peer, último mensaje y no leídos', async () => {
    const { fetchImpl, calls } = recorder(() => ({
      status: 200,
      body: JSON.stringify({
        matches: [
          {
            match: {
              id: MESSAGE.matchId,
              profileIds: ['mx-p02-b1', 'mx-p05'],
              createdAt: '2026-11-13T16:00:00.000Z',
            },
            peer: {
              profileId: 'mx-p02-b1',
              nickname: 'Fran',
              initials: 'FR',
              intention: 'friendship',
              photoId: 'ph02',
              sourceType: 'bot',
            },
            lastMessage: MESSAGE,
            unreadCount: 3,
          },
        ],
      }),
    }));
    const api = createLiveApi({ baseUrl: '/api', fetchImpl });
    const matches = await api.listMatches();
    expect(calls[0].url).toBe('/api/matches');
    expect(matches).toHaveLength(1);
    expect(matches[0].peer.sourceType).toBe('bot');
    expect(matches[0].lastMessage?.body).toBe('hola');
    expect(matches[0].unreadCount).toBe(3);
  });

  it('un match sin mensajes mantiene `lastMessage: null`', async () => {
    const { fetchImpl } = recorder(() => ({
      status: 200,
      body: JSON.stringify({
        matches: [
          {
            match: { id: 'm1', profileIds: ['a', 'b'], createdAt: '2026-11-13T16:00:00.000Z' },
            peer: {
              profileId: 'a',
              nickname: 'Ana',
              initials: 'AN',
              intention: 'friendship',
              photoId: 'ph01',
              sourceType: 'human',
            },
            lastMessage: null,
            unreadCount: 0,
          },
        ],
      }),
    }));
    const api = createLiveApi({ baseUrl: '/api', fetchImpl });
    const matches = await api.listMatches();
    expect(matches[0].lastMessage).toBeNull();
  });

  it('GET messages manda el cursor opaco tal cual y no lo interpreta', async () => {
    const { fetchImpl, calls } = recorder(() => ({
      status: 200,
      body: JSON.stringify({ messages: [MESSAGE], nextCursor: 'a/b+c=', hasMore: true }),
    }));
    const api = createLiveApi({ baseUrl: '/api', fetchImpl });
    const page = await api.listMessages('m 1', null);
    expect(calls[0].url).toBe('/api/matches/m%201/messages');
    expect(page.messages).toHaveLength(1);
    expect(page.hasMore).toBe(true);

    const next = await api.listMessages('m1', page.nextCursor);
    expect(calls[1].url).toBe('/api/matches/m1/messages?cursor=a%2Fb%2Bc%3D');
    expect(next.nextCursor).toBe('a/b+c=');
  });

  it('POST message manda sólo `clientMessageId` y `body`', async () => {
    const { fetchImpl, calls } = recorder(() => ({
      status: 201,
      body: JSON.stringify(MESSAGE),
    }));
    const api = createLiveApi({ baseUrl: '/api', fetchImpl });
    const message = await api.sendMessage('m1', 'cm-1', 'hola');
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toBe('/api/matches/m1/messages');
    expect(JSON.parse(String(calls[0].body))).toEqual({ clientMessageId: 'cm-1', body: 'hola' });
    expect(message.clientMessageId).toBe('cm-1');
  });

  it('POST read es 204 y no devuelve cuerpo', async () => {
    const { fetchImpl, calls } = recorder(() => ({ status: 204, body: '' }));
    const api = createLiveApi({ baseUrl: '/api', fetchImpl });
    await expect(api.markMatchRead('m1')).resolves.toBeUndefined();
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toBe('/api/matches/m1/read');
  });

  it('un 403 CHAT_BLOCKED se lee por `code`, no por el status', async () => {
    const { fetchImpl } = recorder(() => ({
      status: 403,
      body: '{"code":"CHAT_BLOCKED","detail":"el par está bloqueado"}',
    }));
    const api = createLiveApi({ baseUrl: '/api', fetchImpl });
    await expect(api.sendMessage('m1', 'cm-1', 'hola')).rejects.toMatchObject({
      code: 'CHAT_BLOCKED',
      status: 403,
    });
  });
});
