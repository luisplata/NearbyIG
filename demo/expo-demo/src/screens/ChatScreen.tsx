import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { fmt } from '../generated/copy';
import { useDemo } from '../state/DemoProvider';
import { avatarState, canSendInChat, isRevealedByMe, profileById } from '../state/selectors';
import type { ChatMessage } from '../state/types';
import { colors, fontSize, radii, space, text } from '../theme/theme';

import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { RevealButton } from '../components/RevealButton';

/** Respuestas rápidas: sólo claves del catálogo, nunca texto libre. */
export const QUICK_REPLY_KEYS = ['chat.self.1', 'chat.self.2', 'chat.self.3'] as const;

/**
 * Chat guionado de un match: mensajes del catálogo, typing de 1.2 s, revelación
 * mutua de fotos y accesos de seguridad (F-5, F-9).
 */
export function ChatScreen() {
  const { state, dispatch } = useDemo();
  const chatId = state.chatId;
  const profile = profileById(chatId, state.catalog);
  if (chatId === null || profile === null) {
    return null;
  }

  const messages = state.messages[chatId] ?? [];
  const canSend = canSendInChat(state);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Avatar photoId={profile.photoId} size={44} renderState={avatarState(state, chatId)} />
        <View style={styles.headerText}>
          <Text numberOfLines={1} style={[text.title, { fontSize: fontSize[2] }]}>
            {profile.nickname}
          </Text>
          <Text numberOfLines={1} style={[text.small, { color: colors.muted }]}>
            {fmt(profile.statusKey)}
          </Text>
        </View>
      </View>

      <RevealButton
        revealedByMe={isRevealedByMe(state, chatId)}
        revealedByPeer={state.revealedByPeer.includes(chatId)}
        peerName={profile.nickname}
        onReveal={() => dispatch({ type: 'REVEAL_PHOTO' })}
      />

      <View style={styles.divider} />

      <ScrollView contentContainerStyle={styles.messages}>
        {messages.map((message, index) => (
          <MessageBubble key={`${message.textKey}-${index}`} message={message} />
        ))}
        {state.typing === chatId ? <TypingBubble label={fmt('chat.typing')} /> : null}
      </ScrollView>

      {state.blocked.includes(chatId) ? (
        <Text style={[text.small, { color: colors.danger }]}>{fmt('chat.blockedNotice')}</Text>
      ) : null}

      <View style={styles.quickReplies}>
        {QUICK_REPLY_KEYS.map((key) => (
          <Button
            key={key}
            label={fmt(key)}
            variant="outline"
            disabled={!canSend}
            onPress={() => dispatch({ type: 'SEND_MESSAGE', profileId: chatId, textKey: key })}
          />
        ))}
      </View>

      <View style={styles.actionsRow}>
        <View style={styles.action}>
          <Button
            label={fmt('profile.report')}
            variant="outline"
            fullWidth
            onPress={() =>
              dispatch({ type: 'OPEN_OVERLAY', overlay: 'safety', profileId: chatId })
            }
          />
        </View>
        <View style={styles.action}>
          <Button
            label={fmt('profile.block')}
            variant="danger"
            fullWidth
            onPress={() => dispatch({ type: 'BLOCK_PROFILE', profileId: chatId })}
          />
        </View>
      </View>
    </View>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const mine = message.from === 'me';
  return (
    <View style={[styles.bubbleRow, mine ? styles.bubbleRight : styles.bubbleLeft]}>
      <View
        style={[
          styles.bubble,
          { backgroundColor: mine ? colors.gradientMid : colors.surfaceAlt },
          mine ? styles.bubbleCornerMine : styles.bubbleCornerPeer,
        ]}
      >
        <Text style={[text.body, styles.bubbleText]}>{fmt(message.textKey)}</Text>
      </View>
    </View>
  );
}

function TypingBubble({ label }: { label: string }) {
  return (
    <View style={[styles.bubbleRow, styles.bubbleLeft]}>
      <View
        style={[styles.bubble, { backgroundColor: colors.surfaceAlt }]}
        accessibilityLiveRegion="polite"
        accessibilityLabel={label}
      >
        <Text style={[text.small, { color: colors.muted, fontSize: fontSize[1] }]}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    gap: space[1],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[1],
  },
  headerText: {
    flex: 1,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: space[1],
  },
  messages: {
    gap: space[1],
    paddingVertical: space[1],
  },
  bubbleRow: {
    flexDirection: 'row',
  },
  bubbleLeft: {
    justifyContent: 'flex-start',
  },
  bubbleRight: {
    justifyContent: 'flex-end',
  },
  bubble: {
    maxWidth: '82%',
    paddingHorizontal: space[2],
    paddingVertical: space[1],
    borderRadius: radii[1],
  },
  bubbleCornerMine: {
    borderBottomRightRadius: 2,
  },
  bubbleCornerPeer: {
    borderBottomLeftRadius: 2,
  },
  bubbleText: {
    fontSize: fontSize[1],
  },
  quickReplies: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[1],
  },
  actionsRow: {
    flexDirection: 'row',
    gap: space[1],
  },
  action: {
    flex: 1,
  },
});
