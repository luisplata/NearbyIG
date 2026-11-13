import { afterAll, describe, expect, it } from 'vitest';

import { fixtures } from '../src/generated/fixtures';
import { toUiProfiles } from '../src/live/adapter';
import { readLiveSettings } from '../src/live/config';
import {
  createLiveController,
  type EventSourceLike,
  type LiveController,
} from '../src/live/controller';
import { visibleProfiles } from '../src/state/selectors';
import { createDemoStore } from '../src/state/store';
import type { DemoSource, UiProfile } from '../src/state/types';
import { pendingCount, pingForPeer, toPingRows } from '../src/live/pings';

/**
 * Smoke real contra el backend de la demo. **No corre en `npm test`.**
 *
 * Se habilita con `LIVE_SMOKE=1` y la base por `EXPO_PUBLIC_API_URL`:
 *
 *     EXPO_PUBLIC_API_URL=http://localhost:3000 LIVE_SMOKE=1 npm run smoke:live
 *
 * Usa el cliente de verdad (controller + api + adapter + store), no una copia:
 * si el flujo se rompe acá, se rompe en el navegador. Node 22 no trae
 * `EventSource`, así que el test le pasa un shim mínimo de SSE sobre `fetch`
 * para ejercitar los frames reales, y un segundo controller para el polling.
 */
const settings = readLiveSettings(process.env.EXPO_PUBLIC_API_URL);
/** Zona del smoke: `cdmx` (mx) por defecto; `bogota` para probar la región `co`. */
const zone = process.env.EXPO_PUBLIC_DEMO_ZONE ?? 'cdmx';
const enabled = settings !== null && process.env.LIVE_SMOKE === '1';

/** `EventSource` de 40 líneas: frames `event:`/`data:` separados por línea vacía. */
function fetchEventSource(url: string): EventSourceLike {
  const listeners = new Map<string, ((event: { data?: string }) => void)[]>();
  const abort = new AbortController();
  const source: EventSourceLike = {
    onopen: null,
    onerror: null,
    close: () => abort.abort(),
    addEventListener: (type, listener) => {
      const current = listeners.get(type) ?? [];
      current.push(listener);
      listeners.set(type, current);
    },
  };
  const emit = (type: string, data: string): void => {
    for (const listener of listeners.get(type) ?? []) {
      listener({ data });
    }
  };
  void (async () => {
    try {
      const response = await fetch(url, { signal: abort.signal, headers: { accept: 'text/event-stream' } });
      if (!response.ok || response.body === null) {
        source.onerror?.(new Error(`stream ${response.status}`));
        return;
      }
      source.onopen?.();
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          source.onerror?.(new Error('stream cerrado'));
          return;
        }
        buffer += decoder.decode(value, { stream: true });
        let boundary = buffer.indexOf('\n\n');
        while (boundary >= 0) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const lines = frame.split('\n');
          const eventLine = lines.find((line) => line.startsWith('event:'));
          const dataLine = lines.find((line) => line.startsWith('data:'));
          if (eventLine !== undefined && dataLine !== undefined) {
            emit(eventLine.slice(6).trim(), dataLine.slice(5).trim());
          }
          boundary = buffer.indexOf('\n\n');
        }
      }
    } catch (error) {
      if (!abort.signal.aborted) {
        source.onerror?.(error);
      }
    }
  })();
  return source;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(predicate: () => boolean, ms: number, label: string): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < ms) {
    if (predicate()) {
      return;
    }
    await sleep(250);
  }
  throw new Error(`timeout esperando: ${label}`);
}

const controllers: LiveController[] = [];

function makeController(createEventSource: (url: string) => EventSourceLike | null) {
  const catalogs: { profiles: readonly UiProfile[] | null; source: DemoSource }[] = [];
  const controller = createLiveController({
    settings,
    initialZoneKey: zone,
    onCatalog: (profiles, source) => catalogs.push({ profiles, source }),
    createEventSource,
  });
  controllers.push(controller);
  return { controller, catalogs };
}

afterAll(async () => {
  for (const controller of controllers) {
    await controller.stop().catch(() => undefined);
  }
});

