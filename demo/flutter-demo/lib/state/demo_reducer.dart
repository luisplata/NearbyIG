import '../generated/copy.dart';
import '../generated/fixtures.dart';
import 'demo_action.dart';
import 'demo_effect.dart';
import 'demo_state.dart';
import 'selectors.dart';

/// Resultado de un paso del reducer: estado nuevo + efectos a agendar.
class ReduceResult {
  const ReduceResult({required this.state, required this.effects});

  final DemoState state;
  final List<DemoEffect> effects;
}

/// Reducer puro: no importa Flutter, no lee el reloj, no hace I/O.
///
/// Una acción que no pasa su guard es un **no-op** con la misma instancia de
/// estado y sin efectos (state-machine.md §3).
ReduceResult reduce(DemoState state, DemoAction action) {
  switch (action.type) {
    case DemoActionType.setView:
      return _setView(state, action);
    case DemoActionType.setSelfIntention:
      return _setSelfIntention(state, action);
    case DemoActionType.openOverlay:
      return _openOverlay(state, action);
    case DemoActionType.closeOverlay:
      return _closeOverlay(state);
    case DemoActionType.setRadius:
      return _setRadius(state, action);
    case DemoActionType.toggleFilterIntention:
      return _toggleFilterIntention(state, action);
    case DemoActionType.setGenderFilter:
      return _setGenderFilter(state, action);
    case DemoActionType.toggleVerifiedOnly:
      return _toggleVerifiedOnly(state);
    case DemoActionType.toggleOnlineOnly:
      return _toggleOnlineOnly(state);
    case DemoActionType.clearFilters:
      return _clearFilters(state);
    case DemoActionType.sendPing:
      return _sendPing(state, action);
    case DemoActionType.acceptPing:
      return _acceptPing(state, action);
    case DemoActionType.rejectPing:
      return _rejectPing(state, action);
    case DemoActionType.openChat:
      return _openChat(state, action);
    case DemoActionType.sendMessage:
      return _sendMessage(state, action);
    case DemoActionType.revealPhoto:
      return _revealPhoto(state);
    case DemoActionType.toggleGhost:
      return _toggleGhost(state);
    case DemoActionType.setVerification:
      return _cycleVerification(state);
    case DemoActionType.blockProfile:
      return _blockProfile(state, action);
    case DemoActionType.unblockProfile:
      return _unblockProfile(state, action);
    case DemoActionType.reportProfile:
      return _reportProfile(state, action);
    case DemoActionType.markRead:
      return _markRead(state, action);
    case DemoActionType.markAllRead:
      return _markAllRead(state);
    case DemoActionType.dismissToast:
      return _dismissToast(state);
    case DemoActionType.timerFired:
      return _timerFired(state, action);
    case DemoActionType.reset:
      return ReduceResult(state: initialState(), effects: const <DemoEffect>[]);
  }
}

ReduceResult _noop(DemoState state) =>
    ReduceResult(state: state, effects: const <DemoEffect>[]);

ReduceResult _done(DemoState state, List<DemoEffect> effects) =>
    ReduceResult(state: state, effects: effects);

void _pushToast(DemoState state, String textKey, List<DemoEffect> effects) {
  final seq = state.toastSeq + 1;
  state.toastSeq = seq;
  final toast = DemoToast(id: 't$seq', textKey: textKey);
  state.toast = toast;
  effects.add(
    DemoEffect(
      kind: DemoEffectKind.toast,
      id: toast.id,
      delayMs: kTimers.toastMs,
    ),
  );
}

void _pushNotification(
  DemoState state,
  NotificationKind kind,
  String profileId,
) {
  final seq = state.notifSeq + 1;
  state.notifSeq = seq;
  state.notifications.add(
    DemoNotification(
      id: 'n$seq',
      kind: kind,
      profileId: profileId,
      read: false,
    ),
  );
}

bool _isVisible(DemoState state, String id) =>
    visibleProfiles(state).any((profile) => profile.id == id);

ReduceResult _setView(DemoState state, DemoAction action) {
  final view = action.view;
  if (view == null) {
    return _noop(state);
  }
  final next = state.copy();
  next.view = view;
  if (next.overlay == DemoOverlay.filters) {
    next.overlay = null;
  }
  return _done(next, <DemoEffect>[]);
}

