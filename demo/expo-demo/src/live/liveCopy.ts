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
 *
 * No hay copy de "Mock" ni de "Live" como chips: en el build publicado el
 * dataset no es una elección visible, y cuando hay API la sesión arranca sola.
 *
 * **Un texto por causa.** El pedido de ubicación puede fallar por cinco motivos
 * distintos y el usuario necesita saber cuál para poder destrabarlo: el mensaje
 * genérico de antes ("seguimos en la zona demo") no decía si el permiso estaba
 * bloqueado, si el navegador no la soporta o si estaba fuera de México y
 * Colombia.
 */
export const liveCopy = {
  liveBadge: 'Modo de datos: {mode}',
  statusDataset: 'dataset local',
  statusNeedsZone: 'elegí una zona demo',
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
  retry: 'Reintentar',
  noticeUnreachable: 'No se pudo abrir la sesión live. Seguimos con el dataset local.',
  noticeSessionLost: 'La sesión se cerró (la tomó otra pestaña). Seguimos con el dataset local.',
  noticeDegraded: 'Se cortó el stream: seguimos actualizando por polling.',
  gps: 'GPS',
  demoZone: 'zona demo',
  demoZoneIn: 'zona demo ({zone})',
  useMyLocation: 'Usar mi ubicación',
  geolocationOutside: 'Estás fuera de la zona demo: el mapa y las distancias son de la zona demo.',

  // Sheet de zona: la puerta de entrada cuando no hay ubicación utilizable.
  zoneTitle: 'Zona de la demo',
  zoneLead: 'No pudimos usar tu ubicación. Elegí una zona para la demo.',
  zoneLeadInitial: 'Elegí una zona para la demo o usá tu ubicación para ver distancias reales.',
  causeDenied: 'El navegador tiene la ubicación bloqueada para este sitio.',
  causeUnavailable: 'La ubicación no está disponible en este momento.',
  causeTimeout: 'La ubicación tardó demasiado en responder.',
  causeUnsupported: 'Este navegador no entrega la ubicación.',
  causeInsecure: 'El sitio no está en HTTPS, así que el navegador no entrega la ubicación.',
  causeOutside: 'Tu ubicación está fuera de México y Colombia.',
  unblockHint: 'Para destrabarlo, tocá el candado de la barra de direcciones y habilitá la ubicación para este sitio.',
  zoneSwitchNote: 'Elegir una zona de otra región cierra esta sesión y abre una nueva allá.',
  zoneCdmx: 'CDMX, México',
  zoneBogota: 'Bogotá, Colombia',
  zoneCdmxShort: 'CDMX',
  zoneBogotaShort: 'Bogotá',
  changeZone: 'Cambiar zona',
  chooseZone: 'Elegir zona',
  notNow: 'Ahora no',

  // Debug del flujo de ubicación: discreto, sin coordenadas.
  debugToggle: 'debug',
  debugTitle: 'Diagnóstico de ubicación',
  debugGeo: 'geo: {geo} · precisión {accuracy}',
  debugPresence: 'presence: {status} · zona {zone} · fallback {fallback}',
  debugSession: 'sesión: {region} · {slot}',
  debugZone: 'zona: {zone}',
  none: '—',
  yes: 'sí',
  no: 'no',

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

  // Pull-to-refresh: el gesto y el botón son el mismo refresh completo. El
  // primer texto se ve mientras se arrastra pero no alcanza el umbral.
  pull: 'Tirá para actualizar',
  pullRelease: 'Soltá para actualizar',
  pullBusy: 'Actualizando…',
} as const;

export type LiveCopyKey = keyof typeof liveCopy;

/** Interpolación `{param}` igual que `fmt()` del catálogo. */
export function liveText(key: LiveCopyKey, params: Record<string, string> = {}): string {
  const template = liveCopy[key] as string;
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => params[name] ?? `{${name}}`);
}
