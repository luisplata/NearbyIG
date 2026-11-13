import type { DemoSource } from '../state/types';

import { liveText } from './liveCopy';
import type { LiveNotice, LiveState } from './types';

/**
 * Textos derivados del estado live. Puro y testeado: el componente sólo pinta.
 * Un aviso no compite con el estado: convive, porque el estado dice lo que sigue
 * andando y el aviso dice qué se rompió.
 */

export function liveNoticeText(notice: LiveNotice | null): string | null {
  switch (notice) {
    case null:
      return null;
    case 'unconfigured':
      return liveText('notConfiguredHint');
    case 'unreachable':
      return liveText('noticeUnreachable');
    case 'session-lost':
      return liveText('noticeSessionLost');
    case 'degraded':
      return liveText('noticeDegraded');
  }
}

/** Línea de estado del switch: siempre una, nunca vacía. */
export function liveStatusText(source: DemoSource, live: LiveState): string {
  if (source !== 'live') {
    return liveText('statusMock');
  }
  switch (live.status) {
    case 'connecting':
      return liveText('statusConnecting');
    case 'live':
      return liveText('statusLive');
    case 'polling':
      return liveText('statusPolling');
    case 'offline':
      return liveText('statusOffline');
    case 'idle':
      return liveText('statusMock');
  }
}

/** `región mx · mx-p05 · slot 5`, o `null` sin sesión. */
export function liveSessionText(live: LiveState): string | null {
  const session = live.session;
  if (session === null) {
    return null;
  }
  return liveText('sessionLine', {
    region: session.regionKey,
    profileId: session.profileId,
    slot:
      session.demoSlot === null
        ? liveText('guest')
        : liveText('slot', { slot: String(session.demoSlot) }),
  });
}

/** `stream` / `polling` / `null` cuando todavía no hay transporte. */
export function liveTransportText(live: LiveState): string | null {
  if (live.transport === 'sse') {
    return liveText('transportSse');
  }
  if (live.transport === 'polling') {
    return liveText('transportPolling');
  }
  return null;
}

export function liveCountText(count: number): string {
  return liveText('profiles', { count: String(count) });
}
