/**
 * Copy del vacío de descubrimiento sin filtros.
 *
 * Vive acá y no en `demo/shared/copy.json` por la misma razón que `liveCopy`,
 * `mapCopy` y `prefsCopy`: el catálogo alimenta el `datasetId` del artefacto
 * congelado y cualquier clave nueva lo mueve. El estado "no hay nadie cerca" es
 * un caso de densidad real de la demo (una sola persona conectada), no una
 * pantalla del artefacto mock.
 *
 * **Un texto por causa.** `empty.filters` (catálogo) explica el vacío que el
 * usuario puede arreglar limpiando filtros; éste explica el que no depende de
 * él. Compartir un solo texto obligaba a mostrar "Limpiar filtros" con cero
 * filtros activos, que es la mentira que este cambio quita.
 */
export const discoveryCopy = {
  emptyDensity:
    'Todavía no hay nadie cerca. La demo muestra densidad con dos personas conectadas.',
} as const;

export type DiscoveryCopyKey = keyof typeof discoveryCopy;

export function discoveryText(key: DiscoveryCopyKey): string {
  return discoveryCopy[key];
}
