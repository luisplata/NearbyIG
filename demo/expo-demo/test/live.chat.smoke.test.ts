import { afterAll, describe, expect, it } from 'vitest';

import { readLiveSettings } from '../src/live/config';
import { createLiveController, type LiveController } from '../src/live/controller';
import { liveStatusText, liveTransportText } from '../src/live/status';

/**
 * Smoke **real** del chat. No corre en `npm test`: se habilita con `LIVE_SMOKE=1`
 * y la base por `EXPO_PUBLIC_API_URL`.
 *
 *     EXPO_PUBLIC_API_URL=http://localhost:3000 LIVE_SMOKE=1 \
 *       npx vitest run test/live.chat.smoke.test.ts --silent=false
 *
 * Usa el controller de verdad (api + adapter + reconciliación), que es lo mismo
 * que dibuja la pantalla: si esto pasa, la conversación que se ve en el celular
 * es la que devolvió el backend.
 *
 * **Transporte: polling.** Node no trae `EventSource`; el polling aplica los
 * mismos `message.created` con el mismo dedupe por `seq`, así que ejercita el
 * camino real del respaldo —que es justamente el que la demo usa detrás de un
 * túnel—. El SSE real se ejerce en `live.smoke.test.ts`.
 */
const settings = readLiveSettings(process.env.EXPO_PUBLIC_API_URL);
const zone = process.env.EXPO_PUBLIC_DEMO_ZONE ?? 'cdmx';
const enabled = settings !== null && process.env.LIVE_SMOKE === '1';

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

function makeController(label: string): LiveController {
  const controller = createLiveController({
    settings,
    initialZoneKey: zone,
    // Sin `EventSource` en Node: el controller cae a polling, que es el fallback
    // que la demo usa cuando el stream no atraviesa el túnel.
    createEventSource: () => null,
    pollMs: 500,
    pingsMs: 1_000,
    log: (message) => console.info(`[${label}] ${message}`),
  });
  controllers.push(controller);
  return controller;
}

/** Sesión con un perfil propio: desaloja el slot si está ocupado por otra prueba. */
async function openSlot(controller: LiveController, slot: number): Promise<void> {
  expect(await controller.start()).toBe(true);
  // Si `demo-session` ya le dio ese slot, desalojarlo sería `PROFILE_IN_USE`.
  if (controller.getState().session?.demoSlot !== slot) {
    const result = await controller.takeover(slot);
    expect(result.ok, `takeover del slot ${slot} → ${result.code}`).toBe(true);
  }
  await waitFor(() => controller.getState().discovery.length > 0, 20_000, 'foto de discovery');
}

afterAll(async () => {
  for (const controller of controllers) {
    await controller.resetSelf().catch(() => undefined);
    await controller.stop().catch(() => undefined);
  }
});

describe.skipIf(!enabled)('smoke del chat contra el backend', () => {
  it('humano→humano: ping, aceptar, conversar en los dos sentidos', async () => {
    const A = makeController('A');
    const B = makeController('B');
    await openSlot(A, 1);
    await openSlot(B, 2);

    const b = B.getState().session!.profileId;
    const ping = await A.sendPing(b);
    console.info(`A → ping a ${b}: ${ping.status}`);
    expect(ping.status).toBe('pending');

    await B.refreshPings();
    const incoming = B.getState().pings.find(
      (item) => item.ping.fromProfileId === A.getState().session?.profileId,
    );
    expect(incoming).toBeDefined();

    const accepted = await B.acceptPing(incoming!.ping.id);
    expect(accepted.ok).toBe(true);
    const matchId = accepted.matchId!;
    console.info(`B acepta → match ${matchId}`);

    await A.refreshMatches();
    expect(A.getState().matches.some((item) => item.match.id === matchId)).toBe(true);

    expect((await A.openChat(matchId)).ok).toBe(true);
    const stamp = Date.now();
    const fromA = `¿nos vemos en el parque? ${stamp}`;
    expect((await A.sendChatMessage(matchId, fromA)).ok).toBe(true);

    expect((await B.openChat(matchId)).ok).toBe(true);
    const seen = B.getState().chat!.messages;
    console.info(`B ve: ${JSON.stringify(seen.map((message) => `${message.mine ? 'yo' : 'otro'}: ${message.body}`))}`);
    expect(seen.filter((message) => message.body === fromA)).toHaveLength(1);
    // El que abre marca leído: el server deja el match en 0.
    const bUnread = B.getState().matches.find((item) => item.match.id === matchId)?.unreadCount;
    console.info(`B sin leer: ${bUnread}`);
    expect(bUnread).toBe(0);

    const fromB = `dale, a las 6 ${stamp}`;
    expect((await B.sendChatMessage(matchId, fromB)).ok).toBe(true);
    await A.refreshChat();
    const aSees = A.getState().chat!.messages;
    console.info(`A ve: ${JSON.stringify(aSees.map((message) => `${message.mine ? 'yo' : 'otro'}: ${message.body}`))}`);
    expect(aSees.filter((message) => message.body === fromB)).toHaveLength(1);

    await A.refreshMatches();
    const aRow = A.getState().matches.find((item) => item.match.id === matchId);
    console.info(`A bandeja: preview="${aRow?.lastMessage?.body}" sin leer=${aRow?.unreadCount}`);
    expect(aRow?.lastMessage?.body).toBe(fromB);
  }, 90_000);
});
