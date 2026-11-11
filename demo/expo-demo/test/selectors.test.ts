import { describe, expect, it } from 'vitest';

import { fixtures } from '../src/generated/fixtures';
import { initialState, reduce } from '../src/state/reducer';
import {
  avatarState,
  canPing,
  canSendInChat,
  isRevealed,
  pingBlockedReason,
  profileById,
  projectProfile,
  visibleProfiles,
} from '../src/state/selectors';
import type { DemoState } from '../src/state/types';

type StateOverrides = {
  radiusM?: number;
  intentions?: DemoState['filters']['intentions'];
  gender?: DemoState['filters']['gender'];
  verifiedOnly?: boolean;
  onlineOnly?: boolean;
  blocked?: string[];
  pingsSent?: string[];
  matches?: string[];
  revealedByMe?: string[];
  revealedByPeer?: string[];
  chatId?: string | null;
  ghost?: boolean;
};

function state(overrides: StateOverrides = {}): DemoState {
  const base = initialState();
  return {
    ...base,
    chatId: overrides.chatId ?? base.chatId,
    ghost: overrides.ghost ?? base.ghost,
    filters: {
      intentions: overrides.intentions ?? base.filters.intentions,
      gender: overrides.gender ?? base.filters.gender,
      verifiedOnly: overrides.verifiedOnly ?? base.filters.verifiedOnly,
      onlineOnly: overrides.onlineOnly ?? base.filters.onlineOnly,
      radiusM: overrides.radiusM ?? base.filters.radiusM,
    },
    pingsSent: [...(overrides.pingsSent ?? [])],
    matches: [...(overrides.matches ?? [])],
    revealedByMe: [...(overrides.revealedByMe ?? [])],
    revealedByPeer: [...(overrides.revealedByPeer ?? [])],
    blocked: [...(overrides.blocked ?? [])],
  };
}

const ids = (value: DemoState): string[] => visibleProfiles(value).map((profile) => profile.id);

describe('visibleProfiles', () => {
  it('sin filtros devuelve los 10 perfiles ordenados por distancia', () => {
    expect(ids(state())).toEqual([
      'p01',
      'p02',
      'p03',
      'p04',
      'p05',
      'p06',
      'p07',
      'p08',
      'p09',
      'p10',
    ]);
    expect(visibleProfiles(state()).map((profile) => profile.distanceM)).toEqual([
      240, 480, 760, 1150, 1480, 1950, 2600, 3200, 3900, 4800,
    ]);
  });

  it('radio de 500 m deja sólo los perfiles a 500 m o menos', () => {
    expect(ids(state({ radiusM: 500 }))).toEqual(['p01', 'p02']);
  });

  it('el filtro de intención acota el conjunto', () => {
    expect(ids(state({ intentions: ['activities'] }))).toEqual(['p04', 'p08']);
    expect(ids(state({ intentions: ['dating'] }))).toEqual(['p03', 'p06', 'p10']);
  });

  it('elegir la intención propia la aplica como filtro por defecto', () => {
    const selected = reduce(initialState(), {
      type: 'SET_SELF_INTENTION',
      intention: 'activities',
    }).state;
    expect(selected.selfIntention).toBe('activities');
    expect(selected.filters.intentions).toEqual(['activities']);
    expect(ids(selected)).toEqual(['p04', 'p08']);

    const cleared = reduce(selected, { type: 'CLEAR_FILTERS' }).state;
    expect(cleared.filters.intentions).toBeNull();
    expect(ids(cleared)).toHaveLength(10);
  });

  it('filtros de género, verificados y en línea', () => {
    expect(ids(state({ gender: 'female' }))).toEqual(['p01', 'p03', 'p05', 'p09']);
    expect(ids(state({ verifiedOnly: true }))).toEqual(['p01', 'p03', 'p05', 'p07', 'p09']);
    expect(ids(state({ onlineOnly: true }))).toEqual([
      'p01',
      'p02',
      'p04',
      'p05',
      'p07',
      'p09',
      'p10',
    ]);
  });

  it('un bloqueado desaparece y una combinación imposible queda vacía', () => {
    expect(ids(state({ blocked: ['p01'] }))[0]).toBe('p02');
    expect(ids(state({ intentions: ['dating'], radiusM: 500 }))).toEqual([]);
  });
});

