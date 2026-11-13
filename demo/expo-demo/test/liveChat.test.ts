import { describe, expect, it } from 'vitest';

import {
  chatErrorKey,
  emptyChat,
  mergeChatMessages,
  newClientMessageId,
  optimisticMessage,
  setMessageStatus,
  toChatMessage,
  toMatchRow,
  toMatchRows,
  unreadMatchCount,
} from '../src/live/chat';
import type { LiveChatMessage, LiveMatchListItem, LiveMessage } from '../src/live/types';

const SELF = 'mx-p04';

const message = (overrides: Partial<LiveMessage> = {}): LiveMessage => ({
  id: 'msg-1',
  matchId: 'match-1',
  senderProfileId: SELF,
  clientMessageId: 'cm-1',
  body: 'hola',
  createdAt: '2026-11-13T16:00:00.000Z',
  ...overrides,
});

const peer = {
  profileId: 'mx-p02-b1',
  nickname: 'Fran',
  initials: 'FR',
  intention: 'friendship',
  photoId: 'ph02',
  sourceType: 'bot' as const,
};

const item = (overrides: Partial<LiveMatchListItem> = {}): LiveMatchListItem => ({
  match: { id: 'match-1', profileIds: [SELF, 'mx-p02-b1'], createdAt: '2026-11-13T16:00:00.000Z' },
  peer,
  lastMessage: null,
  unreadCount: 0,
  ...overrides,
});

describe('bandeja de matches', () => {
  it('un match sin mensajes es una fila válida con preview nulo', () => {
    const row = toMatchRow(item(), SELF);
    expect(row).not.toBeNull();
    expect(row?.preview).toBeNull();
    expect(row?.previewMine).toBeNull();
    expect(row?.unreadCount).toBe(0);
  });

  it('distingue el preview propio y el del otro', () => {
    const mine = toMatchRow(item({ lastMessage: message({ body: 'te espero' }) }), SELF);
    expect(mine?.preview).toBe('te espero');
    expect(mine?.previewMine).toBe(true);
    const theirs = toMatchRow(
      item({ lastMessage: message({ senderProfileId: 'mx-p02-b1', body: 'voy' }) }),
      SELF,
    );
    expect(theirs?.previewMine).toBe(false);
  });

  it('recorta un preview largo: la fila es de una línea', () => {
    const row = toMatchRow(item({ lastMessage: message({ body: 'x'.repeat(200) }) }), SELF);
    expect(row?.preview?.length).toBe(120);
    expect(row?.preview?.endsWith('…')).toBe(true);
  });

  it('descarta filas sin id o sin nombre: mejor una bandeja corta', () => {
    expect(toMatchRow(item({ match: { id: '', profileIds: [], createdAt: '' } }), SELF)).toBeNull();
    expect(toMatchRow(item({ peer: { ...peer, nickname: '' } }), SELF)).toBeNull();
    expect(toMatchRows([item(), item({ match: { id: '', profileIds: [], createdAt: '' } })], SELF)).toHaveLength(1);
  });

  it('no leídos: normaliza negativos y suma toda la bandeja', () => {
    expect(toMatchRow(item({ unreadCount: -3 }), SELF)?.unreadCount).toBe(0);
    const rows = toMatchRows(
      [item({ unreadCount: 2 }), item({ match: { id: 'm2', profileIds: [], createdAt: '' }, unreadCount: 3 })],
      SELF,
    );
    expect(unreadMatchCount(rows)).toBe(5);
  });
});