ReduceResult _setSelfIntention(DemoState state, DemoAction action) {
  final intention = action.intention;
  if (intention == null) {
    return _noop(state);
  }
  final next = state.copy();
  next.selfIntention = intention;
  // El descubrimiento usa la intención propia como filtro por defecto (F-1).
  next.filters.intentions = <Intention>[intention];
  return _done(next, <DemoEffect>[]);
}

ReduceResult _openOverlay(DemoState state, DemoAction action) {
  final overlay = action.overlay;
  if (overlay == null) {
    return _noop(state);
  }
  if (overlay == DemoOverlay.profile || overlay == DemoOverlay.safety) {
    final id = action.profileId;
    if (id == null || state.blocked.contains(id) || !_isVisible(state, id)) {
      return _noop(state);
    }
  }
  final next = state.copy();
  next.overlay = overlay;
  next.profileId = action.profileId;
  return _done(next, <DemoEffect>[]);
}

ReduceResult _closeOverlay(DemoState state) {
  final wasChat = state.overlay == DemoOverlay.chat;
  final next = state.copy();
  next.overlay = null;
  next.profileId = null;
  // La celebración de match se descarta al cerrar el overlay: es su única salida.
  next.matchCelebration = null;
  if (!wasChat) {
    next.chatId = null;
  }
  return _done(next, <DemoEffect>[]);
}

ReduceResult _setRadius(DemoState state, DemoAction action) {
  final radiusM = action.radiusM;
  if (radiusM == null || !kFilters.radiiM.contains(radiusM)) {
    return _noop(state);
  }
  final next = state.copy();
  next.filters.radiusM = radiusM;
  return _done(next, <DemoEffect>[]);
}

ReduceResult _toggleFilterIntention(DemoState state, DemoAction action) {
  final intention = action.intention;
  if (intention == null) {
    return _noop(state);
  }
  final next = state.copy();
  final current = next.filters.intentions == null
      ? <Intention>[]
      : List<Intention>.of(next.filters.intentions!);
  if (current.contains(intention)) {
    current.remove(intention);
  } else {
    current.add(intention);
  }
  if (current.isEmpty) {
    next.filters.intentions = null;
  } else {
    next.filters.intentions = kFilters.intentions
        .where(current.contains)
        .toList();
  }
  return _done(next, <DemoEffect>[]);
}

ReduceResult _setGenderFilter(DemoState state, DemoAction action) {
  final gender = action.gender;
  if (gender != null && !kFilters.genders.contains(gender)) {
    return _noop(state);
  }
  final next = state.copy();
  next.filters.gender = gender;
  return _done(next, <DemoEffect>[]);
}

ReduceResult _toggleVerifiedOnly(DemoState state) {
  final next = state.copy();
  next.filters.verifiedOnly = !next.filters.verifiedOnly;
  return _done(next, <DemoEffect>[]);
}

ReduceResult _toggleOnlineOnly(DemoState state) {
  final next = state.copy();
  next.filters.onlineOnly = !next.filters.onlineOnly;
  return _done(next, <DemoEffect>[]);
}

ReduceResult _clearFilters(DemoState state) {
  final next = state.copy();
  next.filters
    ..intentions = null
    ..gender = null
    ..verifiedOnly = false
    ..onlineOnly = false;
  return _done(next, <DemoEffect>[]);
}

ReduceResult _sendPing(DemoState state, DemoAction action) {
  final id = action.profileId;
  if (id == null || profileById(id) == null) {
    return _noop(state);
  }
  if (state.ghost ||
      state.blocked.contains(id) ||
      state.pingsSent.contains(id) ||
      state.matches.contains(id) ||
      !_isVisible(state, id)) {
    return _noop(state);
  }
  final effects = <DemoEffect>[];
  final next = state.copy();
  final wasFirstPing = next.pingsSent.isEmpty;
  next.pingsSent.add(id);
  if (wasFirstPing) {
    effects.add(
      DemoEffect(
        kind: DemoEffectKind.incomingPing,
        id: kScript.incomingPingFromId,
        delayMs: kTimers.incomingPingMs,
      ),
    );
  }
  _pushToast(next, 'ping.sent', effects);
  return _done(next, effects);
}

ReduceResult _acceptPing(DemoState state, DemoAction action) {
  final id = action.profileId;
  if (id == null ||
      state.ghost ||
      state.blocked.contains(id) ||
      !state.incomingPings.contains(id)) {
    return _noop(state);
  }
  final effects = <DemoEffect>[];
  final next = state.copy();
  next.incomingPings.remove(id);
  if (!next.matches.contains(id)) {
    next.matches.add(id);
  }
  next.messages.putIfAbsent(id, () => <ChatMessage>[]);
  effects.add(
    DemoEffect(kind: DemoEffectKind.match, id: id, delayMs: kTimers.matchMs),
  );
  return _done(next, effects);
}

