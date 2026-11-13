import { describe, expect, it } from 'vitest';

import type { MatchRow } from '../src/live/chat';
import { matchForPeer } from '../src/live/matches';
import { initialState } from '../src/state/reducer';
import { pingsBadgeCount } from '../src/state/selectors';
import type { DemoState } from '../src/state/types';

/**
 * Puertas al chat que se pueden testear sin renderizar: el cruce peer → match y
 * el badge del nav. El resto es UI y se valida a mano en el navegador.
 */

function row(matchId: string, profileId: string, unreadCount = 0): MatchRow {
  return {
    id: matchId,
    createdAt: '2026-11-13T12:00:00.000Z',
    peer: {
      profileId,
      nickname: profileId.toUpperCase(),
      initials: 'XX',
      intention: 'friendship',
      photoId: 'ph01',
      sourceType: 'human',
    },
    preview: null,
    previewAt: null,
    previewMine: null,
    unreadCount,
  };
}

describe('match de un peer', () => {
  it('encuentra el match por profileId del otro lado', () => {
    const rows = [row('m1', 'mx-p02', 2), row('m2', 'mx-p03')];
    expect(matchForPeer(rows, 'mx-p03')?.id).toBe('m2');
  });

  it('sin match devuelve null (la foto puede no tenerlo todavía)', () => {
    expect(matchForPeer([row('m1', 'mx-p02')], 'mx-p09')).toBeNull();
    expect(matchForPeer([], 'mx-p02')).toBeNull();
  });

  it('no confunde el id del match con el del perfil', () => {
    // Un `match.id` con el mismo texto que un profileId ajeno no debe matchear.
    const rows = [row('mx-p02', 'mx-p07')];
    expect(matchForPeer(rows, 'mx-p02')).toBeNull();
    expect(matchForPeer(rows, 'mx-p07')?.id).toBe('mx-p02');
  });
});

describe('badge del nav', () => {
  it('en live suma pendientes y mensajes sin leer: son cosas distintas', () => {
    const live: DemoState = { ...initialState(), source: 'live' };
    expect(pingsBadgeCount(live, 2, 3)).toBe(5);
    expect(pingsBadgeCount(live, 0, 3)).toBe(3);
    expect(pingsBadgeCount(live, 2, 0)).toBe(2);
  });

  it('en dataset sigue siendo el guion (los no leídos del server no aplican)', () => {
    const dataset: DemoState = { ...initialState(), source: 'dataset', incomingPings: ['a', 'b'] };
    expect(pingsBadgeCount(dataset, 7, 9)).toBe(2);
  });

  it('un número negativo de no leídos no resta pings', () => {
    const live: DemoState = { ...initialState(), source: 'live' };
    expect(pingsBadgeCount(live, 1, -4)).toBe(1);
  });
});
