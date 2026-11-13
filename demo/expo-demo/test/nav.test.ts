import { describe, expect, it } from 'vitest';

import { fmt } from '../src/generated/copy';
import { chatCopy } from '../src/live/chatCopy';
import {
  DEFAULT_VIEW,
  NAV_ITEMS,
  badgeCount,
  isSelectedTab,
  pingsBadge,
  type NavItem,
} from '../src/navigation/navItems';

function item(id: NavItem['id']): NavItem {
  const found = NAV_ITEMS.find((entry) => entry.id === id);
  if (found === undefined) {
    throw new Error(`falta el ítem ${id}`);
  }
  return found;
}

/**
 * **Por qué cambió este test.** El cuarto ítem ya no es "Pings" sino **"Chat"**, y
 * el badge dejó de contar pings para contar mensajes sin leer. El usuario no
 * encontraba el chat dentro de Pings → pestaña Matches, así que el chat pasó a
 * ser un tab principal y los pings, un segmento adentro. Los pings pendientes no
 * desaparecen del nav: se dibujan como punto sobre el mismo tab y como contador
 * en el segmento Recibidos (ver `pingsBadge`).
 */
describe('navegación de cuatro tabs', () => {
  it('ordena Lista → Radar → Chat → Perfil y no incluye Mapa', () => {
    expect(NAV_ITEMS.map((entry) => entry.id)).toEqual(['list', 'radar', 'chat', 'profile']);
    expect(NAV_ITEMS.map((entry) => entry.label)).toEqual([
      fmt('nav.list'),
      fmt('nav.radar'),
      chatCopy.navChat,
      fmt('nav.profile'),
    ]);
    expect(NAV_ITEMS.map((entry) => entry.icon)).toEqual(['list', 'radar', 'chat', 'person']);
    expect(NAV_ITEMS).toHaveLength(4);
    expect(NAV_ITEMS.some((entry) => entry.kind === 'view' && entry.view === 'map')).toBe(false);
  });

  it('el tab Chat se llama Chat y no Pings', () => {
    expect(item('chat').label).toBe('Chat');
    expect(fmt('nav.pings')).not.toBe('Chat');
  });

  it('todas las etiquetas son texto no vacío', () => {
    for (const entry of NAV_ITEMS) {
      expect(entry.label.trim().length, entry.id).toBeGreaterThan(0);
    }
  });

  it('Lista es la vista inicial', () => {
    expect(DEFAULT_VIEW).toBe('list');
    expect(NAV_ITEMS[0]?.kind).toBe('view');
    expect(NAV_ITEMS[0]?.kind === 'view' ? NAV_ITEMS[0].view : null).toBe('list');
  });

  it('sólo la vista de descubrimiento activa queda seleccionada', () => {
    expect(isSelectedTab(item('list'), 'list')).toBe(true);
    expect(isSelectedTab(item('radar'), 'list')).toBe(false);
    expect(isSelectedTab(item('radar'), 'radar')).toBe(true);
    expect(isSelectedTab(item('radar'), 'map')).toBe(false);
    expect(isSelectedTab(item('chat'), 'list')).toBe(false);
    expect(isSelectedTab(item('profile'), 'radar')).toBe(false);
  });

  it('Chat y Perfil abren overlays sin cambiar la vista', () => {
    const chat = item('chat');
    const profile = item('profile');
    // La clave del overlay sigue siendo `pings`: es la del reducer congelado.
    expect(chat.kind === 'overlay' ? chat.overlay : null).toBe('pings');
    expect(profile.kind === 'overlay' ? profile.overlay : null).toBe('settings');
  });

  it('el badge del Chat cuenta mensajes, nunca pings', () => {
    expect(badgeCount(item('chat'), { messages: 3, pings: 9 })).toBe(3);
    expect(badgeCount(item('chat'), { messages: 0, pings: 9 })).toBeUndefined();
    expect(badgeCount(item('list'), { messages: 3, pings: 0 })).toBeUndefined();
    expect(badgeCount(item('radar'), { messages: 3, pings: 0 })).toBeUndefined();
    expect(badgeCount(item('profile'), { messages: 3, pings: 0 })).toBeUndefined();
  });

  it('los pings pendientes viajan aparte, para el segmento Recibidos', () => {
    expect(pingsBadge({ messages: 0, pings: 4 })).toBe(4);
    expect(pingsBadge({ messages: 7, pings: 0 })).toBeUndefined();
  });
});
