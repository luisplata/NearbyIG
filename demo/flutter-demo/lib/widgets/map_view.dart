import 'package:flutter/material.dart';

import '../generated/copy.dart';
import '../generated/fixtures.dart';
import '../generated/tokens.dart';
import '../state/selectors.dart';
import 'demo_chip.dart';
import 'map_painter.dart';
import 'profile_dots.dart';
import 'radar_painter.dart';

/// Vista de mapa: ilustración estilizada con leyenda "mapa simulado" y los
/// mismos puntos accesibles que el radar. Sin tiles, sin geolocalización.
class MapView extends StatelessWidget {
  const MapView({
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
    final dots = <RadarDot>[
      for (final profile in profiles)
        RadarDot(
          profile: profile,
          x: projectProfile(profile, radiusM).x,
          y: projectProfile(profile, radiusM).y,
        ),
    ];
    return Semantics(
      label: fmt('a11y.map'),
      container: true,
      explicitChildNodes: true,
      child: ClipRRect(
        borderRadius: const BorderRadius.all(Radius.circular(12)),
        child: Stack(
          children: <Widget>[
            Positioned.fill(
              child: ExcludeSemantics(
                child: CustomPaint(
                  painter: MapPainter(
                    dots: dots,
                    textDirection: Directionality.of(context),
                  ),
                ),
              ),
            ),
            Positioned.fill(
              child: ProfileDotLayer(
                profiles: profiles,
                radiusM: radiusM,
                onOpen: onOpen,
              ),
            ),
            Positioned(
              left: Tokens.space[2],
              bottom: Tokens.space[2],
              child: DemoChip(label: fmt('discovery.mapLegend')),
            ),
          ],
        ),
      ),
    );
  }
}
