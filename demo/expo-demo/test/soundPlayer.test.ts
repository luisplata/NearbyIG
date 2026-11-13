import { describe, expect, it } from 'vitest';

import { createSoundPlayer, DEFAULT_VOLUME, type SoundPlayer } from '../src/sound/player';
import {
  MIN_GAIN,
  renderSound,
  SOUND_KINDS,
  SOUND_SPECS,
  type AudioContextLike,
  type AudioParamLike,
  type GainLike,
  type Note,
  type OscillatorLike,
} from '../src/sound/synth';

/**
 * El player contra un `AudioContext` de mentira.
 *
 * Lo que se verifica es lo que rompe en un navegador real: que sin Web Audio no
 * explote, que un contexto suspendido se reanude (y avise una sola vez si el
 * navegador no deja), y que el envelope arranque y termine donde decimos sin
 * pasarse de 1 (clipping).
 */

type Ramp = { kind: string; value: number; time: number };

type LoggedParam = AudioParamLike & { log: Ramp[] };
type LoggedOscillator = OscillatorLike & {
  frequency: LoggedParam;
  startedAt: number | null;
  stoppedAt: number | null;
  connectedTo: unknown;
};
type LoggedGain = GainLike & { gain: LoggedParam; connectedTo: unknown };

function param(): LoggedParam {
  const log: Ramp[] = [];
  return {
    log,
    setValueAtTime: (value, time) => log.push({ kind: 'set', value, time }),
    linearRampToValueAtTime: (value, time) => log.push({ kind: 'linear', value, time }),
    exponentialRampToValueAtTime: (value, time) => log.push({ kind: 'exp', value, time }),
  };
}

function fakeContext(options: { state?: 'running' | 'suspended'; resumeWorks?: boolean } = {}): {
  context: AudioContextLike;
  oscillators: LoggedOscillator[];
  gains: LoggedGain[];
  resumes: () => number;
} {
  const oscillators: LoggedOscillator[] = [];
  const gains: LoggedGain[] = [];
  let resumes = 0;
  const context: AudioContextLike = {
    currentTime: 5,
    state: options.state ?? 'running',
    destination: { name: 'destination' },
    resume: async () => {
      resumes += 1;
      if (options.resumeWorks !== false) {
        context.state = 'running';
      }
    },
    createOscillator: () => {
      const node: LoggedOscillator = {
        type: 'sine',
        frequency: param(),
        startedAt: null,
        stoppedAt: null,
        connectedTo: null,
        connect(target) {
          node.connectedTo = target;
          return target;
        },
        start(when) {
          node.startedAt = when;
        },
        stop(when) {
          node.stoppedAt = when;
        },
      };
      oscillators.push(node);
      return node;
    },
    createGain: () => {
      const node: LoggedGain = {
        gain: param(),
        connectedTo: null,
        connect(target) {
          node.connectedTo = target;
          return target;
        },
      };
      gains.push(node);
      return node;
    },
  };
  return { context, oscillators, gains, resumes: () => resumes };
}

describe('sin Web Audio no explota', () => {
  it('un runtime sin AudioContext es no-op silencioso', () => {
    const player = createSoundPlayer({ createContext: () => null });
    expect(() => player.play('ping')).not.toThrow();
    expect(player.isReady()).toBe(false);
    expect(player.isBlocked()).toBe(false);
  });

  it('unlock sin contexto resuelve false y no rompe', async () => {
    const player = createSoundPlayer({ createContext: () => null });
    await expect(player.unlock()).resolves.toBe(false);
  });

  it('un kind inventado no crea nodos', () => {
    const { context, oscillators } = fakeContext();
    const player = createSoundPlayer({ createContext: () => context });
    player.play('nope' as never);
    expect(oscillators).toHaveLength(0);
  });
});

