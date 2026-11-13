import type { LiveEvent, LiveProfileRow } from './types';
import { seqOf } from './types';

/**
 * Aplicación de eventos sobre la última foto de descubrimiento.
 *
 * **Dedupe por `seq`.** El contrato lo fija: `id` es `<regionKey>:<seq:012d>` y
 * el cliente descarta todo `seq <= lastSeen`. Vale igual para el replay del SSE
 * (`Last-Event-ID` reenvía desde `seq + 1`, y reenviar el mismo id no duplica) y
 * para la página de polling, así que los dos transportes comparten esta función
 * y no puede haber dos reglas que se desincronicen.
 *
 * **Qué toca.** Sólo `profile.moved` (medidas) y `profile.presence` (online). Los
 * otros cuatro tipos son de S4/S5: se aceptan y se descartan para no romper la
 * unión cuando el backend empiece a emitirlos.
 *
 * **Qué no inventa.** Un `profile.moved` de un perfil que no está en la foto
 * (entró a la región, o la foto es vieja) no crea una fila: la fila necesita
 * nombre, foto y claves de copy que el evento no trae. Se marca
 * `unknownProfile` y el controller pide una foto nueva.
 */
export type ApplyEventsResult = {
  rows: LiveProfileRow[];
  lastSeq: number;
  changed: boolean;
  unknownProfile: boolean;
};

export function applyEvents(
  rows: readonly LiveProfileRow[],
  events: readonly LiveEvent[],
  lastSeq: number,
): ApplyEventsResult {
  // El orden lo da `seq`, no `occurredAt`: el contrato lo dice explícitamente.
  const ordered = [...events]
    .map((event) => ({ event, seq: seqOf(event.id) }))
    .filter((entry): entry is { event: LiveEvent; seq: number } => entry.seq !== null)
    .sort((a, b) => a.seq - b.seq);

  const byId = new Map<string, LiveProfileRow>();
  for (const row of rows) {
    byId.set(row.profileId, row);
  }

  let highest = lastSeq;
  let changed = false;
  let unknownProfile = false;

  for (const { event, seq } of ordered) {
    if (seq <= highest) {
      continue;
    }
    highest = seq;
    const profileId = event.payload['profileId'];
    if (typeof profileId !== 'string') {
      continue;
    }

    if (event.type === 'profile.moved') {
      const row = byId.get(profileId);
      const distanceM = event.payload['distanceM'];
      const bearingDeg = event.payload['bearingDeg'];
      if (row === undefined) {
        unknownProfile = true;
        continue;
      }
      if (typeof distanceM !== 'number' || typeof bearingDeg !== 'number') {
        continue;
      }
      byId.set(profileId, { ...row, distanceM, bearingDeg });
      changed = true;
      continue;
    }

    if (event.type === 'profile.presence') {
      const row = byId.get(profileId);
      const online = event.payload['online'];
      if (row === undefined) {
        unknownProfile = true;
        continue;
      }
      if (typeof online !== 'boolean' || row.online === online) {
        continue;
      }
      byId.set(profileId, { ...row, online });
      changed = true;
    }
  }

  if (!changed) {
    return { rows: rows as LiveProfileRow[], lastSeq: highest, changed: false, unknownProfile };
  }

  // Se preserva el orden de la foto (ya viene por distancia ascendente); parchear
  // no reordena, porque el server reordena en la próxima foto.
  return {
    rows: rows.map((row) => byId.get(row.profileId) ?? row),
    lastSeq: highest,
    changed: true,
    unknownProfile,
  };
}
