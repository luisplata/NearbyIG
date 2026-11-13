import { StyleSheet, Text, View } from 'react-native';

import { fmt } from '../generated/copy';
import { chatText } from '../live/chatCopy';
import { safetyCopy } from '../live/safetyCopy';
import { formatDistance } from '../state/format';
import type { AvatarRenderState } from '../state/types';
import { colors, fontFamily, fontSize, radii, space } from '../theme/theme';

import { Avatar } from './Avatar';
import { OnlineDot, VerifiedBadge } from './Badges';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { PressableRow } from './PressableRow';
import type { UiProfile } from '../state/types';

/**
 * Tarjeta de perfil de la lista. El label accesible expone nombre y distancia
 * (F-13) y el resto del contenido queda fuera del árbol semántico.
 *
 * **Acceso al chat.** Si el perfil ya tiene match, la tarjeta muestra el globo de
 * chat con los mensajes sin leer. Antes la única puerta al chat era Pings →
 * Matches, y desde la lista no había ninguna pista de que la conversación
 * existiera; el globo es esa pista y el atajo de un toque.
 */
export function ProfileCard({
  profile,
  renderState,
  onTap,
  onBlock,
  onReport,
  chat,
  onOpenChat,
}: {
  profile: UiProfile;
  renderState: AvatarRenderState;
  onTap: () => void;
  /** Acción rápida de la tarjeta (perfil ajeno). Sin handler, no se dibuja. */
  onBlock?: () => void;
  onReport?: () => void;
  /** Hay match con este perfil; `unread` es lo que falta leer del otro lado. */
  chat?: { unread: number } | null;
  onOpenChat?: () => void;
}) {
  const label = [
    fmt('a11y.profileDot', {
      name: profile.nickname,
      distance: formatDistance(profile.distanceM),
    }),
    ...(profile.verified ? [fmt('a11y.verified')] : []),
    ...(profile.online ? [fmt('a11y.online')] : []),
  ].join('. ');

  return (
    <View style={styles.card}>
      <PressableRow accessibilityLabel={label} onPress={onTap} style={styles.tap}>
        <View
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.content}
        >
          <Avatar photoId={profile.photoId} size={52} renderState={renderState} />
          <View style={styles.body}>
            <View style={styles.nameRow}>
              <Text numberOfLines={1} style={styles.name}>
                {profile.nickname}
              </Text>
              {profile.verified ? <VerifiedBadge /> : null}
              {profile.online ? <View style={styles.dotGap}><OnlineDot /></View> : null}
            </View>
            <Text numberOfLines={1} style={styles.status}>
              {fmt(profile.statusKey)}
            </Text>
            <View style={styles.metaRow}>
              <Text style={styles.meta}>{fmt(`intention.${profile.intention}`)}</Text>
              <Text style={styles.distance}>{formatDistance(profile.distanceM)}</Text>
            </View>
          </View>
        </View>
      </PressableRow>
      {onOpenChat === undefined ? null : (
        <View style={styles.chatAction}>
          <IconButton
            icon="chat"
            size={18}
            color={colors.accent}
            label={
              chat !== null && chat !== undefined && chat.unread > 0
                ? chatText('unreadA11y', { count: String(chat.unread) })
                : chatText('openChat')
            }
            onPress={onOpenChat}
          />
          {chat !== null && chat !== undefined && chat.unread > 0 ? (
            <View style={styles.chatBadge}>
              <Text style={styles.chatBadgeText}>{chat.unread}</Text>
            </View>
          ) : null}
        </View>
      )}

      {onBlock === undefined && onReport === undefined ? null : (
        <View style={styles.actions}>
          {onReport === undefined ? null : (
            <IconButton
              icon="info"
              size={18}
              color={colors.muted}
              label={safetyCopy.report}
              onPress={onReport}
            />
          )}
          {onBlock === undefined ? null : (
            <IconButton
              icon="block"
              size={18}
              color={colors.danger}
              label={safetyCopy.block}
              onPress={onBlock}
            />
          )}
        </View>
      )}
      <Icon name="chevronRight" size={20} color={colors.muted} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii[1],
    padding: space[2],
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  tap: {
    flex: 1,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chatAction: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatBadge: {
    position: 'absolute',
    right: 4,
    top: 4,
    minWidth: 14,
    height: 14,
    paddingHorizontal: 3,
    borderRadius: 7,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatBadgeText: {
    fontFamily: fontFamily.semibold,
    fontSize: 9,
    color: colors.bg,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dotGap: {
    marginLeft: 2,
  },
  name: {
    flexShrink: 1,
    fontFamily: fontFamily.semibold,
    fontSize: fontSize[2],
    color: colors.text,
  },
  status: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize[0],
    color: colors.muted,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[1],
    marginTop: 2,
  },
  meta: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize[0],
    color: colors.muted,
  },
  distance: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize[0],
    color: colors.text,
  },
});
