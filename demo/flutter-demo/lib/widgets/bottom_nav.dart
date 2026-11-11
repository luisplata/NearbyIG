import 'package:flutter/material.dart';

import '../generated/copy.dart';
import '../generated/tokens.dart';
import '../state/demo_state.dart';

enum NavTarget { radar, map, list, pings, profile }

/// Barra inferior: las tres vistas de descubrimiento, la bandeja de pings y el
/// perfil propio. No hay tabs de historial (F-11). Cada item tiene 44 px de alto
/// mínimo y etiqueta semántica.
class BottomNav extends StatelessWidget {
  const BottomNav({
    super.key,
    required this.view,
    required this.pingsCount,
    required this.onSelect,
  });

  final DemoView view;
  final int pingsCount;
  final ValueChanged<NavTarget> onSelect;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: Tokens.colorSurface,
        border: Border(top: BorderSide(color: Tokens.colorBorder)),
      ),
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: <Widget>[
          _NavItem(
            target: NavTarget.list,
            icon: Icons.view_list_outlined,
            label: fmt('nav.list'),
            selected: view == DemoView.list,
            onSelect: onSelect,
          ),
          _NavItem(
            target: NavTarget.radar,
            icon: Icons.radar,
            label: fmt('nav.radar'),
            selected: view == DemoView.radar,
            onSelect: onSelect,
          ),
          _NavItem(
            target: NavTarget.map,
            icon: Icons.map_outlined,
            label: fmt('nav.map'),
            selected: view == DemoView.map,
            onSelect: onSelect,
          ),
          _NavItem(
            target: NavTarget.pings,
            icon: Icons.wifi_tethering,
            label: fmt('nav.pings'),
            badgeCount: pingsCount,
            selected: false,
            onSelect: onSelect,
          ),
          _NavItem(
            target: NavTarget.profile,
            icon: Icons.person_outline,
            label: fmt('nav.profile'),
            selected: false,
            onSelect: onSelect,
          ),
        ],
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  const _NavItem({
    required this.target,
    required this.icon,
    required this.label,
    required this.selected,
    required this.onSelect,
    this.badgeCount = 0,
  });

  final NavTarget target;
  final IconData icon;
  final String label;
  final bool selected;
  final ValueChanged<NavTarget> onSelect;
  final int badgeCount;

  @override
  Widget build(BuildContext context) {
    final color = selected ? Tokens.colorAccent : Tokens.colorMuted;
    return Expanded(
      child: Semantics(
        button: true,
        selected: selected,
        label: label,
        child: InkWell(
          onTap: () => onSelect(target),
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 52),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: <Widget>[
                Stack(
                  clipBehavior: Clip.none,
                  children: <Widget>[
                    Icon(icon, size: 20, color: color),
                    if (badgeCount > 0)
                      Positioned(
                        right: -8,
                        top: -4,
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 4),
                          constraints: const BoxConstraints(minWidth: 16),
                          decoration: const BoxDecoration(
                            color: Tokens.colorAccent,
                            borderRadius: BorderRadius.all(
                              Radius.circular(999),
                            ),
                          ),
                          child: Text(
                            '$badgeCount',
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w600,
                              color: Tokens.colorBg,
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: Tokens.fontSizes[0],
                    fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
                    color: color,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
