import 'package:flutter/material.dart';

import '../generated/copy.dart';
import '../generated/tokens.dart';
import '../state/demo_action.dart';
import '../state/demo_scope.dart';
import '../state/demo_state.dart';
import '../state/selectors.dart';
import '../widgets/avatar.dart';
import '../widgets/reveal_button.dart';

/// Chat guionado de un match: mensajes del catálogo, typing de 1.2 s,
/// revelación mutua de fotos y accesos de seguridad (F-5, F-9).
class ChatScreen extends StatelessWidget {
  const ChatScreen({super.key});

  /// Respuestas rápidas: sólo claves del catálogo, nunca texto libre.
  static const List<String> quickReplyKeys = <String>[
    'chat.self.1',
    'chat.self.2',
    'chat.self.3',
  ];

  @override
  Widget build(BuildContext context) {
    final store = DemoScope.of(context);
    final state = store.state;
    final chatId = state.chatId;
    final profile = profileById(chatId);
    if (chatId == null || profile == null) {
      return const SizedBox.shrink();
    }
    final messages = state.messages[chatId] ?? <ChatMessage>[];
    final canSend = canSendInChat(state);

    return Column(
      children: <Widget>[
        Row(
          children: <Widget>[
            Avatar(
              photoId: profile.photoId,
              size: 44,
              renderState: avatarState(state, chatId),
            ),
            SizedBox(width: Tokens.space[1]),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text(
                    profile.nickname,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: Tokens.fontSizes[2],
                      fontWeight: FontWeight.w600,
                      color: Tokens.colorText,
                    ),
                  ),
                  Text(
                    fmt(profile.statusKey),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: Tokens.fontSizes[0],
                      color: Tokens.colorMuted,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        SizedBox(height: Tokens.space[1]),
        RevealButton(
          revealedByMe: isRevealedByMe(state, chatId),
          revealedByPeer: state.revealedByPeer.contains(chatId),
          peerName: profile.nickname,
          onReveal: () => store.dispatch(const DemoAction.revealPhoto()),
        ),
        Divider(height: Tokens.space[3]),
        Expanded(
          child: ListView.builder(
            padding: EdgeInsets.symmetric(vertical: Tokens.space[1]),
            itemCount: messages.length + (state.typing == chatId ? 1 : 0),
            itemBuilder: (context, index) {
              if (index >= messages.length) {
                return _TypingBubble(label: fmt('chat.typing'));
              }
              return _MessageBubble(message: messages[index]);
            },
          ),
        ),
        if (state.blocked.contains(chatId))
          Padding(
            padding: EdgeInsets.only(bottom: Tokens.space[1]),
            child: Text(
              fmt('chat.blockedNotice'),
              style: TextStyle(
                fontSize: Tokens.fontSizes[0],
                color: Tokens.colorDanger,
              ),
            ),
          ),
        Wrap(
          spacing: Tokens.space[1],
          runSpacing: Tokens.space[1],
          children: <Widget>[
            for (final key in quickReplyKeys)
              OutlinedButton(
                onPressed: canSend
                    ? () => store.dispatch(DemoAction.sendMessage(chatId, key))
                    : null,
                child: Text(fmt(key)),
              ),
          ],
        ),
        SizedBox(height: Tokens.space[1]),
        Row(
          children: <Widget>[
            Expanded(
              child: OutlinedButton(
                onPressed: () => store.dispatch(
                  DemoAction.openOverlay(DemoOverlay.safety, profileId: chatId),
                ),
                child: Text(fmt('profile.report')),
              ),
            ),
            SizedBox(width: Tokens.space[1]),
            Expanded(
              child: TextButton(
                style: TextButton.styleFrom(
                  foregroundColor: Tokens.colorDanger,
                ),
                onPressed: () =>
                    store.dispatch(DemoAction.blockProfile(chatId)),
                child: Text(fmt('profile.block')),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _MessageBubble extends StatelessWidget {
  const _MessageBubble({required this.message});

  final ChatMessage message;

  @override
  Widget build(BuildContext context) {
    final mine = message.from == ChatAuthor.me;
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: EdgeInsets.only(bottom: Tokens.space[1]),
        padding: EdgeInsets.symmetric(
          horizontal: Tokens.space[2],
          vertical: Tokens.space[1],
        ),
        constraints: const BoxConstraints(maxWidth: 280),
        decoration: BoxDecoration(
          color: mine ? Tokens.colorGradientMid : Tokens.colorSurfaceAlt,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(12),
            topRight: const Radius.circular(12),
            bottomLeft: Radius.circular(mine ? 12 : 2),
            bottomRight: Radius.circular(mine ? 2 : 12),
          ),
        ),
        child: Text(
          fmt(message.textKey),
          style: TextStyle(
            fontSize: Tokens.fontSizes[1],
            height: Tokens.lineHeights[2],
            color: Tokens.colorText,
          ),
        ),
      ),
    );
  }
}

class _TypingBubble extends StatelessWidget {
  const _TypingBubble({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.centerLeft,
      child: Semantics(
        liveRegion: true,
        label: label,
        child: ExcludeSemantics(
          child: Container(
            margin: EdgeInsets.only(bottom: Tokens.space[1]),
            padding: EdgeInsets.symmetric(
              horizontal: Tokens.space[2],
              vertical: Tokens.space[1],
            ),
            decoration: const BoxDecoration(
              color: Tokens.colorSurfaceAlt,
              borderRadius: BorderRadius.all(Radius.circular(12)),
            ),
            child: Text(
              label,
              style: TextStyle(
                fontSize: Tokens.fontSizes[1],
                color: Tokens.colorMuted,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
