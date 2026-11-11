import 'package:flutter/material.dart';

import '../generated/tokens.dart';

/// Insignia de perfil verificado. Es un ícono con forma propia (no depende del
/// color) y queda fuera del árbol semántico: la etiqueta la aporta la tarjeta.
class VerifiedBadge extends StatelessWidget {
  const VerifiedBadge({super.key, this.size = 15});

  final double size;

  @override
  Widget build(BuildContext context) => ExcludeSemantics(
    child: Icon(Icons.verified, size: size, color: Tokens.colorVerified),
  );
}
