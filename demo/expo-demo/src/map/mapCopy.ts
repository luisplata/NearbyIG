/**
 * Copy del basemap.
 *
 * Vive acá y no en `demo/shared/copy.json` por la misma razón que el copy live:
 * agregar claves al catálogo mueve el `datasetId` del artefacto congelado. El
 * mapa ilustrado tiene su leyenda en el catálogo (`discovery.mapLegend`); esto
 * es sólo el estado de falla del basemap real, que no existe en ese artefacto.
 */
export const mapCopy = {
  retry: 'Reintentar mapa',
  failed: 'mapa: {reason}',
  failWebgl: 'sin WebGL',
  failTimeout: 'timeout',
  failStyle: 'estilo',
  failContext: 'contexto WebGL',
} as const;

export type MapCopyKey = keyof typeof mapCopy;

export function mapText(key: MapCopyKey, params: Record<string, string> = {}): string {
  const template = mapCopy[key] as string;
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => params[name] ?? `{${name}}`);
}
