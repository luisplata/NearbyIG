import 'package:flutter/material.dart';

import '../generated/copy.dart';
import '../generated/tokens.dart';

/// Banner persistente del modo fantasma/pausa (F-8). Mientras está visible, el
/// perfil propio no aparece en descubrimiento y los pings quedan deshabilitados.
class GhostBanner extends StatelessWidget {
  const GhostBanner({super.key, required this.onDisable});

  final VoidCallback onDisable;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      container: true,
      liveRegion: true,
      label: fmt('settings.ghostOn'),
      child: ExcludeSemantics(
        child: Container(
          padding: EdgeInsets.symmetric(
            horizontal: Tokens.space[2],
            vertical: 6,
          ),
          decoration: const BoxDecoration(
            color: Tokens.colorSurfaceAlt,
            border: Border(bottom: BorderSide(color: Tokens.colorAccent)),
          ),
          child: Row(
            children: <Widget>[
              const Icon(
                Icons.visibility_off_outlined,
                size: 16,
                color: Tokens.colorAccent,
              ),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  fmt('settings.ghostOn'),
                  maxLines: 2,
                  style: TextStyle(
                    fontSize: Tokens.fontSizes[0],
                    color: Tokens.colorText,
                  ),
                ),
              ),
              TextButton(
                onPressed: onDisable,
                child: Text(fmt('settings.ghost')),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
