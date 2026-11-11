import { copy } from '../generated/copy';
import { fixtures } from '../generated/fixtures';

import type { DemoAction } from './actions';
import { profileById, visibleProfiles } from './selectors';
import type {
  ChatMessage,
  DemoEffect,
  DemoNotification,
  DemoState,
  DiscoveryFilters,
  ReduceResult,
} from './types';

const timers = fixtures.timers;

/**
 * Copia explícita del estado (equivalente a `DemoState.copy()` en Dart). No se
 * usa `structuredClone`: el reducer debe comportarse igual en Hermes y en web.
 */
export function cloneState(state: DemoState): DemoState {
  const filters: DiscoveryFilters = {
    intentions: state.filters.intentions === null ? null : [...state.filters.intentions],
    gender: state.filters.gender,
    verifiedOnly: state.filters.verifiedOnly,
    onlineOnly: state.filters.onlineOnly,
    radiusM: state.filters.radiusM,
  };
  const messages: Record<string, ChatMessage[]> = {};
  for (const [key, value] of Object.entries(state.messages)) {
    messages[key] = value.map((message) => ({ ...message }));
  }
  return {
    view: state.view,
    overlay: state.overlay,
    profileId: state.profileId,
    chatId: state.chatId,
    selfIntention: state.selfIntention,
    ghost: state.ghost,
    filters,
    pingsSent: [...state.pingsSent],
    incomingPings: [...state.incomingPings],
    matches: [...state.matches],
    revealedByMe: [...state.revealedByMe],
    revealedByPeer: [...state.revealedByPeer],
    messages,
    typing: state.typing,
    notifications: state.notifications.map((notification) => ({ ...notification })),
    blocked: [...state.blocked],
    verification: state.verification,
    matchCelebration: state.matchCelebration,
    toast: state.toast === null ? null : { ...state.toast },
    notifSeq: state.notifSeq,
    toastSeq: state.toastSeq,
    replyCursor: { ...state.replyCursor },
  };
}

/** Estado inicial derivado del dataset: refresh, RESET y primer arranque. */
export function initialState(): DemoState {
  return {
    view: 'list',
    overlay: null,
    profileId: null,
    chatId: null,
    selfIntention: fixtures.self.intention,
    ghost: false,
    filters: {
      intentions: null,
      gender: null,
      verifiedOnly: false,
      onlineOnly: false,
      radiusM: fixtures.filters.defaultRadiusM,
    },
    pingsSent: [],
    incomingPings: [],
    matches: [],
    revealedByMe: [],
    revealedByPeer: [],
    messages: {},
    typing: null,
    notifications: [],
    blocked: [],
    verification: 'unverified',
    matchCelebration: null,
    toast: null,
    notifSeq: 0,
    toastSeq: 0,
    replyCursor: {},
  };
}

function noop(state: DemoState): ReduceResult {
  return { state, effects: [] };
}

function done(state: DemoState, effects: DemoEffect[] = []): ReduceResult {
  return { state, effects };
}

function pushToast(state: DemoState, textKey: string, effects: DemoEffect[]): void {
  const seq = state.toastSeq + 1;
  state.toastSeq = seq;
  const toast = { id: `t${seq}`, textKey };
  state.toast = toast;
  effects.push({ kind: 'toast', id: toast.id, delayMs: timers.toastMs });
}

function pushNotification(
  state: DemoState,
  kind: DemoNotification['kind'],
  profileId: string,
): void {
  const seq = state.notifSeq + 1;
  state.notifSeq = seq;
  state.notifications.push({ id: `n${seq}`, kind, profileId, read: false });
}

function isVisible(state: DemoState, id: string): boolean {
  return visibleProfiles(state).some((profile) => profile.id === id);
}

/**
 * Reducer puro: no importa React/React Native, no lee el reloj y no hace I/O.
 * Una acción que no pasa su guard es un no-op con la misma instancia de estado
 * y sin efectos (state-machine.md §3).
 */
