import '../generated/fixtures.dart';
import 'demo_effect.dart';
import 'demo_state.dart';

/// Las 26 acciones del contrato (state-machine.md §2).
enum DemoActionType {
  setView,
  setSelfIntention,
  openOverlay,
  closeOverlay,
  setRadius,
  toggleFilterIntention,
  setGenderFilter,
  toggleVerifiedOnly,
  toggleOnlineOnly,
  clearFilters,
  sendPing,
  acceptPing,
  rejectPing,
  openChat,
  sendMessage,
  revealPhoto,
  toggleGhost,
  setVerification,
  blockProfile,
  unblockProfile,
  reportProfile,
  markRead,
  markAllRead,
  dismissToast,
  timerFired,
  reset,
}

const Map<String, DemoActionType> _typesByName = <String, DemoActionType>{
  'SET_VIEW': DemoActionType.setView,
  'SET_SELF_INTENTION': DemoActionType.setSelfIntention,
  'OPEN_OVERLAY': DemoActionType.openOverlay,
  'CLOSE_OVERLAY': DemoActionType.closeOverlay,
  'SET_RADIUS': DemoActionType.setRadius,
  'TOGGLE_FILTER_INTENTION': DemoActionType.toggleFilterIntention,
  'SET_GENDER_FILTER': DemoActionType.setGenderFilter,
  'TOGGLE_VERIFIED_ONLY': DemoActionType.toggleVerifiedOnly,
  'TOGGLE_ONLINE_ONLY': DemoActionType.toggleOnlineOnly,
  'CLEAR_FILTERS': DemoActionType.clearFilters,
  'SEND_PING': DemoActionType.sendPing,
  'ACCEPT_PING': DemoActionType.acceptPing,
  'REJECT_PING': DemoActionType.rejectPing,
  'OPEN_CHAT': DemoActionType.openChat,
  'SEND_MESSAGE': DemoActionType.sendMessage,
  'REVEAL_PHOTO': DemoActionType.revealPhoto,
  'TOGGLE_GHOST': DemoActionType.toggleGhost,
  'SET_VERIFICATION': DemoActionType.setVerification,
  'BLOCK_PROFILE': DemoActionType.blockProfile,
  'UNBLOCK_PROFILE': DemoActionType.unblockProfile,
  'REPORT_PROFILE': DemoActionType.reportProfile,
  'MARK_READ': DemoActionType.markRead,
  'MARK_ALL_READ': DemoActionType.markAllRead,
  'DISMISS_TOAST': DemoActionType.dismissToast,
  'TIMER_FIRED': DemoActionType.timerFired,
  'RESET': DemoActionType.reset,
};

/// Acción de la demo. Un único tipo con payload opcional: el golden la
/// deserializa desde `steps.json` y la UI la construye con los constructores
/// nombrados de abajo.
class DemoAction {
  const DemoAction._(
    this.type, {
    this.view,
    this.overlay,
    this.profileId,
    this.intention,
    this.gender,
    this.radiusM,
    this.textKey,
    this.reason,
    this.notificationId,
    this.effectKind,
  });

  final DemoActionType type;
  final DemoView? view;
  final DemoOverlay? overlay;
  final String? profileId;
  final Intention? intention;
  final Gender? gender;
  final int? radiusM;
  final String? textKey;
  final String? reason;
  final String? notificationId;
  final DemoEffectKind? effectKind;

  /// `true` cuando la acción llevaba `gender` explícito (incluido `all` = null).
  bool get hasGenderPayload => type == DemoActionType.setGenderFilter;

  const DemoAction.setView(DemoView value)
    : this._(DemoActionType.setView, view: value);

  const DemoAction.setSelfIntention(Intention value)
    : this._(DemoActionType.setSelfIntention, intention: value);

  const DemoAction.openOverlay(DemoOverlay value, {String? profileId})
    : this._(DemoActionType.openOverlay, overlay: value, profileId: profileId);

  const DemoAction.closeOverlay() : this._(DemoActionType.closeOverlay);

  const DemoAction.setRadius(int value)
    : this._(DemoActionType.setRadius, radiusM: value);

  const DemoAction.toggleFilterIntention(Intention value)
    : this._(DemoActionType.toggleFilterIntention, intention: value);

  const DemoAction.setGenderFilter(Gender? value)
    : this._(DemoActionType.setGenderFilter, gender: value);

  const DemoAction.toggleVerifiedOnly()
    : this._(DemoActionType.toggleVerifiedOnly);

  const DemoAction.toggleOnlineOnly() : this._(DemoActionType.toggleOnlineOnly);

  const DemoAction.clearFilters() : this._(DemoActionType.clearFilters);

  const DemoAction.sendPing(String id)
    : this._(DemoActionType.sendPing, profileId: id);

  const DemoAction.acceptPing(String id)
    : this._(DemoActionType.acceptPing, profileId: id);

  const DemoAction.rejectPing(String id)
    : this._(DemoActionType.rejectPing, profileId: id);

  const DemoAction.openChat(String id)
    : this._(DemoActionType.openChat, profileId: id);

  const DemoAction.sendMessage(String id, String key)
    : this._(DemoActionType.sendMessage, profileId: id, textKey: key);

  const DemoAction.revealPhoto() : this._(DemoActionType.revealPhoto);

  const DemoAction.toggleGhost() : this._(DemoActionType.toggleGhost);

  const DemoAction.setVerification() : this._(DemoActionType.setVerification);