describe('guards de ping y chat', () => {
  it('canPing respeta fantasma, enviados, matches y bloqueos', () => {
    expect(canPing(state(), 'p01')).toBe(true);
    expect(canPing(state({ pingsSent: ['p01'] }), 'p01')).toBe(false);
    expect(canPing(state({ matches: ['p01'] }), 'p01')).toBe(false);
    expect(canPing(state({ blocked: ['p01'] }), 'p01')).toBe(false);
    expect(canPing(state({ ghost: true }), 'p01')).toBe(false);
    expect(canPing(state({ radiusM: 500 }), 'p05')).toBe(false);
  });

  it('pingBlockedReason explica el motivo con claves del catálogo', () => {
    expect(pingBlockedReason(state(), 'p01')).toBeNull();
    expect(pingBlockedReason(state({ ghost: true }), 'p01')).toBe('ping.blocked.paused');
    expect(pingBlockedReason(state({ pingsSent: ['p01'] }), 'p01')).toBe('ping.blocked.sent');
    expect(pingBlockedReason(state({ matches: ['p01'] }), 'p01')).toBe('ping.blocked.matched');
  });

  it('canSendInChat exige match, sin typing y sin bloqueo', () => {
    expect(canSendInChat(state({ matches: ['p07'], chatId: 'p07' }))).toBe(true);
    expect(canSendInChat(state({ matches: ['p07'] }))).toBe(false);
    expect(canSendInChat(state({ chatId: 'p07' }))).toBe(false);
    expect(canSendInChat(state({ blocked: ['p07'], matches: ['p07'], chatId: 'p07' }))).toBe(
      false,
    );
  });
});

describe('revelación', () => {
  it('sólo es clear cuando revelaron los dos lados', () => {
    expect(isRevealed(state({ revealedByMe: ['p07'] }), 'p07')).toBe(false);
    expect(avatarState(state({ revealedByMe: ['p07'] }), 'p07')).toBe('blurred');
    const mutual = state({ revealedByMe: ['p07'], revealedByPeer: ['p07'] });
    expect(isRevealed(mutual, 'p07')).toBe(true);
    expect(avatarState(mutual, 'p07')).toBe('clear');
  });
});

describe('proyección de posición', () => {
  it('el centro es 0.5 y el radio crece con la distancia', () => {
    const nearest = profileById('p01');
    const farthest = profileById('p10');
    expect(nearest).not.toBeNull();
    expect(farthest).not.toBeNull();
    const near = projectProfile(nearest!, fixtures.filters.defaultRadiusM);
    const far = projectProfile(farthest!, fixtures.filters.defaultRadiusM);
    const distance = (dot: { x: number; y: number }): number =>
      Math.hypot(dot.x - 0.5, dot.y - 0.5);
    expect(distance(near)).toBeCloseTo((0.42 * 240) / 5000, 9);
    expect(distance(far)).toBeGreaterThan(distance(near));
    expect(distance(far)).toBeLessThanOrEqual(0.42);
  });

  it('se respeta la fórmula del contrato', () => {
    const profile = profileById('p01')!;
    const dot = projectProfile(profile, 5000);
    const r = (0.42 * profile.distanceM) / 5000;
    const radians = (profile.bearingDeg * Math.PI) / 180;
    expect(dot.x).toBeCloseTo(0.5 + Math.sin(radians) * r, 9);
    expect(dot.y).toBeCloseTo(0.5 - Math.cos(radians) * r, 9);
  });

  it('con radio 0 no se divide por cero', () => {
    const dot = projectProfile(profileById('p03')!, 0);
    expect(Number.isFinite(dot.x)).toBe(true);
    expect(Number.isFinite(dot.y)).toBe(true);
  });
});
