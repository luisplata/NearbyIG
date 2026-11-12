import type { CopyKey } from '../generated/copy';
import type { DemoState } from '../state/types';

export type GhostSwitchModel = {
  checked: boolean;
  disabled: boolean;
  labelKey: CopyKey;
};

/**
 * El switch del header lee el mismo `ghost` que Ajustes y despacha
 * `TOGGLE_GHOST`. Se deshabilita mientras hay un overlay de perfil o chat
 * abierto: un toque accidental no puede cerrarlo. El reducer no cambia.
 */
export function ghostSwitch(state: Pick<DemoState, 'ghost' | 'overlay'>): GhostSwitchModel {
  return {
    checked: state.ghost,
    disabled: state.overlay === 'profile' || state.overlay === 'chat',
    labelKey: 'settings.ghost',
  };
}
