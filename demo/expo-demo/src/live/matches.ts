import type { MatchRow } from './chat';

/**
 * Búsqueda del match de un peer.
 *
 * **Por qué vive acá.** El chat real se indexa por `match.id`, pero la lista de
 * descubrimiento, el perfil y las tarjetas de ping sólo conocen el `profileId`
 * del otro. Cruzar las dos formas en cada pantalla invita a tres versiones de la
 * misma búsqueda; acá hay una sola, pura y testeable.
 *
 * **Por qué puede dar `null` en un match que existe.** La bandeja es una foto:
 * después de aceptar un ping o de que un bot acepte solo, el match tarda una
 * request en aparecer. El que navega pide la foto otra vez antes de rendirse
 * (`LiveProvider.openChatWithPeer`).
 */
export function matchForPeer(rows: readonly MatchRow[], profileId: string): MatchRow | null {
  for (const row of rows) {
    if (row.peer.profileId === profileId) {
      return row;
    }
  }
  return null;
}
