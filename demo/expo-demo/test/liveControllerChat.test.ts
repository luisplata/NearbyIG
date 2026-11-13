import { afterEach, describe, expect, it, vi } from 'vitest';

import { createLiveController, type EventSourceLike } from '../src/live/controller';
import type { LiveSettings } from '../src/live/config';
import type { LiveMessage } from '../src/live/types';

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

const PEER_BOT = {
  profileId: 'mx-p02-b1',
  nickname: 'Fran',
  initials: 'FR',
  intention: 'friendship',
  photoId: 'ph02',
  sourceType: 'bot',
};

const PEER_HUMAN = {
  profileId: 'mx-p02',
  nickname: 'Nico',
  initials: 'NI',
  intention: 'friendship',
  photoId: 'ph02',
  sourceType: 'human',
};

type MatchRowState = {
  id: string;
  peer: typeof PEER_BOT;
  createdAt: string;
  unreadCount: number;
  messages: LiveMessage[];
};

/**
 * Backend de mentira del chat: dos matches (uno con bot y uno humano), página
 * real con cursor y `read` que apaga el `unreadCount`. No reimplementa la lógica
 * del controller: es el mínimo para ejercer apertura, envío, reconciliación,
 * paginación y la respuesta del bot.
 */
function makeChatServer(options: { pageSize?: number } = {}) {
  const pageSize = options.pageSize ?? 50;
  const matches: MatchRowState[] = [
    {
      id: 'match-bot',
      peer: PEER_BOT,
      createdAt: '2026-11-13T16:00:00.000Z',
      unreadCount: 2,
      messages: [
        {
          id: 'msg-b1',
          matchId: 'match-bot',
          senderProfileId: 'mx-p02-b1',
          clientMessageId: 'cm-b1',
          body: 'hola, soy Fran',
          createdAt: '2026-11-13T15:59:00.000Z',
        },
        {
          id: 'msg-b2',
          matchId: 'match-bot',
          senderProfileId: 'mx-p02-b1',
          clientMessageId: 'cm-b2',
          body: '¿qué tal?',
          createdAt: '2026-11-13T15:59:30.000Z',
        },
      ],
    },
    {
      id: 'match-human',
      peer: PEER_HUMAN,
      createdAt: '2026-11-13T14:00:00.000Z',
      unreadCount: 0,
      messages: [],
    },
  ];
  const sends: { matchId: string; clientMessageId: string; body: string }[] = [];
  const reads: string[] = [];
  let seq = 100;
  let failSend: { status: number; code: string } | null = null;

  const asItem = (match: MatchRowState) => ({
    match: {
      id: match.id,
      profileIds: [SESSION.profileId, match.peer.profileId].sort(),
      createdAt: match.createdAt,
    },
    peer: match.peer,
    lastMessage: match.messages.at(-1) ?? null,
    unreadCount: match.unreadCount,
  });

  const page = (match: MatchRowState, cursor: string | null) => {
    const start = cursor === null ? 0 : Number(cursor);
    const slice = match.messages.slice(start, start + pageSize);
    const next = start + pageSize < match.messages.length ? String(start + pageSize) : null;
    return { messages: slice, nextCursor: next, hasMore: next !== null };
  };

  const fetchImpl = async (url: string, init?: { method?: string; body?: string }) => {
    const method = init?.method ?? 'GET';
    const path = url.split('?')[0];
    const query = url.includes('?') ? url.split('?')[1] : '';

    if (method === 'POST' && path === '/api/auth/demo-session') {
      return ok(201, SESSION);
    }
    if (method === 'POST' && path === '/api/auth/stream-ticket') {
      return ok(201, { ticket: 't1' });
    }
    if (method === 'POST' && path === '/api/auth/logout') {
      return { ok: true, status: 204, text: async () => '' };
    }
    if (method === 'PUT' && path === '/api/presence') {
      return ok(200, {
        profileId: SESSION.profileId,
        regionKey: 'mx',
        zoneKey: 'cdmx',
        online: true,
        fallbackRequired: false,
      });
    }
    if (method === 'GET' && path === '/api/demo/profiles') {
      return ok(200, { profiles: [ROW('mx-p02'), ROW('mx-p02-b1'), ROW(SESSION.profileId)] });
    }
    if (method === 'GET' && path === '/api/discovery') {
      return ok(200, { results: [ROW('mx-p02'), ROW('mx-p02-b1')] });
    }
    if (method === 'GET' && path === '/api/me') {
      return { ok: false, status: 404, text: async () => '{"code":"NOT_FOUND"}' };
    }
    if (method === 'GET' && path === '/api/events/poll') {
      return ok(200, { events: [], nextCursor: null, hasMore: false });
    }
    if (method === 'GET' && path === '/api/pings') {
      return ok(200, { pings: [] });
    }
    if (method === 'GET' && path === '/api/matches') {
      return ok(200, { matches: matches.map(asItem) });
    }
    const matchRoute = /^\/api\/matches\/([^/]+)\/(messages|read)$/.exec(path);
    if (matchRoute !== null) {
      const matchId = decodeURIComponent(matchRoute[1]);
      const action = matchRoute[2];
      const match = matches.find((candidate) => candidate.id === matchId);
      if (match === undefined) {
        return { ok: false, status: 404, text: async () => '{"code":"MATCH_NOT_FOUND"}' };
      }
      if (action === 'read' && method === 'POST') {
        reads.push(matchId);
        match.unreadCount = 0;
        return { ok: true, status: 204, text: async () => '' };
      }
      if (action === 'messages' && method === 'GET') {
        const cursor = new URLSearchParams(query).get('cursor');
        return ok(200, page(match, cursor));
      }
      if (action === 'messages' && method === 'POST') {
        const body = JSON.parse(String(init?.body)) as {
          clientMessageId: string;
          body: string;
        };
        if (failSend !== null) {
          const { status, code } = failSend;
          return { ok: false, status, text: async () => JSON.stringify({ code }) };
        }
        const existing = match.messages.find(
          (message) => message.clientMessageId === body.clientMessageId,
        );
        if (existing !== undefined) {
          // Idempotencia del contrato: la misma clave devuelve el mismo mensaje.
          return ok(200, existing);
        }
        seq += 1;
        const message: LiveMessage = {
          id: `msg-new-${seq}`,
          matchId,
          senderProfileId: SESSION.profileId,
          clientMessageId: body.clientMessageId,
          body: body.body.trim(),
          createdAt: new Date(2026, 10, 13, 17, seq - 99).toISOString(),
        };
        match.messages.push(message);
        sends.push({ matchId, clientMessageId: body.clientMessageId, body: body.body });
        return ok(201, message);
      }
    }
    return { ok: false, status: 404, text: async () => '{"code":"NOT_FOUND"}' };
  };

  return {
    fetchImpl,
    matches,
    sends,
    reads,
    match: (id: string) => matches.find((candidate) => candidate.id === id)!,
    failSendWith: (status: number, code: string) => {
      failSend = { status, code };
    },
    clearSendFailure: () => {
      failSend = null;
    },
    /** El bot contesta: se agrega su mensaje y el evento es lo que lo hace visible. */
    botReplies: (matchId: string, body: string): LiveMessage => {
      const match = matches.find((candidate) => candidate.id === matchId)!;
      seq += 1;
      const message: LiveMessage = {
        id: `msg-bot-${seq}`,
        matchId,
        senderProfileId: match.peer.profileId,
        clientMessageId: `cm-bot-${seq}`,
        body,
        createdAt: new Date(2026, 10, 13, 18, seq - 99).toISOString(),
      };
      match.messages.push(message);
      match.unreadCount += 1;
      return message;
    },
  };

  function ok(status: number, payload: unknown) {
    return { ok: true, status, text: async () => JSON.stringify(payload) };
  }
}