describe('volumen y contexto suspendido', () => {
  it('volumen 0 no suena', () => {
    const { context, oscillators } = fakeContext();
    const player = createSoundPlayer({ createContext: () => context, volume: 0 });
    player.play('ping');
    expect(oscillators).toHaveLength(0);
    expect(player.getVolume()).toBe(0);
  });

  it('el volumen se clampea a 0..1 y no acepta NaN', () => {
    const player = createSoundPlayer({ createContext: () => null });
    player.setVolume(4);
    expect(player.getVolume()).toBe(1);
    player.setVolume(-1);
    expect(player.getVolume()).toBe(0);
    player.setVolume(Number.NaN);
    expect(player.getVolume()).toBe(DEFAULT_VOLUME);
  });

  it('con el contexto suspendido intenta resume y suena si el gesto llegó', async () => {
    const probe = fakeContext({ state: 'suspended' });
    const player = createSoundPlayer({ createContext: () => probe.context });
    player.play('ping');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(probe.resumes()).toBe(1);
    expect(player.isBlocked()).toBe(false);
    expect(probe.oscillators).toHaveLength(SOUND_SPECS.ping.notes.length);
  });

  it('si el navegador no deja reanudar avisa una sola vez y no suena', async () => {
    let blocked = 0;
    const probe = fakeContext({ state: 'suspended', resumeWorks: false });
    const player = createSoundPlayer({
      createContext: () => probe.context,
      onBlocked: () => {
        blocked += 1;
      },
    });
    player.play('ping');
    player.play('message');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(blocked).toBe(1);
    expect(player.isBlocked()).toBe(true);
    expect(probe.oscillators).toHaveLength(0);
  });

  it('unlock reanuda y limpia el aviso de bloqueo', async () => {
    const probe = fakeContext({ state: 'suspended', resumeWorks: false });
    const player = createSoundPlayer({ createContext: () => probe.context });
    player.play('ping');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(player.isBlocked()).toBe(true);

    // El usuario toca la pantalla: ahora el navegador sí deja reanudar.
    probe.context.resume = async () => {
      probe.context.state = 'running';
    };
    await expect(player.unlock()).resolves.toBe(true);
    expect(player.isBlocked()).toBe(false);
    expect(player.isReady()).toBe(true);
  });
});

describe('diseño de los cuatro timbres', () => {
  it('ninguno llega a 400 ms ni se repite en loop', () => {
    for (const kind of SOUND_KINDS) {
      const spec = SOUND_SPECS[kind];
      expect(spec.durationMs, kind).toBeLessThan(400);
      expect(spec.notes.length, kind).toBeGreaterThan(0);
      for (const note of spec.notes) {
        expect(note.startMs).toBeGreaterThanOrEqual(0);
        expect(note.startMs + note.durationMs, kind).toBeLessThanOrEqual(400);
        expect(note.peak).toBeGreaterThan(0);
        expect(note.peak).toBeLessThanOrEqual(0.6);
      }
    }
  });

  it('cada kind tiene un timbre distinto (onda + forma)', () => {
    const signatures = SOUND_KINDS.map((kind) => {
      const spec = SOUND_SPECS[kind];
      return spec.notes
        .map((note: Note) => `${note.wave}:${note.frequency}:${note.durationMs}`)
        .join('|');
    });
    expect(new Set(signatures).size).toBe(SOUND_KINDS.length);
  });

  it('el envelope arranca casi en cero, sube y muere sin clipping', () => {
    const probe = fakeContext();
    renderSound(probe.context, SOUND_SPECS.ping, 0.8);
    const gain = probe.gains[0]!;
    expect(gain.gain.log[0]).toMatchObject({ kind: 'set', value: MIN_GAIN });
    expect(gain.gain.log[1]?.kind).toBe('linear');
    expect(gain.gain.log[1]!.value).toBeLessThanOrEqual(1);
    expect(gain.gain.log[2]?.kind).toBe('exp');
    expect(gain.gain.log[2]!.value).toBe(MIN_GAIN);
    // Cada oscilador arranca en `currentTime` + offset y se detiene después.
    const oscillator = probe.oscillators[0]!;
    expect(oscillator.startedAt).toBe(5);
    expect(oscillator.stoppedAt).toBeGreaterThan(oscillator.startedAt!);
  });

  it('un glissando usa rampa exponencial de frecuencia', () => {
    const probe = fakeContext();
    renderSound(probe.context, SOUND_SPECS.message, 1);
    const oscillator = probe.oscillators[0]!;
    expect(oscillator.frequency.log.some((ramp) => ramp.kind === 'exp')).toBe(true);
  });

  it('el volumen maestro multiplica el pico sin pasarse de 1', () => {
    const probe = fakeContext();
    renderSound(probe.context, SOUND_SPECS.match, 1);
    for (const gain of probe.gains) {
      const peak = gain.gain.log.find((ramp) => ramp.kind === 'linear');
      expect(peak!.value).toBeLessThanOrEqual(1);
    }
  });
});
