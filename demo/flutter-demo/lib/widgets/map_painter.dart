import 'package:flutter/material.dart';

import '../generated/copy.dart';
import '../generated/fixtures.dart';
import '../generated/tokens.dart';
import 'radar_painter.dart';

/// Mapa estilizado: ilustración con calles y manzanas del `mapDecor`, cero
/// tiles y cero red (F-2). Usa la misma proyección que el radar.
class MapPainter extends CustomPainter {
  const MapPainter({required this.dots, required this.textDirection});

  final List<RadarDot> dots;
  final TextDirection textDirection;

  @override
  void paint(Canvas canvas, Size size) {
    final background = Paint()..color = Tokens.colorSurface;
    canvas.drawRect(Offset.zero & size, background);

    final grid = Paint()
      ..strokeWidth = 0.5
      ..color = Tokens.colorBorder.withValues(alpha: 0.25);
    for (var index = 1; index < 8; index += 1) {
      final dx = size.width * index / 8;
      final dy = size.height * index / 8;
      canvas.drawLine(Offset(dx, 0), Offset(dx, size.height), grid);
      canvas.drawLine(Offset(0, dy), Offset(size.width, dy), grid);
    }

    final blockPaint = Paint()..color = Tokens.colorSurfaceAlt;
    final blockBorder = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 0.5
      ..color = Tokens.colorBorder;
    for (final block in kMapDecor.blocks) {
      final rect = RRect.fromRectAndRadius(
        Rect.fromLTWH(
          block.x * size.width,
          block.y * size.height,
          block.w * size.width,
          block.h * size.height,
        ),
        Radius.circular(block.radius),
      );
      canvas
        ..drawRRect(rect, blockPaint)
        ..drawRRect(rect, blockBorder);
    }

    final street = Paint()
      ..strokeCap = StrokeCap.round
      ..color = Tokens.colorBorder;
    for (final line in kMapDecor.streets) {
      street.strokeWidth = line.weight;
      canvas.drawLine(
        Offset(line.x1 * size.width, line.y1 * size.height),
        Offset(line.x2 * size.width, line.y2 * size.height),
        street,
      );
    }

    for (final label in kMapDecor.labels) {
      final painter = TextPainter(
        text: TextSpan(
          text: fmt(label.copyKey),
          style: TextStyle(
            fontSize: Tokens.fontSizes[0],
            color: Tokens.colorMuted.withValues(alpha: 0.8),
          ),
        ),
        textDirection: textDirection,
      )..layout(maxWidth: size.width * 0.4);
      painter.paint(
        canvas,
        Offset(
          label.x * size.width - painter.width / 2,
          label.y * size.height - painter.height / 2,
        ),
      );
    }

    final center = Offset(size.width / 2, size.height / 2);
    final unitRadius = size.shortestSide * 0.46;
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
        center.dx + (dot.x - 0.5) * 2 * unitRadius,
        center.dy + (dot.y - 0.5) * 2 * unitRadius,
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
  bool shouldRepaint(MapPainter oldDelegate) =>
      oldDelegate.textDirection != textDirection ||
      !identical(oldDelegate.dots, dots);
}
