/**
 * Proyecciones puras del log de eventos: SSE y polling.
 *
 * Las dos son funciones del mismo log (`contract/event/sample-log.json`), así que
 * su equivalencia se puede probar hoy, sin server ni DB. El server de Sprint 2
 * tiene que dar la misma secuencia para el mismo cursor; cualquier divergencia
 * rompe `contract/test/events-contract.test.mjs`.
 *
 * Nada acá hace I/O ni guarda estado: recibe el log y devuelve la proyección.
 */

/** `id = <regionKey>:<seq:012d>`. El cliente sólo parsea el sufijo numérico. */
export const EVENT_ID_PATTERN = /^([a-z]{2}):([0-9]{12})$/;

/** Preámbulo del stream: el navegador reintenta a los 5 s si se corta. */
export const SSE_PREAMBLE = 'retry: 5000\n\n';

export const DEFAULT_POLL_LIMIT = 100;
export const MAX_POLL_LIMIT = 500;

/** Envelope `id` a partir de región y `seq`. Falla si alguno no tiene forma válida. */
export function formatEventId(regionKey, seq) {
  if (typeof regionKey !== 'string' || !/^[a-z]{2}$/.test(regionKey)) {
    throw new Error(`regionKey inválida: ${JSON.stringify(regionKey)}`);
  }
  if (!Number.isInteger(seq) || seq < 0) {
    throw new Error(`seq inválido: ${JSON.stringify(seq)}`);
  }
  return `${regionKey}:${String(seq).padStart(12, '0')}`;
}

/** `id` a `{ regionKey, seq }`. Un id malformado es 422 `VALIDATION_FAILED`. */
export function parseEnvelopeId(id) {
  const match = typeof id === 'string' ? EVENT_ID_PATTERN.exec(id) : null;
  if (!match) {
    throw new Error(
      `id de evento malformado: ${JSON.stringify(id)} (se esperaba <regionKey>:<seq:012d>)`,
    );
  }
  return { regionKey: match[1], seq: Number(match[2]) };
}

/**
 * Eventos de la región con `seq` estrictamente mayor al cursor, en orden
 * ascendente y sin repetidos: la primera aparición de un `seq` gana y las
 * siguientes se descartan (`seq <= lastSeen`).
 */
function replay(log, { regionKey, cursor = null, limit }) {
  formatEventId(regionKey, 0); // valida la región aunque el log esté vacío
  let after = 0;
  if (cursor !== null) {
    const parsed = parseEnvelopeId(cursor);
    if (parsed.regionKey !== regionKey) {
      throw new Error(`cursor de otra región: ${cursor} en un stream ${regionKey}`);
    }
    after = parsed.seq;
  }

  const seen = new Set();
  const events = [];
  for (const event of log) {
    const { regionKey: eventRegion, seq } = parseEnvelopeId(event.id);
    if (eventRegion !== regionKey || seq <= after || seen.has(seq)) continue;
    seen.add(seq);
    events.push(event);
  }
  events.sort((a, b) => parseEnvelopeId(a.id).seq - parseEnvelopeId(b.id).seq);
  return events.slice(0, limit);
}

/**
 * Una página de polling. `nextCursor` es el `id` del último entregado; una página
 * vacía devuelve el cursor recibido sin moverlo (y `hasMore: false`).
 */
export function toPollPage(log, { regionKey, cursor = null, limit = DEFAULT_POLL_LIMIT } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_POLL_LIMIT) {
    throw new Error(`limit fuera de 1..${MAX_POLL_LIMIT}: ${JSON.stringify(limit)}`);
  }
  const events = replay(log, { regionKey, cursor, limit: Number.MAX_SAFE_INTEGER });
  const page = events.slice(0, limit);
  return {
    events: page,
    nextCursor: page.length === 0 ? cursor : page[page.length - 1].id,
    hasMore: events.length > page.length,
  };
}

/** Frames SSE del replay completo desde `cursor`, con el preámbulo `retry`. */
export function toSseFrames(log, { regionKey, cursor = null } = {}) {
  const events = replay(log, { regionKey, cursor, limit: Number.MAX_SAFE_INTEGER });
  const frames = events.map(
    (event) => `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
  );
  return SSE_PREAMBLE + frames.join('');
}
