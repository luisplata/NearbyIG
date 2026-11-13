import { ScrollView, StyleSheet } from 'react-native';

import { fmt } from '../generated/copy';
import { avatarState } from '../state/selectors';
import type { DemoState, UiProfile } from '../state/types';
import { space } from '../theme/theme';

import { EmptyState } from './EmptyState';
import { ProfileCard } from './ProfileCard';

/**
 * Lista de descubrimiento: ordenada por distancia ascendente (F-2) y con el
 * mismo conjunto filtrado que radar y mapa.
 */
export function ProfileList({
  state,
  profiles,
  onOpen,
  onClearFilters,
  onBlock,
  onReport,
  chatFor,
  onOpenChat,
  onScrollTopChange,
}: {
  state: DemoState;
  profiles: UiProfile[];
  onOpen: (profile: UiProfile) => void;
  onClearFilters: () => void;
  onBlock?: (profile: UiProfile) => void;
  onReport?: (profile: UiProfile) => void;
  /** Match del perfil en la bandeja vigente, o `null`. Sin esto no hay globo. */
  chatFor?: (profile: UiProfile) => { unread: number } | null;
  onOpenChat?: (profile: UiProfile) => void;
  /**
   * Avisa si la lista está arriba de todo. El pull-to-refresh sólo se arma con
   * la lista en el tope: a mitad de scroll, tirar hacia abajo es scrollear.
   */
  onScrollTopChange?: (atTop: boolean) => void;
}) {
  if (profiles.length === 0) {
    return (
      <EmptyState
        message={fmt('empty.filters')}
        actionLabel={fmt('empty.filtersCta')}
        onAction={onClearFilters}
      />
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      style={styles.scroll}
      scrollEventThrottle={16}
      onScroll={
        onScrollTopChange === undefined
          ? undefined
          : (event) => onScrollTopChange(event.nativeEvent.contentOffset.y <= 0)
      }
    >
      {profiles.map((profile) => (
        <ProfileCard
          key={profile.id}
          profile={profile}
          renderState={avatarState(state, profile.id)}
          onTap={() => onOpen(profile)}
          onBlock={onBlock === undefined ? undefined : () => onBlock(profile)}
          onReport={onReport === undefined ? undefined : () => onReport(profile)}
          chat={chatFor === undefined ? undefined : chatFor(profile)}
          onOpenChat={onOpenChat === undefined ? undefined : () => onOpenChat(profile)}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: space[3],
    paddingTop: space[2],
    paddingBottom: space[3],
    gap: space[1],
  },
});
