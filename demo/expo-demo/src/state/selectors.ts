import { fixtures } from '../generated/fixtures';
import type { Profile } from '../generated/fixtures';

import type { AvatarRenderState, DemoState } from './types';

/** Perfil por `id`, o `null` si no existe en el dataset. */
export function profileById(id: string | null): Profile | null {
  if (id === null) {
    return null;
  }
  return fixtures.profiles.find((profile) => profile.id === id) ?? null;
}

/**
 * Perfiles visibles: sin bloqueados, dentro del radio, con los filtros activos
 * y ordenados por distancia ascendente (empatan por `id`).
 */
export function visibleProfiles(state: DemoState): Profile[] {
  // Sin filtro explícito de intención se muestran los 10 perfiles del dataset
  // (CONTRACT.md §9, punto 2). La intención propia actúa como filtro por defecto
  // sólo cuando el usuario la elige (SET_SELF_INTENTION).
  const intentions = state.filters.intentions;
  const gender = state.filters.gender;
  const result: Profile[] = [];
  for (const profile of fixtures.profiles) {
    if (state.blocked.includes(profile.id)) {
      continue;
    }
    if (profile.distanceM > state.filters.radiusM) {
      continue;
    }
    if (intentions !== null && !intentions.includes(profile.intention)) {
      continue;
    }
    if (gender !== null && profile.gender !== gender) {
      continue;
    }
    if (state.filters.verifiedOnly && !profile.verified) {
      continue;
    }
    if (state.filters.onlineOnly && !profile.online) {
      continue;
    }
    result.push(profile);
  }
  result.sort((a, b) => {
    const byDistance = a.distanceM - b.distanceM;
    return byDistance !== 0 ? byDistance : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return result;
}

/** Notificaciones sin leer (badge). */
export function unreadCount(state: DemoState): number {
  return state.notifications.filter((notification) => !notification.read).length;
}

/** Ping disponible: sin pausa, visible, no bloqueado, no enviado ni matcheado. */
export function canPing(state: DemoState, id: string): boolean {
  if (state.ghost || state.blocked.includes(id)) {
    return false;
  }
  if (state.pingsSent.includes(id) || state.matches.includes(id)) {
    return false;
  }
  return visibleProfiles(state).some((profile) => profile.id === id);
}

/** Motivo de bloqueo del ping como clave de copy, o `null` si puede enviarse. */
export function pingBlockedReason(state: DemoState, id: string): string | null {
  if (state.ghost) {
    return 'ping.blocked.paused';
  }
  if (state.blocked.includes(id)) {
    return 'ping.blocked.blocked';
  }
  if (state.matches.includes(id)) {
    return 'ping.blocked.matched';
  }
  if (state.pingsSent.includes(id)) {
    return 'ping.blocked.sent';
  }
  return null;
}

/** Envío de mensajes habilitado en el chat abierto. */
export function canSendInChat(state: DemoState): boolean {
  const chatId = state.chatId;
  if (chatId === null || state.typing !== null) {
    return false;
  }
  return state.matches.includes(chatId) && !state.blocked.includes(chatId);
}

/** Revelación mutua: hace falta que ambos lados hayan revelado. */
export function isRevealed(state: DemoState, id: string): boolean {
  return state.revealedByMe.includes(id) && state.revealedByPeer.includes(id);
}

export function isRevealedByMe(state: DemoState, id: string): boolean {
  return state.revealedByMe.includes(id);
}

/** Estado de render del avatar: `clear` sólo tras revelación mutua. */
export function avatarState(state: DemoState, id: string): AvatarRenderState {
  return isRevealed(state, id) ? 'clear' : 'blurred';
}

export type DotPosition = { x: number; y: number };

/**
 * Posición normalizada (0..1) de un perfil en radar y mapa: proyección
 * compartida del contrato (state-machine.md §6), sin azar.
 */
export function projectProfile(profile: Profile, radiusM: number): DotPosition {
  const ratio = radiusM <= 0 ? 1 : Math.min(profile.distanceM / radiusM, 1);
  const r = 0.42 * ratio;
  const radians = (profile.bearingDeg * Math.PI) / 180;
  return { x: 0.5 + Math.sin(radians) * r, y: 0.5 - Math.cos(radians) * r };
}

/** El perfil propio queda fuera del descubrimiento en modo fantasma (F-8). */
export function selfVisibleInDiscovery(state: DemoState): boolean {
  return !state.ghost;
}
