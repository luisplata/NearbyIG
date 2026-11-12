import type { IconName } from '../components/Icon';
import type { CopyKey } from '../generated/copy';
import type { DemoOverlay, DemoView } from '../state/types';

/** Overlays que se abren desde la barra inferior (sin cambiar la vista). */
export type NavOverlay = Extract<DemoOverlay, 'pings' | 'settings'>;

export type NavItem =
  | {
      id: 'list' | 'radar';
      kind: 'view';
      view: DemoView;
      icon: IconName;
      labelKey: CopyKey;
    }
  | {
      id: 'pings' | 'profile';
      kind: 'overlay';
      overlay: NavOverlay;
      icon: IconName;
      labelKey: CopyKey;
    };

/**
 * Navegación de la demo Expo: Lista → Radar → Pings → Perfil. No hay tab Mapa:
 * `DemoView.map` sigue reservado y renderiza la misma composición de radar.
 * Datos puros para poder testear orden, labels y badge sin renderizar.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { id: 'list', kind: 'view', view: 'list', icon: 'list', labelKey: 'nav.list' },
  { id: 'radar', kind: 'view', view: 'radar', icon: 'radar', labelKey: 'nav.radar' },
  { id: 'pings', kind: 'overlay', overlay: 'pings', icon: 'ping', labelKey: 'nav.pings' },
  { id: 'profile', kind: 'overlay', overlay: 'settings', icon: 'person', labelKey: 'nav.profile' },
];

/** Lista es la vista inicial en carga, RESET y refresh. */
export const DEFAULT_VIEW: DemoView = 'list';

/** Sólo las tabs de descubrimiento pueden quedar seleccionadas. */
export function isSelectedTab(item: NavItem, view: DemoView): boolean {
  return item.kind === 'view' && item.view === view;
}

/** Badge de pings entrantes: sin pings no se anuncia nada. */
export function badgeCount(item: NavItem, incomingPings: number): number | undefined {
  if (item.kind !== 'overlay' || item.id !== 'pings' || incomingPings <= 0) {
    return undefined;
  }
  return incomingPings;
}
