import 'package:flutter/material.dart';

import '../generated/copy.dart';
import '../generated/fixtures.dart';
import '../generated/tokens.dart';
import '../state/demo_action.dart';
import '../state/demo_scope.dart';
import '../state/demo_state.dart';
import '../state/demo_store.dart';
import '../state/format.dart';
import '../state/selectors.dart';
import '../widgets/bottom_nav.dart';
import '../widgets/map_view.dart';
import '../widgets/profile_card.dart';
import '../widgets/profile_list.dart';
import '../widgets/radar_view.dart';
import '../widgets/radius_control.dart';

/// Pantalla base: descubrimiento en radar, mapa o lista, con radio y filtros
/// compartidos (F-2, F-3).
class DiscoveryScreen extends StatelessWidget {
  const DiscoveryScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final store = DemoScope.of(context);
    final state = store.state;
    final profiles = visibleProfiles(state);
    final filtered =
        state.filters.intentions != null ||
        state.filters.gender != null ||
        state.filters.verifiedOnly ||
        state.filters.onlineOnly;

    return Column(
      children: <Widget>[
        Padding(
          padding: EdgeInsets.fromLTRB(
            Tokens.space[3],
            Tokens.space[1],
            Tokens.space[2],
            0,
          ),
          child: Row(
            children: <Widget>[
              Expanded(
                child: Text(
                  fmt('discovery.title'),
                  style: TextStyle(
                    fontSize: Tokens.fontSizes[4],
                    fontWeight: FontWeight.w600,
                    color: Tokens.colorText,
                  ),
                ),
              ),
              Semantics(
                button: true,
                label: fmt('discovery.filters'),
                child: IconButton(
                  onPressed: () => store.dispatch(
                    const DemoAction.openOverlay(DemoOverlay.filters),
                  ),
                  tooltip: fmt('discovery.filters'),
                  icon: Badge(
                    isLabelVisible: filtered,
                    backgroundColor: Tokens.colorAccent,
                    child: const Icon(Icons.tune, color: Tokens.colorText),
                  ),
                ),
              ),
            ],
          ),
        ),
        Padding(
          padding: EdgeInsets.symmetric(horizontal: Tokens.space[3]),
          child: Row(
            children: <Widget>[
              Expanded(
                child: Text(
                  fmt('discovery.count', <String, String>{
                    'count': '${profiles.length}',
                    'radius': formatRadius(state.filters.radiusM),
                  }),
                  style: TextStyle(
                    fontSize: Tokens.fontSizes[1],
                    color: Tokens.colorMuted,
                  ),
                ),
              ),
              if (filtered)
                Text(
                  fmt('discovery.filtersApplied'),
                  style: TextStyle(
                    fontSize: Tokens.fontSizes[0],
                    color: Tokens.colorAccent,
                  ),
                ),
            ],
          ),
        ),
        Padding(
          padding: EdgeInsets.fromLTRB(
            Tokens.space[3],
            Tokens.space[1],
            Tokens.space[3],
            Tokens.space[1],
          ),
          child: RadiusControl(
            radiusM: state.filters.radiusM,
            showLabel: false,
            onChanged: (value) => store.dispatch(DemoAction.setRadius(value)),
          ),
        ),
        Expanded(child: _body(context, state, profiles, store)),
        BottomNav(
          view: state.view,
          pingsCount: state.incomingPings.length,
          onSelect: (target) => _onNav(store, target),
        ),
      ],
    );
  }

  void _onNav(DemoStore store, NavTarget target) {
    switch (target) {
      case NavTarget.radar:
        store.dispatch(const DemoAction.setView(DemoView.radar));
      case NavTarget.map:
        store.dispatch(const DemoAction.setView(DemoView.map));
      case NavTarget.list:
        store.dispatch(const DemoAction.setView(DemoView.list));
      case NavTarget.pings:
        store.dispatch(const DemoAction.openOverlay(DemoOverlay.pings));
      case NavTarget.profile:
        store.dispatch(const DemoAction.openOverlay(DemoOverlay.settings));
    }
  }

  Widget _body(
    BuildContext context,
    DemoState state,
    List<Profile> profiles,
    DemoStore store,
  ) {
    final onOpen = (Profile profile) => store.dispatch(
      DemoAction.openOverlay(DemoOverlay.profile, profileId: profile.id),
    );
    final onClearFilters = () =>
        store.dispatch(const DemoAction.clearFilters());

    if (profiles.isEmpty) {
      return EmptyState(
        message: fmt('empty.filters'),
        actionLabel: fmt('empty.filtersCta'),
        onAction: onClearFilters,
      );
    }

    switch (state.view) {
      case DemoView.radar:
        return Padding(
          padding: EdgeInsets.symmetric(horizontal: Tokens.space[3]),
          child: Column(
            children: <Widget>[
              Expanded(
                child: RadarView(
                  profiles: profiles,
                  radiusM: state.filters.radiusM,
                  onOpen: onOpen,
                ),
              ),
              Padding(
                padding: EdgeInsets.only(bottom: Tokens.space[1]),
                child: Text(
                  fmt('discovery.radarCaption'),
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: Tokens.fontSizes[0],
                    color: Tokens.colorMuted,
                  ),
                ),
              ),
            ],
          ),
        );
      case DemoView.map:
        return Padding(
          padding: EdgeInsets.fromLTRB(
            Tokens.space[3],
            0,
            Tokens.space[3],
            Tokens.space[2],
          ),
          child: MapView(
            profiles: profiles,
            radiusM: state.filters.radiusM,
            onOpen: onOpen,
          ),
        );
      case DemoView.list:
        return Column(
          children: <Widget>[
            Padding(
              padding: EdgeInsets.symmetric(horizontal: Tokens.space[3]),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  fmt('discovery.listHeading'),
                  style: TextStyle(
                    fontSize: Tokens.fontSizes[0],
                    color: Tokens.colorMuted,
                  ),
                ),
              ),
            ),
            Expanded(
              child: ProfileList(
                state: state,
                profiles: profiles,
                onOpen: onOpen,
                onClearFilters: onClearFilters,
              ),
            ),
          ],
        );
    }
  }
}
