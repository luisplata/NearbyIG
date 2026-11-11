import { ScrollView, StyleSheet } from 'react-native';

import { fmt } from '../generated/copy';
import type { Profile } from '../generated/fixtures';
import { avatarState } from '../state/selectors';
import type { DemoState } from '../state/types';
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
}: {
  state: DemoState;
  profiles: Profile[];
  onOpen: (profile: Profile) => void;
  onClearFilters: () => void;
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
    <ScrollView contentContainerStyle={styles.content} style={styles.scroll}>
      {profiles.map((profile) => (
        <ProfileCard
          key={profile.id}
          profile={profile}
          renderState={avatarState(state, profile.id)}
          onTap={() => onOpen(profile)}
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
