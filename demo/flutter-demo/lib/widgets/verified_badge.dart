import 'package:flutter/material.dart';

import '../generated/copy.dart';
import '../generated/tokens.dart';

/// Insignia de perfil verificado. La forma del ícono no depende del color y la
/// etiqueta sale del catálogo de copy (`a11y.verified`). En listas, la tarjeta
/// compone su propio label y este nodo queda excluido por el `ExcludeSemantics`
/// del contenedor.
class VerifiedBadge extends StatelessWidget {
  const VerifiedBadge({super.key, this.size = 15});

  final double size;

  @override
  Widget build(BuildContext context) => Semantics(
    label: fmt('a11y.verified'),
    child: ExcludeSemantics(
      child: Icon(Icons.verified, size: size, color: Tokens.colorVerified),
    ),
  );
}
