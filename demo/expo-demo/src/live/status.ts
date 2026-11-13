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

/**
 * Línea de estado de la barra: siempre una, nunca vacía.
 *
 * El estado manda sobre el origen: "conectando…" mientras se abre la sesión y
 * "sin conexión" si se cayó, sin importar que el catálogo todavía sea el del
 * build. Cuando no hay sesión —build sin API— la barra ni se monta, así que acá
 * `statusDataset` es el caso "la sesión todavía no entregó la primera foto".
 */
export function liveStatusText(source: DemoSource, live: LiveState): string {
  if (live.status === 'connecting') {
    return liveText('statusConnecting');
  }
  if (live.status === 'offline') {
    return liveText('statusOffline');
  }
  if (source !== 'live') {
    return liveText('statusDataset');
  }
  switch (live.status) {
    case 'live':
      return liveText('statusLive');
    case 'polling':
      return liveText('statusPolling');
    case 'idle':
      return liveText('statusDataset');
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
