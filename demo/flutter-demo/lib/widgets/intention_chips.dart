import 'package:flutter/material.dart';

import '../generated/copy.dart';
import '../generated/fixtures.dart';
import '../generated/tokens.dart';

/// Selector de intenciones (las 4 del dataset). Se usa en el perfil propio
/// (selección simple) y en el filtro de descubrimiento (selección múltiple).
class IntentionChips extends StatelessWidget {
  const IntentionChips({
    super.key,
    required this.selected,
    required this.onTap,
  });

  final Set<Intention> selected;
  final ValueChanged<Intention> onTap;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: Tokens.space[1],
      runSpacing: Tokens.space[1],
      children: <Widget>[
        for (final intention in kFilters.intentions)
          _IntentionChip(
            intention: intention,
            selected: selected.contains(intention),
            onTap: () => onTap(intention),
          ),
      ],
    );
  }
}

class _IntentionChip extends StatelessWidget {
  const _IntentionChip({
    required this.intention,
    required this.selected,
    required this.onTap,
  });

  final Intention intention;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final label = fmt('intention.${intention.name}');
    return Semantics(
      button: true,
      selected: selected,
      label: label,
      child: InkWell(
        onTap: onTap,
        borderRadius: const BorderRadius.all(Radius.circular(999)),
        child: Container(
          constraints: const BoxConstraints(minHeight: 44),
          padding: EdgeInsets.symmetric(horizontal: Tokens.space[2]),
          decoration: BoxDecoration(
            color: selected ? Tokens.colorSurfaceAlt : Tokens.colorSurface,
            borderRadius: const BorderRadius.all(Radius.circular(999)),
            border: Border.all(
              color: selected ? Tokens.colorAccent : Tokens.colorBorder,
            ),
          ),
          child: Center(
            widthFactor: 1,
            child: Text(
              label,
              style: TextStyle(
                fontSize: Tokens.fontSizes[1],
                fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
                color: selected ? Tokens.colorAccent : Tokens.colorMuted,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