export function reduce(state: DemoState, action: DemoAction): ReduceResult {
  switch (action.type) {
    case 'SET_VIEW': {
      const next = cloneState(state);
      next.view = action.view;
      if (next.overlay === 'filters') {
        next.overlay = null;
      }
      return done(next);
    }

    case 'SET_SELF_INTENTION': {
      const next = cloneState(state);
      next.selfIntention = action.intention;
      // El descubrimiento usa la intención propia como filtro por defecto (F-1).
      next.filters.intentions = [action.intention];
      return done(next);
    }

    case 'OPEN_OVERLAY': {
      if (action.overlay === 'profile' || action.overlay === 'safety') {
        const id = action.profileId ?? null;
        if (id === null || state.blocked.includes(id) || !isVisible(state, id)) {
          return noop(state);
        }
      }
      const next = cloneState(state);
      next.overlay = action.overlay;
      next.profileId = action.profileId ?? null;
      return done(next);
    }

    case 'CLOSE_OVERLAY': {
      const wasChat = state.overlay === 'chat';
      const next = cloneState(state);
      next.overlay = null;
      next.profileId = null;
      // La celebración de match se descarta al cerrar el overlay: es su única salida.
      next.matchCelebration = null;
      if (!wasChat) {
        next.chatId = null;
      }
      return done(next);
    }

    case 'SET_RADIUS': {
      if (!fixtures.filters.radiiM.some((value) => value === action.radiusM)) {
        return noop(state);
      }
      const next = cloneState(state);
      next.filters.radiusM = action.radiusM;
      return done(next);
    }

    case 'TOGGLE_FILTER_INTENTION': {
      const next = cloneState(state);
      const current = next.filters.intentions === null ? [] : [...next.filters.intentions];
      if (current.includes(action.intention)) {
        current.splice(current.indexOf(action.intention), 1);
      } else {
        current.push(action.intention);
      }
      next.filters.intentions =
        current.length === 0
          ? null
          : fixtures.filters.intentions.filter((intention) => current.includes(intention));
      return done(next);
    }

    case 'SET_GENDER_FILTER': {
      if (
        action.gender !== null &&
        !fixtures.filters.genders.some((value) => value === action.gender)
      ) {
        return noop(state);
      }
      const next = cloneState(state);
      next.filters.gender = action.gender;
      return done(next);
    }

    case 'TOGGLE_VERIFIED_ONLY': {
      const next = cloneState(state);
      next.filters.verifiedOnly = !next.filters.verifiedOnly;
      return done(next);
    }

    case 'TOGGLE_ONLINE_ONLY': {
      const next = cloneState(state);
      next.filters.onlineOnly = !next.filters.onlineOnly;
      return done(next);
    }

    case 'CLEAR_FILTERS': {
      const next = cloneState(state);
      next.filters.intentions = null;
      next.filters.gender = null;
      next.filters.verifiedOnly = false;
      next.filters.onlineOnly = false;
      return done(next);
    }

    case 'SEND_PING': {
      const id = action.profileId;
      if (profileById(id) === null) {
        return noop(state);
      }
      if (
        state.ghost ||
        state.blocked.includes(id) ||
        state.pingsSent.includes(id) ||
        state.matches.includes(id) ||
        !isVisible(state, id)
      ) {
        return noop(state);
      }
      const effects: DemoEffect[] = [];
      const next = cloneState(state);
      const wasFirstPing = next.pingsSent.length === 0;
      next.pingsSent.push(id);
      if (wasFirstPing) {
        effects.push({
          kind: 'incomingPing',
          id: fixtures.script.incomingPingFromId,
          delayMs: timers.incomingPingMs,
        });
      }
      pushToast(next, 'ping.sent', effects);
      return done(next, effects);
    }

    case 'ACCEPT_PING': {
      const id = action.profileId;
      if (state.ghost || state.blocked.includes(id) || !state.incomingPings.includes(id)) {
        return noop(state);
      }
      const effects: DemoEffect[] = [];
      const next = cloneState(state);
      next.incomingPings.splice(next.incomingPings.indexOf(id), 1);
      if (!next.matches.includes(id)) {
        next.matches.push(id);
      }
      if (next.messages[id] === undefined) {
        next.messages[id] = [];
      }
      effects.push({ kind: 'match', id, delayMs: timers.matchMs });
      return done(next, effects);
    }

    case 'REJECT_PING': {
      const id = action.profileId;
      if (!state.incomingPings.includes(id)) {
        return noop(state);
      }
      const next = cloneState(state);
      next.incomingPings.splice(next.incomingPings.indexOf(id), 1);
      return done(next);
    }

    case 'OPEN_CHAT': {
      const id = action.profileId;
      if (state.blocked.includes(id) || !state.matches.includes(id)) {
        return noop(state);
      }
      const next = cloneState(state);
      next.chatId = id;
      next.matchCelebration = null;
      next.overlay = 'chat';
      return done(next);
    }

    case 'SEND_MESSAGE': {
      const id = action.profileId;
      if (!(action.textKey in copy)) {
        return noop(state);
      }
      if (
        state.chatId !== id ||
        state.typing !== null ||
        state.blocked.includes(id) ||
        !state.matches.includes(id)
      ) {
        return noop(state);
      }
      const effects: DemoEffect[] = [];
      const next = cloneState(state);
      if (next.messages[id] === undefined) {
        next.messages[id] = [];
      }
      next.messages[id].push({ from: 'me', textKey: action.textKey });
      next.typing = id;
      effects.push({ kind: 'typing', id, delayMs: timers.typingMs });
      return done(next, effects);
    }

    case 'REVEAL_PHOTO': {
      const chatId = state.chatId;
      if (
        chatId === null ||
        state.blocked.includes(chatId) ||
        !state.matches.includes(chatId) ||
        state.revealedByMe.includes(chatId)
      ) {
        return noop(state);
      }
      const next = cloneState(state);
      next.revealedByMe.push(chatId);
      return done(next, [{ kind: 'reveal', id: chatId, delayMs: timers.revealMs }]);
    }

    case 'TOGGLE_GHOST': {
      const next = cloneState(state);
      next.ghost = !next.ghost;
      if (next.ghost && (next.overlay === 'profile' || next.overlay === 'chat')) {
        next.overlay = null;
        next.profileId = null;
        next.chatId = null;
      }
      return done(next);
    }

    case 'SET_VERIFICATION': {
      const next = cloneState(state);
      const order = ['unverified', 'linked', 'verified'] as const;
      const index = order.indexOf(next.verification);
      next.verification = order[(index + 1) % order.length];
      return done(next);
    }

    case 'BLOCK_PROFILE': {
      const id = action.profileId;
      if (state.blocked.includes(id)) {
        return noop(state);
      }
      const effects: DemoEffect[] = [];
      const next = cloneState(state);
      next.blocked.push(id);
      next.pingsSent = next.pingsSent.filter((value) => value !== id);
      next.incomingPings = next.incomingPings.filter((value) => value !== id);
      next.matches = next.matches.filter((value) => value !== id);
      next.revealedByMe = next.revealedByMe.filter((value) => value !== id);
      next.revealedByPeer = next.revealedByPeer.filter((value) => value !== id);
      delete next.messages[id];
      delete next.replyCursor[id];
      if (next.typing === id) {
        next.typing = null;
      }
      next.notifications = next.notifications.filter(
        (notification) => notification.profileId !== id,
      );
      if (next.matchCelebration === id) {
        next.matchCelebration = null;
      }
      if (next.chatId === id) {
        next.chatId = null;
        if (next.overlay === 'chat') {
          next.overlay = null;
        }
      }
      if (next.profileId === id) {
        next.overlay = null;
        next.profileId = null;
      }
      pushToast(next, 'safety.blocked', effects);
      return done(next, effects);
    }

    case 'UNBLOCK_PROFILE': {
      const id = action.profileId;
      if (!state.blocked.includes(id)) {
        return noop(state);
      }
      const effects: DemoEffect[] = [];
      const next = cloneState(state);
      next.blocked = next.blocked.filter((value) => value !== id);
      pushToast(next, 'safety.unblocked', effects);
      return done(next, effects);
    }

    case 'REPORT_PROFILE': {
      const id = action.profileId;
      const reason = action.reason;
      if (
        state.blocked.includes(id) ||
        !fixtures.reportReasons.some((value) => value === reason)
      ) {
        return noop(state);
      }
      const effects: DemoEffect[] = [];
      const next = cloneState(state);
      pushToast(next, 'safety.reportDone', effects);
      return done(next, effects);
    }

    case 'MARK_READ': {
      const index = state.notifications.findIndex(
        (notification) => notification.id === action.notificationId,
      );
      if (index < 0) {
        return noop(state);
      }
      const next = cloneState(state);
      next.notifications[index] = { ...next.notifications[index], read: true };
      return done(next);
    }

    // `MARK_NOTIFICATIONS_READ` es la regla de apertura del centro (F-6):
    // markAllRead lo despacha la UI después de `OPEN_OVERLAY('notifications')`.
    case 'MARK_ALL_READ':
    case 'MARK_NOTIFICATIONS_READ': {
      const next = cloneState(state);
      next.notifications = next.notifications.map((notification) => ({
        ...notification,
        read: true,
      }));
      return done(next);
    }

    case 'DISMISS_TOAST': {
      if (state.toast === null) {
        return noop(state);
      }
      const next = cloneState(state);
      next.toast = null;
      return done(next);
    }

    case 'TIMER_FIRED': {
      switch (action.kind) {
        case 'incomingPing':
          return timerIncomingPing(state, action.id);
        case 'match':
          return timerMatch(state, action.id);
        case 'typing':
          return timerTyping(state, action.id);
        case 'reveal':
          return timerReveal(state, action.id);
        case 'toast': {
          if (state.toast === null || state.toast.id !== action.id) {
            return noop(state);
          }
          const next = cloneState(state);
          next.toast = null;
          return done(next);
        }
      }
      break;
    }

    case 'RESET':
      return { state: initialState(), effects: [] };
  }
}

