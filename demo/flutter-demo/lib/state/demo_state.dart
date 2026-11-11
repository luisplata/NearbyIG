import '../generated/fixtures.dart';

/// Vista base de descubrimiento. No hay más secciones: el contrato prohíbe
/// cualquier pantalla de historial de rutas, encuentros o visitas (F-11).
enum DemoView { radar, map, list }

/// Overlays apilados sobre la vista base. Se dibujan con `Stack`, nunca con
/// `Navigator` (design A4). `pings` es aditivo: el inventario de
/// `demo/CONTRACT.md` §6 exige diez pantallas y el enum del diseño listaba nueve.
enum DemoOverlay {
  profile,
  chat,
  pings,
  notifications,
  filters,
  settings,
  about,
  safety,
  blocked,
  privacy,
}

enum NotificationKind { ping, match, reveal }

/// Ciclo de demostración de Instagram: `unverified → linked → verified`.
enum IgVerification { unverified, linked, verified }

enum ChatAuthor { me, peer }

class ChatMessage {
  const ChatMessage({required this.from, required this.textKey});

  final ChatAuthor from;
  final String textKey;
}

class DemoNotification {
  const DemoNotification({
    required this.id,
    required this.kind,
    required this.profileId,
    required this.read,
  });

  final String id;
  final NotificationKind kind;
  final String profileId;
  final bool read;

  DemoNotification asRead() =>
      DemoNotification(id: id, kind: kind, profileId: profileId, read: true);
}

class DemoToast {
  const DemoToast({required this.id, required this.textKey});

  final String id;
  final String textKey;
}

/// Filtros del descubrimiento. `intentions == null` significa "sin filtro de
/// intención" (se usa la intención propia); `gender == null` significa "todos".
/// Se llama `DiscoveryFilters` para no colisionar con `DemoFilters` de los
/// fixtures generados (radios/intenciones/géneros del contrato).
class DiscoveryFilters {
  DiscoveryFilters({
    this.intentions,
    this.gender,
    this.verifiedOnly = false,
    this.onlineOnly = false,
    required this.radiusM,
  });

  List<Intention>? intentions;
  Gender? gender;
  bool verifiedOnly;
  bool onlineOnly;
  int radiusM;

  DiscoveryFilters copy() => DiscoveryFilters(
    intentions: intentions == null ? null : List<Intention>.of(intentions!),
    gender: gender,
    verifiedOnly: verifiedOnly,
    onlineOnly: onlineOnly,
    radiusM: radiusM,
  );
}

/// Estado completo de la demo.
///
/// Los campos son mutables a propósito: el reducer trabaja siempre sobre
/// `state.copy()` y las pantallas sólo leen. La forma (y no la identidad) es lo
/// que se compara con el golden, así que no se implementa `==`.
class DemoState {
  DemoState({
    required this.view,
    required this.overlay,
    required this.profileId,
    required this.chatId,
    required this.selfIntention,
    required this.ghost,
    required this.filters,
    required this.pingsSent,
    required this.incomingPings,
    required this.matches,
    required this.revealedByMe,
    required this.revealedByPeer,
    required this.messages,
    required this.typing,
    required this.notifications,
    required this.blocked,
    required this.verification,
    required this.matchCelebration,
    required this.toast,
    required this.notifSeq,
    required this.toastSeq,
    required this.replyCursor,
  });

  DemoView view;
  DemoOverlay? overlay;
  String? profileId;
  String? chatId;
  Intention selfIntention;
  bool ghost;
  DiscoveryFilters filters;
  List<String> pingsSent;
  List<String> incomingPings;
  List<String> matches;
  List<String> revealedByMe;
  List<String> revealedByPeer;
  Map<String, List<ChatMessage>> messages;
  String? typing;
  List<DemoNotification> notifications;
  List<String> blocked;
  IgVerification verification;
  String? matchCelebration;
  DemoToast? toast;
  int notifSeq;
  int toastSeq;
  Map<String, int> replyCursor;

  DemoState copy() => DemoState(
    view: view,
    overlay: overlay,
    profileId: profileId,
    chatId: chatId,
    selfIntention: selfIntention,
    ghost: ghost,
    filters: filters.copy(),
    pingsSent: List<String>.of(pingsSent),
    incomingPings: List<String>.of(incomingPings),
    matches: List<String>.of(matches),
    revealedByMe: List<String>.of(revealedByMe),
    revealedByPeer: List<String>.of(revealedByPeer),
    messages: <String, List<ChatMessage>>{
      for (final entry in messages.entries)
        entry.key: List<ChatMessage>.of(entry.value),
    },
    typing: typing,
    notifications: List<DemoNotification>.of(notifications),
    blocked: List<String>.of(blocked),
    verification: verification,
    matchCelebration: matchCelebration,
    toast: toast,
    notifSeq: notifSeq,
    toastSeq: toastSeq,
    replyCursor: Map<String, int>.of(replyCursor),
  );
}

/// `initialState()` derivado del dataset: refresh, `RESET` y primer arranque
/// producen exactamente este estado (F-12).
DemoState initialState() => DemoState(
  view: DemoView.radar,
  overlay: null,
  profileId: null,
  chatId: null,
  selfIntention: kSelf.intention,
  ghost: false,
  filters: DiscoveryFilters(radiusM: kFilters.defaultRadiusM),
  pingsSent: <String>[],
  incomingPings: <String>[],
  matches: <String>[],
  revealedByMe: <String>[],
  revealedByPeer: <String>[],
  messages: <String, List<ChatMessage>>{},
  typing: null,
  notifications: <DemoNotification>[],
  blocked: <String>[],
  verification: IgVerification.unverified,
  matchCelebration: null,
  toast: null,
  notifSeq: 0,
  toastSeq: 0,
  replyCursor: <String, int>{},
);
