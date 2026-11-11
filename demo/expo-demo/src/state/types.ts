import type { Gender, Intention } from '../generated/fixtures';

/**
 * Tipos del estado de la demo. Espejo exacto de `lib/state/demo_state.dart` de
 * la app Flutter: misma forma, mismos enums, mismos valores por defecto.
 */

export type DemoView = 'radar' | 'map' | 'list';

/** Diez overlays: el inventario de CONTRACT.md §6, incluida la bandeja de pings. */
export type DemoOverlay =
  | 'profile'
  | 'chat'
  | 'pings'
  | 'notifications'
  | 'filters'
  | 'settings'
  | 'about'
  | 'safety'
  | 'blocked'
  | 'privacy';

export type NotificationKind = 'ping' | 'match' | 'reveal';

/** Ciclo de demostración de Instagram: `unverified → linked → verified`. */
export type IgVerification = 'unverified' | 'linked' | 'verified';

export type ChatAuthor = 'me' | 'peer';

export type AvatarRenderState = 'blurred' | 'clear';

export type DemoEffectKind = 'incomingPing' | 'match' | 'typing' | 'reveal' | 'toast';

export type ChatMessage = {
  from: ChatAuthor;
  textKey: string;
};

export type DemoNotification = {
  id: string;
  kind: NotificationKind;
  profileId: string;
  read: boolean;
};

export type DemoToast = {
  id: string;
  textKey: string;
};

/**
 * `intentions === null` significa "sin filtro de intención"; `gender === null`,
 * "todos". El radio es siempre uno de los valores del contrato.
 */
export type DiscoveryFilters = {
  intentions: Intention[] | null;
  gender: Gender | null;
  verifiedOnly: boolean;
  onlineOnly: boolean;
  radiusM: number;
};

export type DemoState = {
  view: DemoView;
  overlay: DemoOverlay | null;
  profileId: string | null;
  chatId: string | null;
  selfIntention: Intention;
  ghost: boolean;
  filters: DiscoveryFilters;
  pingsSent: string[];
  incomingPings: string[];
  matches: string[];
  revealedByMe: string[];
  revealedByPeer: string[];
  messages: Record<string, ChatMessage[]>;
  typing: string | null;
  notifications: DemoNotification[];
  blocked: string[];
  verification: IgVerification;
  matchCelebration: string | null;
  toast: DemoToast | null;
  notifSeq: number;
  toastSeq: number;
  replyCursor: Record<string, number>;
};

/** Efecto a agendar por el store. El reducer nunca agenda nada. */
export type DemoEffect = {
  kind: DemoEffectKind;
  id: string;
  delayMs: number;
};

export type ReduceResult = {
  state: DemoState;
  effects: DemoEffect[];
};

/** Clave del timer en el store: `kind:id`. */
export function effectTimerKey(effect: DemoEffect): string {
  return `${effect.kind}:${effect.id}`;
}

export const IG_VERIFICATIONS: readonly IgVerification[] = ['unverified', 'linked', 'verified'];