describe.skipIf(!enabled)('smoke live contra el backend', () => {
  it('abre sesión, registra presencia y ve perfiles con medidas del server', async () => {
    const { controller } = makeController(fetchEventSource);
    expect(await controller.start()).toBe(true);
    const state = controller.getState();
    expect(state.session?.regionKey).toBe('mx');
    expect(state.session?.token).toBeTruthy();

    await waitFor(() => controller.getState().discovery.length > 0, 20_000, 'primer perfil en discovery');
    const discovery = controller.getState().discovery;
    for (const row of discovery) {
      expect(row.distanceM).toBeGreaterThanOrEqual(200);
      expect(row.distanceM).toBeLessThanOrEqual(5000);
      expect(row.bearingDeg).toBeGreaterThanOrEqual(0);
      expect(row.bearingDeg).toBeLessThanOrEqual(359);
      expect(row).not.toHaveProperty('lat');
      expect(row).not.toHaveProperty('lng');
    }
    // El catálogo entra al estado como cualquier dataset (el mock no se enteró).
    const store = createDemoStore();
    store.setCatalog(toUiProfiles(controller.getState().discovery), 'live');
    expect(visibleProfiles(store.getState()).length).toBe(discovery.length);
  }, 40_000);

  it('recibe movimiento por SSE y deduplica por seq', async () => {
    const { controller } = makeController(fetchEventSource);
    await controller.start();
    await waitFor(() => controller.getState().status === 'live', 10_000, 'stream abierto');
    await waitFor(() => controller.getState().lastSeq > 0, 25_000, 'primer evento del stream');
    const first = controller.getState().lastSeq;
    expect(first).toBeGreaterThan(0);

    await waitFor(() => controller.getState().lastSeq > first, 25_000, 'segundo evento del stream');
    expect(controller.getState().lastEventAt).not.toBeNull();
    expect(controller.getState().notice).toBeNull();
  }, 40_000);

  it('el selector de perfiles trae inUse y marca la sesión propia', async () => {
    const { controller } = makeController(fetchEventSource);
    await controller.start();
    await waitFor(() => controller.getState().rows.length === 10, 10_000, 'catálogo de 10 slots');
    const mine = controller.getState().session?.demoSlot ?? null;
    const rows = controller.getState().rows;
    const occupied = rows.filter((row) => row.inUse).map((row) => row.demoSlot);
    expect(occupied).toContain(mine);
  }, 30_000);

  it('reclama un slot libre y desalojar el propio devuelve 409', async () => {
    const { controller } = makeController(fetchEventSource);
    await controller.start();
    await waitFor(() => controller.getState().rows.length === 10, 10_000, 'catálogo de 10 slots');
    const mine = controller.getState().session?.demoSlot ?? null;
    const free = controller.getState().rows.find((row) => !row.inUse && row.demoSlot !== mine);
    if (free?.demoSlot !== null && free?.demoSlot !== undefined) {
      expect(await controller.claim(free.demoSlot)).toEqual({ ok: true, code: null });
      expect(controller.getState().session?.demoSlot).toBe(free.demoSlot);
    }

    const own = controller.getState().session?.demoSlot;
    if (own !== null && own !== undefined) {
      expect(await controller.takeover(own)).toEqual({ ok: false, code: 'PROFILE_IN_USE' });
    }
  }, 30_000);

  it('sin EventSource cae a polling y también recibe eventos', async () => {
    const { controller } = makeController(() => null);
    await controller.start();
    expect(controller.getState().status).toBe('polling');
    await waitFor(() => controller.getState().lastSeq > 0, 30_000, 'primer evento por polling');
    expect(controller.getState().transport).toBe('polling');
  }, 40_000);

  it('cerrar la sesión devuelve el catálogo al dataset', async () => {
    const { controller, catalogs } = makeController(fetchEventSource);
    await controller.start();
    await waitFor(() => controller.getState().discovery.length > 0, 20_000, 'perfiles live');
    await controller.stop();
    expect(controller.getState().status).toBe('idle');
    expect(catalogs.at(-1)).toEqual({ profiles: null, source: 'dataset' });
    expect(fixtures.profiles).toHaveLength(10);
  }, 30_000);

  /**
   * Flujo real de pings (S4) con el cliente de verdad: dos sesiones vivas, ping a
   * un humano, ping a un bot (acepta solo), inbox del destinatario, accept y el
   * match visible en los dos lados.
   */
  it('manda ping a un humano y a un bot, acepta y muestra el match', async () => {
    const fresh = (): { controller: LiveController; toasts: number[] } => {
      const toasts: number[] = [];
      const controller = createLiveController({
        settings,
        initialZoneKey: zone,
        createEventSource: fetchEventSource,
        onNewPings: (count) => toasts.push(count),
      });
      controllers.push(controller);
      return { controller, toasts };
    };

    // Las pruebas anteriores dejan sesiones vivas (se cierran en `afterAll`).
    // Para pingear hacen falta dos perfiles propios: con los 10 slots tomados la
    // sesión entra como invitado y `POST /pings` responde PING_FORBIDDEN.
    for (const previous of controllers.splice(0)) {
      await previous.stop().catch(() => undefined);
    }
    await sleep(1_000);

    const sender = fresh();
    expect(await sender.controller.start()).toBe(true);
    expect(sender.controller.getState().session?.sourceType).toBe('human');
    await waitFor(() => sender.controller.getState().discovery.length > 0, 20_000, 'discovery del emisor');

    // Segunda sesión: una humana con presencia viva. Sus bots existen mientras
    // tanto (es la misma regla que `/discovery`).
    const peer = fresh();
    expect(await peer.controller.start()).toBe(true);
    expect(peer.controller.getState().session?.sourceType).toBe('human');
    await waitFor(() => peer.controller.getState().discovery.length > 0, 20_000, 'discovery del peer');

    const senderId = sender.controller.getState().session?.profileId ?? '';
    const peerId = peer.controller.getState().session?.profileId ?? '';
    expect(senderId).not.toBe('');
    expect(peerId).not.toBe('');
    expect(peerId).not.toBe(senderId);

    // 1. Un bot acepta solo: el 201 vuelve `accepted` con matchId. Los bots se
    // concilian en el tick del mundo después de la presencia, así que el primer
    // intento puede ser 404 PROFILE_NOT_FOUND: se reintenta hasta que aparezca.
    let botPing = await sender.controller.sendPing(`${peerId}-b1`);
    const botStarted = Date.now();
    while (!botPing.ok && botPing.code === 'PROFILE_NOT_FOUND' && Date.now() - botStarted < 25_000) {
      await sleep(1_000);
      botPing = await sender.controller.sendPing(`${peerId}-b1`);
    }
    expect(botPing.ok, `bot ping: ${JSON.stringify({ code: botPing.code, senderId, peerId })}`).toBe(true);
    expect(botPing.status).toBe('accepted');
    expect(botPing.matchId).toBeTruthy();
    expect(sender.controller.getState().pingError).toBeNull();

    // 2. Un humano queda pendiente y aparece en enviados.
    const humanPing = await sender.controller.sendPing(peerId);
    expect(humanPing.ok).toBe(true);
    expect(humanPing.status).toBe('pending');
    const sent = toPingRows(sender.controller.getState().sentPings, 'sent');
    expect(pingForPeer(sent, peerId)?.status).toBe('pending');

    // 3. El destinatario ve el ping en su inbox (el badge es `pendingCount`).
    await peer.controller.refreshPings();
    const inbox = toPingRows(peer.controller.getState().pings, 'inbox');
    const incoming = inbox.find((row) => row.peer.profileId === senderId);
    expect(incoming).toBeDefined();
    expect(pendingCount(inbox)).toBeGreaterThanOrEqual(1);

    // 4. Aceptar crea el match y la fila queda `accepted` con su matchId.
    const match = await peer.controller.acceptPing(incoming?.id ?? '');
    expect(match.ok).toBe(true);
    expect(match.matchId).toBeTruthy();
    const afterInbox = toPingRows(peer.controller.getState().pings, 'inbox');
    const resolved = afterInbox.find((row) => row.id === incoming?.id);
    expect(resolved?.status).toBe('accepted');
    expect(resolved?.matchId).toBe(match.matchId);

    // 5. El emisor ve el match en su bandeja de enviados.
    await sender.controller.refreshPings();
    const afterSent = toPingRows(sender.controller.getState().sentPings, 'sent');
    const accepted = pingForPeer(afterSent, peerId);
    expect(accepted?.status).toBe('accepted');
    expect(accepted?.matchId).toBe(match.matchId);
    expect(pendingCount(afterSent)).toBe(0);
  }, 60_000);
});
