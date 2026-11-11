import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { fmt } from '../generated/copy';
import type { Profile } from '../generated/fixtures';
import { useDemo } from '../state/DemoProvider';
import { formatDistance } from '../state/format';
import { profileById } from '../state/selectors';
import { colors, fontSize, radii, space, text } from '../theme/theme';

import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';

/**
 * Bandeja de pings: recibidos (aceptar → match a 2.5 s, o rechazar) y enviados
 * con su estado pendiente (F-4, F-5). Espejo de `pings_screen.dart`: el ping
 * enviado se lista sin acciones, así el segundo envío queda bloqueado por el
 * reducer y por la UI.
 */
export function PingsScreen() {
  const { state } = useDemo();
  const incoming = state.incomingPings.flatMap((id) => {
    const profile = profileById(id);
    return profile === null ? [] : [profile];
  });
  // Un ping enviado sigue "esperando respuesta" hasta que hay match (ahí la
  // conversación vive en el chat) o el perfil se bloquea.
  const sent = state.pingsSent.flatMap((id) => {
    const profile = profileById(id);
    if (profile === null || state.matches.includes(id) || state.blocked.includes(id)) {
      return [];
    }
    return [profile];
  });

  if (incoming.length === 0 && sent.length === 0) {
    return <EmptyState message={fmt('ping.inboxEmpty')} icon="ping" />;
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {incoming.length === 0 ? null : (
        <Section title={fmt('ping.inboxTitle')}>
          {incoming.map((profile) => (
            <ReceivedCard key={profile.id} profile={profile} />
          ))}
        </Section>
      )}
      {sent.length === 0 ? null : (
        <Section title={fmt('ping.sentTitle')}>
          {sent.map((profile) => (
            <SentCard key={profile.id} profile={profile} />
          ))}
        </Section>
      )}
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={[text.small, styles.sectionTitle]}>{title}</Text>
      {children}
    </View>
  );
}

function Card({
  profile,
  subtitle,
  children,
}: {
  profile: Profile;
  subtitle: string;
  children?: ReactNode;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Avatar photoId={profile.photoId} size={44} />
        <View style={styles.info}>
          <Text numberOfLines={1} style={[text.bodyLarge, styles.name]}>
            {profile.nickname}
          </Text>
          <Text numberOfLines={1} style={[text.small, { color: colors.muted }]}>
            {subtitle}
          </Text>
        </View>
      </View>
      {children}
    </View>
  );
}

function ReceivedCard({ profile }: { profile: Profile }) {
  const { dispatch } = useDemo();
  return (
    <Card profile={profile} subtitle={`${fmt('notif.ping')} · ${formatDistance(profile.distanceM)}`}>
      <View style={styles.actions}>
        <View style={styles.action}>
          <Button
            label={fmt('ping.accept')}
            fullWidth
            onPress={() => dispatch({ type: 'ACCEPT_PING', profileId: profile.id })}
          />
        </View>
        <View style={styles.action}>
          <Button
            label={fmt('ping.reject')}
            variant="outline"
            fullWidth
            onPress={() => dispatch({ type: 'REJECT_PING', profileId: profile.id })}
          />
        </View>
      </View>
    </Card>
  );
}

function SentCard({ profile }: { profile: Profile }) {
  const status = fmt('ping.sentStatus');
  return (
    <Card profile={profile} subtitle={formatDistance(profile.distanceM)}>
      <View style={styles.status} accessibilityLabel={status}>
        <Icon name="schedule" size={16} color={colors.accent} />
        <Text numberOfLines={1} style={[text.small, styles.statusText]}>
          {status}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: space[1],
    paddingBottom: space[3],
  },
  section: {
    gap: space[1],
    paddingTop: space[1],
  },
  sectionTitle: {
    color: colors.muted,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii[1],
    padding: space[2],
    gap: space[1],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: fontSize[2],
  },
  actions: {
    flexDirection: 'row',
    gap: space[1],
  },
  action: {
    flex: 1,
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[1],
  },
  statusText: {
    flex: 1,
    color: colors.accent,
  },
});
