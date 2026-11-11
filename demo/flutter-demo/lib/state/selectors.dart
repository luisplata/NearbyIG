import 'dart:math' as math;

import '../generated/fixtures.dart';
import 'demo_state.dart';

/// Perfil por `id`, o `null` si no existe en el dataset.
Profile? profileById(String? id) {
  if (id == null) {
    return null;
  }
  for (final profile in kProfiles) {
    if (profile.id == id) {
      return profile;
    }
  }
  return null;
}

/// Perfiles visibles: sin bloqueados, dentro del radio, con los filtros activos
/// y ordenados por distancia ascendente (empatan por `id`).
List<Profile> visibleProfiles(DemoState state) {
  // Sin filtro explícito de intención se muestran los 10 perfiles del dataset
  // (CONTRACT.md §9, punto 2). La intención propia actúa como filtro por
  // defecto sólo cuando el usuario la elige (SET_SELF_INTENTION).
  final intentions = state.filters.intentions;
  final gender = state.filters.gender;
  final result = <Profile>[];
  for (final profile in kProfiles) {
    if (state.blocked.contains(profile.id)) {
      continue;
    }
    if (profile.distanceM > state.filters.radiusM) {
      continue;
    }
    if (intentions != null && !intentions.contains(profile.intention)) {
      continue;
    }
    if (gender != null && profile.gender != gender) {
      continue;
    }
    if (state.filters.verifiedOnly && !profile.verified) {
      continue;
    }
    if (state.filters.onlineOnly && !profile.online) {
      continue;
    }
    result.add(profile);
  }
  result.sort((a, b) {
    final byDistance = a.distanceM.compareTo(b.distanceM);
    return byDistance != 0 ? byDistance : a.id.compareTo(b.id);
  });
  return result;
}

/// Notificaciones sin leer (badge).
int unreadCount(DemoState state) {
  var count = 0;
  for (final notification in state.notifications) {
    if (!notification.read) {
      count += 1;
    }
  }
  return count;
}

/// Ping disponible: sin pausa, visible, no bloqueado, no enviado ni matcheado.
bool canPing(DemoState state, String id) {
  if (state.ghost || state.blocked.contains(id)) {
    return false;
  }
  if (state.pingsSent.contains(id) || state.matches.contains(id)) {
    return false;
  }
  return visibleProfiles(state).any((profile) => profile.id == id);
}

/// Motivo de bloqueo del envío de ping, como clave de copy, o `null` si puede.
String? pingBlockedReason(DemoState state, String id) {
  if (state.ghost) {
    return 'ping.blocked.paused';
  }
  if (state.blocked.contains(id)) {
    return 'ping.blocked.blocked';
  }
  if (state.matches.contains(id)) {
    return 'ping.blocked.matched';
  }
  if (state.pingsSent.contains(id)) {
    return 'ping.blocked.sent';
  }
  return null;
}

/// Envío de mensajes habilitado en el chat abierto.
bool canSendInChat(DemoState state) {
  final chatId = state.chatId;
  if (chatId == null || state.typing != null) {
    return false;
  }
  return state.matches.contains(chatId) && !state.blocked.contains(chatId);
}

/// Revelación mutua: hace falta que ambos lados hayan revelado.
bool isRevealed(DemoState state, String id) =>
    state.revealedByMe.contains(id) && state.revealedByPeer.contains(id);

bool isRevealedByMe(DemoState state, String id) =>
    state.revealedByMe.contains(id);

/// Estado de render del avatar: `clear` sólo tras revelación mutua.
AvatarRenderState avatarState(DemoState state, String id) =>
    isRevealed(state, id) ? AvatarRenderState.clear : AvatarRenderState.blurred;

enum AvatarRenderState { blurred, clear }

/// Posición normalizada (0..1) de un perfil en radar y mapa: proyección
/// compartida del contrato (state-machine.md §6), sin azar.
class DotPosition {
  const DotPosition(this.x, this.y);

  final double x;
  final double y;
}

DotPosition projectProfile(Profile profile, int radiusM) {
  final ratio = radiusM <= 0 ? 1.0 : math.min(profile.distanceM / radiusM, 1.0);
  final r = 0.42 * ratio;
  final radians = profile.bearingDeg * math.pi / 180;
  return DotPosition(0.5 + math.sin(radians) * r, 0.5 - math.cos(radians) * r);
}

/// El perfil propio queda fuera del descubrimiento cuando el modo fantasma
/// está activo (F-8).
bool selfVisibleInDiscovery(DemoState state) => !state.ghost;
