import type { Gender, Intention } from '../generated/fixtures';

/**
 * Tipos del estado de la demo. Espejo exacto de `lib/state/demo_state.dart` de
 * la app Flutter: misma forma, mismos enums, mismos valores por defecto.
 */

export type DemoView = 'radar' | 'map' | 'list';

/** Origen del catálogo de descubrimiento: dataset del build o backend live. */
export type DemoSource = 'mock' | 'live';

/**
 * Forma en la que la UI consume un perfil: los 13 campos del dataset
 * (`fixtures.profiles[]`), que son los mismos 13 que proyecta
 * `ProfileSummary` del contrato. El backend agrega `regionKey`, `demoSlot`,
 * `sourceType` e `inUse`; eso no lo dibuja la tarjeta ni el radar, así que el
 * adapter live lo descarta en vez de ensuciar la UI con identidad de slot.
 *
 * No se usa `Profile` (el tipo literal derivado de `fixtures`) porque el modo
 * live entrega números arbitrarios: `distanceM: 240 | 480 | …` no admite 1060.
 */
export type UiProfile = {
  id: string;
  nickname: string;
  initials: string;
  gender: Gender;
  intention: Intention;
  verified: boolean;
  online: boolean;
  distanceM: number;
  bearingDeg: number;
  photoId: string;
  instagramHandle: string;
  statusKey: string;
  bioKey: string;
};

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
  /**
   * Dataset sobre el que corre la máquina de estados. El mock lo fija en
   * `fixtures.profiles`; el modo live lo cambia por la última foto de
   * `/discovery`. No entra en `projectState`: el golden de paridad no lo ve.
   */
  catalog: readonly UiProfile[];
  /** Origen del catálogo. La UI lo usa para el switch y los avisos. */
  source: DemoSource;
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
