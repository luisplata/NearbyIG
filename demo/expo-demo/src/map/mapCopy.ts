/**
 * Copy del basemap.
 *
 * Vive acá y no en `demo/shared/copy.json` por la misma razón que el copy live:
 * agregar claves al catálogo mueve el `datasetId` del artefacto congelado. El
 * mapa ilustrado tiene su leyenda en el catálogo (`discovery.mapLegend`); esto
 * es el estado de falla del basemap real y el marcador propio del radar, que no
 * existen en ese artefacto.
 */
export const mapCopy = {
  retry: 'Reintentar mapa',
  failed: 'mapa: {reason}',
  failWebgl: 'sin WebGL',
  failTimeout: 'timeout',
  failStyle: 'estilo',
  failContext: 'contexto WebGL',
  /** Marcador propio del radar: el centro siempre sos vos. */
  selfYou: 'vos',
  selfA11y: 'Tu ubicación, en el centro del radar',
} as const;

export type MapCopyKey = keyof typeof mapCopy;

export function mapText(key: MapCopyKey, params: Record<string, string> = {}): string {
  const template = mapCopy[key] as string;
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => params[name] ?? `{${name}}`);
}
