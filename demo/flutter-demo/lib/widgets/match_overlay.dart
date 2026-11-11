import 'package:flutter/material.dart';

import '../generated/copy.dart';
import '../generated/fixtures.dart';
import '../generated/tokens.dart';
import 'avatar.dart';

/// Celebración de match (2.5 s después de aceptar el ping). Es una capa sobre
/// el overlay actual, no una ruta: se cierra con "Seguir explorando".
class MatchOverlay extends StatelessWidget {
  const MatchOverlay({
    super.key,
    required this.profile,
    required this.onOpenChat,
    required this.onDismiss,
  });

  final Profile profile;
  final VoidCallback onOpenChat;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) {
    final title = fmt('match.title');
    return Semantics(
      scopesRoute: true,
      namesRoute: true,
      explicitChildNodes: true,
      label: title,
      child: ColoredBox(
        color: Tokens.colorBg.withValues(alpha: 0.92),
        child: Center(
          child: Padding(
            padding: EdgeInsets.all(Tokens.space[4]),
            child: FocusScope(
              autofocus: true,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: <Widget>[
                  Avatar(
                    photoId: profile.photoId,
                    size: 96,
                    semanticLabel: profile.nickname,
                  ),
                  SizedBox(height: Tokens.space[3]),
                  Text(
                    title,
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: Tokens.fontSizes[5],
                      fontWeight: FontWeight.w600,
                      color: Tokens.colorText,
                    ),
                  ),
                  SizedBox(height: Tokens.space[1]),
                  Text(
                    fmt('match.subtitle', <String, String>{
                      'name': profile.nickname,
                    }),
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: Tokens.fontSizes[1],
                      color: Tokens.colorMuted,
                    ),
                  ),
                  SizedBox(height: Tokens.space[3]),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      onPressed: onOpenChat,
                      child: Text(fmt('match.openChat')),
                    ),
                  ),
                  SizedBox(height: Tokens.space[1]),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton(
                      onPressed: onDismiss,
                      child: Text(fmt('match.keepBrowsing')),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
