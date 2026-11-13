import { describe, expect, it } from 'vitest';

import { createStreamWatchdog, DEFAULT_STALL_MS } from '../src/live/watchdog';

/**
 * El watchdog con reloj inyectado: la regla es tiempo puro, así que el test mueve
 * el reloj y no espera. Ningún timer real, ningún `sleep`.
 */
function makeWatchdog(stallMs = DEFAULT_STALL_MS) {
  let now = 1_000;
  const stalls: number[] = [];
  const watchdog = createStreamWatchdog({
    stallMs,
    now: () => now,
    onStall: () => stalls.push(now),
  });
  return {
    watchdog,
    stalls,
    advance: (ms: number) => {
      now += ms;
    },
    at: (value: number) => {
      now = value;
    },
  };
}

describe('watchdog del stream', () => {
  it('no dispara antes de los 25 s y sí a los 25 s', () => {
    const { watchdog, stalls, advance } = makeWatchdog();
    watchdog.arm();

    advance(24_999);
    expect(watchdog.check()).toBe(false);
    expect(stalls).toEqual([]);

    advance(1);
    expect(watchdog.check()).toBe(true);
    expect(stalls).toEqual([26_000]);
  });

  it('un frame reinicia la cuenta: el silencio se mide desde el último dato', () => {
    const { watchdog, stalls, advance } = makeWatchdog();
    watchdog.arm();
    advance(20_000);
    watchdog.touch();
    advance(20_000);
    expect(watchdog.check()).toBe(false);
    expect(stalls).toEqual([]);

    advance(5_000);
    expect(watchdog.check()).toBe(true);
    expect(stalls).toHaveLength(1);
  });

  it('dispara una sola vez: dos tick no degradan dos veces', () => {
    const { watchdog, stalls, advance } = makeWatchdog();
    watchdog.arm();
    advance(30_000);
    expect(watchdog.check()).toBe(true);
    expect(watchdog.check()).toBe(false); // la segunda llamada ya está desarmada
    expect(stalls).toHaveLength(1);
    expect(watchdog.armed).toBe(false);
  });

  it('desarmado no dispara aunque pase una hora', () => {
    const { watchdog, stalls, advance } = makeWatchdog();
    watchdog.arm();
    watchdog.disarm();
    advance(3_600_000);
    expect(watchdog.check()).toBe(false);
    expect(stalls).toEqual([]);
  });

  it('un `touch` sin armar no arranca la cuenta', () => {
    const { watchdog, stalls, advance } = makeWatchdog();
    watchdog.touch();
    advance(30_000);
    expect(watchdog.check()).toBe(false);
    expect(stalls).toEqual([]);
    expect(watchdog.armed).toBe(false);
  });

  it('rearmar después de degradar vuelve a vigilar con cuenta nueva', () => {
    const { watchdog, stalls, advance, at } = makeWatchdog();
    watchdog.arm();
    advance(30_000);
    expect(watchdog.check()).toBe(true);

    watchdog.arm();
    expect(watchdog.armed).toBe(true);
    at(200_000);
    watchdog.touch();
    advance(24_000);
    expect(watchdog.check()).toBe(false);
    advance(1_000);
    expect(watchdog.check()).toBe(true);
    expect(stalls).toHaveLength(2);
  });

  it('sin `onopen` también cuenta: armar es suficiente para detectar el stream mudo', () => {
    const { watchdog, stalls, advance } = makeWatchdog();
    // El caso Cloudflare: se crea el EventSource, nunca llega `onopen`.
    watchdog.arm();
    advance(25_000);
    expect(watchdog.check()).toBe(true);
    expect(stalls).toHaveLength(1);
  });

  it('el default es 25 s: suficiente para dos latidos de presencia de 8 s', () => {
    expect(DEFAULT_STALL_MS).toBe(25_000);
  });
});
