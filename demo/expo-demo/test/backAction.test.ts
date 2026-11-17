import { describe, expect, it } from 'vitest';

import {
  nextBackAction,
  SHEET_PRECEDENCE,
  topSheet,
  type BackState,
} from '../src/navigation/backAction';

/**
 * El back del sistema en Android, como tabla.
 *
 * Es una función pura a propósito: el handler de `BackHandler` sólo la llama y
 * aplica el efecto. Así la precedencia completa (sheet → match → overlay → salir)
 * se fija en un test de node, sin emulador: en el device sólo se confirma que la
 * tabla se siente bien.
 *
 * El orden de los sheets NO es mental, es el orden de pintado del JSX: el
 * `ZoneSheet` es el último hijo de la pila absoluta, así que queda arriba del
 * selector de perfiles y del de simulación. Back cierra lo que se ve.
 */
const NO_SHEET = { sim: false, profiles: false, zone: false };
const NO_OVERLAY: BackState = { sheet: null, match: false, overlay: null, hasProfile: false };

describe('topSheet', () => {
  it('sin sheets abiertos no hay nada que cerrar', () => {
    expect(topSheet(NO_SHEET)).toBeNull();
  });

  it('la zona gana sobre el selector de perfiles y sobre simulación', () => {
    expect(SHEET_PRECEDENCE).toEqual(['zone', 'profiles', 'sim']);
    expect(topSheet({ zone: true, profiles: true, sim: true })).toBe('zone');
    expect(topSheet({ zone: false, profiles: true, sim: true })).toBe('profiles');
    expect(topSheet({ zone: false, profiles: false, sim: true })).toBe('sim');
  });
});

describe('nextBackAction', () => {
  it('un sheet abierto se cierra primero, con o sin overlay detrás', () => {
    for (const overlay of [null, 'profile', 'safety', 'chat', 'notifications'] as const) {
      for (const sheet of ['zone', 'profiles', 'sim'] as const) {
        expect(nextBackAction({ sheet, match: false, overlay, hasProfile: true })).toEqual({
          type: 'close-sheet',
          sheet,
        });
      }
    }
  });

  it('sin sheet, el back documentado del overlay corre antes de salir', () => {
    expect(
      nextBackAction({ sheet: null, match: false, overlay: 'chat', hasProfile: true }),
    ).toEqual({
      type: 'open-overlay',
      overlay: 'pings',
    });
    expect(
      nextBackAction({ sheet: null, match: false, overlay: 'safety', hasProfile: true }),
    ).toEqual({
      type: 'open-overlay',
      overlay: 'profile',
    });
  });

  it('seguridad sin perfil elegido sólo cierra el overlay', () => {
    expect(
      nextBackAction({ sheet: null, match: false, overlay: 'safety', hasProfile: false }),
    ).toEqual({
      type: 'close-overlay',
    });
  });

  it('los demás overlays cierran y vuelven a la vista de abajo', () => {
    for (const overlay of [
      'profile',
      'notifications',
      'filters',
      'settings',
      'about',
      'blocked',
      'privacy',
    ] as const) {
      expect(nextBackAction({ sheet: null, match: false, overlay, hasProfile: true })).toEqual({
        type: 'close-overlay',
      });
    }
  });

  it('en la raíz no intercepta: deja que la plataforma salga', () => {
    expect(nextBackAction(NO_OVERLAY)).toEqual({ type: 'exit' });
  });

  it('la celebración de match se cierra antes de salir, aunque no haya overlay', () => {
    // Regresión: sin esto la app se cerraba con la celebración full-screen arriba.
    expect(
      nextBackAction({ sheet: null, match: true, overlay: null, hasProfile: false }),
    ).toEqual({ type: 'close-overlay' });
  });

  it('el sheet gana sobre la celebración', () => {
    expect(
      nextBackAction({ sheet: 'zone', match: true, overlay: null, hasProfile: true }),
    ).toEqual({ type: 'close-sheet', sheet: 'zone' });
  });

  it('la celebración gana sobre el overlay que quedó debajo', () => {
    // Se pinta después del `Overlay` en el JSX: back cierra lo que está arriba.
    for (const overlay of ['chat', 'safety', 'notifications'] as const) {
      expect(
        nextBackAction({ sheet: null, match: true, overlay, hasProfile: true }),
      ).toEqual({ type: 'close-overlay' });
    }
  });

  it('sin celebración en la raíz sigue saliendo', () => {
    expect(
      nextBackAction({ sheet: null, match: false, overlay: null, hasProfile: true }),
    ).toEqual({ type: 'exit' });
  });

  it('la precedencia es sheet → match → overlay → salir, sin atajos', () => {
    // Con un sheet arriba, ni el back de chat ni el de seguridad se adelantan.
    expect(
      nextBackAction({ sheet: 'zone', match: false, overlay: 'chat', hasProfile: true }),
    ).toEqual({
      type: 'close-sheet',
      sheet: 'zone',
    });
    // Sin sheet y con chat, nunca `exit` aunque no haya perfil.
    expect(
      nextBackAction({ sheet: null, match: false, overlay: 'chat', hasProfile: false }),
    ).toEqual({
      type: 'open-overlay',
      overlay: 'pings',
    });
  });
});
