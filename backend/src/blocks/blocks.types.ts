import type { PingPeer } from '../pings/pings.types';

/**
 * Tipos de bloqueo, alineados con `contract/schemas/blocks.yaml`.
 *
 * `profileId` es siempre el humano canonizado: si el cliente bloquea un bot
 * (`mx-p03-b1`), la fila y la response publican al dueño (`mx-p03`). La
 * canonización vive en el service porque es una regla de negocio, no una
 * propiedad del DTO.
 */
export interface Block {
  readonly profileId: string;
  readonly createdAt: string;
}

/**
 * Una fila de `GET /blocks`: el bloqueo y la identidad del otro, con la misma
 * proyección que la bandeja de pings (`PingPeer`). No hay un DTO de identidad
 * nuevo: el cliente ya sabe dibujar esa.
 */
export interface BlockListItem {
  readonly block: Block;
  readonly peer: PingPeer;
}

export interface BlockList {
  readonly blocks: readonly BlockListItem[];
}
