/**
 * Tipos de presencia, alineados con `contract/schemas/presence.yaml`.
 *
 * La frontera es de un solo sentido: `PresenceUpdate` es lo que **entra** (y por
 * eso puede nombrar un punto), `PresenceState` es lo que **sale** (y por eso no
 * puede: sólo `regionKey`, `zoneKey` y `fallbackRequired`).
 */

/**
 * `PresenceState`: la presencia proyectada. Cinco campos, ni uno más
 * (`additionalProperties: false` en el contrato).
 *
 * Invariante del contrato: `zoneKey === null` si y sólo si
 * `fallbackRequired === true`.
 */
export interface PresenceState {
  readonly profileId: string;
  readonly regionKey: string;
  readonly zoneKey: string | null;
  readonly online: boolean;
  readonly fallbackRequired: boolean;
}

/**
 * Lo que el cliente pidió, ya validado: exactamente uno de los dos caminos.
 *
 * Es una unión discriminada —y no dos campos opcionales— porque el `oneOf` del
 * contrato deja afuera los casos "ninguno" y "los dos" con un 422: si no pueden
 * llegar hasta acá, el resto del código no tiene que preguntar "¿tendrá punto?".
 */
export type PresenceUpdate =
  | { readonly kind: 'point'; readonly lat: number; readonly lng: number }
  | { readonly kind: 'zone'; readonly demoZoneKey: string };
