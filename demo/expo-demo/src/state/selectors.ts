import { fixtures } from '../generated/fixtures';

import type { AvatarRenderState, DemoState, UiProfile } from './types';

/**
 * Perfil por `id`, o `null` si no existe en el catálogo activo.
 *
 * El segundo parámetro es el dataset (`state.catalog`): el build lo deja por
 * defecto y el modo live pasa el catálogo del backend. Sin default, cada
 * llamada de una pantalla tendría que conocer el origen.
 */
export function profileById(
  id: string | null,
  catalog: readonly UiProfile[] = fixtures.profiles,
): UiProfile | null {
  if (id === null) {
    return null;
  }
  return catalog.find((profile) => profile.id === id) ?? null;
}

/**
 * Perfiles visibles: sin bloqueados, dentro del radio, con los filtros activos
 * y ordenados por distancia ascendente (empatan por `id`).
 */
export function visibleProfiles(state: DemoState): UiProfile[] {
  // Sin filtro explícito de intención se muestran los 10 perfiles del dataset
  // (CONTRACT.md §9, punto 2). La intención propia actúa como filtro por defecto
  // sólo cuando el usuario la elige (SET_SELF_INTENTION).
  const intentions = state.filters.intentions;
  const gender = state.filters.gender;
  // El toggle de bots es del cliente: el server sigue devolviendo el catálogo
  // completo y acá se recorta, así apagar bots no cambia lo que ve la otra
  // sesión ni obliga a un query param nuevo.
  const bots = state.includeBots ? null : new Set(state.botIds);
  const result: UiProfile[] = [];
  for (const profile of state.catalog) {
    if (bots !== null && bots.has(profile.id)) {
      continue;
    }
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

/**
 * Badge de pings de la barra inferior.
 *
 * En modo live el número es la bandeja real (pendientes que todavía esperan
 * respuesta); en dataset es el guion del mock. Mezclarlos contaría dos veces el
 * mismo ping cuando la sesión live arranca con el catálogo del build.
 */
export function pingsBadgeCount(state: DemoState, livePending: number): number {
  return state.source === 'live' ? livePending : state.incomingPings.length;
}

/**
 * Badge de la campana: notificaciones del guion sin leer + pings pendientes de
 * la sesión live. Es lo que responde a "no veo nada en notificaciones": mientras
 * el ping esté pendiente, la campana lo cuenta.
 */
export function bellBadgeCount(state: DemoState, livePending: number): number {
  return unreadCount(state) + (state.source === 'live' ? livePending : 0);
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
export function projectProfile(profile: UiProfile, radiusM: number): DotPosition {
  const ratio = radiusM <= 0 ? 1 : Math.min(profile.distanceM / radiusM, 1);
  const r = 0.42 * ratio;
  const radians = (profile.bearingDeg * Math.PI) / 180;
  return { x: 0.5 + Math.sin(radians) * r, y: 0.5 - Math.cos(radians) * r };
}

/** El perfil propio queda fuera del descubrimiento en modo fantasma (F-8). */
export function selfVisibleInDiscovery(state: DemoState): boolean {
  return !state.ghost;
}