  const DemoAction.blockProfile(String id)
    : this._(DemoActionType.blockProfile, profileId: id);

  const DemoAction.unblockProfile(String id)
    : this._(DemoActionType.unblockProfile, profileId: id);

  const DemoAction.reportProfile(String id, String reportReason)
    : this._(DemoActionType.reportProfile, profileId: id, reason: reportReason);

  const DemoAction.markRead(String id)
    : this._(DemoActionType.markRead, notificationId: id);

  const DemoAction.markAllRead() : this._(DemoActionType.markAllRead);

  const DemoAction.dismissToast() : this._(DemoActionType.dismissToast);

  const DemoAction.timerFired(DemoEffectKind kind, String id)
    : this._(DemoActionType.timerFired, effectKind: kind, profileId: id);

  const DemoAction.reset() : this._(DemoActionType.reset);

  /// Deserializa una acción del golden (`golden/steps.json`). Mismo mapeo de
  /// nombres que la implementación Expo: cualquier divergencia rompe el digest.
  static DemoAction fromJson(Map<String, Object?> json) {
    final typeName = json['type'];
    if (typeName is! String) {
      throw ArgumentError('Acción sin "type": $json');
    }
    final type = _typesByName[typeName];
    if (type == null) {
      throw ArgumentError('Tipo de acción desconocido: $typeName');
    }
    final profileId = json['profileId'] as String?;
    switch (type) {
      case DemoActionType.setView:
        return DemoAction.setView(_enumByName(DemoView.values, json['view']));
      case DemoActionType.setSelfIntention:
        return DemoAction.setSelfIntention(
          _enumByName(Intention.values, json['intention']),
        );
      case DemoActionType.openOverlay:
        return DemoAction.openOverlay(
          _enumByName(DemoOverlay.values, json['overlay']),
          profileId: profileId,
        );
      case DemoActionType.closeOverlay:
        return const DemoAction.closeOverlay();
      case DemoActionType.setRadius:
        return DemoAction.setRadius(_intPayload(json['radiusM'], 'radiusM'));
      case DemoActionType.toggleFilterIntention:
        return DemoAction.toggleFilterIntention(
          _enumByName(Intention.values, json['intention']),
        );
      case DemoActionType.setGenderFilter:
        final gender = json['gender'];
        return DemoAction.setGenderFilter(
          gender == null || gender == 'all'
              ? null
              : _enumByName(Gender.values, gender),
        );
      case DemoActionType.toggleVerifiedOnly:
        return const DemoAction.toggleVerifiedOnly();
      case DemoActionType.toggleOnlineOnly:
        return const DemoAction.toggleOnlineOnly();
      case DemoActionType.clearFilters:
        return const DemoAction.clearFilters();
      case DemoActionType.sendPing:
        return DemoAction.sendPing(_stringPayload(profileId, 'profileId'));
      case DemoActionType.acceptPing:
        return DemoAction.acceptPing(_stringPayload(profileId, 'profileId'));
      case DemoActionType.rejectPing:
        return DemoAction.rejectPing(_stringPayload(profileId, 'profileId'));
      case DemoActionType.openChat:
        return DemoAction.openChat(_stringPayload(profileId, 'profileId'));
      case DemoActionType.sendMessage:
        return DemoAction.sendMessage(
          _stringPayload(profileId, 'profileId'),
          _stringPayload(json['textKey'], 'textKey'),
        );
      case DemoActionType.revealPhoto:
        return const DemoAction.revealPhoto();
      case DemoActionType.toggleGhost:
        return const DemoAction.toggleGhost();
      case DemoActionType.setVerification:
        return const DemoAction.setVerification();
      case DemoActionType.blockProfile:
        return DemoAction.blockProfile(_stringPayload(profileId, 'profileId'));
      case DemoActionType.unblockProfile:
        return DemoAction.unblockProfile(
          _stringPayload(profileId, 'profileId'),
        );
      case DemoActionType.reportProfile:
        return DemoAction.reportProfile(
          _stringPayload(profileId, 'profileId'),
          _stringPayload(json['reason'], 'reason'),
        );
      case DemoActionType.markRead:
        return DemoAction.markRead(
          _stringPayload(json['notificationId'], 'notificationId'),
        );
      case DemoActionType.markAllRead:
        return const DemoAction.markAllRead();
      case DemoActionType.dismissToast:
        return const DemoAction.dismissToast();
      case DemoActionType.timerFired:
        return DemoAction.timerFired(
          _enumByName(DemoEffectKind.values, json['kind']),
          _stringPayload(json['id'], 'id'),
        );
      case DemoActionType.reset:
        return const DemoAction.reset();
    }
  }

  static T _enumByName<T extends Enum>(List<T> values, Object? raw) {
    if (raw is! String) {
      throw ArgumentError('Se esperaba un enum en string, llegó: $raw');
    }
    for (final value in values) {
      if (value.name == raw) {
        return value;
      }
    }
    throw ArgumentError('Valor de enum desconocido: $raw');
  }

  static String _stringPayload(Object? raw, String field) {
    if (raw is! String) {
      throw ArgumentError('Se esperaba "$field" en string, llegó: $raw');
    }
    return raw;
  }

  static int _intPayload(Object? raw, String field) {
    if (raw is! int) {
      throw ArgumentError('Se esperaba "$field" en entero, llegó: $raw');
    }
    return raw;
  }
}
