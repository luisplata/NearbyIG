/**
 * Copy de la bandeja de pings.
 *
 * Vive acá y no en `demo/shared/copy.json` por la misma razón que `liveCopy` y
 * `mapCopy`: agregar claves al catálogo mueve el `datasetId` del artefacto
 * congelado (Flutter + golden). Estos textos son del flujo real de pings, que no
 * existe en el artefacto mock.
 *
 * Lo que **sí** se reutiliza del catálogo por `fmt()` es lo que ya estaba:
 * `ping.accept`, `ping.reject`, `ping.inboxTitle`, `ping.sentTitle`,
 * `ping.inboxEmpty`, `ping.sent`, `ping.sentStatus`, `notif.ping` (el toast) y
 * `intention.*`.
 */
export const pingsCopy = {
  tabInbox: 'Recibidos',
  tabSent: 'Enviados',
  refresh: 'Actualizar',
  liveHint: 'En vivo: el backend resuelve cada ping y avisa el match.',

  statusPending: 'Pendiente',
  statusAccepted: 'Match creado',
  statusRejected: 'Rechazado',
  statusExpired: 'Vencido',

  inboxEmptyLive: 'Todavía no te llegó ningún ping en esta sesión.',
  sentEmptyLive: 'Todavía no enviaste pings en esta sesión.',
  matchCreated: 'Match creado con {name}',

  send: 'Enviar ping',
  sending: 'Enviando…',
  sendPending: 'Ping enviado. Esperando respuesta.',
  sendBotNote: 'Un bot acepta solo: el match ya está creado.',
  guestNote: 'Sesión de invitado: no hay un perfil propio con el que enviar pings.',

  notifLive: 'Ping de {name}',

  errorDuplicate: 'Ya le mandaste un ping a este perfil. Esperá la respuesta.',
  errorExpired: 'Ese ping venció. Podés mandar uno nuevo.',
  errorResolved: 'Ese ping ya estaba resuelto.',
  errorForbidden: 'No podés resolver ese ping.',
  errorTarget: 'Ese perfil ya no está disponible.',
  errorRate: 'Mandaste demasiados pings seguidos. Esperá un momento.',
  errorNetwork: 'No se pudo hablar con la API. Probá de nuevo.',
  errorSession: 'La sesión se cerró: volvé a abrirla para seguir usando pings.',
  errorGeneric: 'No se pudo completar la acción ({code}).',
} as const;

export type PingsCopyKey = keyof typeof pingsCopy;

/** Interpolación `{param}` igual que `fmt()` y `liveText()`. */
export function pingText(key: PingsCopyKey, params: Record<string, string> = {}): string {
  const template = pingsCopy[key] as string;
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => params[name] ?? `{${name}}`);
}
