import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { fmt } from '../generated/copy';
import { badgeCount, isSelectedTab, NAV_ITEMS, type NavItem } from '../navigation/navItems';
import type { DemoView } from '../state/types';
import { colors, fontFamily, fontSize, space } from '../theme/theme';

import { Icon } from './Icon';

/**
 * Barra inferior con cuatro tabs: Lista → Radar → Pings → Perfil. Sin tab Mapa
 * y sin historial (F-11). Cada ítem mantiene 44 px mínimos, etiqueta semántica,
 * estado seleccionado y foco visible.
 */
export function BottomNav({
  view,
  pingsCount,
  onSelect,
}: {
  view: DemoView;
  pingsCount: number;
  onSelect: (item: NavItem) => void;
}) {
  return (
    <View style={styles.bar} accessibilityRole="tablist">
      {NAV_ITEMS.map((item) => (
        <NavItemView
          key={item.id}
          item={item}
          selected={isSelectedTab(item, view)}
          badge={badgeCount(item, pingsCount)}
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
  onSelect,
}: {
  item: NavItem;
  selected: boolean;
  badge: number | undefined;
  onSelect: (item: NavItem) => void;
}) {
  const [focused, setFocused] = useState(false);
  const color = selected ? colors.accent : colors.muted;
  const label = fmt(item.labelKey);

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      aria-selected={selected}
      onPress={() => onSelect(item)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [styles.item, focused && styles.focused, pressed && styles.pressed]}
    >
      <View style={styles.iconWrap}>
        <Icon name={item.icon} size={20} color={color} />
        {badge === undefined ? null : (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        )}
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
    borderTopWidth: 2,
    borderTopColor: 'transparent',
  },
  focused: {
    borderTopColor: colors.accent,
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
