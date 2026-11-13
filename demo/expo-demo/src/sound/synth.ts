/**
 * Sonidos de la demo: notas sintetizadas, no archivos.
 *
 * **Por qué sintetizar.** Un mp3 por evento son cuatro assets binarios nuevos,
 * cuatro licencias que revisar y peso en el bundle para un aviso de 150 ms. Un
 * `OscillatorNode` + un `GainNode` dan el mismo aviso sin bajar nada y con el
 * envelope bajo control: cada sonido arranca y muere donde nosotros decimos, así
 * que no hay clicks ni colas.
 *
 * **Qué describe este archivo.** Sólo datos: qué nota, con qué onda, de qué
 * frecuencia a cuál, cuándo y cuánto dura. El grafo se arma en `renderSound`, y
 * el `AudioContext` llega por parámetro (tipo estructural, sin depender de DOM).
 * Eso es lo que permite testear el envelope con un fake y no con un navegador.
 *
 * **Reglas del diseño.** Todos los sonidos son cortos (≤ 400 ms), con ataque
 * rápido y caída exponencial a casi cero. Ninguno usa `loop`: un dron en una demo
 * de citas es una alarma, no un aviso. El pico se reparte por nota para que tres
 * notas sumadas no clipeen.
 */

/** Onda del `OscillatorNode`. Se declara como string para no depender del DOM. */
export type OscillatorWave = 'sine' | 'triangle' | 'square' | 'sawtooth';

/** Los cuatro avisos de la demo. */
export type SoundKind = 'ping' | 'match' | 'message' | 'sent';

export const SOUND_KINDS: readonly SoundKind[] = ['ping', 'match', 'message', 'sent'];

const KIND_SET: ReadonlySet<string> = new Set(SOUND_KINDS);

export function isSoundKind(value: unknown): value is SoundKind {
  return typeof value === 'string' && KIND_SET.has(value);
}

/** Una nota del sonido. Varias notas = un pequeño arpegio, no un acorde. */
export type Note = {
  wave: OscillatorWave;
  /** Frecuencia de arranque, en Hz. */
  frequency: number;
  /** Frecuencia final del glissando. Sin esto la nota es plana. */
  endFrequency?: number;
  /** Cuándo empieza, relativo al inicio del sonido. */
  startMs: number;
  durationMs: number;
  /** Pico relativo al volumen maestro (0..1). Tres notas suman como mucho ~1.5. */
  peak: number;
};

export type SoundSpec = {
  kind: SoundKind;
  notes: readonly Note[];
  /** Duración audible del sonido completo. Sirve para documentar y testear. */
  durationMs: number;
};

/**
 * Los cuatro timbres. Se distinguen por onda y por forma, no sólo por altura:
 * dos senoidales seguidas se confunden de oído si además duran lo mismo.
 *
 * - `ping`    (llegó un ping): dos notas agudas y secas, senoidal. "Tin-tin".
 * - `match`   (se creó un match): arpegio de tres notas en triángulo, cálido.
 * - `message` (llegó un mensaje): una sola nota con glissando descendente.
 * - `sent`    (mandaste un mensaje): una nota grave, corta y suave.
 */
export const SOUND_SPECS: Readonly<Record<SoundKind, SoundSpec>> = {
  ping: {
    kind: 'ping',
    durationMs: 160,
    notes: [
      { wave: 'sine', frequency: 1318.51, startMs: 0, durationMs: 70, peak: 0.5 },
      { wave: 'sine', frequency: 1760.0, startMs: 70, durationMs: 80, peak: 0.42 },
    ],
  },
  match: {
    kind: 'match',
    durationMs: 300,
    notes: [
      { wave: 'triangle', frequency: 523.25, startMs: 0, durationMs: 90, peak: 0.45 },
      { wave: 'triangle', frequency: 659.25, startMs: 80, durationMs: 90, peak: 0.45 },
      { wave: 'triangle', frequency: 783.99, startMs: 160, durationMs: 140, peak: 0.5 },
    ],
  },
  message: {
    kind: 'message',
    durationMs: 150,
    notes: [
      {
        wave: 'sine',
        frequency: 987.77,
        endFrequency: 830.61,
        startMs: 0,
        durationMs: 150,
        peak: 0.42,
      },
    ],
  },
  sent: {
    kind: 'sent',
    durationMs: 110,
    notes: [
      {
        wave: 'sine',
        frequency: 392.0,
        endFrequency: 329.63,
        startMs: 0,
        durationMs: 110,
        peak: 0.26,
      },
    ],
  },
};

/** El mínimo de una rampa exponencial: no puede llegar a 0 exacto. */
export const MIN_GAIN = 0.0001;

/**
 * Tipos estructurales de Web Audio. Se declaran acá y no se importan de `lib.dom`
 * para que el módulo compile igual en el runtime de tests (Node) y para que el
 * fake del test no tenga que implementar un `AudioContext` completo.
 */
export type AudioParamLike = {
  setValueAtTime(value: number, startTime: number): void;
  linearRampToValueAtTime(value: number, endTime: number): void;
  exponentialRampToValueAtTime(value: number, endTime: number): void;
};

export type OscillatorLike = {
  type: string;
  frequency: AudioParamLike;
  connect(target: unknown): unknown;
  start(when: number): void;
  stop(when: number): void;
};

export type GainLike = {
  gain: AudioParamLike;
  connect(target: unknown): unknown;
};

export type AudioContextLike = {
  currentTime: number;
  state: string;
  destination: unknown;
  resume(): Promise<void> | void;
  createOscillator(): OscillatorLike;
  createGain(): GainLike;
  close?(): Promise<void> | void;
};

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Ataque corto: 12 ms o un cuarto de la nota, lo que sea menor. */
function attackSeconds(note: Note): number {
  return Math.min(0.012, note.durationMs / 1000 / 4);
}

/**
 * Arma y dispara el sonido. Cada nota es oscilador → gain → destino, con
 * envelope lineal de subida y exponencial de bajada (el `setValueAtTime` en
 * `MIN_GAIN` es lo que evita el click del borde).
 */
export function renderSound(context: AudioContextLike, spec: SoundSpec, volume = 1): void {
  const master = clamp(volume, 0, 1);
  if (master <= 0) {
    return;
  }
  const origin = context.currentTime;
  for (const note of spec.notes) {
    const start = origin + note.startMs / 1000;
    const end = start + note.durationMs / 1000;
    const peak = clamp(note.peak * master, MIN_GAIN, 1);
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = note.wave;
    oscillator.frequency.setValueAtTime(note.frequency, start);
    if (note.endFrequency !== undefined) {
      oscillator.frequency.exponentialRampToValueAtTime(note.endFrequency, end);
    }
    gain.gain.setValueAtTime(MIN_GAIN, start);
    gain.gain.linearRampToValueAtTime(peak, start + attackSeconds(note));
    gain.gain.exponentialRampToValueAtTime(MIN_GAIN, end);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(end + 0.02);
  }
}

/** `false` si el kind no existe (payload raro): nunca se tira por un string suelto. */
export function playSound(
  context: AudioContextLike,
  kind: SoundKind,
  volume = 1,
): boolean {
  const spec = SOUND_SPECS[kind];
  if (spec === undefined) {
    return false;
  }
  renderSound(context, spec, volume);
  return true;
}
