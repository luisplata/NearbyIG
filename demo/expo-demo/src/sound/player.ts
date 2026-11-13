import {
  isSoundKind,
  playSound,
  type AudioContextLike,
  type SoundKind,
} from './synth';

/**
 * El player: dueño del `AudioContext` y de sus guardas.
 *
 * **Se desbloquea con un gesto.** Los navegadores crean el contexto `suspended`
 * hasta que hay un gesto del usuario (pointerdown/keydown). `unlock()` lo
 * reanuda; el listener que lo llama vive en `engine.ts` y se remueve solo.
 *
 * **Sin `AudioContext` no pasa nada.** SSR, jsdom y navegadores viejos no tienen
 * el constructor: `createContext` devuelve `null` y todos los métodos son
 * no-op. No hay excepciones, no hay `if (typeof window)` regado por las
 * pantallas.
 *
 * **Si el navegador bloquea, no se insiste.** Un `play()` con el contexto
 * suspendido avisa **una vez** (`onBlocked`) y trata de reanudar: si el gesto no
 * llegó, el sonido se pierde en silencio y el aviso queda para el próximo toque.
 * Nada de reintentos en loop ni de tirar cuando el navegador dice que no.
 */
export type SoundPlayer = {
  /** Crea/reanuda el contexto. `false` si el runtime no tiene audio. */
  unlock(): Promise<boolean>;
  play(kind: SoundKind): void;
  setVolume(volume: number): void;
  getVolume(): number;
  /** El contexto existe y está corriendo. */
  isReady(): boolean;
  /** Un `play()` no pudo sonar por falta de gesto. */
  isBlocked(): boolean;
  dispose(): void;
};

export type SoundPlayerPorts = {
  /** `null` = el runtime no tiene Web Audio (tests, SSR, navegador viejo). */
  createContext?: () => AudioContextLike | null;
  /** Volumen maestro (0..1). Moderado a propósito: la demo no es un ringtone. */
  volume?: number;
  /** Se llama una sola vez por episodio bloqueado, hasta el próximo unlock. */
  onBlocked?: () => void;
};

/** 0.8 deja margen para que tres notas no clipeen y sigue siendo audible. */
export const DEFAULT_VOLUME = 0.8;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_VOLUME;
  }
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * `AudioContext` del navegador, o `null`. El acceso es dinámico porque el
 * constructor no existe en Node ni en un webview viejo, y porque Safari
 * históricamente lo expuso como `webkitAudioContext`.
 */
export function browserAudioContext(): AudioContextLike | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const scope = window as unknown as {
    AudioContext?: new () => AudioContextLike;
    webkitAudioContext?: new () => AudioContextLike;
  };
  const ctor = scope.AudioContext ?? scope.webkitAudioContext;
  if (typeof ctor !== 'function') {
    return null;
  }
  try {
    return new ctor();
  } catch {
    // Un contexto por pestaña o un límite del navegador: silencio, no crash.
    return null;
  }
}

export function createSoundPlayer(ports: SoundPlayerPorts = {}): SoundPlayer {
  const createContext = ports.createContext ?? browserAudioContext;
  let context: AudioContextLike | null = null;
  let volume = clamp01(ports.volume ?? DEFAULT_VOLUME);
  let blocked = false;
  /** El aviso de "tocá la pantalla" no puede repetirse en cada intento. */
  let notified = false;

  const ensureContext = (): AudioContextLike | null => {
    if (context !== null) {
      return context;
    }
    context = createContext();
    return context;
  };

  const isRunning = (target: AudioContextLike): boolean => target.state === 'running';

  const emit = (target: AudioContextLike, kind: SoundKind): void => {
    try {
      playSound(target, kind, volume);
    } catch {
      // Un envelope raro no puede tumbar un render: el sonido es accesorio.
    }
  };

  const noteBlocked = (): void => {
    blocked = true;
    if (notified) {
      return;
    }
    notified = true;
    ports.onBlocked?.();
  };

  /**
   * Intenta reanudar y recién ahí decide: si el navegador no deja (no hubo
   * gesto), avisa una vez; si deja, suena. El aviso se espera al resultado de
   * `resume()` para no parpadear el cartel cuando el gesto ya había ocurrido.
   */
  const resumeThenPlay = async (target: AudioContextLike, kind: SoundKind): Promise<void> => {
    try {
      await target.resume();
    } catch {
      noteBlocked();
      return;
    }
    if (!isRunning(target)) {
      noteBlocked();
      return;
    }
    blocked = false;
    notified = false;
    emit(target, kind);
  };

  return {
    unlock: async () => {
      const target = ensureContext();
      if (target === null) {
        return false;
      }
      if (isRunning(target)) {
        blocked = false;
        notified = false;
        return true;
      }
      try {
        await target.resume();
      } catch {
        return false;
      }
      const running = isRunning(target);
      blocked = !running;
      if (running) {
        notified = false;
      }
      return running;
    },
    play: (kind) => {
      if (!isSoundKind(kind) || volume <= 0) {
        return;
      }
      const target = ensureContext();
      if (target === null) {
        return;
      }
      if (isRunning(target)) {
        blocked = false;
        notified = false;
        emit(target, kind);
        return;
      }
      void resumeThenPlay(target, kind);
    },
    setVolume: (next) => {
      volume = clamp01(next);
    },
    getVolume: () => volume,
    isReady: () => context !== null && isRunning(context),
    isBlocked: () => blocked,
    dispose: () => {
      const target = context;
      context = null;
      blocked = false;
      notified = false;
      try {
        void target?.close?.();
      } catch {
        // Cerrar un contexto ya cerrado no es un error de la app.
      }
    },
  };
}
