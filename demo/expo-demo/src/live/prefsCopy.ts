/**
 * Copy de preferencias y del perfil propio.
 *
 * Mismo motivo que `liveCopy` / `mapCopy` / `pingsCopy`: el catálogo compartido
 * alimenta el `datasetId` del artefacto congelado. El toggle de bots y la
 * restauración de preferencias son de la app Expo, no del artefacto mock.
 */
export const prefsCopy = {
  botsLabel: 'Incluir bots',
  botsOn: 'Bots incluidos',
  botsOff: 'Sin bots',
  botsCount: '{count} bots en la zona',

  reset: 'Restablecer preferencias',
  resetHint: 'Vuelve radio, filtros y bots a los valores de fábrica. No cambia tu zona ni tu sesión.',

  selfLive: 'perfil de la sesión',
  selfFallback: 'Perfil del dataset: la API todavía no devolvió tu perfil de la sesión.',
  selfGuest: 'Sesión de invitado: no hay perfil propio en el catálogo.',
} as const;

export type PrefsCopyKey = keyof typeof prefsCopy;

export function prefsText(key: PrefsCopyKey, params: Record<string, string> = {}): string {
  const template = prefsCopy[key] as string;
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => params[name] ?? `{${name}}`);
}
