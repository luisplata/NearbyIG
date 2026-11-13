import { useEffect, useRef, useSyncExternalStore } from 'react';

import { useDemo } from '../state/DemoProvider';

import { datasetSnapshot, type DatasetCueSnapshot } from './cues';
import { getSoundEngine } from './engine';

/**
 * Sonidos del dataset del build.
 *
 * Con sesión live los avisos salen de los eventos del contrato (los dispara el
 * `LiveProvider`). Sin sesión no hay stream: el guion del reducer mueve
 * `incomingPings`, `matches` y `messages`, así que el mismo motor escucha esos
 * cambios. La primera foto no suena — los pings y matches que ya estaban al
 * montar no son noticia.
 */
export function useSoundEffects(): void {
  const { state } = useDemo();
  const previous = useRef<DatasetCueSnapshot | null>(null);

  useEffect(() => {
    const next = datasetSnapshot(state);
    // En live el estado del reducer sigue existiendo, pero el guion no corre:
    // los sonidos salen de los eventos y acá sólo se actualiza la foto.
    if (state.source !== 'live') {
      getSoundEngine().handleDataset(previous.current, next);
    }
    previous.current = next;
  }, [state]);
}

/** `true` mientras el navegador tenga el audio bloqueado por falta de gesto. */
export function useSoundBlocked(): boolean {
  const engine = getSoundEngine();
  return useSyncExternalStore(engine.subscribe, engine.isBlocked, engine.isBlocked);
}

/** El toggle de Ajustes, aplicado al motor. */
export function useSoundPreference(enabled: boolean): void {
  useEffect(() => {
    getSoundEngine().setEnabled(enabled);
  }, [enabled]);
}
