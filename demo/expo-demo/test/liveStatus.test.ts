import { describe, expect, it } from 'vitest';

import { liveCopy } from '../src/live/liveCopy';
import { emptyLiveState, type LiveState } from '../src/live/types';
import { liveNoticeText, liveStatusText, liveSessionText, liveTransportText } from '../src/live/status';

/**
 * La barra ya no es un switch: el estado cuenta qué está pasando y el dataset del
 * build no se ofrece como modo. Estos textos son la mitad visible de esa
 * decisión, así que se testean como funciones puras.
 */
const state = (patch: Partial<LiveState>): LiveState => ({ ...emptyLiveState(), ...patch });

describe('estado de la barra', () => {
  it('sin sesión el estado es el dataset local, no un modo "mock"', () => {
    expect(liveStatusText('dataset', emptyLiveState())).toBe('dataset local');
    expect(liveCopy).not.toHaveProperty('mock');
    expect(liveCopy).not.toHaveProperty('live');
  });

  it('conectando gana sobre el origen: el usuario ve que algo está pasando', () => {
    expect(liveStatusText('dataset', state({ status: 'connecting' }))).toBe('conectando…');
  });

  it('una sesión viva y una degradada a polling se distinguen', () => {
    expect(liveStatusText('live', state({ status: 'live', transport: 'sse' }))).toBe('en vivo');
    expect(liveStatusText('live', state({ status: 'polling', transport: 'polling' }))).toBe(
      'en vivo por polling',
    );
  });

  it('si la API falló se dice sin conexión, aunque el catálogo sea el del build', () => {
    const offline = state({ status: 'offline', notice: 'unreachable' });
    expect(liveStatusText('dataset', offline)).toBe('sin conexión');
    expect(liveNoticeText(offline.notice)).toContain('dataset local');
  });

  it('el aviso no habla de "mock": el piso es el dataset del build', () => {
    for (const notice of ['unreachable', 'session-lost'] as const) {
      expect(liveNoticeText(notice) ?? '').not.toMatch(/mock/i);
    }
    expect(liveNoticeText('unconfigured')).toContain('EXPO_PUBLIC_API_URL');
  });

  it('la línea de sesión y el transporte sólo existen con sesión', () => {
    expect(liveSessionText(emptyLiveState())).toBeNull();
    expect(liveTransportText(emptyLiveState())).toBeNull();
    const live = state({
      transport: 'sse',
      session: {
        token: 'tok',
        expiresAt: '2026-11-13T12:00:00.000Z',
        regionKey: 'mx',
        profileId: 'mx-p05',
        demoSlot: 5,
        sourceType: 'human',
      },
    });
    expect(liveTransportText(live)).toBe('stream');
    expect(liveSessionText(live)).toContain('región mx');
    expect(liveSessionText(live)).toContain('slot 5');
  });
});
