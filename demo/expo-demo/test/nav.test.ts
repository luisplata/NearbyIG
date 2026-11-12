import { describe, expect, it } from 'vitest';

import { copy } from '../src/generated/copy';
import {
  DEFAULT_VIEW,
  NAV_ITEMS,
  badgeCount,
  isSelectedTab,
  type NavItem,
} from '../src/navigation/navItems';

function item(id: NavItem['id']): NavItem {
  const found = NAV_ITEMS.find((entry) => entry.id === id);
  if (found === undefined) {
    throw new Error(`falta el ítem ${id}`);
  }
  return found;
}

describe('navegación de cuatro tabs', () => {
  it('ordena Lista → Radar → Pings → Perfil y no incluye Mapa', () => {
    expect(NAV_ITEMS.map((entry) => entry.id)).toEqual(['list', 'radar', 'pings', 'profile']);
    expect(NAV_ITEMS.map((entry) => entry.labelKey)).toEqual([
      'nav.list',
      'nav.radar',
      'nav.pings',
      'nav.profile',
    ]);
    expect(NAV_ITEMS).toHaveLength(4);
    expect(NAV_ITEMS.some((entry) => entry.kind === 'view' && entry.view === 'map')).toBe(false);
  });

  it('todas las etiquetas resuelven en el catálogo de copy', () => {
    for (const entry of NAV_ITEMS) {
      expect(copy[entry.labelKey]).toBeTruthy();
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
    expect(isSelectedTab(item('pings'), 'list')).toBe(false);
    expect(isSelectedTab(item('profile'), 'radar')).toBe(false);
  });

  it('Pings y Perfil abren overlays sin cambiar la vista', () => {
    const pings = item('pings');
    const profile = item('profile');
    expect(pings.kind === 'overlay' ? pings.overlay : null).toBe('pings');
    expect(profile.kind === 'overlay' ? profile.overlay : null).toBe('settings');
  });

  it('el badge es sólo de Pings y se oculta en cero', () => {
    expect(badgeCount(item('pings'), 3)).toBe(3);
    expect(badgeCount(item('pings'), 0)).toBeUndefined();
    expect(badgeCount(item('list'), 3)).toBeUndefined();
    expect(badgeCount(item('profile'), 3)).toBeUndefined();
  });
});
