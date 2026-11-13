/**
 * Copy del modo live.
 *
 * **Por qué acá y no en `demo/shared/copy.json`.** El catálogo es la fuente
 * única del artefacto mock y el `datasetId` sale de su contenido: agregar claves
 * mueve el hash, obliga a regenerar `copy.dart` (referencia congelada) y a
 * reescribir el `datasetId` de `test/golden/expected.json`. El modo live no
 * existe en ese artefacto, así que sus textos viven con el código que los usa.
 * Todo lo que ya está en el catálogo se reutiliza por `fmt()`: nombres de
 * intención, `status.*`, `a11y.profileDot`, títulos de pantalla.
 */
export const liveCopy = {
  mock: 'Mock',
  live: 'Live',
  liveBadge: 'Modo de datos: {mode}',
  statusMock: 'dataset del build',
  statusConnecting: 'conectando…',
  statusLive: 'en vivo',
  statusPolling: 'en vivo por polling',
  statusOffline: 'sin conexión',
  notConfigured: 'live no configurado',
  notConfiguredHint: 'Falta EXPO_PUBLIC_API_URL en este build: la demo usa el dataset local.',
  sessionLine: 'región {region} · {profileId} · {slot}',
  slot: 'slot {slot}',
  guest: 'invitado',
  profiles: '{count} perfiles',
  transportSse: 'stream',
  transportPolling: 'polling',
  changeProfile: 'Cambiar perfil',
  noticeUnreachable: 'No se pudo abrir la sesión live. Seguimos con el dataset del build.',
  noticeSessionLost: 'La sesión se cerró (la tomó otra pestaña). Volvimos al dataset del build.',
  noticeDegraded: 'Se cortó el stream: seguimos actualizando por polling.',
  pickerTitle: 'Perfiles demo',
  pickerHelp: 'Un slot en uso lo tiene otra sesión de demo. Podés esperar a que se libere o desalojarla.',
  inUse: 'en uso',
  free: 'libre',
  mine: 'es tu perfil',
  use: 'usar',
  takeover: 'desalojar',
  takeoverConfirm: '¿Desalojar la sesión que tiene el slot {slot}? La otra pestaña pierde el token en el acto.',
  confirm: 'Sí, desalojar',
  cancel: 'Cancelar',
  pickerEmpty: 'El backend no devolvió perfiles en esta región.',
  refresh: 'Actualizar',
  claimFailed: 'No se pudo usar el slot ({code}).',
  profilesA11y: 'Perfil {name}, slot {slot}, {state}',
} as const;

export type LiveCopyKey = keyof typeof liveCopy;

/** Interpolación `{param}` igual que `fmt()` del catálogo. */
export function liveText(key: LiveCopyKey, params: Record<string, string> = {}): string {
  const template = liveCopy[key] as string;
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => params[name] ?? `{${name}}`);
}

