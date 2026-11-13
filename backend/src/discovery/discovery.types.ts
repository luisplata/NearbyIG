import type { ProfileSummary } from '../profiles/profiles.service';

/**
 * `GET /discovery` — tipos del contrato (`schemas/discovery.yaml`).
 *
 * La fila del resultado **no** es un DTO nuevo: es `ProfileSummary`, la misma de
 * `GET /demo/profiles` (`additionalProperties: false`, 17 campos). Acá sólo se
 * declaran los filtros de entrada y el objeto que envuelve el array.
 */

/** `DiscoveryQuery` ya validado y con los defaults aplicados. */
export interface DiscoveryFilters {
  /** Radio en metros desde la presencia de la sesión (200–5000). */
  readonly radiusM: number;
  readonly intention?: string | undefined;
  readonly gender?: string | undefined;
  /**
   * `true` filtra por verificados. `false` o ausente **no filtra**: el contrato
   * dice "sólo perfiles verificados cuando es `true`", no "no verificados".
   */
  readonly verified: boolean;
  /** Igual que `verified`: sólo `true` filtra, y todo lo visible ya está online. */
  readonly online: boolean;
}

/** `DiscoveryResult`: objeto con array adentro, no array pelado. */
export interface DiscoveryResult {
  readonly results: readonly ProfileSummary[];
}