type Stub = EventSourceLike & {
  open: () => void;
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

function makeController(server: ReturnType<typeof makeChatServer>, stream = makeStream()) {
  const controller = createLiveController({
    settings: SETTINGS,
    initialZoneKey: 'cdmx',
    fetchImpl: server.fetchImpl as never,
    createEventSource: stream.factory,
    pollMs: 60_000,
    heartbeatMs: 60_000,
    reseedMs: 60_000,
    pingsMs: 60_000,
    watchdogTickMs: 60_000,
  });
  return { controller, stream };
}

const event = (seq: number, type: string, payload: Record<string, unknown>) =>
  JSON.stringify({
    id: `mx:${String(seq).padStart(12, '0')}`,
    type,
    occurredAt: '2026-11-13T17:00:00.000Z',
    payload,
  });

afterEach(() => {
  vi.useRealTimers();
});

describe('chat real en el controller', () => {
  it('la bandeja de matches llega al arrancar con preview y no leídos', async () => {
    const server = makeChatServer();
    const { controller, stream } = makeController(server);
    await controller.start();
    stream.instances[0].open();
    await vi.waitFor(() => {
      expect(controller.getState().matches).toHaveLength(2);
    });

    const [bot, human] = controller.getState().matches;
    expect(bot.match.id).toBe('match-bot');
    expect(bot.peer.sourceType).toBe('bot');
    expect(bot.lastMessage?.body).toBe('¿qué tal?');
    expect(bot.unreadCount).toBe(2);
    expect(human.lastMessage).toBeNull();
    await controller.stop();
  });

  it('abrir un match trae el historial ascendente y marca leído', async () => {
    const server = makeChatServer();
    const { controller, stream } = makeController(server);
    await controller.start();
    stream.instances[0].open();

    const result = await controller.openChat('match-bot');
    expect(result).toEqual({ ok: true, code: null });

    const chat = controller.getState().chat;
    expect(chat?.matchId).toBe('match-bot');
    expect(chat?.peer?.nickname).toBe('Fran');
    expect(chat?.messages.map((message) => message.body)).toEqual([
      'hola, soy Fran',
      '¿qué tal?',
    ]);
    expect(chat?.loading).toBe(false);
    // El historial del bot no es mío: `mine` sale de la sesión, no del remitente.
    expect(chat?.messages.every((message) => !message.mine)).toBe(true);

    expect(server.reads).toEqual(['match-bot']);
    const row = controller.getState().matches.find((item) => item.match.id === 'match-bot');
    expect(row?.unreadCount).toBe(0);
    await controller.stop();
  });

  it('enviar es optimista y se reconcilia por clientMessageId: una sola burbuja', async () => {
    const server = makeChatServer();
    const { controller, stream } = makeController(server);
    await controller.start();
    stream.instances[0].open();
    await controller.openChat('match-human');

    const result = await controller.sendChatMessage('match-human', '  hola  ');
    expect(result).toEqual({ ok: true, code: null });

    const messages = controller.getState().chat?.messages ?? [];
    expect(messages).toHaveLength(1);
    expect(messages[0].mine).toBe(true);
    expect(messages[0].status).toBe('sent');
    expect(messages[0].id).not.toBeNull();
    // El texto viaja tal cual; el recorte de bordes es del server.
    expect(server.sends[0].body).toBe('  hola  ');
    expect(server.sends[0].clientMessageId).toBe(messages[0].clientMessageId);
    await controller.stop();
  });

  it('reintentar con la misma clave no duplica ni crea otro mensaje en el server', async () => {
    const server = makeChatServer();
    const { controller, stream } = makeController(server);
    await controller.start();
    stream.instances[0].open();
    await controller.openChat('match-human');

    await controller.sendChatMessage('match-human', 'hola');
    const first = controller.getState().chat!.messages[0];
    // Reintento explícito con la clave ya confirmada: el server responde el mismo.
    await controller.sendChatMessage('match-human', 'hola', first.clientMessageId);

    const messages = controller.getState().chat!.messages;
    expect(messages).toHaveLength(1);
    expect(messages[0].key).toBe(first.key);
    expect(server.sends).toHaveLength(1);
    await controller.stop();
  });

  it('un error del server deja la burbuja fallida con su código', async () => {
    const server = makeChatServer();
    const { controller, stream } = makeController(server);
    await controller.start();
    stream.instances[0].open();
    await controller.openChat('match-human');
    server.failSendWith(403, 'CHAT_BLOCKED');

    const result = await controller.sendChatMessage('match-human', 'hola');
    expect(result).toEqual({ ok: false, code: 'CHAT_BLOCKED' });

    const chat = controller.getState().chat;
    expect(chat?.error).toBe('CHAT_BLOCKED');
    expect(chat?.messages).toHaveLength(1);
    expect(chat?.messages[0].status).toBe('failed');
    expect(chat?.messages[0].id).toBeNull();
    await controller.stop();
  });

  it('reintentar después de un fallo reusa la clave y confirma la misma burbuja', async () => {
    const server = makeChatServer();
    const { controller, stream } = makeController(server);
    await controller.start();
    stream.instances[0].open();
    await controller.openChat('match-human');
    server.failSendWith(422, 'VALIDATION_FAILED');
    await controller.sendChatMessage('match-human', 'hola');

    const failed = controller.getState().chat!.messages[0];
    expect(failed.status).toBe('failed');

    server.clearSendFailure();
    const retry = await controller.sendChatMessage(
      'match-human',
      failed.body,
      failed.clientMessageId,
    );
    expect(retry.ok).toBe(true);
    const messages = controller.getState().chat!.messages;
    expect(messages).toHaveLength(1);
    expect(messages[0].status).toBe('sent');
    expect(messages[0].clientMessageId).toBe(failed.clientMessageId);
    await controller.stop();
  });

  it('el bot responde solo: el evento message.created trae su mensaje', async () => {
    const server = makeChatServer();
    const { controller, stream } = makeController(server);
    await controller.start();
    stream.instances[0].open();
    await controller.openChat('match-bot');
    await controller.sendChatMessage('match-bot', 'todo bien');

    const reply = server.botReplies('match-bot', 'mensaje fijo del bot');
    stream.instances[0].emit(
      'message.created',
      event(120, 'message.created', { matchId: 'match-bot', messageId: reply.id }),
    );

    await vi.waitFor(() => {
      expect(controller.getState().chat?.messages.at(-1)?.body).toBe('mensaje fijo del bot');
    });
    const messages = controller.getState().chat!.messages;
    expect(messages).toHaveLength(4);
    expect(messages.at(-1)?.mine).toBe(false);
    // El pedido propio no se duplicó: sigue habiendo una sola burbuja suya.
    expect(messages.filter((message) => message.body === 'todo bien')).toHaveLength(1);
    await controller.stop();
  });

  it('el mismo mensaje llega por polling y no duplica: la clave es la misma', async () => {
    const server = makeChatServer();
    const { controller, stream } = makeController(server);
    await controller.start();
    stream.instances[0].open();
    await controller.openChat('match-human');
    await controller.sendChatMessage('match-human', 'hola');
    const confirmed = controller.getState().chat!.messages[0];

    // Una relectura de la página y un evento con el mismo contenido no suman filas.
    await controller.refreshChat();
    stream.instances[0].emit(
      'message.created',
      event(121, 'message.created', { matchId: 'match-human', messageId: confirmed.id }),
    );
    await vi.waitFor(() => {
      expect(controller.getState().chat?.messages).toHaveLength(1);
    });
    await controller.stop();
  });

  it('la paginación recorre la conversación y sólo deja cola cuando queda', async () => {
    const server = makeChatServer({ pageSize: 1 });
    const { controller, stream } = makeController(server);
    await controller.start();
    stream.instances[0].open();

    // 11 mensajes: el tope de 10 páginas deja uno pendiente y "cargar más" sirve.
    const target = server.match('match-bot');
    for (let index = 0; index < 9; index += 1) {
      const minute = String(index).padStart(2, '0');
      target.messages.push({
        id: `msg-extra-${index}`,
        matchId: 'match-bot',
        senderProfileId: 'mx-p02-b1',
        clientMessageId: `cm-extra-${index}`,
        body: `extra ${index}`,
        createdAt: `2026-11-13T15:${minute}:00.000Z`,
      });
    }

    await controller.openChat('match-bot');
    expect(controller.getState().chat?.messages).toHaveLength(10);
    expect(controller.getState().chat?.hasMore).toBe(true);

    await controller.loadMoreMessages();
    expect(controller.getState().chat?.messages).toHaveLength(11);
    expect(controller.getState().chat?.hasMore).toBe(false);

    // Sin más páginas, pedir otra vez no pide nada.
    await controller.loadMoreMessages();
    expect(controller.getState().chat?.messages).toHaveLength(11);
    await controller.stop();
  });

  it('abrir un match inexistente devuelve el código del server', async () => {
    const server = makeChatServer();
    const { controller, stream } = makeController(server);
    await controller.start();
    stream.instances[0].open();

    const result = await controller.openChat('match-fantasma');
    expect(result).toEqual({ ok: false, code: 'MATCH_NOT_FOUND' });
    expect(controller.getState().chat?.error).toBe('MATCH_NOT_FOUND');
    await controller.stop();
  });

  it('sin sesión no hay chat: el estado arranca nulo y closeChat lo cierra', async () => {
    const server = makeChatServer();
    const { controller, stream } = makeController(server);
    expect(controller.getState().chat).toBeNull();
    await controller.start();
    stream.instances[0].open();
    await controller.openChat('match-human');
    expect(controller.getState().chat).not.toBeNull();

    controller.closeChat();
    expect(controller.getState().chat).toBeNull();
    await controller.stop();
  });

  it('un texto vacío no se manda ni crea burbuja', async () => {
    const server = makeChatServer();
    const { controller, stream } = makeController(server);
    await controller.start();
    stream.instances[0].open();
    await controller.openChat('match-human');

    const result = await controller.sendChatMessage('match-human', '   ');
    expect(result).toEqual({ ok: false, code: 'VALIDATION_FAILED' });
    expect(controller.getState().chat?.messages).toEqual([]);
    expect(server.sends).toEqual([]);
    await controller.stop();
  });
});
