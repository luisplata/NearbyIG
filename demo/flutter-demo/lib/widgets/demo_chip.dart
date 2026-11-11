import 'package:flutter/material.dart';

import '../generated/tokens.dart';

/// Chip del contrato. `emphasis` se usa para el chip DEMO persistente; el resto
/// son etiquetas de datos (intención, verificado, leyenda del mapa).
class DemoChip extends StatelessWidget {
  const DemoChip({
    super.key,
    required this.label,
    this.emphasis = false,
    this.icon,
    this.onTap,
    this.upperCase = false,
  });

  final String label;
  final bool emphasis;
  final IconData? icon;
  final VoidCallback? onTap;
  final bool upperCase;

  @override
  Widget build(BuildContext context) {
    final foreground = emphasis ? Tokens.colorBg : Tokens.colorMuted;
    final background = emphasis ? Tokens.colorAccent : Tokens.colorSurfaceAlt;
    final chip = Container(
      constraints: const BoxConstraints(minHeight: 24),
      padding: EdgeInsets.symmetric(horizontal: Tokens.space[1], vertical: 2),
      decoration: BoxDecoration(
        color: background,
        borderRadius: const BorderRadius.all(Radius.circular(999)),
        border: Border.all(
          color: emphasis ? Tokens.colorAccent : Tokens.colorBorder,
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          if (icon != null) ...<Widget>[
            Icon(icon, size: 14, color: foreground),
            const SizedBox(width: 4),
          ],
          Flexible(
            child: Text(
              upperCase ? label.toUpperCase() : label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: Tokens.fontSizes[0],
                fontWeight: FontWeight.w600,
                letterSpacing: 0.4,
                color: foreground,
              ),
            ),
          ),
        ],
      ),
    );

    if (onTap == null) {
      return Semantics(
        label: label,
        child: ExcludeSemantics(child: chip),
      );
    }
    return Semantics(
      button: true,
      label: label,
      child: InkWell(
        onTap: onTap,
        borderRadius: const BorderRadius.all(Radius.circular(999)),
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 44),
          child: Center(widthFactor: 1, heightFactor: 1, child: chip),
        ),
      ),
    );
  }
}
