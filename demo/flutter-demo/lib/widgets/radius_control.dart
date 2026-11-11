import 'package:flutter/material.dart';

import '../generated/copy.dart';
import '../generated/fixtures.dart';
import '../generated/tokens.dart';
import '../state/format.dart';

/// Selector de radio: siempre uno de los valores del contrato (500 m–5 km).
class RadiusControl extends StatelessWidget {
  const RadiusControl({
    super.key,
    required this.radiusM,
    required this.onChanged,
    this.showLabel = true,
  });

  final int radiusM;
  final ValueChanged<int> onChanged;
  final bool showLabel;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        if (showLabel)
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Text(
              fmt('discovery.radiusLabel'),
              style: TextStyle(
                fontSize: Tokens.fontSizes[0],
                color: Tokens.colorMuted,
              ),
            ),
          ),
        Wrap(
          spacing: Tokens.space[1],
          runSpacing: Tokens.space[1],
          children: <Widget>[
            for (final value in kFilters.radiiM)
              _RadiusOption(
                value: value,
                selected: value == radiusM,
                onTap: () => onChanged(value),
              ),
          ],
        ),
      ],
    );
  }
}

class _RadiusOption extends StatelessWidget {
  const _RadiusOption({
    required this.value,
    required this.selected,
    required this.onTap,
  });

  final int value;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final label = formatRadius(value);
    return Semantics(
      button: true,
      selected: selected,
      label: label,
      child: InkWell(
        onTap: onTap,
        borderRadius: const BorderRadius.all(Radius.circular(12)),
        child: Container(
          constraints: const BoxConstraints(minHeight: 44, minWidth: 56),
          padding: EdgeInsets.symmetric(horizontal: Tokens.space[2]),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: selected ? Tokens.colorSurfaceAlt : Tokens.colorSurface,
            borderRadius: const BorderRadius.all(Radius.circular(12)),
            border: Border.all(
              color: selected ? Tokens.colorAccent : Tokens.colorBorder,
            ),
          ),
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
    );
  }
}
