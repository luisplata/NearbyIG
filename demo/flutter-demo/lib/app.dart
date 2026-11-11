import 'package:flutter/material.dart';

import 'generated/copy.dart';
import 'generated/fixtures.dart';
import 'generated/tokens.dart';
import 'screens/about_screen.dart';
import 'screens/blocked_screen.dart';
import 'screens/chat_screen.dart';
import 'screens/discovery_screen.dart';
import 'screens/notifications_screen.dart';
import 'screens/pings_screen.dart';
import 'screens/privacy_screen.dart';
import 'screens/profile_screen.dart';
import 'screens/safety_screen.dart';
import 'screens/settings_screen.dart';
import 'state/demo_action.dart';
import 'state/demo_scope.dart';
import 'state/demo_state.dart';
import 'state/demo_store.dart';
import 'state/selectors.dart';
import 'theme/app_theme.dart';
import 'widgets/demo_chip.dart';
import 'widgets/demo_frame.dart';
import 'widgets/filter_sheet.dart';
import 'widgets/ghost_banner.dart';
import 'widgets/match_overlay.dart';
import 'widgets/sim_sheet.dart';
import 'widgets/toast_host.dart';
import 'widgets/ui_scope.dart';

/// Raíz de la demo. Crea y descarta el store (y con él los timers) cuando el
/// widget se desmonta; en tests se puede inyectar un store propio.
class NearbyDemoApp extends StatefulWidget {
  const NearbyDemoApp({super.key, this.store});

  final DemoStore? store;

  @override
  State<NearbyDemoApp> createState() => _NearbyDemoAppState();
}

class _NearbyDemoAppState extends State<NearbyDemoApp> {
  DemoStore? _owned;

  DemoStore get _store => widget.store ?? (_owned ??= DemoStore());

  @override
  void dispose() {
    _owned?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return DemoScope(
      store: _store,
      child: MaterialApp(
        title: fmt('about.brand'),
        debugShowCheckedModeBanner: false,
        theme: buildAppTheme(),
        home: const DemoShell(),
      ),
    );
  }
}

/// Chrome de la demo: header persistente con marca, chip DEMO y campana; banner
/// de pausa; y un `Stack` de overlays (nunca `Navigator`).
class DemoShell extends StatefulWidget {
  const DemoShell({super.key});

  @override
  State<DemoShell> createState() => _DemoShellState();
}

class _DemoShellState extends State<DemoShell> {
  bool _simOpen = false;

