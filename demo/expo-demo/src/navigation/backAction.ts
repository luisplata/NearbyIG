import type { DemoOverlay } from '../state/types';

/**
 * Back del sistema, como función pura.
 *
 * **Por qué acá y no en `App.tsx`.** El orden `sheet → match → overlay → salir`
 * es la única regla que el usuario percibe; si vive mezclada con `dispatch` y
 * estados de React sólo se prueba a mano en un teléfono. Acá se fija con una
 * tabla en `test/backAction.test.ts` y el shell queda reducido a aplicar el
 * efecto.
 *
 * **Por qué el orden de los sheets es zone → profiles → sim.** No es un orden
 * mental de importancia: es el orden de pintado del JSX. `ZoneSheet` es el
 * último hijo de la pila absoluta del shell, así que queda arriba del selector
 * de perfiles y del de simulación. Back cierra lo que se ve, no lo que "importa".
 */

export type SheetId = 'zone' | 'profiles' | 'sim';

export type SheetFlags = {
  sim: boolean;
  profiles: boolean;
  zone: boolean;
};

/** De arriba hacia abajo: el primero abierto es el que se cierra. */
export const SHEET_PRECEDENCE = ['zone', 'profiles', 'sim'] as const;

export function topSheet(flags: SheetFlags): SheetId | null {
  for (const sheet of SHEET_PRECEDENCE) {
    if (flags[sheet]) return sheet;
  }
  return null;
}

export type BackState = {
  /** Sheet visible, ya resuelto con `topSheet`. */
  sheet: SheetId | null;
  /**
   * `state.matchCelebration !== null`: la celebración de match es un overlay
   * full-screen propio, no un `overlay` del reducer. Sin este flag, back en la
   * raíz con la celebración visible devolvía `exit` y Android cerraba la app
   * con una pantalla entera tapando la vista.
   */
  match: boolean;
  /** `state.overlay` del reducer: el mismo que pinta `Overlay`. */
  overlay: DemoOverlay | null;
  /** `state.profileId !== null`: sin perfil elegido no hay a dónde volver. */
  hasProfile: boolean;
};

export type BackAction =
  | { type: 'close-sheet'; sheet: SheetId }
  | { type: 'open-overlay'; overlay: 'profile' | 'pings' }
  | { type: 'close-overlay' }
  /** No se intercepta: la plataforma decide (en Android, salir). */
  | { type: 'exit' };

/**
 * Un solo paso de back. El shell lo aplica y vuelve a preguntar en el próximo
 * toque: nunca se encadenan dos niveles de una vez.
 */
export function nextBackAction(state: BackState): BackAction {
  if (state.sheet !== null) {
    return { type: 'close-sheet', sheet: state.sheet };
  }
  /**
   * La celebración va antes que el overlay porque se pinta después en el JSX:
   * `MatchOverlay` es hermano posterior de `Overlay`, así que queda arriba.
   * Cerrarla reusa `CLOSE_OVERLAY`, que ya limpia `matchCelebration`; no hace
   * falta una acción nueva ni un segundo camino de salida.
   */
  if (state.match) {
    return { type: 'close-overlay' };
  }
  /**
   * El back documentado de cada overlay: seguridad vuelve al perfil que la
   * abrió, el chat vuelve a la bandeja de pings (es de donde se entra), y el
   * resto cierra y deja la vista de abajo. Es el mismo `onBack` del header, así
   * el botón de la pantalla y el gesto del sistema no divergen.
   */
  if (state.overlay === 'safety' && state.hasProfile) {
    return { type: 'open-overlay', overlay: 'profile' };
  }
  if (state.overlay === 'chat') {
    return { type: 'open-overlay', overlay: 'pings' };
  }
  if (state.overlay !== null) {
    return { type: 'close-overlay' };
  }
  return { type: 'exit' };
}
