import 'package:flutter/material.dart';

import '../generated/copy.dart';
import '../generated/tokens.dart';

/// Revelación de foto. Sólo hay revelación mutua: mientras el par no revela, se
/// muestra el estado de espera y la foto del otro sigue blurred (F-9).
class RevealButton extends StatelessWidget {
  const RevealButton({
    super.key,
    required this.revealedByMe,
    required this.revealedByPeer,
    required this.peerName,
    required this.onReveal,
  });

  final bool revealedByMe;
  final bool revealedByPeer;
  final String peerName;
  final VoidCallback onReveal;

  @override
  Widget build(BuildContext context) {
    if (revealedByMe && revealedByPeer) {
      return Row(
        children: <Widget>[
          const Icon(Icons.check_circle, size: 16, color: Tokens.colorAccent),
          const SizedBox(width: 6),
          Text(
            fmt('chat.revealed'),
            style: TextStyle(
              fontSize: Tokens.fontSizes[1],
              color: Tokens.colorText,
            ),
          ),
        ],
      );
    }
    if (revealedByMe) {
      return Text(
        fmt('chat.revealPending', <String, String>{'name': peerName}),
        style: TextStyle(
          fontSize: Tokens.fontSizes[1],
          color: Tokens.colorMuted,
        ),
      );
    }
    return OutlinedButton.icon(
      onPressed: onReveal,
      icon: const Icon(Icons.visibility_outlined, size: 16),
      label: Text(fmt('chat.reveal')),
    );
  }
}
