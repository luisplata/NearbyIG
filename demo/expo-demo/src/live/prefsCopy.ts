/**
 * Copy de preferencias y del perfil propio.
 *
 * Mismo motivo que `liveCopy` / `mapCopy` / `pingsCopy`: el catálogo compartido
 * alimenta el `datasetId` del artefacto congelado. La restauración de
 * preferencias es de la app Expo, no del artefacto mock.
 */
export const prefsCopy = {
  reset: 'Restablecer preferencias',
  resetHint: 'Vuelve radio y filtros a los valores de fábrica. No cambia tu zona ni tu sesión.',

  soundsLabel: 'Sonidos',
  soundsHint: 'Un tono corto para ping, match y mensaje. Se activan con el primer toque en la pantalla.',
  soundsBlocked: 'Tocá la pantalla para activar los sonidos.',

  selfLive: 'perfil de la sesión',
  selfFallback: 'Perfil del dataset: la API todavía no devolvió tu perfil de la sesión.',
  selfGuest: 'Sesión de invitado: no hay perfil propio en el catálogo.',
} as const;

export type PrefsCopyKey = keyof typeof prefsCopy;

export function prefsText(key: PrefsCopyKey, params: Record<string, string> = {}): string {
  const template = prefsCopy[key] as string;
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => params[name] ?? `{${name}}`);
}
