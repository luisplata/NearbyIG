import { useFonts } from 'expo-font';
import { useEffect, useMemo, useState } from 'react';
import { Image, Platform, StyleSheet, Text, View } from 'react-native';

import { DemoFrame } from './components/DemoFrame';
import { Chip } from './components/Chip';
import { FilterSheet } from './components/FilterSheet';
import { CountBadge, IconButton } from './components/IconButton';
import { GhostBanner } from './components/GhostBanner';
import { MatchOverlay } from './components/MatchOverlay';
import { Overlay, SheetLayer } from './components/Overlay';
import { SimSheet } from './components/SimSheet';
import { ToastHost } from './components/ToastHost';
import { fmt } from './generated/copy';
import { AboutScreen } from './screens/AboutScreen';
import { BlockedScreen } from './screens/BlockedScreen';
import { ChatScreen } from './screens/ChatScreen';
import { DiscoveryScreen } from './screens/DiscoveryScreen';
import { NotificationsScreen } from './screens/NotificationsScreen';
import { PingsScreen } from './screens/PingsScreen';
import { PrivacyScreen } from './screens/PrivacyScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { SafetyScreen } from './screens/SafetyScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { DemoStoreProvider, useDemo } from './state/DemoProvider';
import { profileById, unreadCount } from './state/selectors';
import { createDemoStore } from './state/store';
import type { DemoOverlay } from './state/types';
import { colors, space, text } from './theme/theme';

/**
 * Raíz de la demo Expo. Carga Inter local con `expo-font` (sin CDN) y no
 * renderiza hasta tener la fuente: evita FOUT y diferencias de captura (E-6).
 */
export default function App() {
  const [fontsLoaded] = useFonts({
    'Inter-Regular': require('../assets/fonts/Inter-Regular.ttf'),
    'Inter-SemiBold': require('../assets/fonts/Inter-SemiBold.ttf'),
  });
  const store = useMemo(() => createDemoStore(), []);

  useEffect(() => {
    // El template de Expo Web sale con `lang="en"`; la demo es es-AR (a11y).
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.documentElement.lang = 'es';
    }
  }, []);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <DemoStoreProvider store={store}>
      <DemoShell />
    </DemoStoreProvider>
  );
}

/**
 * Chrome de la demo: header persistente con marca, chip DEMO y campana; banner
 * de pausa; y capas absolutas para overlays, match y toasts. Cero router.
 */
function DemoShell() {
  const { state, dispatch } = useDemo();
  const [simOpen, setSimOpen] = useState(false);
  const overlayProfile = profileById(state.profileId);
  const celebration = profileById(state.matchCelebration);

  const closeSheet = (): void => setSimOpen(false);
  const openSheet = (): void => setSimOpen(true);

  const onBack = (): void => {
    if (state.overlay === 'safety' && state.profileId !== null) {
      dispatch({ type: 'OPEN_OVERLAY', overlay: 'profile', profileId: state.profileId });
      return;
    }
    dispatch({ type: 'CLOSE_OVERLAY' });
  };

  return (
    <View style={styles.root}>
      <DemoFrame>
        <View style={styles.frame}>
          <View style={styles.header}>
            <Image
              source={require('../assets/brand/icon-192.png')}
              style={styles.brandIcon}
              accessibilityLabel={fmt('about.brand')}
            />
            <Text numberOfLines={1} style={[text.label, styles.brand]}>
              {fmt('about.brand')}
            </Text>
            <Chip label={fmt('common.demoChip')} emphasis onPress={openSheet} />
            <View>
              <IconButton
                icon="bellOutline"
                label={
                  unreadCount(state) > 0
                    ? fmt('a11y.notificationsBadge', { count: `${unreadCount(state)}` })
                    : fmt('nav.notifications')
                }
                onPress={() => dispatch({ type: 'OPEN_OVERLAY', overlay: 'notifications' })}
              />
              <CountBadge
                count={unreadCount(state)}
                label={fmt('a11y.notificationsBadge', { count: `${unreadCount(state)}` })}
              />
            </View>
          </View>

          {state.ghost ? <GhostBanner onDisable={() => dispatch({ type: 'TOGGLE_GHOST' })} /> : null}

          <View style={styles.stack}>
            <DiscoveryScreen />

            {state.overlay === null ? null : (
              <Overlay
                title={overlayTitle(state.overlay, overlayProfile?.nickname)}
                full={state.overlay === 'chat'}
                onBack={onBack}
              >
                <OverlayBody overlay={state.overlay} onOpenSim={openSheet} />
              </Overlay>
            )}

            {celebration === null ? null : (
              <MatchOverlay
                profile={celebration}
                onOpenChat={() => dispatch({ type: 'OPEN_CHAT', profileId: celebration.id })}
                onDismiss={() => dispatch({ type: 'CLOSE_OVERLAY' })}
              />
            )}

            {state.toast === null ? null : (
              <ToastHost toast={state.toast} onDismiss={() => dispatch({ type: 'DISMISS_TOAST' })} />
            )}

            {simOpen ? (
              <SheetLayer onClose={closeSheet}>
                <SimSheet onClose={closeSheet} />
              </SheetLayer>
            ) : null}
          </View>
        </View>
      </DemoFrame>
    </View>
  );
}

function overlayTitle(overlay: DemoOverlay, nickname: string | undefined): string {
  switch (overlay) {
    case 'profile':
    case 'safety':
      return nickname ?? fmt('nav.profile');
    case 'chat':
      return nickname ?? fmt('chat.placeholder');
    case 'pings':
      return fmt('nav.pings');
    case 'notifications':
      return fmt('notif.title');
    case 'filters':
      return fmt('filters.title');
    case 'settings':
      return fmt('settings.title');
    case 'about':
      return fmt('about.title');
    case 'blocked':
      return fmt('safety.blockedListTitle');
    case 'privacy':
      return fmt('privacy.title');
  }
}

function OverlayBody({
  overlay,
  onOpenSim,
}: {
  overlay: DemoOverlay;
  onOpenSim: () => void;
}) {
  switch (overlay) {
    case 'profile':
      return <ProfileScreen />;
    case 'chat':
      return <ChatScreen />;
    case 'pings':
      return <PingsScreen />;
    case 'notifications':
      return <NotificationsScreen />;
    case 'filters':
      return <FilterSheet />;
    case 'settings':
      return <SettingsScreen />;
    case 'about':
      return <AboutScreen onOpenSim={onOpenSim} />;
    case 'safety':
      return <SafetyScreen />;
    case 'blocked':
      return <BlockedScreen />;
    case 'privacy':
      return <PrivacyScreen />;
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  frame: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[1],
    paddingLeft: space[3],
    paddingRight: space[1],
    paddingVertical: space[1],
  },
  brandIcon: {
    width: 24,
    height: 24,
  },
  brand: {
    flex: 1,
  },
  stack: {
    flex: 1,
  },
});
