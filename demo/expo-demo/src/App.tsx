import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DemoFrame } from './components/DemoFrame';
import { FilterSheet } from './components/FilterSheet';
import { CountBadge, IconButton } from './components/IconButton';
import { GhostBanner } from './components/GhostBanner';
import { LiveBar } from './components/LiveBar';
import { MatchOverlay } from './components/MatchOverlay';
import { Overlay, SheetLayer } from './components/Overlay';
import { ProfilePickerSheet } from './components/ProfilePickerSheet';
import { SimSheet } from './components/SimSheet';
import { ToastHost } from './components/ToastHost';
import { VisibilitySwitch } from './components/VisibilitySwitch';
import { ZoneSheet } from './components/ZoneSheet';
import { fmt } from './generated/copy';
import { chatText } from './live/chatCopy';
import { LiveProvider, useLive } from './live/LiveProvider';
import { prefsCopy } from './live/prefsCopy';
import { safetyText } from './live/safetyCopy';
import { useGhost } from './live/useGhost';
import {
  nextBackAction,
  topSheet,
  type BackAction,
  type BackState,
} from './navigation/backAction';
import { AboutScreen } from './screens/AboutScreen';
import { BlockedScreen } from './screens/BlockedScreen';
import { ChatHubScreen } from './screens/ChatHubScreen';
import { ChatScreen } from './screens/ChatScreen';
import { DiscoveryScreen } from './screens/DiscoveryScreen';
import { NotificationsScreen } from './screens/NotificationsScreen';
import { PrivacyScreen } from './screens/PrivacyScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { SafetyScreen } from './screens/SafetyScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { getSoundEngine, installGestureUnlock } from './sound/engine';
import { useSoundBlocked, useSoundEffects } from './sound/useSound';
import { DemoStoreProvider, useDemo } from './state/DemoProvider';
import { PreferencesProvider } from './state/PreferencesProvider';
import { bellBadgeCount, profileById } from './state/selectors';
import { createDemoStore } from './state/store';
import type { DemoOverlay } from './state/types';
import { colors, fontFamily, fontSize, space, text } from './theme/theme';

/**
 * Raíz de la demo Expo. Carga Inter local con `expo-font` (sin CDN) y no
 * renderiza hasta tener la fuente: evita FOUT y diferencias de captura (E-6).
 * El idioma del documento (`lang="es"`) sale del build, no de un override en
 * runtime: `web.lang` + `public/index.html` (E-5 / F-13).
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

  /**
   * Desbloqueo de audio: el navegador sólo deja sonar después de un gesto. El
   * primer `pointerdown`/`keydown` reanuda el contexto y los listeners se
   * remueven (no queda un handler pegado a cada toque de la demo).
   */
  useEffect(() => installGestureUnlock(), []);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      {/*
        La barra de estado se declara una sola vez, en la raíz: el fondo es
        #09090B en toda la app, así que los glifos tienen que ser claros. Un
        `StatusBar` por pantalla sería tres copias que se pisan al abrir un sheet.
      */}
      <StatusBar style="light" />
      <DemoStoreProvider store={store}>
        <PreferencesProvider>
          <LiveProvider store={store}>
            <DemoShell />
          </LiveProvider>
        </PreferencesProvider>
      </DemoStoreProvider>
    </SafeAreaProvider>
  );
}

/**
 * Chrome de la demo: header persistente con marca y slogan, switch de
 * visibilidad y campana; banner de pausa; y capas absolutas para overlays,
 * match y toasts. Cero router.
 */
