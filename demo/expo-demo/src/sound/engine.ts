import type { LiveEvent } from '../live/types';

import { createCueDedupe, cuesForEvents, datasetCues, type DatasetCueSnapshot } from './cues';
import { browserAudioContext, createSoundPlayer, type SoundPlayer } from './player';
import type { AudioContextLike, SoundKind } from './synth';

/**
 * El motor de sonido: la única puerta que usan la UI y el borde live.
 *
 * **Por qué un singleton y no un contexto de React.** Los eventos llegan en el
 * controlador live (que no es React) y los cambios del dataset en el store. Un
 * contexto obligaría a pasar el player por props hasta el controlador o a
 * duplicarlo; un módulo con dueño único mantiene una sola cola de sonidos y un
 * solo `AudioContext` por pestaña (crear dos es un bug conocido: el segundo
 * pisa el primero en Safari).
 *
 * **Preferencia.** El toggle de Ajustes llama `setEnabled(false)`: el motor
 * ignora todo sin tocar el player, así que apagar los sonidos tampoco desbloquea
 * ni crea el `AudioContext`.
 *
 * **Aviso de bloqueo.** Si el navegador exige un gesto, el player avisa una vez
 * y el motor notifica a quien escuche (`subscribe`), que dibuja el aviso
 * discreto. Al primer gesto, `installGestureUnlock` reanuda y el aviso se va
 * solo: no hay timer ni reintento en loop.
 */
export type SoundEngine = {
  play(kind: SoundKind): void;
  /** Eventos del contrato (SSE o polling): ping, match, mensaje. */
  handleLiveEvents(events: readonly LiveEvent[], selfId: string | null): void;
  /** Transiciones del dataset del build. */
  handleDataset(previous: DatasetCueSnapshot | null, next: DatasetCueSnapshot): void;
  /** Acuse de un mensaje propio confirmado por el server. */
  sent(): void;
  setEnabled(value: boolean): void;
  isEnabled(): boolean;
  unlock(): Promise<boolean>;
  isReady(): boolean;
  isBlocked(): boolean;
  /** Cambios de `isBlocked()` y de `isEnabled()`. */
  subscribe(listener: () => void): () => void;
  dispose(): void;
};

export type SoundEnginePorts = {
  /** Inyectable en tests; en la app es el player real del navegador. */
  player?: SoundPlayer;
  createContext?: () => AudioContextLike | null;
  enabled?: boolean;
  volume?: number;
};

export function createSoundEngine(ports: SoundEnginePorts = {}): SoundEngine {
  const listeners = new Set<() => void>();
  const notify = (): void => {
    for (const listener of [...listeners]) {
      listener();
    }
  };
  const player =
    ports.player ??
    createSoundPlayer({
      createContext: ports.createContext ?? browserAudioContext,
      volume: ports.volume,
      onBlocked: notify,
    });
  const dedupe = createCueDedupe();
  let enabled = ports.enabled ?? true;

  return {
    play: (kind) => {
      if (!enabled) {
        return;
      }
      player.play(kind);
      // Un play bloqueado cambia `isBlocked()`: el aviso se dibuja sin que el
      // llamador tenga que saber si el audio salió o no.
      notify();
    },
    handleLiveEvents: (events, selfId) => {
      if (!enabled || events.length === 0) {
        return;
      }
      for (const kind of cuesForEvents(events, selfId, dedupe)) {
        player.play(kind);
      }
      notify();
    },
    handleDataset: (previous, next) => {
      if (!enabled) {
        return;
      }
      for (const kind of datasetCues(previous, next, dedupe)) {
        player.play(kind);
      }
      notify();
    },
    sent: () => {
      if (!enabled) {
        return;
      }
      player.play('sent');
      notify();
    },
    setEnabled: (value) => {
      if (enabled === value) {
        return;
      }
      enabled = value;
      notify();
    },
    isEnabled: () => enabled,
    unlock: async () => {
      // Con los sonidos apagados ni siquiera se crea el `AudioContext`: apagar el
      // toggle es apagar el audio, no dejarlo listo por si acaso.
      if (!enabled) {
        return false;
      }
      const ready = await player.unlock();
      notify();
      return ready;
    },
    isReady: () => player.isReady(),
    isBlocked: () => player.isBlocked(),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose: () => {
      listeners.clear();
      dedupe.reset();
      player.dispose();
    },
  };
}

let shared: SoundEngine | null = null;

/** Motor de la app. Se crea en el primer uso: importar no abre audio. */
export function getSoundEngine(): SoundEngine {
  if (shared === null) {
    shared = createSoundEngine();
  }
  return shared;
}

/** Lo mínimo de `window` que necesita el desbloqueo por gesto. */
export type GestureTarget = {
  addEventListener(
    type: string,
    listener: () => void,
    options?: { passive?: boolean },
  ): void;
  removeEventListener(type: string, listener: () => void): void;
};

/** Los gestos que los navegadores aceptan como "el usuario tocó algo". */
export const UNLOCK_GESTURES: readonly string[] = ['pointerdown', 'keydown'];

/**
 * Instala el desbloqueo: el primer `pointerdown`/`keydown` reanuda el contexto y
 * los dos listeners se remueven. `passive` porque un listener de audio no puede
 * bloquear el scroll y no tiene por qué intentarlo.
 *
 * Devuelve el cleanup para el efecto de React (o para un test).
 */
export function installGestureUnlock(
  engine: SoundEngine = getSoundEngine(),
  target: GestureTarget | null = typeof window === 'undefined'
    ? null
    : (window as unknown as GestureTarget),
): () => void {
  if (target === null) {
    return () => undefined;
  }
  let armed = true;
  const cleanup = (): void => {
    if (!armed) {
      return;
    }
    armed = false;
    for (const type of UNLOCK_GESTURES) {
      target.removeEventListener(type, handler);
    }
  };
  const handler = (): void => {
    void engine.unlock().then((ready) => {
      if (ready) {
        cleanup();
      }
    });
  };
  for (const type of UNLOCK_GESTURES) {
    target.addEventListener(type, handler, { passive: true });
  }
  return cleanup;
}
