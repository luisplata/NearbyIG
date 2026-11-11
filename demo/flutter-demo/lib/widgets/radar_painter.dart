import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../generated/fixtures.dart';
import '../generated/tokens.dart';

/// Punto ya proyectado a coordenadas normalizadas 0..1 del radar/mapa.
class RadarDot {
  const RadarDot({required this.profile, required this.x, required this.y});

  final Profile profile;
  final double x;
  final double y;
}

/// Radar dibujado con `CustomPainter`: tres anillos, cruz y barrido de 6 s.
/// El pintor es decorativo (`ExcludeSemantics` del lado del widget): los puntos
/// tappables y sus etiquetas viven en `ProfileDotLayer`.
class RadarPainter extends CustomPainter {
  const RadarPainter({required this.dots, required this.sweep});

  final List<RadarDot> dots;

  /// Posición del barrido 0..1. Negativo = estático (prefers-reduced-motion).
  final double sweep;

  @override
  void paint(Canvas canvas, Size size) {
    final side = size.shortestSide;
    final center = Offset(size.width / 2, size.height / 2);
    final radius = side * 0.46;
    final ring = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1
      ..color = Tokens.colorBorder;
    for (var index = 1; index <= 3; index += 1) {
      canvas.drawCircle(center, radius * index / 3, ring);
    }

    final axis = Paint()
      ..strokeWidth = 1
      ..color = Tokens.colorBorder.withValues(alpha: 0.5);
    canvas.drawLine(
      Offset(center.dx - radius, center.dy),
      Offset(center.dx + radius, center.dy),
      axis,
    );
    canvas.drawLine(
      Offset(center.dx, center.dy - radius),
      Offset(center.dx, center.dy + radius),
      axis,
    );

    if (sweep >= 0) {
      final rect = Rect.fromCircle(center: center, radius: radius);
      final shader = SweepGradient(
        colors: <Color>[
          Tokens.colorAccent.withValues(alpha: 0),
          Tokens.colorAccent.withValues(alpha: 0.3),
        ],
        transform: GradientRotation(sweep * 2 * math.pi),
      ).createShader(rect);
      canvas.drawCircle(
        center,
        radius,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2
          ..shader = shader,
      );
      final angle = sweep * 2 * math.pi - math.pi / 2;
      canvas.drawLine(
        center,
        center + Offset(math.cos(angle), math.sin(angle)) * radius,
        Paint()
          ..strokeWidth = 1.5
          ..color = Tokens.colorAccent.withValues(alpha: 0.55),
      );
    }

    // Perfil propio: al centro del radar.
    canvas.drawCircle(center, 6, Paint()..color = Tokens.colorAccent);
    canvas.drawCircle(
      center,
      10,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1
        ..color = Tokens.colorAccent.withValues(alpha: 0.5),
    );

    for (final dot in dots) {
      final offset = Offset(
        center.dx + (dot.x - 0.5) * 2 * radius,
        center.dy + (dot.y - 0.5) * 2 * radius,
      );
      canvas.drawCircle(
        offset,
        6,
        Paint()
          ..color = dot.profile.verified
              ? Tokens.colorVerified
              : Tokens.colorGradientStart,
      );
      canvas.drawCircle(
        offset,
        8,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1
          ..color = Tokens.colorBg.withValues(alpha: 0.8),
      );
    }
  }

  @override
  bool shouldRepaint(RadarPainter oldDelegate) =>
      oldDelegate.sweep != sweep || !identical(oldDelegate.dots, dots);
}
