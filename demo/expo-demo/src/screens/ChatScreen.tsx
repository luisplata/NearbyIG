import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { fmt } from '../generated/copy';
import { chatErrorKey } from '../live/chat';
import { chatText } from '../live/chatCopy';
import { useLive } from '../live/LiveProvider';
import { formatPingTime } from '../live/pings';
import type { LiveChatMessage, LiveChatState } from '../live/types';
import { useDemo } from '../state/DemoProvider';
import { avatarState, canSendInChat, isRevealedByMe, profileById } from '../state/selectors';
import type { ChatMessage } from '../state/types';
import { colors, fontSize, radii, space, text } from '../theme/theme';

import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { Chip } from '../components/Chip';
import { RevealButton } from '../components/RevealButton';

/** Respuestas rápidas: sólo claves del catálogo, nunca texto libre. */
export const QUICK_REPLY_KEYS = ['chat.self.1', 'chat.self.2', 'chat.self.3'] as const;

/**
 * Pantalla de chat, con dos fuentes y una sola puerta.
 *
 * **Conversación real.** Si hay un match abierto en el controlador live
 * (`live.chat`), se dibuja `GET /matches/{id}/messages`: historial paginado,
 * burbujas por emisor, envío optimista con `clientMessageId`, estado de envío,
 * error por código y la respuesta del bot cuando llega por el stream.
 *
 * **Guion del dataset.** Sin match abierto se muestra el chat mock de siempre
 * (mensajes del catálogo, typing, revelación y accesos de seguridad). El dataset
 * no perdió nada: es el piso de la demo cuando no hay API o no hay match.
 */
export function ChatScreen() {
  const live = useLive();
  if (live.chat !== null) {
    return <LiveChat chat={live.chat} />;
  }
  return <MockChat />;
}

/** Chat guionado de un match: mensajes del catálogo, typing y revelación (F-5, F-9). */
function MockChat() {
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

/**
 * Conversación real de un match.
 *
 * **Scroll al último.** Se ancla al final cuando cambia la cantidad de mensajes:
 * abrir, mandar y la respuesta del bot tienen que dejar el mensaje nuevo a la
 * vista. La página del contrato es ascendente, así que "el último" es el final
 * del array.
 *
 * **Burbujas.** Las propias a la derecha; las del otro a la izquierda. Las del
 * bot llevan borde y etiqueta: un bot que responde solo tiene que distinguirse de
 * una persona, aunque el texto sea igual de corto.
 */
function LiveChat({ chat }: { chat: LiveChatState }) {
  const live = useLive();
  const [draft, setDraft] = useState('');
  const scroller = useRef<ComponentRef<typeof ScrollView> | null>(null);
  const peer = chat.peer;
  const isBot = peer?.sourceType === 'bot';
  const count = chat.messages.length;

  useEffect(() => {
    scroller.current?.scrollToEnd({ animated: false });
  }, [count]);

  const send = (): void => {
    const body = draft;
    if (body.trim() === '') {
      return;
    }
    setDraft('');
    void live.sendChatMessage(chat.matchId, body);
  };

  const retry = (message: LiveChatMessage): void => {
    void live.sendChatMessage(chat.matchId, message.body, message.clientMessageId);
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Avatar photoId={peer?.photoId ?? ''} size={44} />
        <View style={styles.headerText}>
          <View style={styles.nameRow}>
            <Text numberOfLines={1} style={[text.title, { fontSize: fontSize[2] }]}>
              {peer?.nickname ?? fmt('nav.pings')}
            </Text>
            {isBot ? <Chip label={chatText('matchBotTag')} /> : null}
          </View>
          <Text numberOfLines={1} style={[text.small, { color: colors.muted }]}>
            {isBot ? chatText('botNote') : chatText('tabMatches')}
          </Text>
        </View>
      </View>

      <View style={styles.divider} />

      {chat.loading ? (
        <Text style={[text.small, { color: colors.muted }]}>{chatText('loading')}</Text>
      ) : null}

      <ScrollView ref={scroller} contentContainerStyle={styles.messages}>
        {chat.messages.length === 0 && !chat.loading ? (
          <Text style={[text.small, { color: colors.muted }]}>
            {chatText('conversationEmpty')}
          </Text>
        ) : null}
        {chat.messages.map((message) => (
          <LiveBubble
            key={message.key}
            message={message}
            bot={!message.mine && isBot}
            onRetry={() => retry(message)}
          />
        ))}
      </ScrollView>

      {chat.hasMore || chat.loadingMore ? (
        <View style={styles.loadMore}>
          <Chip
            label={chat.loadingMore ? chatText('loadingMore') : chatText('loadMore')}
            onPress={() => void live.loadMoreMessages()}
          />
        </View>
      ) : null}

      {chat.error === null ? null : (
        <Text style={[text.small, { color: colors.danger }]}>
          {chatText(chatErrorKey(chat.error), { code: chat.error })}
        </Text>
      )}

      <View style={styles.composer}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={chatText('placeholder')}
          placeholderTextColor={colors.muted}
          accessibilityLabel={chatText('placeholder')}
          onSubmitEditing={send}
          style={styles.input}
          multiline={false}
        />
        <Button label={chatText('send')} disabled={draft.trim() === ''} onPress={send} />
      </View>
    </View>
  );
}

function LiveBubble({
  message,
  bot,
  onRetry,
}: {
  message: LiveChatMessage;
  bot: boolean;
  onRetry: () => void;
}) {
  const mine = message.mine;
  const time = formatPingTime(message.createdAt);
  const failed = message.status === 'failed';
  return (
    <View style={[styles.bubbleRow, mine ? styles.bubbleRight : styles.bubbleLeft]}>
      <View style={styles.bubbleColumn}>
        <View
          style={[
            styles.bubble,
            { backgroundColor: mine ? colors.gradientMid : colors.surfaceAlt },
            mine ? styles.bubbleCornerMine : styles.bubbleCornerPeer,
            bot ? styles.bubbleBot : null,
          ]}
        >
          <Text style={[text.body, styles.bubbleText]}>{message.body}</Text>
        </View>
        <View style={[styles.bubbleMeta, mine ? styles.metaRight : null]}>
          <Text style={[text.small, { color: failed ? colors.danger : colors.muted }]}>
            {message.status === 'sending'
              ? chatText('sending')
              : failed
                ? `${chatText('failed')} · ${time}`
                : time}
          </Text>
          {failed ? (
            <Chip label={chatText('retry')} onPress={onRetry} />
          ) : null}
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
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
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
  bubbleColumn: {
    maxWidth: '82%',
    gap: 1,
  },
  bubble: {
    maxWidth: '100%',
    paddingHorizontal: space[2],
    paddingVertical: space[1],
    borderRadius: radii[1],
  },
  bubbleBot: {
    borderWidth: 1,
    borderColor: colors.accent,
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
  bubbleMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  metaRight: {
    justifyContent: 'flex-end',
  },
  loadMore: {
    alignItems: 'center',
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[1],
  },
  input: {
    flex: 1,
    minHeight: 40,
    paddingHorizontal: space[2],
    paddingVertical: space[1],
    borderRadius: radii[1],
    backgroundColor: colors.surfaceAlt,
    color: colors.text,
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
