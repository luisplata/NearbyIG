import 'package:flutter/material.dart';

import '../generated/tokens.dart';

/// Punto de "en línea". La presencia o ausencia del punto es la señal de forma;
/// el color sólo la refuerza.
class OnlineDot extends StatelessWidget {
  const OnlineDot({super.key, this.size = 8});

  final double size;

  @override
  Widget build(BuildContext context) => ExcludeSemantics(
    child: Container(
      width: size,
      height: size,
      decoration: const BoxDecoration(
        shape: BoxShape.circle,
        color: Tokens.colorOnline,
      ),
    ),
  );
}
