import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { fmt } from '../generated/copy';
import type { DemoView } from '../state/types';
import { colors, fontFamily, fontSize, space } from '../theme/theme';

import { Icon, type IconName } from './Icon';

export type NavTarget = DemoView | 'pings' | 'profile';

type Item = {
  target: NavTarget;
  icon: IconName;
  label: string;
  badge?: number;
};

/**
 * Barra inferior: las tres vistas de descubrimiento, la bandeja de pings y el
 * perfil propio. No hay tabs de historial (F-11). 44 px mínimo y etiqueta
 * semántica por ítem.
 */
export function BottomNav({
  view,
  pingsCount,
  onSelect,
}: {
  view: DemoView;
  pingsCount: number;
  onSelect: (target: NavTarget) => void;
}) {
  const items: Item[] = [
    { target: 'radar', icon: 'radar', label: fmt('nav.radar') },
    { target: 'map', icon: 'map', label: fmt('nav.map') },
    { target: 'list', icon: 'list', label: fmt('nav.list') },
    { target: 'pings', icon: 'ping', label: fmt('nav.pings'), badge: pingsCount },
    { target: 'profile', icon: 'person', label: fmt('nav.profile') },
  ];

  return (
    <View style={styles.bar} accessibilityRole="tablist">
      {items.map((item) => (
        <NavItem
          key={item.target}
          item={item}
          selected={item.target === view}
          onSelect={onSelect}
        />
      ))}
    </View>
  );
}

function NavItem({
  item,
  selected,
  onSelect,
}: {
  item: Item;
  selected: boolean;
  onSelect: (target: NavTarget) => void;
}) {
  const [focused, setFocused] = useState(false);
  const color = selected ? colors.accent : colors.muted;

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={item.label}
      accessibilityState={{ selected }}
      onPress={() => onSelect(item.target)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [styles.item, focused && styles.focused, pressed && styles.pressed]}
    >
      <View style={styles.iconWrap}>
        <Icon name={item.icon} size={20} color={color} />
        {item.badge !== undefined && item.badge > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{item.badge}</Text>
          </View>
        ) : null}
      </View>
      <Text numberOfLines={1} style={[styles.label, { color }]}>
        {item.label}
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
