import 'package:flutter/material.dart';

import '../generated/copy.dart';
import '../generated/tokens.dart';

/// Punto de "en línea". La presencia del punto es la señal de forma; el color
/// sólo la refuerza. La etiqueta sale del catálogo (`a11y.online`) y, en listas,
/// la tarjeta la incluye en su label compuesto.
class OnlineDot extends StatelessWidget {
  const OnlineDot({super.key, this.size = 8});

  final double size;

  @override
  Widget build(BuildContext context) => Semantics(
    label: fmt('a11y.online'),
    child: ExcludeSemantics(
      child: Container(
        width: size,
        height: size,
        decoration: const BoxDecoration(
          shape: BoxShape.circle,
          color: Tokens.colorOnline,
        ),
      ),
    ),
  );
}