function timerIncomingPing(state: DemoState, id: string): ReduceResult {
  if (
    state.ghost ||
    state.blocked.includes(id) ||
    state.incomingPings.includes(id) ||
    state.matches.includes(id) ||
    state.pingsSent.includes(id) ||
    profileById(id) === null
  ) {
    return noop(state);
  }
  const effects: DemoEffect[] = [];
  const next = cloneState(state);
  next.incomingPings.push(id);
  pushNotification(next, 'ping', id);
  pushToast(next, 'notif.ping', effects);
  return done(next, effects);
}

function timerMatch(state: DemoState, id: string): ReduceResult {
  if (state.blocked.includes(id) || !state.matches.includes(id)) {
    return noop(state);
  }
  const next = cloneState(state);
  next.matchCelebration = id;
  pushNotification(next, 'match', id);
  return done(next);
}

function timerTyping(state: DemoState, id: string): ReduceResult {
  if (state.typing !== id || state.blocked.includes(id) || !state.matches.includes(id)) {
    return noop(state);
  }
  const next = cloneState(state);
  next.typing = null;
  const replies = fixtures.script.chatReplies[id as keyof typeof fixtures.script.chatReplies] as
    | readonly string[]
    | undefined;
  let replyKey: string;
  if (replies === undefined || replies.length === 0) {
    replyKey = fixtures.script.fallbackReplyKey;
  } else {
    const cursor = next.replyCursor[id] ?? 0;
    const index = cursor < replies.length ? cursor : replies.length - 1;
    replyKey = replies[index];
    next.replyCursor[id] = index + 1 < replies.length ? index + 1 : replies.length - 1;
  }
  if (next.messages[id] === undefined) {
    next.messages[id] = [];
  }
  next.messages[id].push({ from: 'peer', textKey: replyKey });
  return done(next);
}

function timerReveal(state: DemoState, id: string): ReduceResult {
  if (state.blocked.includes(id) || !state.revealedByMe.includes(id)) {
    return noop(state);
  }
  const next = cloneState(state);
  if (!next.revealedByPeer.includes(id)) {
    next.revealedByPeer.push(id);
  }
  pushNotification(next, 'reveal', id);
  return done(next);
}
