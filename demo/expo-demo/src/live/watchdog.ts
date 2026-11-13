/**
 * Watchdog del stream SSE.
 *
 * **El problema real.** Cloudflare (y cualquier proxy con buffering) puede
 * aceptar la conexión `text/event-stream`, disparar `onopen` y después no
 * entregar ni un frame. El cliente marcaba `transport: 'sse'` en el `onopen` y
 * **dejaba de pollear**, así que el radar se quedaba viejo y la campana congelada
 * sin ningún error visible: el peor estado posible, "conectado" y muerto.
 *
 * **Qué mide.** Una sola cosa: cuánto pasó desde la última señal de vida del
 * stream. `onopen` es una señal (la conexión se estableció), cada frame del SSE
 * es otra. Si pasan `stallMs` sin ninguna, el transporte está muerto aunque el
 * `EventSource` siga diciendo que está abierto.
 *
 * **Por qué con reloj inyectado.** La regla es tiempo puro y así se testea sin
 * timers reales: el test mueve `now()` 24 s y 26 s y ve exactamente dónde salta.
 * El controller le pasa `Date.now` y un tick de 5 s.
 *
 * **Una sola vez.** `check()` dispara `onStall` máximo una vez por armado: el
 * llamador hace `arm()` al abrir un stream nuevo y `disarm()` al cerrarlo.
 */

export type StreamWatchdog = {
  /** Arranca la cuenta: al crear el `EventSource`, no al recibir el primer frame. */
  arm(): void;
  /** Señal de vida: `onopen` y cada frame de cualquiera de los seis tipos. */
  touch(): void;
  /** `true` la primera vez que se detecta el silencio; después siempre `false`. */
  check(): boolean;
  /** Deja de vigilar sin disparar (stream cerrado o degradado a polling). */
  disarm(): void;
  /** `true` mientras vigila. Lo usa el controller para no duplicar el tick. */
  readonly armed: boolean;
};

export type StreamWatchdogOptions = {
  /** Silencio tolerado. 25 s: dos latidos de presencia (8 s) y margen. */
  stallMs: number;
  /** Reloj inyectable. En la app es `Date.now`; en los tests, un contador. */
  now: () => number;
  /** Se llama una vez cuando el stream se quedó mudo. */
  onStall: () => void;
};

export const DEFAULT_STALL_MS = 25_000;

export function createStreamWatchdog({
  stallMs,
  now,
  onStall,
}: StreamWatchdogOptions): StreamWatchdog {
  let armed = false;
  let fired = false;
  let lastSignal = 0;

  const watchdog: StreamWatchdog = {
    get armed() {
      return armed;
    },
    arm: () => {
      armed = true;
      fired = false;
      lastSignal = now();
    },
    touch: () => {
      if (!armed) {
        return;
      }
      lastSignal = now();
    },
    check: () => {
      if (!armed || fired) {
        return false;
      }
      if (now() - lastSignal < stallMs) {
        return false;
      }
      fired = true;
      armed = false;
      onStall();
      return true;
    },
    disarm: () => {
      armed = false;
      fired = false;
    },
  };

  return watchdog;
}
