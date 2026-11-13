import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { fmt } from '../generated/copy';
import {
  badgeCount,
  isSelectedTab,
  NAV_ITEMS,
  pingsBadge,
  type NavBadges,
  type NavItem,
} from '../navigation/navItems';
import type { DemoView } from '../state/types';
import { focusRingInset } from '../theme/focusRing';
import { colors, fontFamily, fontSize, space } from '../theme/theme';

import { Icon } from './Icon';

/**
 * Barra inferior con cuatro tabs: Lista → Radar → Chat → Perfil. Sin tab Mapa y
 * sin historial (F-11). Cada ítem mantiene 44 px mínimos, etiqueta semántica,
 * estado seleccionado y foco visible.
 *
 * **El badge del Chat cuenta mensajes, nunca pings.** Un ping pendiente es otra
 * cosa y se anuncia sobre el segmento Recibidos, adentro de la pantalla; si el
 * tab sumara las dos cosas el número no querría decir nada.
 *
 * **Foco.** El anillo es interior (`focusRingInset`): la barra vive dentro de un
 * marco con `overflow: hidden` y un anillo externo se recortaría en el borde de
 * la pantalla. Ya no queda el subrayado `borderTop` como segundo indicador.
 */
export function BottomNav({
  view,
  badges,
  onSelect,
}: {
  view: DemoView;
  badges: NavBadges;
  onSelect: (item: NavItem) => void;
}) {
  return (
    <View style={styles.bar} accessibilityRole="tablist">
      {NAV_ITEMS.map((item) => (
        <NavItemView
          key={item.id}
          item={item}
          selected={isSelectedTab(item, view)}
          badge={badgeCount(item, badges)}
          pings={item.id === 'chat' ? pingsBadge(badges) : undefined}
          onSelect={onSelect}
        />
      ))}
    </View>
  );
}

function NavItemView({
  item,
  selected,
  badge,
  pings,
  onSelect,
}: {
  item: NavItem;
  selected: boolean;
  badge: number | undefined;
  /** Punto chico de pings pendientes: no reemplaza al badge de mensajes. */
  pings: number | undefined;
  onSelect: (item: NavItem) => void;
}) {
  const [focused, setFocused] = useState(false);
  const color = selected ? colors.accent : colors.muted;
  const label = item.label;

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      aria-selected={selected}
      onPress={() => onSelect(item)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [styles.item, focusRingInset(focused), pressed && styles.pressed]}
    >
      <View style={styles.iconWrap}>
        <Icon name={item.icon} size={20} color={color} />
        {badge === undefined ? null : (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        )}
        {pings === undefined ? null : <View style={styles.dot} />}
      </View>
      <Text numberOfLines={1} style={[styles.label, { color }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: space[0],
  },
  item: {
    flex: 1,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  pressed: {
    opacity: 0.7,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    right: -10,
    top: -6,
    minWidth: 16,
    paddingHorizontal: 3,
    borderRadius: 999,
    backgroundColor: colors.accent,
    alignItems: 'center',
  },
  dot: {
    position: 'absolute',
    left: -10,
    top: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.surface,
    backgroundColor: colors.accent,
  },
  badgeText: {
    fontFamily: fontFamily.semibold,
    fontSize: 10,
    color: colors.bg,
  },
  label: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize[0],
  },
});
