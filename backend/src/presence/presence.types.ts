/**
 * Tipos de presencia, alineados con `contract/schemas/presence.yaml`.
 *
 * La frontera es de un solo sentido: `PresenceUpdate` es lo que **entra** (y por
 * eso puede nombrar un punto), `PresenceState` es lo que **sale** (y por eso no
 * puede: sólo `regionKey`, `zoneKey`, `online`, `visibility` y
 * `fallbackRequired`).
 */

/**
 * Visibilidad de la presencia (v0.5).
 *
 * `visible` es el default histórico: aparecés en el descubrimiento y en el
 * stream de los demás. `ghost` es "online pero invisible": la sesión sigue viva
 * —y viendo— pero ni el humano ni sus bots aparecen para nadie más. No es lo
 * mismo que `DELETE /presence`, que apaga la presencia para todos, incluido uno
 * mismo.
 */
export type Visibility = 'visible' | 'ghost';

/**
 * `PresenceState`: la presencia proyectada. Seis campos, ni uno más
 * (`additionalProperties: false` en el contrato).
 *
 * Invariante del contrato: `zoneKey === null` si y sólo si
 * `fallbackRequired === true`. `online` sigue siendo `true` en `ghost`: lo que
 * cambia es a quién se le muestra, no si la presencia existe.
 */
export interface PresenceState {
  readonly profileId: string;
  readonly regionKey: string;
  readonly zoneKey: string | null;
  readonly online: boolean;
  readonly visibility: Visibility;
  readonly fallbackRequired: boolean;
}

/**
 * Lo que el cliente pidió, ya validado: exactamente uno de los dos caminos.
 *
 * Es una unión discriminada —y no dos campos opcionales— porque el `oneOf` del
 * contrato deja afuera los casos "ninguno" y "los dos" con un 422: si no pueden
 * llegar hasta acá, el resto del código no tiene que preguntar "¿tendrá punto?".
 *
 * `visibility` es ortogonal: `null` significa "no la toques" (el heartbeat de
 * posición del cliente no puede sacar a nadie de ghost por olvidar el campo).
 */
export type PresenceUpdate = {
  readonly visibility: Visibility | null;
} & (
  | { readonly kind: 'point'; readonly lat: number; readonly lng: number }
  | { readonly kind: 'zone'; readonly demoZoneKey: string }
);
