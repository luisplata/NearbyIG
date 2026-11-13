import type { DemoSource } from '../state/types';

import { liveText, type LiveCopyKey } from './liveCopy';
import type { LiveNotice, LiveState, ZonePromptCause } from './types';

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
    case 'outside-zone':
      return liveText('geolocationOutside');
  }
}

/** Nombre corto de la zona demo (`CDMX`, `Bogotá`); la clave cruda si es nueva. */
export function zoneNameText(zoneKey: string | null): string | null {
  if (zoneKey === null) {
    return null;
  }
  if (zoneKey === 'cdmx') {
    return liveText('zoneCdmxShort');
  }
  if (zoneKey === 'bogota') {
    return liveText('zoneBogotaShort');
  }
  return zoneKey;
}

/**
 * Motivo del sheet de zona, uno por causa. El encabezado (`zoneLead`) ya dice
 * "no pudimos usar tu ubicación"; esto agrega **por qué**, que es lo que permite
 * destrabarlo. `initial` no es una falla: es la primera visita.
 */
export function zoneCauseText(cause: ZonePromptCause): string {
  const key: LiveCopyKey =
    cause === 'initial'
      ? 'zoneLeadInitial'
      : cause === 'denied'
        ? 'causeDenied'
        : cause === 'unavailable'
          ? 'causeUnavailable'
          : cause === 'timeout'
            ? 'causeTimeout'
            : cause === 'unsupported'
              ? 'causeUnsupported'
              : cause === 'insecure'
                ? 'causeInsecure'
                : 'causeOutside';
  return liveText(key);
}

/**
 * Línea de estado de la barra: siempre una, nunca vacía.
 *
 * El estado manda sobre el origen: "conectando…" mientras se abre la sesión y
 * "sin conexión" si se cayó, sin importar que el catálogo todavía sea el del
 * build. "elegí una zona demo" es el estado propio de `needs-zone`: sin zona no
 * hay región con la que abrir sesión, y la barra no puede fingir que hay una.
 */
export function liveStatusText(source: DemoSource, live: LiveState): string {
  if (live.status === 'needs-zone') {
    return liveText('statusNeedsZone');
  }
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

/**
 * De dónde salen las distancias: `GPS` o `zona demo (CDMX)`. La zona va en el
 * texto a propósito: con dos regiones en el catálogo, "zona demo" sola no dice
 * si el radar habla de México o de Colombia.
 */
export function liveLocationText(live: LiveState): string | null {
  if (live.location === 'gps') {
    return liveText('gps');
  }
  if (live.location === 'demo') {
    const zone = zoneNameText(live.zoneKey);
    return zone === null ? liveText('demoZone') : liveText('demoZoneIn', { zone });
  }
  return null;
}

export function liveCountText(count: number): string {
  return liveText('profiles', { count: String(count) });
}
