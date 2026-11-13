import { describe, expect, it } from 'vitest';

import { createLiveApi, type FetchLike } from '../src/live/api';
import {
  canResolve,
  formatPingTime,
  newPendingPeers,
  pendingCount,
  pingErrorKey,
  pingForPeer,
  pingSendBlock,
  toPingRow,
  toPingRows,
} from '../src/live/pings';
import type { LivePing, LivePingPeer } from '../src/live/types';

type Call = { url: string; method: string; body?: string };

function recorder(respond: (call: Call) => { status: number; body: string }) {
  const calls: Call[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    const call: Call = { url, method: init?.method ?? 'GET', body: init?.body };
    calls.push(call);
    const { status, body } = respond(call);
    return { ok: status >= 200 && status < 300, status, text: async () => body };
  };
  return { fetchImpl, calls };
}

const PING: LivePing = {
  id: '11111111-1111-4111-8111-111111111111',
  fromProfileId: 'mx-p04',
  toProfileId: 'mx-p02',
  status: 'pending',
  createdAt: '2026-11-13T16:15:33.416Z',
  expiresAt: '2026-11-14T16:15:33.416Z',
  matchId: null,
};

const PEER: LivePingPeer = {
  profileId: 'mx-p02',
  nickname: 'Nico',
  initials: 'NI',
  intention: 'friendship',
  photoId: 'ph02',
  sourceType: 'human',
};

const ITEM = { ping: PING, peer: PEER };

describe('cliente de pings', () => {
  it('crear un ping manda sólo el target y devuelve la fila', async () => {
    const { fetchImpl, calls } = recorder(() => ({ status: 201, body: JSON.stringify(PING) }));
    const api = createLiveApi({ baseUrl: 'http://host:3000', fetchImpl });
    const ping = await api.createPing('mx-p02');
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toBe('http://host:3000/pings');
    expect(JSON.parse(String(calls[0].body))).toEqual({ targetProfileId: 'mx-p02' });
    expect(ping).toEqual(PING);
  });

  it('un 409 del contrato llega como código, no como status pelado', async () => {
    const { fetchImpl } = recorder(() => ({
      status: 409,
      body: JSON.stringify({ code: 'PING_DUPLICATE', title: 'Ping duplicate' }),
    }));
    const api = createLiveApi({ baseUrl: '/api', fetchImpl });
    await expect(api.createPing('mx-p02')).rejects.toMatchObject({
      name: 'LiveApiError',
      status: 409,
      code: 'PING_DUPLICATE',
    });
  });

  it('la bandeja pide el box explícito y anida ping + peer', async () => {
    const { fetchImpl, calls } = recorder(() => ({
      status: 200,
      body: JSON.stringify({ pings: [ITEM] }),
    }));
    const api = createLiveApi({ baseUrl: '/api', fetchImpl });
    const inbox = await api.listPings('inbox');
    expect(calls[0].url).toBe('/api/pings?box=inbox');
    expect(inbox).toEqual([ITEM]);

    await api.listPings('sent');
    expect(calls[1].url).toBe('/api/pings?box=sent');
  });

  it('una fila inválida se descarta sin tirar la bandeja', async () => {
    const { fetchImpl } = recorder(() => ({
      status: 200,
      body: JSON.stringify({ pings: [ITEM, { ping: { id: '' }, peer: PEER }, { ping: PING }] }),
    }));
    const api = createLiveApi({ baseUrl: '/api', fetchImpl });
    expect(await api.listPings('inbox')).toHaveLength(1);
  });

  it('accept devuelve el match y reject no espera body', async () => {
    const { fetchImpl, calls } = recorder((call) => {
      if (call.url.endsWith('/accept')) {
        return {
          status: 200,
          body: JSON.stringify({
            id: 'm1',
            profileIds: ['mx-p02', 'mx-p04'],
            createdAt: '2026-11-13T16:20:00.000Z',
          }),
        };
      }
      return { status: 204, body: '' };
    });
    const api = createLiveApi({ baseUrl: '/api', fetchImpl });
    const match = await api.acceptPing(PING.id);
    expect(match.profileIds).toEqual(['mx-p02', 'mx-p04']);
    expect(calls[0].url).toBe(`/api/pings/${PING.id}/accept`);

    await expect(api.rejectPing(PING.id)).resolves.toBeUndefined();
    expect(calls[1].method).toBe('POST');
    expect(calls[1].url).toBe(`/api/pings/${PING.id}/reject`);
  });

  it('`/me` ausente (404) es `null`, no un error de sesión', async () => {
    const { fetchImpl } = recorder(() => ({ status: 404, body: '{"code":"NOT_FOUND"}' }));
    const api = createLiveApi({ baseUrl: '/api', fetchImpl });
    expect(await api.me()).toBeNull();
  });

  it('`/me` acepta la fila pelada y la envuelta en `profile`', async () => {
    const row = {
      profileId: 'mx-p04',
      nickname: 'Sofi',
      initials: 'SO',
      intention: 'networking',
      gender: 'female',
      verified: false,
      online: true,
      photoId: 'ph04',
      instagramHandle: 'sofi.cafe',
      statusKey: 'status.p04',
      bioKey: 'bio.p04',
    };
    const flat = recorder(() => ({ status: 200, body: JSON.stringify(row) }));
    expect((await createLiveApi({ baseUrl: '/api', fetchImpl: flat.fetchImpl }).me())?.profileId).toBe(
      'mx-p04',
    );

    const nested = recorder(() => ({ status: 200, body: JSON.stringify({ profile: row }) }));
    expect(
      (await createLiveApi({ baseUrl: '/api', fetchImpl: nested.fetchImpl }).me())?.nickname,
    ).toBe('Sofi');
  });
});

