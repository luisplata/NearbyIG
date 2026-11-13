import type { IconName } from '../components/Icon';
import { fmt } from '../generated/copy';
import { chatCopy } from '../live/chatCopy';
import type { DemoOverlay, DemoView } from '../state/types';

/**
 * Navegación de la demo Expo: Lista → Radar → **Chat** → Perfil. No hay tab Mapa:
 * `DemoView.map` sigue reservado y renderiza la misma composición de radar.
 *
 * **El chat es un tab principal, no una pestaña escondida.** El cuarto ítem era
 * "Pings" y dentro vivía una pestaña Matches; el usuario no la encontraba. Ahora
 * el tab dice Chat y abre directo en Conversaciones. Los pings no se pierden:
 * son los segmentos Recibidos/Enviados de esa misma pantalla.
 *
 * **La clave del overlay sigue siendo `pings`.** Es la que entiende el reducer
 * (27 acciones congeladas y golden de paridad): cambiar la etiqueta visible no
 * tiene por qué mover el estado.
 *
 * Los labels son strings ya resueltos y no claves de copy porque `nav.pings` del
 * catálogo compartido dice "Pings": el catálogo alimenta el artefacto mock
 * congelado y no se toca por un cambio de la app Expo.
 */
export type NavItem =
  | {
      id: 'list' | 'radar';
      kind: 'view';
      view: DemoView;
      icon: IconName;
      label: string;
    }
  | {
      id: 'chat' | 'profile';
      kind: 'overlay';
      overlay: Extract<DemoOverlay, 'pings' | 'settings'>;
      icon: IconName;
      label: string;
    };

export type NavOverlay = Extract<DemoOverlay, 'pings' | 'settings'>;

export const NAV_ITEMS: readonly NavItem[] = [
  { id: 'list', kind: 'view', view: 'list', icon: 'list', label: fmt('nav.list') },
  { id: 'radar', kind: 'view', view: 'radar', icon: 'radar', label: fmt('nav.radar') },
  { id: 'chat', kind: 'overlay', overlay: 'pings', icon: 'chat', label: chatCopy.navChat },
  {
    id: 'profile',
    kind: 'overlay',
    overlay: 'settings',
    icon: 'person',
    label: fmt('nav.profile'),
  },
];

/** Lista es la vista inicial en carga, RESET y refresh. */
export const DEFAULT_VIEW: DemoView = 'list';

/** Sólo las tabs de descubrimiento pueden quedar seleccionadas. */
export function isSelectedTab(item: NavItem, view: DemoView): boolean {
  return item.kind === 'view' && item.view === view;
}

/**
 * Lo que la barra inferior tiene para anunciar.
 *
 * `messages` es el número del badge del tab Chat (mensajes sin leer de los
 * matches); `pings` es el contador de pendientes, que se dibuja adentro de la
 * pantalla sobre el segmento Recibidos. Son dos cosas distintas a propósito: un
 * ping esperando respuesta no es un mensaje sin leer, y sumarlos haría que el
 * badge mienta.
 */
export type NavBadges = {
  messages: number;
  pings: number;
};

/** Badge del tab Chat: sólo mensajes sin leer; en cero no se anuncia nada. */
export function badgeCount(item: NavItem, badges: NavBadges): number | undefined {
  if (item.kind !== 'overlay' || item.id !== 'chat') {
    return undefined;
  }
  return badges.messages > 0 ? badges.messages : undefined;
}

/** Pings que todavía esperan respuesta: badge del segmento Recibidos. */
export function pingsBadge(badges: NavBadges): number | undefined {
  return badges.pings > 0 ? badges.pings : undefined;
}
