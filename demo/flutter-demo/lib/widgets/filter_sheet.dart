import 'package:flutter/material.dart';

import '../generated/copy.dart';
import '../generated/fixtures.dart';
import '../generated/tokens.dart';
import '../state/demo_action.dart';
import '../state/demo_scope.dart';
import 'intention_chips.dart';
import 'radius_control.dart';

/// Hoja de filtros: radio + intención + género + verificados + en línea. Todo
/// cambio se refleja de inmediato en radar, mapa y lista (F-3).
class FilterSheet extends StatelessWidget {
  const FilterSheet({super.key});

  @override
  Widget build(BuildContext context) {
    final store = DemoScope.of(context);
    final state = store.state;
    final selectedIntentions =
        state.filters.intentions?.toSet() ?? <Intention>{};
    return SingleChildScrollView(
      padding: EdgeInsets.only(bottom: Tokens.space[3]),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          RadiusControl(
            radiusM: state.filters.radiusM,
            onChanged: (value) => store.dispatch(DemoAction.setRadius(value)),
          ),
          SizedBox(height: Tokens.space[3]),
          Text(
            fmt('filters.intention'),
            style: TextStyle(
              fontSize: Tokens.fontSizes[0],
              color: Tokens.colorMuted,
            ),
          ),
          const SizedBox(height: 6),
          IntentionChips(
            selected: selectedIntentions,
            onTap: (intention) =>
                store.dispatch(DemoAction.toggleFilterIntention(intention)),
          ),
          SizedBox(height: Tokens.space[3]),
          Text(
            fmt('filters.gender'),
            style: TextStyle(
              fontSize: Tokens.fontSizes[0],
              color: Tokens.colorMuted,
            ),
          ),
          const SizedBox(height: 6),
          Wrap(
            spacing: Tokens.space[1],
            runSpacing: Tokens.space[1],
            children: <Widget>[
              _GenderOption(
                label: fmt('filters.genderAll'),
                selected: state.filters.gender == null,
                onTap: () =>
                    store.dispatch(const DemoAction.setGenderFilter(null)),
              ),
              for (final gender in kFilters.genders)
                _GenderOption(
                  label: fmt('gender.${gender.name}'),
                  selected: state.filters.gender == gender,
                  onTap: () =>
                      store.dispatch(DemoAction.setGenderFilter(gender)),
                ),
            ],
          ),
          SizedBox(height: Tokens.space[2]),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            value: state.filters.verifiedOnly,
            onChanged: (_) =>
                store.dispatch(const DemoAction.toggleVerifiedOnly()),
            title: Text(
              fmt('filters.verifiedOnly'),
              style: TextStyle(
                fontSize: Tokens.fontSizes[1],
                color: Tokens.colorText,
              ),
            ),
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            value: state.filters.onlineOnly,
            onChanged: (_) =>
                store.dispatch(const DemoAction.toggleOnlineOnly()),
            title: Text(
              fmt('filters.onlineOnly'),
              style: TextStyle(
                fontSize: Tokens.fontSizes[1],
                color: Tokens.colorText,
              ),
            ),
          ),
          SizedBox(height: Tokens.space[1]),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton(
              onPressed: () => store.dispatch(const DemoAction.clearFilters()),
              child: Text(fmt('filters.clear')),
            ),
          ),
        ],
      ),
    );
  }
}

class _GenderOption extends StatelessWidget {
  const _GenderOption({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
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
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: selected ? Tokens.colorSurfaceAlt : Tokens.colorSurface,
            borderRadius: const BorderRadius.all(Radius.circular(999)),
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