describe('mensajes', () => {
  it('el emisor propio se reconoce por la sesión', () => {
    expect(toChatMessage(message(), SELF).mine).toBe(true);
    expect(toChatMessage(message({ senderProfileId: 'mx-p02-b1' }), SELF).mine).toBe(false);
    expect(toChatMessage(message(), null).mine).toBe(false);
  });

  it('la clave de una burbuja confirmada es su clientMessageId', () => {
    expect(toChatMessage(message(), SELF).key).toBe('cm-1');
    expect(toChatMessage(message({ clientMessageId: '' }), SELF).key).toBe('msg-1');
  });

  it('la optimista nace enviando, sin id del server', () => {
    const bubble = optimisticMessage({
      clientMessageId: 'cm-9',
      senderProfileId: SELF,
      body: 'hola',
      createdAt: '2026-11-13T16:01:00.000Z',
    });
    expect(bubble.id).toBeNull();
    expect(bubble.status).toBe('sending');
    expect(bubble.mine).toBe(true);
    expect(bubble.key).toBe('cm-9');
  });

  it('reconciliar por clientMessageId: la confirmación reemplaza, no duplica', () => {
    const pending = optimisticMessage({
      clientMessageId: 'cm-1',
      senderProfileId: SELF,
      body: 'hola',
      createdAt: '2026-11-13T16:00:01.000Z',
    });
    const merged = mergeChatMessages([message()], [pending], SELF);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('msg-1');
    expect(merged[0].status).toBe('sent');
  });

  it('dos mensajes con el mismo texto no se confunden: manda la clave', () => {
    const a = message({ id: 'msg-1', clientMessageId: 'cm-1', body: 'ok' });
    const b = message({ id: 'msg-2', clientMessageId: 'cm-2', body: 'ok', createdAt: '2026-11-13T16:00:05.000Z' });
    const merged = mergeChatMessages([a, b], [], SELF);
    expect(merged.map((entry) => entry.key)).toEqual(['cm-1', 'cm-2']);
  });

  it('lo confirmado que ya estaba se conserva aunque la página no lo traiga', () => {
    const older = toChatMessage(
      message({ id: 'msg-0', clientMessageId: 'cm-0', createdAt: '2026-11-13T15:00:00.000Z' }),
      SELF,
    );
    const merged = mergeChatMessages([message()], [older], SELF);
    expect(merged.map((entry) => entry.id)).toEqual(['msg-0', 'msg-1']);
  });

  it('una burbuja optimista sin confirmar sobrevive al refresh y queda al final', () => {
    const pending = optimisticMessage({
      clientMessageId: 'cm-9',
      senderProfileId: SELF,
      body: 'sigo acá',
      createdAt: '2026-11-13T16:00:00.500Z',
    });
    const merged = mergeChatMessages([message()], [pending], SELF);
    expect(merged).toHaveLength(2);
    expect(merged[1].key).toBe('cm-9');
    expect(merged[1].status).toBe('sending');
  });

  it('ordena por la fecha del server y no por el orden en que llegó', () => {
    const late = message({ id: 'msg-3', clientMessageId: 'cm-3', createdAt: '2026-11-13T17:00:00.000Z' });
    const early = message({ id: 'msg-2', clientMessageId: 'cm-2', createdAt: '2026-11-13T16:30:00.000Z' });
    const merged = mergeChatMessages([late, early], [], SELF);
    expect(merged.map((entry) => entry.id)).toEqual(['msg-2', 'msg-3']);
  });

  it('un mensaje sin cuerpo o sin id del server no entra', () => {
    const merged = mergeChatMessages(
      [message({ body: '' }), message({ id: '', clientMessageId: 'cm-7' })],
      [],
      SELF,
    );
    expect(merged).toEqual([]);
  });

  it('marcar estado no toca otras burbujas ni las ya confirmadas', () => {
    const pending = optimisticMessage({
      clientMessageId: 'cm-9',
      senderProfileId: SELF,
      body: 'hola',
      createdAt: '2026-11-13T16:00:00.000Z',
    });
    const failed = setMessageStatus([pending], 'cm-9', 'failed');
    expect(failed[0].status).toBe('failed');
    // El mismo estado devuelve la misma referencia: el provider memoiza.
    expect(setMessageStatus(failed, 'cm-9', 'failed')).toBe(failed);
    const confirmed = toChatMessage(message({ clientMessageId: 'cm-9' }), SELF);
    expect(setMessageStatus([confirmed], 'cm-9', 'failed')[0].status).toBe('sent');
  });
});

describe('códigos y claves', () => {
  it('cada error del chat tiene su texto', () => {
    expect(chatErrorKey('CHAT_BLOCKED')).toBe('errorBlocked');
    expect(chatErrorKey('MATCH_CLOSED')).toBe('errorMatchClosed');
    expect(chatErrorKey('MATCH_NOT_FOUND')).toBe('errorMatchNotFound');
    expect(chatErrorKey('VALIDATION_FAILED')).toBe('errorValidation');
    expect(chatErrorKey('RATE_LIMITED')).toBe('errorRate');
    expect(chatErrorKey('SOMETHING_ELSE')).toBe('errorGeneric');
    expect(chatErrorKey(null)).toBe('errorGeneric');
  });

  it('la clave del mensaje es única y estable', () => {
    const a = newClientMessageId();
    const b = newClientMessageId();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(8);
    expect(typeof a).toBe('string');
  });

  it('el chat vacío es de carga, no de error', () => {
    const chat = emptyChat('match-1', peer);
    expect(chat.loading).toBe(true);
    expect(chat.error).toBeNull();
    expect(chat.messages).toEqual([]);
    expect(chat.peer).toBe(peer);
  });
});

describe('tipos de la conversación', () => {
  it('lo pendiente no se mezcla con lo confirmado al marcar estados', () => {
    const messages: LiveChatMessage[] = [
      toChatMessage(message(), SELF),
      optimisticMessage({
        clientMessageId: 'cm-2',
        senderProfileId: SELF,
        body: 'dos',
        createdAt: '2026-11-13T16:00:02.000Z',
      }),
    ];
    const next = setMessageStatus(messages, 'cm-2', 'failed');
    expect(next.map((entry) => entry.status)).toEqual(['sent', 'failed']);
  });
});
