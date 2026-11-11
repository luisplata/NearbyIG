import 'package:flutter/material.dart';

import '../generated/copy.dart';
import '../generated/fixtures.dart';
import '../generated/tokens.dart';
import '../state/demo_state.dart';
import '../state/selectors.dart';
import 'profile_card.dart';

/// Lista de descubrimiento: ordenada por distancia ascendente (F-2) y con el
/// mismo conjunto filtrado que radar y mapa.
class ProfileList extends StatelessWidget {
  const ProfileList({
    super.key,
    required this.state,
    required this.profiles,
    required this.onOpen,
    required this.onClearFilters,
  });

  final DemoState state;
  final List<Profile> profiles;
  final ValueChanged<Profile> onOpen;
  final VoidCallback onClearFilters;

  @override
  Widget build(BuildContext context) {
    if (profiles.isEmpty) {
      return EmptyState(
        message: fmt('empty.filters'),
        actionLabel: fmt('empty.filtersCta'),
        onAction: onClearFilters,
      );
    }
    return ListView.separated(
      padding: EdgeInsets.fromLTRB(
        Tokens.space[3],
        Tokens.space[2],
        Tokens.space[3],
        Tokens.space[3],
      ),
      itemCount: profiles.length,
      separatorBuilder: (context, index) => SizedBox(height: Tokens.space[1]),
      itemBuilder: (context, index) {
        final profile = profiles[index];
        return ProfileCard(
          profile: profile,
          renderState: avatarState(state, profile.id),
          onTap: () => onOpen(profile),
        );
      },
    );
  }
}