ReduceResult _rejectPing(DemoState state, DemoAction action) {
  final id = action.profileId;
  if (id == null || !state.incomingPings.contains(id)) {
    return _noop(state);
  }
  final next = state.copy();
  next.incomingPings.remove(id);
  return _done(next, <DemoEffect>[]);
}

ReduceResult _openChat(DemoState state, DemoAction action) {
  final id = action.profileId;
  if (id == null || state.blocked.contains(id) || !state.matches.contains(id)) {
    return _noop(state);
  }
  final next = state.copy();
  next.chatId = id;
  next.matchCelebration = null;
  next.overlay = DemoOverlay.chat;
  return _done(next, <DemoEffect>[]);
}

ReduceResult _sendMessage(DemoState state, DemoAction action) {
  final id = action.profileId;
  final textKey = action.textKey;
  if (id == null || textKey == null || !kCopy.containsKey(textKey)) {
    return _noop(state);
  }
  if (state.chatId != id ||
      state.typing != null ||
      state.blocked.contains(id) ||
      !state.matches.contains(id)) {
    return _noop(state);
  }
  final effects = <DemoEffect>[];
  final next = state.copy();
  next.messages
      .putIfAbsent(id, () => <ChatMessage>[])
      .add(ChatMessage(from: ChatAuthor.me, textKey: textKey));
  next.typing = id;
  effects.add(
    DemoEffect(kind: DemoEffectKind.typing, id: id, delayMs: kTimers.typingMs),
  );
  return _done(next, effects);
}

ReduceResult _revealPhoto(DemoState state) {
  final chatId = state.chatId;
  if (chatId == null ||
      state.blocked.contains(chatId) ||
      !state.matches.contains(chatId) ||
      state.revealedByMe.contains(chatId)) {
    return _noop(state);
  }
  final effects = <DemoEffect>[];
  final next = state.copy();
  next.revealedByMe.add(chatId);
  effects.add(
    DemoEffect(
      kind: DemoEffectKind.reveal,
      id: chatId,
      delayMs: kTimers.revealMs,
    ),
  );
  return _done(next, effects);
}

ReduceResult _toggleGhost(DemoState state) {
  final next = state.copy();
  next.ghost = !next.ghost;
  if (next.ghost &&
      (next.overlay == DemoOverlay.profile ||
          next.overlay == DemoOverlay.chat)) {
    next.overlay = null;
    next.profileId = null;
    next.chatId = null;
  }
  return _done(next, <DemoEffect>[]);
}

ReduceResult _cycleVerification(DemoState state) {
  const values = IgVerification.values;
  final index = values.indexOf(state.verification);
  final next = state.copy();
  next.verification = values[(index + 1) % values.length];
  return _done(next, <DemoEffect>[]);
}

ReduceResult _blockProfile(DemoState state, DemoAction action) {
  final id = action.profileId;
  if (id == null || state.blocked.contains(id)) {
    return _noop(state);
  }
  final effects = <DemoEffect>[];
  final next = state.copy();
  next.blocked.add(id);
  next.pingsSent.remove(id);
  next.incomingPings.remove(id);
  next.matches.remove(id);
  next.revealedByMe.remove(id);
  next.revealedByPeer.remove(id);
  next.messages.remove(id);
  next.replyCursor.remove(id);
  if (next.typing == id) {
    next.typing = null;
  }
  next.notifications.removeWhere(
    (notification) => notification.profileId == id,
  );
  if (next.matchCelebration == id) {
    next.matchCelebration = null;
  }
  if (next.chatId == id) {
    next.chatId = null;
    if (next.overlay == DemoOverlay.chat) {
      next.overlay = null;
    }
  }
  if (next.profileId == id) {
    next.overlay = null;
    next.profileId = null;
  }
  _pushToast(next, 'safety.blocked', effects);
  return _done(next, effects);
}

ReduceResult _unblockProfile(DemoState state, DemoAction action) {
  final id = action.profileId;
  if (id == null || !state.blocked.contains(id)) {
    return _noop(state);
  }
  final effects = <DemoEffect>[];
  final next = state.copy();
  next.blocked.remove(id);
  _pushToast(next, 'safety.unblocked', effects);
  return _done(next, effects);
}