  @override
  Widget build(BuildContext context) {
    final store = DemoScope.of(context);
    final state = store.state;
    final overlayProfile = profileById(state.profileId);
    final celebrationProfile = profileById(state.matchCelebration);

    return DemoUiScope(
      openSimSheet: () => setState(() => _simOpen = true),
      child: Scaffold(
        backgroundColor: Tokens.colorBg,
        body: SafeArea(
          child: DemoFrame(
            child: Column(
              children: <Widget>[
                _GlobalHeader(
                  unread: unreadCount(state),
                  onNotifications: () => _openNotifications(store),
                  onSim: () => setState(() => _simOpen = true),
                ),
                if (state.ghost)
                  GhostBanner(
                    onDisable: () =>
                        store.dispatch(const DemoAction.toggleGhost()),
                  ),
                Expanded(
                  child: Stack(
                    children: <Widget>[
                      const Positioned.fill(child: DiscoveryScreen()),
                      if (state.overlay != null)
                        Positioned.fill(
                          child: _OverlayLayer(
                            title: _titleFor(state, overlayProfile),
                            full: state.overlay == DemoOverlay.chat,
                            onBack: () => _onBack(store, state),
                            child: _screenFor(state.overlay!),
                          ),
                        ),
                      if (state.matchCelebration != null &&
                          celebrationProfile != null)
                        Positioned.fill(
                          child: MatchOverlay(
                            profile: celebrationProfile,
                            onOpenChat: () => store.dispatch(
                              DemoAction.openChat(celebrationProfile.id),
                            ),
                            onDismiss: () =>
                                store.dispatch(const DemoAction.closeOverlay()),
                          ),
                        ),
                      if (state.toast != null)
                        Positioned(
                          left: Tokens.space[3],
                          right: Tokens.space[3],
                          bottom: Tokens.space[3],
                          child: Center(
                            child: ToastHost(
                              toast: state.toast!,
                              onDismiss: () => store.dispatch(
                                const DemoAction.dismissToast(),
                              ),
                            ),
                          ),
                        ),
                      if (_simOpen)
                        Positioned.fill(
                          child: _SimLayer(
                            onClose: () => setState(() => _simOpen = false),
                          ),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  /// Abrir el centro de notificaciones limpia el badge (F-6): primero navega y
  /// después marca todo leído con una acción explícita, para que el reducer y el
  /// golden cubran la regla (state-machine.md §3).
  void _openNotifications(DemoStore store) {
    store.dispatch(const DemoAction.openOverlay(DemoOverlay.notifications));
    store.dispatch(const DemoAction.markNotificationsRead());
  }

  void _onBack(DemoStore store, DemoState state) {
    final profileId = state.profileId;
    if (state.overlay == DemoOverlay.safety && profileId != null) {
      store.dispatch(
        DemoAction.openOverlay(DemoOverlay.profile, profileId: profileId),
      );
      return;
    }
    store.dispatch(const DemoAction.closeOverlay());
  }

  String _titleFor(DemoState state, Profile? profile) {
    switch (state.overlay!) {
      case DemoOverlay.profile:
      case DemoOverlay.safety:
        return profile?.nickname ?? fmt('nav.profile');
      case DemoOverlay.chat:
        return profile?.nickname ?? fmt('chat.placeholder');
      case DemoOverlay.pings:
        return fmt('nav.pings');
      case DemoOverlay.notifications:
        return fmt('notif.title');
      case DemoOverlay.filters:
        return fmt('filters.title');
      case DemoOverlay.settings:
        return fmt('settings.title');
      case DemoOverlay.about:
        return fmt('about.title');
      case DemoOverlay.blocked:
        return fmt('safety.blockedListTitle');
      case DemoOverlay.privacy:
        return fmt('privacy.title');
    }
  }

  Widget _screenFor(DemoOverlay overlay) {
    switch (overlay) {
      case DemoOverlay.profile:
        return const ProfileScreen();
      case DemoOverlay.chat:
        return const ChatScreen();
      case DemoOverlay.pings:
        return const PingsScreen();
      case DemoOverlay.notifications:
        return const NotificationsScreen();
      case DemoOverlay.filters:
        return const FilterSheet();
      case DemoOverlay.settings:
        return const SettingsScreen();
      case DemoOverlay.about:
        return const AboutScreen();
      case DemoOverlay.safety:
        return const SafetyScreen();
      case DemoOverlay.blocked:
        return const BlockedScreen();
      case DemoOverlay.privacy:
        return const PrivacyScreen();
    }
  }
}

class _GlobalHeader extends StatelessWidget {
  const _GlobalHeader({
    required this.unread,
    required this.onNotifications,
    required this.onSim,
  });

  final int unread;
  final VoidCallback onNotifications;
  final VoidCallback onSim;

  @override
  Widget build(BuildContext context) {
    final bellLabel = unread > 0
        ? fmt('a11y.notificationsBadge', <String, String>{'count': '$unread'})
        : fmt('nav.notifications');
    return Padding(
      padding: EdgeInsets.fromLTRB(
        Tokens.space[3],
        Tokens.space[1],
        Tokens.space[1],
        Tokens.space[1],
      ),
      child: Row(
        children: <Widget>[
          Image.asset(
            'assets/brand/icon-192.png',
            width: 24,
            height: 24,
            filterQuality: FilterQuality.medium,
            semanticLabel: fmt('about.brand'),
          ),
          SizedBox(width: Tokens.space[1]),
          Expanded(
            child: Text(
              fmt('about.brand'),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: Tokens.fontSizes[1],
                fontWeight: FontWeight.w600,
                color: Tokens.colorText,
              ),
            ),
          ),
          DemoChip(label: fmt('common.demoChip'), emphasis: true, onTap: onSim),
          const SizedBox(width: 2),
          Semantics(
            button: true,
            label: bellLabel,
            liveRegion: unread > 0,
            child: IconButton(
              onPressed: onNotifications,
              tooltip: fmt('nav.notifications'),
              icon: Badge(
                isLabelVisible: unread > 0,
                label: Text('$unread'),
                backgroundColor: Tokens.colorAccent,
                textColor: Tokens.colorBg,
                child: const Icon(Icons.notifications_none),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _OverlayLayer extends StatelessWidget {
  const _OverlayLayer({
    required this.title,
    required this.child,
    required this.onBack,
    required this.full,
  });

  final String title;
  final Widget child;
  final VoidCallback onBack;
  final bool full;

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: <Widget>[
        Positioned.fill(
          child: ModalBarrier(
            dismissible: true,
            onDismiss: onBack,
            color: Tokens.colorBg.withValues(alpha: 0.72),
          ),
        ),
        Positioned.fill(
          child: Align(
            alignment: Alignment.bottomCenter,
            child: FractionallySizedBox(
              heightFactor: full ? 0.96 : 0.84,
              widthFactor: 1,
              child: DecoratedBox(
                decoration: const BoxDecoration(
                  borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
                  boxShadow: <BoxShadow>[
                    BoxShadow(
                      offset: Offset(0, Tokens.shadowSheetOffsetY),
                      blurRadius: Tokens.shadowSheetBlur,
                      color: Tokens.shadowSheetColor,
                    ),
                  ],
                ),
                child: Material(
                  color: Tokens.colorSurface,
                  borderRadius: const BorderRadius.vertical(
                    top: Radius.circular(20),
                  ),
                  child: Semantics(
                    scopesRoute: true,
                    namesRoute: true,
                    explicitChildNodes: true,
                    label: title,
                    child: FocusScope(
                      autofocus: true,
                      child: Padding(
                        padding: EdgeInsets.fromLTRB(
                          Tokens.space[3],
                          Tokens.space[1],
                          Tokens.space[3],
                          Tokens.space[2],
                        ),
                        child: Column(
                          children: <Widget>[
                            Row(
                              children: <Widget>[
                                IconButton(
                                  onPressed: onBack,
                                  tooltip: fmt('common.back'),
                                  icon: const Icon(Icons.arrow_back),
                                ),
                                Expanded(
                                  child: Text(
                                    title,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(
                                      fontSize: Tokens.fontSizes[3],
                                      fontWeight: FontWeight.w600,
                                      color: Tokens.colorText,
                                    ),
                                  ),
                                ),
                                Semantics(
                                  button: true,
                                  label: fmt('common.close'),
                                  child: IconButton(
                                    onPressed: onBack,
                                    tooltip: fmt('common.close'),
                                    icon: const Icon(Icons.close),
                                  ),
                                ),
                              ],
                            ),
                            Expanded(child: child),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _SimLayer extends StatelessWidget {
  const _SimLayer({required this.onClose});

  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: <Widget>[
        Positioned.fill(
          child: ModalBarrier(
            dismissible: true,
            onDismiss: onClose,
            color: Tokens.colorBg.withValues(alpha: 0.72),
          ),
        ),
        Positioned(
          left: 0,
          right: 0,
          bottom: 0,
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxHeight: 520),
            child: FocusScope(
              autofocus: true,
              child: SimSheet(onClose: onClose),
            ),
          ),
        ),
      ],
    );
  }
}
