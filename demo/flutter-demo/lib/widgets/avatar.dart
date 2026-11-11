import 'package:flutter/material.dart';

import '../generated/photo_map.dart';
import '../generated/tokens.dart';
import '../state/selectors.dart';

/// Avatar procedural del contrato (A1): gradiente de 2 stops + círculos
/// translúcidos derivados del `seed` + iniciales. No hay binarios de retratos y
/// no se usa `filter: blur`: `blurred` es una variante de render (CONTRACT.md §4).
class Avatar extends StatelessWidget {
  const Avatar({
    super.key,
    required this.photoId,
    required this.size,
    this.renderState = AvatarRenderState.blurred,
    this.semanticLabel,
  });

  final String photoId;
  final double size;
  final AvatarRenderState renderState;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final spec = kPhotoMap[photoId] ?? kFallbackPhoto;
    final clear = renderState == AvatarRenderState.clear;
    final radius = spec.shape == 'circle'
        ? BorderRadius.circular(size / 2)
        : BorderRadius.circular(size * 0.28);
    final start = _parseHex(spec.gradientStart);
    final end = _parseHex(spec.gradientEnd);
    final alpha = clear ? 1.0 : 0.55;

    final avatar = DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: radius,
        border: clear
            ? Border.all(color: Tokens.colorBorder)
            : Border.all(color: Tokens.colorBorder.withValues(alpha: 0.6)),
      ),
      child: ClipRRect(
        borderRadius: radius,
        child: SizedBox(
          width: size,
          height: size,
          child: Stack(
            fit: StackFit.expand,
            children: <Widget>[
              DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: <Color>[
                      start.withValues(alpha: alpha),
                      end.withValues(alpha: alpha),
                    ],
                  ),
                ),
              ),
              ..._bubbles(spec.seed),
              if (!clear)
                DecoratedBox(
                  decoration: BoxDecoration(
                    color: Tokens.colorSurface.withValues(alpha: 0.45),
                  ),
                ),
              if (clear)
                Center(
                  child: Text(
                    spec.initials,
                    maxLines: 1,
                    style: TextStyle(
                      fontSize: size * 0.34,
                      fontWeight: FontWeight.w600,
                      color: Tokens.colorText,
                    ),
                  ),
                )
              else
                Center(
                  child: Icon(
                    Icons.lock_outline,
                    size: size * 0.3,
                    color: Tokens.colorText.withValues(alpha: 0.75),
                  ),
                ),
            ],
          ),
        ),
      ),
    );

    if (semanticLabel == null) {
      return ExcludeSemantics(child: avatar);
    }
    return Semantics(
      label: semanticLabel,
      image: true,
      child: ExcludeSemantics(child: avatar),
    );
  }

  /// Dos o tres círculos translúcidos posicionados de forma determinista por el
  /// `seed` del contrato: mismo dibujo en Flutter y en Expo.
  List<Widget> _bubbles(int seed) {
    final bubbles = <Widget>[];
    for (var index = 0; index < 3; index += 1) {
      final x = ((seed * (index + 2) + 3) % 10) / 10;
      final y = ((seed * (index + 3) + 5) % 10) / 10;
      bubbles.add(
        Align(
          alignment: Alignment(x * 2 - 1, y * 2 - 1),
          child: FractionallySizedBox(
            widthFactor: 0.4,
            heightFactor: 0.4,
            child: DecoratedBox(
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: Tokens.colorText.withValues(alpha: 0.08 + index * 0.04),
              ),
            ),
          ),
        ),
      );
    }
    return bubbles;
  }

  static Color _parseHex(String value) {
    final hex = value.replaceFirst('#', '');
    return Color(int.parse('FF$hex', radix: 16));
  }
}
