import type { LiveEvent } from '../live/types';
import type { DemoState } from '../state/types';

import type { SoundKind } from './synth';

/**
 * Qué evento suena y con qué, sin tocar React ni audio.
 *
 * **Dos caminos, una tabla.** El modo live avisa por eventos del contrato
 * (`ping.received`, `match.created`, `message.created`); el dataset del build no
 * tiene stream y avisa por cambios de estado (un ping del guion, un match del
 * reducer). Los dos terminan en las mismas cuatro claves de sonido.
 *
 * **Dedupe por id, no por tiempo.** El stream reenvía frames y el polling repite
 * la página: el mismo `EventEnvelope.id` puede llegar más de una vez y sonaría
 * dos veces. La clave del dataset es el id del ping / del match / la huella del
 * último mensaje, así que un refresh idéntico tampoco repite. Nada de "ignorá
 * sonidos durante 300 ms": eso calla un ping legítimo que llega enseguida.
 */

/**
 * Evento del contrato → sonido, o `null` si no amerita uno.
 *
 * Un `message.created` propio no es "llegó algo": el acuse de envío ya tiene su
 * sonido (`sent`) y contar dos veces el mismo mensaje es el peor bug de audio.
 */
export function cueForEvent(event: LiveEvent, selfId: string | null): SoundKind | null {
  if (event.type === 'ping.received') {
    return 'ping';
  }
  if (event.type === 'match.created') {
    return 'match';
  }
  if (event.type === 'message.created') {
    const sender = event.payload['senderProfileId'];
    if (typeof sender === 'string' && selfId !== null && sender === selfId) {
      return null;
    }
    return 'message';
  }
  return null;
}

/**
 * Memoria de claves ya sonadas. FIFO con tope: el SSE de una sesión larga puede
 * generar cientos de ids y no queremos que esto crezca sin límite.
 */
export type CueDedupe = {
  /** `true` la primera vez que ve la clave; `false` de ahí en más. */
  claim(key: string): boolean;
  has(key: string): boolean;
  size(): number;
  reset(): void;
};

export const DEDUPE_LIMIT = 256;

export function createCueDedupe(limit: number = DEDUPE_LIMIT): CueDedupe {
  const seen = new Map<string, true>();
  return {
    claim: (key) => {
      if (seen.has(key)) {
        return false;
      }
      seen.set(key, true);
      if (seen.size > limit) {
        const oldest = seen.keys().next();
        if (!oldest.done) {
          seen.delete(oldest.value);
        }
      }
      return true;
    },
    has: (key) => seen.has(key),
    size: () => seen.size,
    reset: () => {
      seen.clear();
    },
  };
}

/** Lote de eventos del stream → sonidos que hay que tocar, en orden. */
export function cuesForEvents(
  events: readonly LiveEvent[],
  selfId: string | null,
  dedupe: CueDedupe,
): SoundKind[] {
  const cues: SoundKind[] = [];
  for (const event of events) {
    const kind = cueForEvent(event, selfId);
    if (kind === null) {
      continue;
    }
    if (!dedupe.claim(`event:${event.id}`)) {
      continue;
    }
    cues.push(kind);
  }
  return cues;
}

/** Último mensaje de una conversación del dataset, reducido a una huella. */
export type LastMessageCue = {
  fingerprint: string;
  mine: boolean;
};

/**
 * Foto mínima del dataset para derivar sonidos. Es sólo lo que cambia cuando
 * "pasa algo": pings entrantes, matches y el último mensaje de cada chat.
 */
export type DatasetCueSnapshot = {
  incoming: readonly string[];
  matches: readonly string[];
  lastMessage: Readonly<Record<string, LastMessageCue>>;
};

/**
 * Foto del estado del reducer. La huella incluye la cantidad de mensajes: dos
 * mensajes seguidos con el mismo `textKey` (el guion repite respuestas) son dos
 * eventos distintos y tienen que sonar dos veces.
 */
export function datasetSnapshot(state: DemoState): DatasetCueSnapshot {
  const lastMessage: Record<string, LastMessageCue> = {};
  for (const [peerId, messages] of Object.entries(state.messages)) {
    const last = messages[messages.length - 1];
    lastMessage[peerId] =
      last === undefined
        ? { fingerprint: '', mine: false }
        : {
            fingerprint: `${messages.length}|${last.from}|${last.textKey}`,
            mine: last.from === 'me',
          };
  }
  return { incoming: state.incomingPings, matches: state.matches, lastMessage };
}

/**
 * Transiciones del dataset → sonidos.
 *
 * `null` es la primera foto: al montar hay pings y matches que ya existían y no
 * son noticia. Primar la foto (en vez de sonar todo) es lo mismo que hace el
 * controlador con `pingsAt` para el toast.
 */
export function datasetCues(
  previous: DatasetCueSnapshot | null,
  next: DatasetCueSnapshot,
  dedupe: CueDedupe,
): SoundKind[] {
  if (previous === null) {
    return [];
  }
  const cues: SoundKind[] = [];

  const knownPings = new Set(previous.incoming);
  for (const id of next.incoming) {
    if (knownPings.has(id)) {
      continue;
    }
    if (dedupe.claim(`ping:${id}`)) {
      cues.push('ping');
    }
  }

  const knownMatches = new Set(previous.matches);
  for (const id of next.matches) {
    if (knownMatches.has(id)) {
      continue;
    }
    if (dedupe.claim(`match:${id}`)) {
      cues.push('match');
    }
  }

  for (const [peerId, current] of Object.entries(next.lastMessage)) {
    const before = previous.lastMessage[peerId];
    if (current.fingerprint === '' || before?.fingerprint === current.fingerprint) {
      continue;
    }
    if (!dedupe.claim(`msg:${peerId}:${current.fingerprint}`)) {
      continue;
    }
    cues.push(current.mine ? 'sent' : 'message');
  }

  return cues;
}
