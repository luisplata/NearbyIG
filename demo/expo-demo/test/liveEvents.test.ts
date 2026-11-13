import { describe, expect, it } from 'vitest';

import { applyEvents } from '../src/live/events';
import { seqOf, parseEvent, type LiveEvent, type LiveProfileRow } from '../src/live/types';

const row = (overrides: Partial<LiveProfileRow> = {}): LiveProfileRow => ({
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

const moved = (seq: number, profileId: string, distanceM: number, bearingDeg = 90): LiveEvent => ({
  id: `mx:${String(seq).padStart(12, '0')}`,
  type: 'profile.moved',
  occurredAt: '2026-11-13T09:00:00.000Z',
  payload: { profileId, distanceM, bearingDeg },
});

const presence = (seq: number, profileId: string, online: boolean): LiveEvent => ({
  id: `mx:${String(seq).padStart(12, '0')}`,
  type: 'profile.presence',
  occurredAt: '2026-11-13T09:00:00.000Z',
  payload: { profileId, online },
});

describe('envelope', () => {
  it('el sufijo del id es el seq y el prefijo es opaco', () => {
    expect(seqOf('mx:000000000042')).toBe(42);
    expect(seqOf('co:000000000000')).toBe(0);
    expect(seqOf('mx:42')).toBeNull();
    expect(seqOf('MX:000000000042')).toBeNull();
    expect(seqOf('mx:00000000004')).toBeNull();
    expect(seqOf('')).toBeNull();
  });

  it('parseEvent no explota con basura', () => {
    expect(parseEvent('')).toBeNull();
    expect(parseEvent('{')).toBeNull();
    expect(parseEvent('{"id":"mx:000000000001"}')).toBeNull();
    expect(
      parseEvent('{"id":"mx:000000000001","type":"profile.moved","occurredAt":"x","payload":{}}'),
    ).not.toBeNull();
  });
});

describe('aplicación de eventos', () => {
  it('parchea distancia y rumbo de la foto vigente', () => {
    const result = applyEvents([row()], [moved(7, 'mx-p01', 900, 180)], 0);
    expect(result.changed).toBe(true);
    expect(result.lastSeq).toBe(7);
    expect(result.rows[0].distanceM).toBe(900);
    expect(result.rows[0].bearingDeg).toBe(180);
  });

  it('dedupe por seq: el mismo evento dos veces se aplica una sola vez', () => {
    const first = applyEvents([row()], [moved(7, 'mx-p01', 900)], 0);
    const second = applyEvents(first.rows, [moved(7, 'mx-p01', 1500)], first.lastSeq);
    expect(second.changed).toBe(false);
    expect(second.rows[0].distanceM).toBe(900);
    expect(second.lastSeq).toBe(7);
  });

  it('un evento viejo (seq menor al último visto) no retrocede la foto', () => {
    const result = applyEvents([row({ distanceM: 900 })], [moved(3, 'mx-p01', 240)], 7);
    expect(result.changed).toBe(false);
    expect(result.rows[0].distanceM).toBe(900);
    expect(result.lastSeq).toBe(7);
  });

  it('ordena por seq, no por occurredAt', () => {
    const late = { ...moved(9, 'mx-p01', 400), occurredAt: '2026-11-13T08:00:00.000Z' };
    const early = { ...moved(8, 'mx-p01', 500), occurredAt: '2026-11-13T23:00:00.000Z' };
    const result = applyEvents([row()], [late, early], 0);
    expect(result.rows[0].distanceM).toBe(400);
    expect(result.lastSeq).toBe(9);
  });

  it('avanza el cursor aunque el evento no cambie nada observable', () => {
    // `profile.presence` con el mismo estado: nada que pintar, pero el seq ya
    // se consumió y no se puede volver a aplicar.
    const result = applyEvents([row()], [presence(4, 'mx-p01', true)], 0);
    expect(result.changed).toBe(false);
    expect(result.lastSeq).toBe(4);
  });

  it('un perfil que no está en la foto pide una foto nueva en vez de inventar filas', () => {
    const result = applyEvents([row()], [moved(5, 'mx-p99-b1', 800)], 0);
    expect(result.changed).toBe(false);
    expect(result.unknownProfile).toBe(true);
    expect(result.rows).toHaveLength(1);
  });

  it('profile.presence apaga y prende online', () => {
    const off = applyEvents([row()], [presence(2, 'mx-p01', false)], 0);
    expect(off.rows[0].online).toBe(false);
    const on = applyEvents(off.rows, [presence(3, 'mx-p01', true)], off.lastSeq);
    expect(on.rows[0].online).toBe(true);
  });

  it('los eventos de S4/S5 se aceptan y se ignoran', () => {
    const ping: LiveEvent = {
      id: 'mx:000000000010',
      type: 'ping.received',
      occurredAt: '2026-11-13T09:00:00.000Z',
      payload: { pingId: 'x', profileId: 'mx-p01', expiresAt: '2026-11-13T09:00:30.000Z' },
    };
    const result = applyEvents([row()], [ping], 0);
    expect(result.changed).toBe(false);
    expect(result.lastSeq).toBe(10);
    expect(result.unknownProfile).toBe(false);
  });

  it('un evento con payload inválido no rompe ni cambia la fila', () => {
    const broken: LiveEvent = {
      id: 'mx:000000000011',
      type: 'profile.moved',
      occurredAt: '2026-11-13T09:00:00.000Z',
      payload: { profileId: 'mx-p01', distanceM: '900' },
    };
    const result = applyEvents([row()], [broken], 0);
    expect(result.changed).toBe(false);
    expect(result.rows[0].distanceM).toBe(240);
  });
});
