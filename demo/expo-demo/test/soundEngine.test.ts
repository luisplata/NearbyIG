import { describe, expect, it } from 'vitest';

import type { LiveEvent } from '../src/live/types';
import { createSoundEngine, installGestureUnlock, type GestureTarget } from '../src/sound/engine';
import type { SoundPlayer } from '../src/sound/player';
import type { SoundKind } from '../src/sound/synth';

/**
 * El motor: preferencia, dedupe y aviso de bloqueo, con un player de mentira.
 *
 * Lo que se protege es la regla de producto: con el toggle apagado no se toca el
 * player (ni siquiera para intentar desbloquear audio), y un evento repetido no
 * suena dos veces aunque llegue por el stream y por polling.
 */
function fakePlayer(options: { blocked?: boolean } = {}): SoundPlayer & { played: SoundKind[] } {
  const played: SoundKind[] = [];
  let ready = false;
  let blocked = options.blocked ?? false;
  return {
    played,
    unlock: async () => {
      ready = true;
      blocked = false;
      return true;
    },
    play: (kind) => {
      played.push(kind);
    },
    setVolume: () => undefined,
    getVolume: () => 0.8,
    isReady: () => ready,
    isBlocked: () => blocked,
    dispose: () => undefined,
  };
}

const SELF = 'mx-p04';

function event(id: string, type: string, payload: Record<string, unknown> = {}): LiveEvent {
  return { id, type, occurredAt: '2026-11-13T12:00:00.000Z', payload };
}

describe('preferencia de sonido', () => {
  it('con el toggle apagado no se llama al player, ni por evento ni por envío', () => {
    const player = fakePlayer();
    const engine = createSoundEngine({ player, enabled: false });
    engine.play('ping');
    engine.handleLiveEvents([event('mx:000000000001', 'ping.received')], SELF);
    engine.handleDataset(null, { incoming: ['mx-p02'], matches: [], lastMessage: {} });
    engine.sent();
    expect(player.played).toEqual([]);
    expect(player.isReady()).toBe(false);
  });

  it('el toggle se puede apagar en caliente y volver a prender', () => {
    const player = fakePlayer();
    const engine = createSoundEngine({ player });
    engine.play('ping');
    engine.setEnabled(false);
    engine.play('match');
    engine.setEnabled(true);
    engine.play('message');
    expect(player.played).toEqual(['ping', 'message']);
  });

  it('apagado, el gesto tampoco crea el AudioContext', async () => {
    let unlocks = 0;
    const player = fakePlayer();
    const engine = createSoundEngine({
      player: {
        ...player,
        unlock: async () => {
          unlocks += 1;
          return true;
        },
      },
      enabled: false,
    });
    await expect(engine.unlock()).resolves.toBe(false);
    expect(unlocks).toBe(0);
  });

  it('apagar el motor avisa a los suscriptores (el toggle se dibuja al día)', () => {
    const engine = createSoundEngine({ player: fakePlayer() });
    let changes = 0;
    const off = engine.subscribe(() => {
      changes += 1;
    });
    engine.setEnabled(false);
    engine.setEnabled(false);
    expect(changes).toBe(1);
    off();
  });
});

describe('eventos repetidos', () => {
  it('un mismo evento suena una sola vez aunque lo entreguen dos transportes', () => {
    const player = fakePlayer();
    const engine = createSoundEngine({ player });
    const batch = [
      event('mx:000000000010', 'ping.received'),
      event('mx:000000000011', 'match.created'),
      event('mx:000000000012', 'message.created', { senderProfileId: 'mx-p02' }),
    ];
    engine.handleLiveEvents(batch, SELF);
    engine.handleLiveEvents(batch, SELF);
    expect(player.played).toEqual(['ping', 'match', 'message']);
  });

  it('un mensaje propio no suena como recibido', () => {
    const player = fakePlayer();
    const engine = createSoundEngine({ player });
    engine.handleLiveEvents(
      [event('mx:000000000013', 'message.created', { senderProfileId: SELF })],
      SELF,
    );
    expect(player.played).toEqual([]);
  });

  it('el acuse de envío suena "sent"', () => {
    const player = fakePlayer();
    const engine = createSoundEngine({ player });
    engine.sent();
    expect(player.played).toEqual(['sent']);
  });
});

describe('aviso de audio bloqueado', () => {
  it('el motor expone el bloqueo del player', () => {
    const engine = createSoundEngine({ player: fakePlayer({ blocked: true }) });
    expect(engine.isBlocked()).toBe(true);
  });

  it('unlock reanuda y notifica una sola vez', async () => {
    const player = fakePlayer({ blocked: true });
    const engine = createSoundEngine({ player });
    let notifications = 0;
    engine.subscribe(() => {
      notifications += 1;
    });
    await expect(engine.unlock()).resolves.toBe(true);
    expect(engine.isBlocked()).toBe(false);
    expect(notifications).toBe(1);
  });
});

describe('desbloqueo por gesto', () => {
  it('el primer pointerdown reanuda y remueve los dos listeners', async () => {
    const listeners = new Map<string, Set<() => void>>();
    const target: GestureTarget = {
      addEventListener: (type, listener) => {
        const set = listeners.get(type) ?? new Set();
        set.add(listener);
        listeners.set(type, set);
      },
      removeEventListener: (type, listener) => {
        listeners.get(type)?.delete(listener);
      },
    };
    const player = fakePlayer({ blocked: true });
    const engine = createSoundEngine({ player });
    const cleanup = installGestureUnlock(engine, target);
    expect([...listeners.keys()].sort()).toEqual(['keydown', 'pointerdown']);

    for (const listener of [...(listeners.get('pointerdown') ?? [])]) {
      listener();
    }
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(engine.isBlocked()).toBe(false);
    expect(listeners.get('pointerdown')?.size).toBe(0);
    expect(listeners.get('keydown')?.size).toBe(0);
    cleanup();
  });

  it('sin target (SSR, tests) no instala nada y el cleanup es inofensivo', () => {
    const engine = createSoundEngine({ player: fakePlayer() });
    const cleanup = installGestureUnlock(engine, null);
    expect(() => cleanup()).not.toThrow();
  });
});
