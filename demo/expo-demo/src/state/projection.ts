import { fixtures } from '../generated/fixtures';

import type { ChatMessage, DemoNotification, DemoState } from './types';

/**
 * Proyección normada del estado (state-machine.md §8). Espejo de
 * `lib/state/projection.dart`: líneas `clave=valor`, sin depender del orden de
 * claves de un JSON, para que Dart y TS produzcan el mismo digest.
 *
 * Reglas de serialización:
 * - `null` → `-`; booleanos → `1` / `0`.
 * - Listas → orden ascendente, unidas por `,`; lista vacía → `-`.
 * - `filter.intentions` → `-` si es `null`; si no, en el orden del dataset.
 * - `messages` → chats por `id` ascendente, cada uno `id:` seguido de
 *   `from=textKey` unidos por `+`; chats unidos por `;`; sin chats → `-`.
 * - `notifications` → `id:kind:profileId:read` en orden de creación, unidos por `;`.
 * - `toast` → `id:textKey` o `-`.
 */
export function projectState(state: DemoState): string {
  const lines = [
    `view=${state.view}`,
    `overlay=${state.overlay ?? '-'}`,
    `profileId=${state.profileId ?? '-'}`,
    `chatId=${state.chatId ?? '-'}`,
    `selfIntention=${state.selfIntention}`,
    `ghost=${bool(state.ghost)}`,
    `radiusM=${state.filters.radiusM}`,
    `filter.intentions=${intentions(state)}`,
    `filter.gender=${state.filters.gender ?? '-'}`,
    `filter.verifiedOnly=${bool(state.filters.verifiedOnly)}`,
    `filter.onlineOnly=${bool(state.filters.onlineOnly)}`,
    `pingsSent=${list(state.pingsSent)}`,
    `incomingPings=${list(state.incomingPings)}`,
    `matches=${list(state.matches)}`,
    `revealedByMe=${list(state.revealedByMe)}`,
    `revealedByPeer=${list(state.revealedByPeer)}`,
    `messages=${messages(state.messages)}`,
    `typing=${state.typing ?? '-'}`,
    `notifications=${notifications(state.notifications)}`,
    `blocked=${list(state.blocked)}`,
    `verification=${state.verification}`,
    `matchCelebration=${state.matchCelebration ?? '-'}`,
    `toast=${state.toast === null ? '-' : `${state.toast.id}:${state.toast.textKey}`}`,
  ];
  return lines.join('\n');
}

function bool(value: boolean): string {
  return value ? '1' : '0';
}

function list(values: string[]): string {
  if (values.length === 0) {
    return '-';
  }
  return [...values].sort().join(',');
}

function intentions(state: DemoState): string {
  const selected = state.filters.intentions;
  if (selected === null) {
    return '-';
  }
  const ordered = fixtures.filters.intentions.filter((intention) => selected.includes(intention));
  return ordered.length === 0 ? '-' : ordered.join(',');
}

function messages(messagesByChat: Record<string, ChatMessage[]>): string {
  const keys = Object.keys(messagesByChat).sort();
  if (keys.length === 0) {
    return '-';
  }
  return keys
    .map((key) => `${key}:${messagesByChat[key].map((message) => `${message.from}=${message.textKey}`).join('+')}`)
    .join(';');
}

function notifications(entries: DemoNotification[]): string {
  if (entries.length === 0) {
    return '-';
  }
  return entries
    .map((entry) => `${entry.id}:${entry.kind}:${entry.profileId}:${bool(entry.read)}`)
    .join(';');
}

/** Longitud del digest acordada con el contrato (`golden/steps.json`). */
export const DIGEST_LENGTH = 12;
