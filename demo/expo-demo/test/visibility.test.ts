import { describe, expect, it } from 'vitest';

import { ghostSwitch } from '../src/components/visibilityModel';
import { copy } from '../src/generated/copy';
import { initialState, reduce } from '../src/state/reducer';
import { pingBlockedReason, visibleProfiles } from '../src/state/selectors';

describe('switch de visibilidad del header', () => {
  it('refleja el estado fantasma y arranca apagado', () => {
    const state = initialState();
    expect(ghostSwitch(state)).toEqual({
      checked: false,
      disabled: false,
      labelKey: 'settings.ghost',
    });

    const on = reduce(state, { type: 'TOGGLE_GHOST' }).state;
    expect(ghostSwitch(on).checked).toBe(true);
  });

  it('se deshabilita sólo con los overlays de perfil o chat', () => {
    const base = initialState();
    for (const overlay of ['profile', 'chat'] as const) {
      expect(ghostSwitch({ ...base, overlay }).disabled).toBe(true);
    }
    for (const overlay of ['pings', 'settings', 'filters', 'notifications', null] as const) {
      expect(ghostSwitch({ ...base, overlay }).disabled).toBe(false);
    }
  });

  it('ON significa pausa: pings bloqueados y puntos visibles', () => {
    const off = initialState();
    const on = reduce(off, { type: 'TOGGLE_GHOST' }).state;

    expect(pingBlockedReason(on, 'p01')).toBe('ping.blocked.paused');
    expect(visibleProfiles(on).map((profile) => profile.id)).toEqual(
      visibleProfiles(off).map((profile) => profile.id),
    );
  });

  it('RESET vuelve a apagar el modo fantasma', () => {
    const on = reduce(initialState(), { type: 'TOGGLE_GHOST' }).state;
    expect(on.ghost).toBe(true);

    const reset = reduce(on, { type: 'RESET' }).state;
    expect(reset.ghost).toBe(false);
    expect(ghostSwitch(reset).checked).toBe(false);
  });

  it('el copy del switch no habla de demo ni de mock', () => {
    for (const key of ['settings.ghost', 'settings.ghostOn', 'ping.blocked.paused'] as const) {
      expect(copy[key].toLowerCase()).not.toMatch(/demo|mock/);
    }
    expect(copy['settings.ghost'].toLowerCase()).toMatch(/fantasma|visibilidad|pausa/);
    expect(copy['settings.ghostOn'].toLowerCase()).toMatch(/pausa/);
    expect(copy['settings.ghostOn'].toLowerCase()).not.toMatch(/invisib/);
  });
});
