import { fixtures } from '../generated/fixtures';
import type { Gender, Intention } from '../generated/fixtures';

import type { DemoEffectKind, DemoView, DemoOverlay } from './types';

/**
 * Las 26 acciones del contrato (state-machine.md §2). Mismo union que
 * `DemoActionType` de la app Flutter; `actionFromJson` replica su `fromJson`
 * para que el golden de paridad use exactamente el mismo mapeo.
 */
export type DemoAction =
  | { type: 'SET_VIEW'; view: DemoView }
  | { type: 'SET_SELF_INTENTION'; intention: Intention }
  | { type: 'OPEN_OVERLAY'; overlay: DemoOverlay; profileId?: string | null }
  | { type: 'CLOSE_OVERLAY' }
  | { type: 'SET_RADIUS'; radiusM: number }
  | { type: 'TOGGLE_FILTER_INTENTION'; intention: Intention }
  | { type: 'SET_GENDER_FILTER'; gender: Gender | null }
  | { type: 'TOGGLE_VERIFIED_ONLY' }
  | { type: 'TOGGLE_ONLINE_ONLY' }
  | { type: 'CLEAR_FILTERS' }
  | { type: 'SEND_PING'; profileId: string }
  | { type: 'ACCEPT_PING'; profileId: string }
  | { type: 'REJECT_PING'; profileId: string }
  | { type: 'OPEN_CHAT'; profileId: string }
  | { type: 'SEND_MESSAGE'; profileId: string; textKey: string }
  | { type: 'REVEAL_PHOTO' }
  | { type: 'TOGGLE_GHOST' }
  | { type: 'SET_VERIFICATION' }
  | { type: 'BLOCK_PROFILE'; profileId: string }
  | { type: 'UNBLOCK_PROFILE'; profileId: string }
  | { type: 'REPORT_PROFILE'; profileId: string; reason: string }
  | { type: 'MARK_READ'; notificationId: string }
  | { type: 'MARK_ALL_READ' }
  | { type: 'DISMISS_TOAST' }
  | { type: 'TIMER_FIRED'; kind: DemoEffectKind; id: string }
  | { type: 'RESET' };

export type DemoActionType = DemoAction['type'];

const VIEWS: readonly DemoView[] = ['radar', 'map', 'list'];

const OVERLAYS: readonly DemoOverlay[] = [
  'profile',
  'chat',
  'pings',
  'notifications',
  'filters',
  'settings',
  'about',
  'safety',
  'blocked',
  'privacy',
];

const EFFECT_KINDS: readonly DemoEffectKind[] = [
  'incomingPing',
  'match',
  'typing',
  'reveal',
  'toast',
];

const ACTION_TYPES: readonly DemoActionType[] = [
  'SET_VIEW',
  'SET_SELF_INTENTION',
  'OPEN_OVERLAY',
  'CLOSE_OVERLAY',
  'SET_RADIUS',
  'TOGGLE_FILTER_INTENTION',
  'SET_GENDER_FILTER',
  'TOGGLE_VERIFIED_ONLY',
  'TOGGLE_ONLINE_ONLY',
  'CLEAR_FILTERS',
  'SEND_PING',
  'ACCEPT_PING',
  'REJECT_PING',
  'OPEN_CHAT',
  'SEND_MESSAGE',
  'REVEAL_PHOTO',
  'TOGGLE_GHOST',
  'SET_VERIFICATION',
  'BLOCK_PROFILE',
  'UNBLOCK_PROFILE',
  'REPORT_PROFILE',
  'MARK_READ',
  'MARK_ALL_READ',
  'DISMISS_TOAST',
  'TIMER_FIRED',
  'RESET',
];

export { ACTION_TYPES };

function enumValue<T extends string>(values: readonly T[], raw: unknown, field: string): T {
  if (typeof raw !== 'string' || !values.includes(raw as T)) {
    throw new Error(`Valor desconocido en "${field}": ${String(raw)}`);
  }
  return raw as T;
}

function stringPayload(raw: unknown, field: string): string {
  if (typeof raw !== 'string') {
    throw new Error(`Se esperaba "${field}" en string, llegó: ${String(raw)}`);
  }
  return raw;
}

function intPayload(raw: unknown, field: string): number {
  if (typeof raw !== 'number' || !Number.isInteger(raw)) {
    throw new Error(`Se esperaba "${field}" en entero, llegó: ${String(raw)}`);
  }
  return raw;
}

/** Deserializa una acción del golden (`test/golden/steps.json`). */
export function actionFromJson(json: Record<string, unknown>): DemoAction {
  const type = enumValue(ACTION_TYPES, json.type, 'type');
  const profileId = typeof json.profileId === 'string' ? json.profileId : null;

  switch (type) {
    case 'SET_VIEW':
      return { type, view: enumValue(VIEWS, json.view, 'view') };
    case 'SET_SELF_INTENTION':
      return {
        type,
        intention: enumValue(fixtures.filters.intentions, json.intention, 'intention'),
      };
    case 'OPEN_OVERLAY':
      return {
        type,
        overlay: enumValue(OVERLAYS, json.overlay, 'overlay'),
        profileId,
      };
    case 'CLOSE_OVERLAY':
      return { type };
    case 'SET_RADIUS':
      return { type, radiusM: intPayload(json.radiusM, 'radiusM') };
    case 'TOGGLE_FILTER_INTENTION':
      return {
        type,
        intention: enumValue(fixtures.filters.intentions, json.intention, 'intention'),
      };
    case 'SET_GENDER_FILTER': {
      const gender = json.gender;
      return {
        type,
        gender:
          gender === null || gender === undefined || gender === 'all'
            ? null
            : enumValue(fixtures.filters.genders, gender, 'gender'),
      };
    }
    case 'TOGGLE_VERIFIED_ONLY':
    case 'TOGGLE_ONLINE_ONLY':
    case 'CLEAR_FILTERS':
    case 'REVEAL_PHOTO':
    case 'TOGGLE_GHOST':
    case 'SET_VERIFICATION':
    case 'MARK_ALL_READ':
    case 'DISMISS_TOAST':
    case 'RESET':
      return { type };
    case 'SEND_PING':
    case 'ACCEPT_PING':
    case 'REJECT_PING':
    case 'OPEN_CHAT':
    case 'BLOCK_PROFILE':
    case 'UNBLOCK_PROFILE':
      return { type, profileId: stringPayload(profileId, 'profileId') };
    case 'SEND_MESSAGE':
      return {
        type,
        profileId: stringPayload(profileId, 'profileId'),
        textKey: stringPayload(json.textKey, 'textKey'),
      };
    case 'REPORT_PROFILE':
      return {
        type,
        profileId: stringPayload(profileId, 'profileId'),
        reason: stringPayload(json.reason, 'reason'),
      };
    case 'MARK_READ':
      return { type, notificationId: stringPayload(json.notificationId, 'notificationId') };
    case 'TIMER_FIRED':
      return {
        type,
        kind: enumValue(EFFECT_KINDS, json.kind, 'kind'),
        id: stringPayload(json.id, 'id'),
      };
  }
}
