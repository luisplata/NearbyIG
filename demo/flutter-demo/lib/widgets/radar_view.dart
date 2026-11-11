import 'package:flutter/material.dart';

import '../generated/copy.dart';
import '../generated/fixtures.dart';
import '../state/selectors.dart';
import 'profile_dots.dart';
import 'radar_painter.dart';

/// Vista de radar: anillos + barrido de 6 s sobre `RepaintBoundary`. Con
/// `prefers-reduced-motion` (mapeado a `MediaQuery.disableAnimationsOf`) el
/// barrido queda estático y los puntos siguen visibles (F-2).
class RadarView extends StatefulWidget {
  const RadarView({
    super.key,
    required this.profiles,
    required this.radiusM,
    required this.onOpen,
  });

  final List<Profile> profiles;
  final int radiusM;
  final ValueChanged<Profile> onOpen;

  @override
  State<RadarView> createState() => _RadarViewState();
}

class _RadarViewState extends State<RadarView>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 6),
  );
  bool _reducedMotion = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final reduced = MediaQuery.disableAnimationsOf(context);
    if (reduced == _reducedMotion) {
      if (!reduced && !_controller.isAnimating) {
        _controller.repeat();
      }
      return;
    }
    _reducedMotion = reduced;
    if (reduced) {
      _controller
        ..stop()
        ..value = 0;
    } else {
      _controller.repeat();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final dots = <RadarDot>[
      for (final profile in widget.profiles)
        RadarDot(
          profile: profile,
          x: projectProfile(profile, widget.radiusM).x,
          y: projectProfile(profile, widget.radiusM).y,
        ),
    ];

    return Semantics(
      label: fmt('a11y.radar'),
      container: true,
      explicitChildNodes: true,
      child: AspectRatio(
        aspectRatio: 1,
        child: Stack(
          children: <Widget>[
            Positioned.fill(
              child: ExcludeSemantics(
                child: RepaintBoundary(
                  child: AnimatedBuilder(
                    animation: _controller,
                    builder: (context, child) => CustomPaint(
                      painter: RadarPainter(
                        dots: dots,
                        sweep: _reducedMotion ? -1 : _controller.value,
                      ),
                    ),
                  ),
                ),
              ),
            ),
            Positioned.fill(
              child: ProfileDotLayer(
                profiles: widget.profiles,
                radiusM: widget.radiusM,
                onOpen: widget.onOpen,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
