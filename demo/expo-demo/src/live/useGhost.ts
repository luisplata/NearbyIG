import { useCallback, useEffect, useState } from 'react';

import { useDemo } from '../state/DemoProvider';

import { useLive } from './LiveProvider';
import type { Visibility } from './types';

/**
 * El switch "Fantasma" del header y del tab Perfil, en los dos modos.
 *
 * **Dos verdades, una lectura.** En dataset el `ghost` del reducer es la verdad
 * (y sigue siendo el guion de siempre). Con sesión live la verdad es el server:
 * `PUT /presence` con `visibility` y el estado que devuelve. El hook parte de la
 * fuente correcta y sincroniza el reducer para que el banner, los guards del
 * ping y los tests del mock sigan leyendo un solo campo.
 *
 * **El latido no participa.** Cambiar de visibilidad es una action explícita;
 * los `PUT /presence` de posición omiten `visibility` y conservan la vigente, así
 * que el heartbeat no saca a nadie de ghost. Eso se verifica en el controlador,
 * no acá.
 *
 * **Falla visible.** Si el server rechaza el cambio, `checked` no se mueve y el
 * error queda con su `Problem.code`: un switch que se mueve solo mentiría sobre
 * la visibilidad real.
 */
export type GhostBinding = {
  checked: boolean;
  disabled: boolean;
  busy: boolean;
  live: boolean;
  error: string | null;
  toggle: () => void;
  /**
   * Banner a mostrar: `live` con el copy del servidor (invisible para los demás)
   * o `dataset` con el del guion (pausa). `null` = no hay nada que avisar.
   */
  banner: 'live' | 'dataset' | null;
};

export function useGhost(): GhostBinding {
  const { state, dispatch } = useDemo();
  const live = useLive();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const liveMode = state.source === 'live' && live.enabled && live.state.session !== null;

  // El server manda: si la sesión quedó en ghost (preferencia persistida,
  // cambio desde otro lado), el reducer se alinea una sola vez.
  useEffect(() => {
    if (!liveMode) {
      return;
    }
    const ghost = live.visibility === 'ghost';
    if (state.ghost !== ghost) {
      dispatch({ type: 'TOGGLE_GHOST' });
    }
  }, [liveMode, live.visibility, state.ghost, dispatch]);

  const toggle = useCallback(() => {
    if (busy) {
      return;
    }
    if (!liveMode) {
      dispatch({ type: 'TOGGLE_GHOST' });
      return;
    }
    const next: Visibility = live.visibility === 'ghost' ? 'visible' : 'ghost';
    setBusy(true);
    setError(null);
    void live.setVisibility(next).then((result) => {
      setBusy(false);
      setError(result.ok ? null : result.code);
    });
  }, [busy, dispatch, live, liveMode]);

  return {
    checked: liveMode ? live.visibility === 'ghost' : state.ghost,
    disabled: busy || state.overlay === 'profile' || state.overlay === 'chat',
    busy,
    live: liveMode,
    error,
    toggle,
    banner: liveMode
      ? live.visibility === 'ghost'
        ? 'live'
        : null
      : state.ghost
        ? 'dataset'
        : null,
  };
}