ReduceResult _reportProfile(DemoState state, DemoAction action) {
  final id = action.profileId;
  final reason = action.reason;
  if (id == null ||
      reason == null ||
      state.blocked.contains(id) ||
      !kReportReasons.contains(reason)) {
    return _noop(state);
  }
  final effects = <DemoEffect>[];
  final next = state.copy();
  _pushToast(next, 'safety.reportDone', effects);
  return _done(next, effects);
}

ReduceResult _markRead(DemoState state, DemoAction action) {
  final id = action.notificationId;
  if (id == null) {
    return _noop(state);
  }
  final index = state.notifications.indexWhere(
    (notification) => notification.id == id,
  );
  if (index < 0) {
    return _noop(state);
  }
  final next = state.copy();
  next.notifications[index] = next.notifications[index].asRead();
  return _done(next, <DemoEffect>[]);
}

ReduceResult _markAllRead(DemoState state) {
  final next = state.copy();
  for (var index = 0; index < next.notifications.length; index += 1) {
    next.notifications[index] = next.notifications[index].asRead();
  }
  return _done(next, <DemoEffect>[]);
}

ReduceResult _dismissToast(DemoState state) {
  if (state.toast == null) {
    return _noop(state);
  }
  final next = state.copy();
  next.toast = null;
  return _done(next, <DemoEffect>[]);
}

ReduceResult _timerFired(DemoState state, DemoAction action) {
  final kind = action.effectKind;
  final id = action.profileId;
  if (kind == null || id == null) {
    return _noop(state);
  }
  switch (kind) {
    case DemoEffectKind.incomingPing:
      return _timerIncomingPing(state, id);
    case DemoEffectKind.match:
      return _timerMatch(state, id);
    case DemoEffectKind.typing:
      return _timerTyping(state, id);
    case DemoEffectKind.reveal:
      return _timerReveal(state, id);
    case DemoEffectKind.toast:
      if (state.toast?.id != id) {
        return _noop(state);
      }
      final next = state.copy();
      next.toast = null;
      return _done(next, <DemoEffect>[]);
  }
}

ReduceResult _timerIncomingPing(DemoState state, String id) {
  if (state.ghost ||
      state.blocked.contains(id) ||
      state.incomingPings.contains(id) ||
      state.matches.contains(id) ||
      state.pingsSent.contains(id) ||
      profileById(id) == null) {
    return _noop(state);
  }
  final effects = <DemoEffect>[];
  final next = state.copy();
  next.incomingPings.add(id);
  _pushNotification(next, NotificationKind.ping, id);
  _pushToast(next, 'notif.ping', effects);
  return _done(next, effects);
}

ReduceResult _timerMatch(DemoState state, String id) {
  if (state.blocked.contains(id) || !state.matches.contains(id)) {
    return _noop(state);
  }
  final next = state.copy();
  next.matchCelebration = id;
  _pushNotification(next, NotificationKind.match, id);
  return _done(next, <DemoEffect>[]);
}

ReduceResult _timerTyping(DemoState state, String id) {
  if (state.typing != id ||
      state.blocked.contains(id) ||
      !state.matches.contains(id)) {
    return _noop(state);
  }
  final next = state.copy();
  next.typing = null;
  final replies = kScript.chatReplies[id];
  final String replyKey;
  if (replies == null || replies.isEmpty) {
    replyKey = kScript.fallbackReplyKey;
  } else {
    final cursor = next.replyCursor[id] ?? 0;
    final index = cursor < replies.length ? cursor : replies.length - 1;
    replyKey = replies[index];
    next.replyCursor[id] = index + 1 < replies.length
        ? index + 1
        : replies.length - 1;
  }
  next.messages
      .putIfAbsent(id, () => <ChatMessage>[])
      .add(ChatMessage(from: ChatAuthor.peer, textKey: replyKey));
  return _done(next, <DemoEffect>[]);
}

ReduceResult _timerReveal(DemoState state, String id) {
  if (state.blocked.contains(id) || !state.revealedByMe.contains(id)) {
    return _noop(state);
  }
  final next = state.copy();
  if (!next.revealedByPeer.contains(id)) {
    next.revealedByPeer.add(id);
  }
  _pushNotification(next, NotificationKind.reveal, id);
  return _done(next, <DemoEffect>[]);
}
