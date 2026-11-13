import { describe, expect, it } from 'vitest';

import {
  createCueDedupe,
  cueForEvent,
  cuesForEvents,
  datasetCues,
  datasetSnapshot,
  type DatasetCueSnapshot,
} from '../src/sound/cues';
import type { LiveEvent } from '../src/live/types';
import { initialState } from '../src/state/reducer';
import type { DemoState } from '../src/state/types';

/**
 * Sonido de eventos y transiciones: puro, sin audio y sin React. Lo que se
 * protege acá es lo que se escucha mal cuando falla: un evento repetido no puede
 * sonar dos veces y un mensaje propio no puede sonar como "llegó".
 */

const SELF = 'mx-p04';

function event(id: string, type: string, payload: Record<string, unknown> = {}): LiveEvent {
  return { id, type, occurredAt: '2026-11-13T12:00:00.000Z', payload };
}

describe('evento del contrato → sonido', () => {
  it('mapea los tres avisos del stream', () => {
    expect(cueForEvent(event('mx:000000000001', 'ping.received'), SELF)).toBe('ping');
    expect(cueForEvent(event('mx:000000000002', 'match.created'), SELF)).toBe('match');
    expect(
      cueForEvent(
        event('mx:000000000003', 'message.created', { matchId: 'm1', senderProfileId: 'mx-p02' }),
        SELF,
      ),
    ).toBe('message');
  });

  it('un mensaje propio no suena como recibido', () => {
    const own = event('mx:000000000004', 'message.created', {
      matchId: 'm1',
      senderProfileId: SELF,
    });
    expect(cueForEvent(own, SELF)).toBeNull();
  });

  it('los eventos de movimiento y presencia no suenan', () => {
    expect(cueForEvent(event('mx:000000000005', 'profile.moved'), SELF)).toBeNull();
    expect(cueForEvent(event('mx:000000000006', 'profile.presence'), SELF)).toBeNull();
    expect(cueForEvent(event('mx:000000000007', 'typing.started'), SELF)).toBeNull();
  });

  it('un lote devuelve un sonido por evento nuevo y descarta el reenvío', () => {
    const dedupe = createCueDedupe();
    const batch = [
      event('mx:000000000010', 'ping.received'),
      event('mx:000000000011', 'match.created'),
    ];
    expect(cuesForEvents(batch, SELF, dedupe)).toEqual(['ping', 'match']);

    // El mismo frame reenviado (reconexión del SSE) o la misma página de polling.
    expect(cuesForEvents(batch, SELF, dedupe)).toEqual([]);
    expect(dedupe.size()).toBe(2);
  });

  it('el dedupe no distingue transporte: id igual, sonido igual', () => {
    const dedupe = createCueDedupe();
    const one = event('mx:000000000012', 'message.created', { senderProfileId: 'mx-p02' });
    expect(cuesForEvents([one], SELF, dedupe)).toEqual(['message']);
    expect(cuesForEvents([one], SELF, dedupe)).toEqual([]);
  });

  it('el dedupe tiene tope: no crece sin fin en una sesión larga', () => {
    const dedupe = createCueDedupe(2);
    expect(dedupe.claim('a')).toBe(true);
    expect(dedupe.claim('b')).toBe(true);
    expect(dedupe.claim('c')).toBe(true);
    expect(dedupe.size()).toBe(2);
    // 'a' fue la más vieja y ya se olvidó; 'c' sigue recordada.
    expect(dedupe.has('a')).toBe(false);
    expect(dedupe.has('c')).toBe(true);
  });
});

describe('transiciones del dataset', () => {
  const EMPTY: DatasetCueSnapshot = { incoming: [], matches: [], lastMessage: {} };

  it('la primera foto no suena: lo que ya estaba no es noticia', () => {
    const dedupe = createCueDedupe();
    const state: DemoState = {
      ...initialState(),
      incomingPings: ['mx-p02', 'mx-p03'],
      matches: ['mx-p05'],
    };
    expect(datasetCues(null, datasetSnapshot(state), dedupe)).toEqual([]);
    expect(dedupe.size()).toBe(0);
  });

  it('un ping entrante del guion suena una sola vez', () => {
    const dedupe = createCueDedupe();
    const before = datasetSnapshot({ ...initialState(), incomingPings: [] });
    const after: DatasetCueSnapshot = { ...before, incoming: ['mx-p02'] };
    expect(datasetCues(before, after, dedupe)).toEqual(['ping']);
    expect(datasetCues(before, after, dedupe)).toEqual([]);
  });

  it('un match nuevo suena; uno que ya estaba no', () => {
    const dedupe = createCueDedupe();
    const before: DatasetCueSnapshot = { ...EMPTY, matches: ['mx-p02'] };
    const after: DatasetCueSnapshot = { ...EMPTY, matches: ['mx-p02', 'mx-p03'] };
    expect(datasetCues(before, after, dedupe)).toEqual(['match']);
    expect(datasetCues(before, before, dedupe)).toEqual([]);
  });

  it('el último mensaje decide si suena "llegó" o "mandé"', () => {
    const dedupe = createCueDedupe();
    const before: DatasetCueSnapshot = {
      ...EMPTY,
      matches: ['mx-p02'],
      lastMessage: { 'mx-p02': { fingerprint: '1|peer|chat.p02.1', mine: false } },
    };
    const mine: DatasetCueSnapshot = {
      ...before,
      lastMessage: { 'mx-p02': { fingerprint: '2|me|chat.quick.1', mine: true } },
    };
    const theirs: DatasetCueSnapshot = {
      ...mine,
      lastMessage: { 'mx-p02': { fingerprint: '3|peer|chat.p02.2', mine: false } },
    };
    expect(datasetCues(before, mine, dedupe)).toEqual(['sent']);
    expect(datasetCues(mine, theirs, dedupe)).toEqual(['message']);
    // Un refresh que repite la misma foto no vuelve a sonar.
    expect(datasetCues(theirs, theirs, dedupe)).toEqual([]);
  });

  it('dos respuestas iguales seguidas son dos mensajes, no uno', () => {
    const dedupe = createCueDedupe();
    const before: DatasetCueSnapshot = {
      ...EMPTY,
      matches: ['mx-p02'],
      lastMessage: { 'mx-p02': { fingerprint: '1|peer|chat.p02.1', mine: false } },
    };
    // Mismo textKey otra vez: la huella incluye la cantidad de mensajes.
    const after: DatasetCueSnapshot = {
      ...before,
      lastMessage: { 'mx-p02': { fingerprint: '2|peer|chat.p02.1', mine: false } },
    };
    expect(datasetCues(before, after, dedupe)).toEqual(['message']);
  });

  it('la foto del estado no inventa conversaciones sin mensajes', () => {
    const state: DemoState = { ...initialState(), matches: ['mx-p02'] };
    const snapshot = datasetSnapshot(state);
    expect(snapshot.matches).toContain('mx-p02');
    // Sin mensajes no hay entrada: un match recién creado no es "llegó un mensaje".
    expect(snapshot.lastMessage['mx-p02']).toBeUndefined();
    const withEmpty: DemoState = { ...state, messages: { 'mx-p02': [] } };
    expect(datasetSnapshot(withEmpty).lastMessage['mx-p02']).toEqual({
      fingerprint: '',
      mine: false,
    });
  });
});
