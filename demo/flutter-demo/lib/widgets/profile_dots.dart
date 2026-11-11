import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../generated/copy.dart';
import '../generated/fixtures.dart';
import '../state/format.dart';
import '../state/selectors.dart';

/// Capa tappable de puntos: 44×44 px por perfil, etiqueta con nombre y
/// distancia, por encima del pintor decorativo del radar o del mapa.
class ProfileDotLayer extends StatelessWidget {
  const ProfileDotLayer({
    super.key,
    required this.profiles,
    required this.radiusM,
    required this.onOpen,
  });

  final List<Profile> profiles;
  final int radiusM;
  final ValueChanged<Profile> onOpen;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final side = math.min(constraints.maxWidth, constraints.maxHeight);
        final radius = side * 0.46;
        final center = Offset(
          constraints.maxWidth / 2,
          constraints.maxHeight / 2,
        );
        return Stack(
          children: <Widget>[
            for (final profile in profiles)
              _positioned(profile, center, radius),
          ],
        );
      },
    );
  }

  Widget _positioned(Profile profile, Offset center, double radius) {
    final position = projectProfile(profile, radiusM);
    final left = center.dx + (position.x - 0.5) * 2 * radius - 22;
    final top = center.dy + (position.y - 0.5) * 2 * radius - 22;
    final label = fmt('a11y.profileDot', <String, String>{
      'name': profile.nickname,
      'distance': formatDistance(profile.distanceM),
    });
    return Positioned(
      left: left,
      top: top,
      child: Semantics(
        button: true,
        label: label,
        child: SizedBox(
          width: 44,
          height: 44,
          child: InkWell(
            onTap: () => onOpen(profile),
            customBorder: const CircleBorder(),
          ),
        ),
      ),
    );
  }
}