function DemoShell() {
  const { state, dispatch } = useDemo();
  const live = useLive();
  const [simOpen, setSimOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const overlayProfile = profileById(state.profileId, state.catalog);
  const celebration = profileById(state.matchCelebration, state.catalog);
  /** Con un match real abierto el título sale del peer del chat, no del catálogo. */
  const overlayName = live.state.chat?.peer?.nickname ?? overlayProfile?.nickname;
  const ghost = useGhost();
  const soundBlocked = useSoundBlocked();
  const zonePrompt = live.state.zonePrompt;
  // Pings, matches y mensajes del dataset del build suenan por acá; en live los
  // dispara el stream desde el provider.
  useSoundEffects();
  /**
   * Campana: `unreadCount` de `/notifications` en live. En dataset sigue siendo
   * el guion (notificaciones sin leer), que es el comportamiento de siempre.
   */
  const bell = bellBadgeCount(state, live.unreadCount);

  const closeSheet = (): void => setSimOpen(false);
  const openSheet = (): void => setSimOpen(true);

  /**
   * Efectos de un paso de back. El botón "volver" del header y el gesto del
   * sistema pasan por la misma función: si divergen, el usuario aprende dos
   * comportamientos para el mismo botón.
   */
  const runBack = (action: BackAction): void => {
    switch (action.type) {
      case 'close-sheet':
        if (action.sheet === 'sim') setSimOpen(false);
        else if (action.sheet === 'profiles') setPickerOpen(false);
        else live.dismissZoneSheet();
        return;
      case 'open-overlay':
        /**
         * Volver desde una conversación cae en el **Chat**, no en descubrimiento:
         * es la pantalla desde la que se abrió. Además cierra el chat real, así
         * el próximo match del guion no muestra la conversación del server.
         */
        if (action.overlay === 'pings') {
          live.closeChat();
          dispatch({ type: 'OPEN_OVERLAY', overlay: 'pings' });
          return;
        }
        dispatch({ type: 'OPEN_OVERLAY', overlay: 'profile', profileId: state.profileId });
        return;
      case 'close-overlay':
        dispatch({ type: 'CLOSE_OVERLAY' });
        return;
      case 'exit':
        return;
    }
  };

  /**
   * Back del sistema (Android). Se suscribe **una vez** y el estado entra por
   * ref: re-suscribir con dependencias deja una ventana sin handler justo al
   * abrir o cerrar un sheet, y agrega un add/remove por cada toque.
   *
   * En web no se registra: `react-native-web` no lo soporta y su `addEventListener`
   * imprime un `console.error` en la consola del sitio publicado.
   */
  const backRef = useRef<BackState>({
    sheet: null,
    match: false,
    overlay: null,
    hasProfile: false,
  });
  backRef.current = {
    sheet: topSheet({ sim: simOpen, profiles: pickerOpen, zone: zonePrompt !== null }),
    // La celebración no es `state.overlay`: se modela aparte porque tapa la vista.
    match: state.matchCelebration !== null,
    overlay: state.overlay,
    hasProfile: state.profileId !== null,
  };
  const runBackRef = useRef(runBack);
  runBackRef.current = runBack;

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      const action = nextBackAction(backRef.current);
      // En la raíz no se intercepta: `false` deja que Android cierre la app.
      if (action.type === 'exit') return false;
      runBackRef.current(action);
      return true;
    });
    return () => subscription.remove();
  }, []);

  /**
   * El `onBack` del header: mismo paso, sin sheet porque se pulsa desde el overlay.
   * `match: false` a propósito: el botón vive dentro del `Overlay`, y la
   * celebración (si la hay) está encima suyo, no debajo. Que el header cierre la
   * celebración cambiaría un comportamiento ya verificado en el device.
   */
  const onBack = (): void =>
    runBack(
      nextBackAction({
        sheet: null,
        match: false,
        overlay: state.overlay,
        hasProfile: state.profileId !== null,
      }),
    );

  /**
   * Abrir el centro de notificaciones limpia el badge (F-6): navega y después
   * marca todo leído con la acción explícita que también reproduce el golden.
   */
  const openNotifications = (): void => {
    dispatch({ type: 'OPEN_OVERLAY', overlay: 'notifications' });
    dispatch({ type: 'MARK_NOTIFICATIONS_READ' });
    // El dataset se marca solo al abrir (F-6); el live no: sus avisos los apaga
    // el usuario con "Marcar todas como leídas". La pantalla pide su foto fresca.
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
            <View style={styles.brandColumn}>
              <Text numberOfLines={1} style={[text.label, styles.brandName]}>
                {fmt('about.brand')}
              </Text>
              <Text numberOfLines={1} style={styles.slogan}>
                {fmt('about.club')}
              </Text>
            </View>
            <VisibilitySwitch
              checked={ghost.checked}
              disabled={ghost.disabled}
              onToggle={ghost.toggle}
            />
            <View>
              <IconButton
                icon="bellOutline"
                label={
                  bell > 0
                    ? fmt('a11y.notificationsBadge', { count: `${bell}` })
                    : fmt('nav.notifications')
                }
                onPress={() => openNotifications()}
              />
              <CountBadge
                count={bell}
                label={fmt('a11y.notificationsBadge', { count: `${bell}` })}
              />
            </View>
          </View>

          {ghost.banner === null ? null : (
            <GhostBanner
              onDisable={ghost.toggle}
              message={
                ghost.banner === 'live'
                  ? safetyText('ghostLiveOn')
                  : fmt('settings.ghostOn')
              }
            />
          )}
          {ghost.error === null ? null : (
            <Text style={[text.small, styles.ghostError]}>
              {safetyText('ghostError', { code: ghost.error })}
            </Text>
          )}

          <LiveBar onOpenProfiles={() => setPickerOpen(true)} />

          {/* Aviso discreto y una sola vez: un toque desbloquea el audio. */}
          {soundBlocked ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLiveRegion="polite"
              accessibilityLabel={prefsCopy.soundsBlocked}
              onPress={() => void getSoundEngine().unlock()}
              style={styles.soundHintRow}
            >
              <Text style={[text.small, styles.soundHint]}>{prefsCopy.soundsBlocked}</Text>
            </Pressable>
          ) : null}

          <View style={styles.stack}>
            <DiscoveryScreen />

            {state.overlay === null ? null : (
              <Overlay
                title={overlayTitle(state.overlay, overlayName)}
                full={state.overlay === 'chat'}
                onBack={onBack}
              >
                <OverlayBody overlay={state.overlay} onOpenSim={openSheet} />
              </Overlay>
            )}

            {celebration === null ? null : (
              <MatchOverlay
                profile={celebration}
                onOpenChat={() => {
                  // El match del guion no es un match del server: se cierra el chat
                  // real para que la pantalla muestre la conversación del dataset.
                  live.closeChat();
                  dispatch({ type: 'OPEN_CHAT', profileId: celebration.id });
                }}
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

            {pickerOpen ? (
              <SheetLayer onClose={() => setPickerOpen(false)}>
                <ProfilePickerSheet onClose={() => setPickerOpen(false)} />
              </SheetLayer>
            ) : null}

            {zonePrompt === null ? null : (
              <SheetLayer onClose={live.dismissZoneSheet}>
                <ZoneSheet cause={zonePrompt} />
              </SheetLayer>
            )}
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
      // El overlay sigue llamándose `pings` en el reducer; la pantalla es Chat.
      return chatText('title');
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
      return <ChatHubScreen />;
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
  brandColumn: {
    flex: 1,
    justifyContent: 'center',
    gap: 1,
  },
  brandName: {
    fontSize: fontSize[0],
  },
  slogan: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize[0],
    color: colors.muted,
  },
  ghostError: {
    color: colors.danger,
    paddingHorizontal: space[2],
    paddingBottom: 4,
  },
  soundHintRow: {
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: space[3],
  },
  soundHint: {
    color: colors.accent,
  },
  stack: {
    flex: 1,
  },
});
