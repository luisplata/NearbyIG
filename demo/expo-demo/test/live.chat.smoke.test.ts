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
  it('humano→bot: ping, abrir, enviar, respuesta del bot y marcar leído', async () => {
    const A = makeController('A');
    const B = makeController('B');
    await openSlot(B, 2);
    await openSlot(A, 1);

    const a = A.getState();
    console.info(`A = ${a.session?.profileId} (slot ${a.session?.demoSlot}), B = ${B.getState().session?.profileId}`);
    // La barra de la demo en este modo: estado y transporte de polling.
    expect(liveStatusText('live', a)).toBe('en vivo por polling');
    expect(liveTransportText(a)).toBe('polling');

    // Los bots del otro dueño están en el descubrimiento propio.
    await A.refresh();
    const bot = A.getState().discovery.find((row) => row.sourceType === 'bot');
    expect(bot).toBeDefined();
    console.info(`bot: ${bot?.profileId} (${bot?.nickname})`);

    const ping = await A.sendPing(bot!.profileId);
    console.info(`POST /pings → ${ping.status} match=${ping.matchId}`);
    expect(ping.ok).toBe(true);
    expect(ping.status).toBe('accepted');
    const botMatchId = ping.matchId!;
    expect(botMatchId).not.toBeNull();

    await A.refreshMatches();
    const botRow = A.getState().matches.find((item) => item.match.id === botMatchId);
    expect(botRow?.peer.sourceType).toBe('bot');
    console.info(`bandeja: ${botRow?.peer.nickname} · último=${botRow?.lastMessage?.body ?? '—'} · sin leer=${botRow?.unreadCount}`);

    const opened = await A.openChat(botMatchId);
    expect(opened.ok).toBe(true);
    const buddiesBefore = A.getState().chat!.messages.filter((message) => !message.mine).length;
    const stamp = Date.now();
    const sent = await A.sendChatMessage(botMatchId, `hola desde el smoke ${stamp}`);
    expect(sent.ok).toBe(true);
    const mine = A.getState().chat!.messages.at(-1)!;
    expect(mine.mine).toBe(true);
    expect(mine.status).toBe('sent');
    console.info(`enviado: ${mine.body} (${mine.status}, ${mine.clientMessageId})`);

    // El bot contesta solo: se relee la página hasta que aparece **una respuesta
    // nueva**. (El match puede reusarse entre corridas: contar, no comparar.)
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      await A.refreshChat();
      const count = A.getState().chat!.messages.filter((message) => !message.mine).length;
      if (count > buddiesBefore) {
        break;
      }
      await sleep(500);
    }
    const buddies = A.getState().chat!.messages.filter((message) => !message.mine);
    expect(buddies.length).toBeGreaterThan(buddiesBefore);
    console.info(`respuesta del bot: ${buddies.at(-1)?.body}`);

    await A.refreshMatches();
    const unread = A.getState().matches.find((item) => item.match.id === botMatchId)?.unreadCount;
    console.info(`sin leer con la respuesta del bot: ${unread}`);
    expect(unread).toBeGreaterThan(0);

    // Abrir de nuevo marca leído y el server lo confirma.
    expect((await A.openChat(botMatchId)).ok).toBe(true);
    const after = A.getState().matches.find((item) => item.match.id === botMatchId)?.unreadCount;
    console.info(`sin leer después de abrir: ${after}`);
    expect(after).toBe(0);
    console.info(
      `historial visible: ${JSON.stringify(A.getState().chat?.messages.map((message) => `${message.mine ? 'yo' : 'otro'}: ${message.body}`))}`,
    );
  }, 90_000);

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