describe('adapter de pings', () => {
  it('mapea la fila con su dirección y el peer que dibuja la UI', () => {
    const row = toPingRow(ITEM, 'inbox')!;
    expect(row).toEqual({
      id: PING.id,
      box: 'inbox',
      status: 'pending',
      createdAt: PING.createdAt,
      expiresAt: PING.expiresAt,
      matchId: null,
      peer: PEER,
    });
  });

  it('descarta filas sin id, con estado inventado o sin peer dibujable', () => {
    expect(toPingRow({ ping: { ...PING, id: '' }, peer: PEER }, 'inbox')).toBeNull();
    expect(
      toPingRow({ ping: { ...PING, status: 'maybe' as never }, peer: PEER }, 'inbox'),
    ).toBeNull();
    expect(toPingRow({ ping: PING, peer: { ...PEER, nickname: '' } }, 'inbox')).toBeNull();
  });

  it('ordena más nuevo primero y desempata por id', () => {
    const older = { ...PING, id: 'a', createdAt: '2026-11-13T10:00:00.000Z' };
    const newer = { ...PING, id: 'b', createdAt: '2026-11-13T12:00:00.000Z' };
    const sameTime = { ...PING, id: 'c', createdAt: '2026-11-13T12:00:00.000Z' };
    const rows = toPingRows(
      [
        { ping: older, peer: PEER },
        { ping: newer, peer: { ...PEER, profileId: 'mx-p03', nickname: 'Mica' } },
        { ping: sameTime, peer: { ...PEER, profileId: 'mx-p05', nickname: 'Lean' } },
      ],
      'sent',
    );
    expect(rows.map((row) => row.id)).toEqual(['c', 'b', 'a']);
    expect(rows.every((row) => row.box === 'sent')).toBe(true);
  });

  it('cuenta pendientes y encuentra el ping de un par', () => {
    const rows = toPingRows([ITEM], 'sent');
    expect(pendingCount(rows)).toBe(1);
    expect(pingForPeer(rows, 'mx-p02')?.id).toBe(PING.id);
    expect(pingForPeer(rows, 'mx-p09')).toBeNull();
  });

  it('un ping aceptado no bloquea como pendiente pero sí como match', () => {
    const accepted = toPingRow({ ping: { ...PING, status: 'accepted', matchId: 'm1' }, peer: PEER }, 'sent')!;
    expect(pendingCount([accepted])).toBe(0);
    expect(pingSendBlock(accepted)).toBe('matched');
    expect(pingSendBlock(toPingRow(ITEM, 'sent'))).toBe('sent');
    expect(pingSendBlock(null)).toBeNull();
  });

  it('sólo los recibidos pendientes se pueden resolver', () => {
    const inbox = toPingRow(ITEM, 'inbox')!;
    expect(canResolve(inbox)).toBe(true);
    expect(canResolve({ ...inbox, box: 'sent' })).toBe(false);
    expect(canResolve({ ...inbox, status: 'expired' })).toBe(false);
  });

  it('un ping nuevo avisa una sola vez; el que ya estaba o se aceptó no', () => {
    const pending = toPingRows([ITEM], 'inbox');
    const other = toPingRows([{ ping: { ...PING, id: 'b' }, peer: { ...PEER, profileId: 'mx-p03' } }], 'inbox');
    expect(newPendingPeers([], pending)).toEqual(['mx-p02']);
    expect(newPendingPeers(pending, pending)).toEqual([]);
    expect(newPendingPeers(pending, [...pending, ...other])).toEqual(['mx-p03']);
    expect(
      newPendingPeers(pending, toPingRows([{ ping: { ...PING, status: 'accepted' }, peer: PEER }], 'inbox')),
    ).toEqual([]);
  });

  it('cada código de error tiene su texto y el desconocido cae al genérico', () => {
    expect(pingErrorKey('PING_DUPLICATE')).toBe('errorDuplicate');
    expect(pingErrorKey('PING_EXPIRED')).toBe('errorExpired');
    expect(pingErrorKey('PING_RESOLVED')).toBe('errorResolved');
    expect(pingErrorKey('PROFILE_NOT_FOUND')).toBe('errorTarget');
    expect(pingErrorKey('RATE_LIMITED')).toBe('errorRate');
    expect(pingErrorKey('HTTP_503')).toBe('errorGeneric');
    expect(pingErrorKey(null)).toBe('errorGeneric');
  });

  it('la hora de la fila no rompe con un createdAt inválido', () => {
    expect(formatPingTime('2026-11-13T16:15:33.416Z')).toMatch(/^\d{2}:\d{2}$/);
    expect(formatPingTime('')).toBe('');
    expect(formatPingTime('no-es-fecha')).toBe('');
  });
});
