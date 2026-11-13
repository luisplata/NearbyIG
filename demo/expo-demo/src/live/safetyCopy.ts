/**
 * Copy de privacidad de la sesión (Sprint 5): fantasma real, bloqueos,
 * reportes, notificaciones y reset propio.
 *
 * **Por qué acá y no en `demo/shared/copy.json`.** Mismo motivo que `liveCopy`,
 * `pingsCopy` y `prefsCopy`: el catálogo compartido alimenta el `datasetId` del
 * artefacto congelado (Flutter + golden). Estos textos son del flujo live, que
 * no existe en ese artefacto.
 *
 * Lo que **sí** se reutiliza por `fmt()` es lo que ya estaba: `settings.ghost`
 * (nombre del switch), `safety.unblock`, `safety.blocked`, `safety.unblocked`,
 * `profile.block`, `profile.report`, `notif.title`, `notif.markRead` y
 * `notif.markAllRead` (el botón del dataset sigue diciendo "Marcar todo leído";
 * el live usa su propio texto porque es una action del server).
 */
export const safetyCopy = {
  // Fantasma real (el banner del dataset sigue con `settings.ghostOn`).
  ghostLiveOn:
    'Fantasma: estás invisible. Tu perfil y tus bots no aparecen para los demás; vos sí los ves.',
  ghostLiveOff: 'Visible: tu perfil vuelve a aparecer en el descubrimiento de los demás.',
  ghostError: 'No se pudo cambiar la visibilidad ({code}).',
  ghostPending: 'Cambiando visibilidad…',

  // Bloqueos.
  block: 'Bloquear',
  blocked: 'Bloqueado',
  report: 'Reportar',
  blockBotOwner: 'Es un bot: el bloqueo se aplicó a su dueño ({owner}).',
  blockError: 'No se pudo bloquear ({code}).',
  unblockError: 'No se pudo desbloquear ({code}).',
  blockListTitle: 'Bloqueados',
  blockListEmpty: 'No bloqueaste a nadie en esta sesión.',
  blockListLiveHint:
    'Un bloqueo también oculta al otro lado y corta los pings y la escritura del chat.',

  // Reportes.
  reportNote:
    'El reporte se registra en el backend. No bloquea a la persona: para eso está "Bloquear".',
  reportDone: 'Reporte enviado. Gracias por avisar.',
  reportAlready: 'Ya reportaste este perfil en esta sesión.',
  reportError: 'No se pudo enviar el reporte ({code}).',
  reasonSpam: 'Spam',
  reasonHarassment: 'Acoso',
  reasonInappropriate: 'Contenido inapropiado',
  reasonImpersonation: 'Suplantación de identidad',
  reasonOther: 'Otro',

  // Reset propio (el global sigue fuera de la UI).
  resetSelf: 'Cerrar mi sesión y limpiar mis datos',
  resetSelfHint:
    'Cierra tu sesión de la demo y borra tus bloqueos, reportes y notificaciones. Volvés a elegir zona.',
  resetSelfConfirm:
    '¿Cerrar tu sesión y borrar tus bloqueos, reportes y notificaciones? El catálogo no se toca.',
  resetSelfDone: 'Sesión cerrada y datos propios borrados.',
  resetSelfError: 'No se pudo cerrar la sesión ({code}).',

  // Campana real.
  notifLive: 'Marcar todas como leídas',
  notifLiveHint:
    'Avisos guardados por el backend. El badge cuenta las no leídas de todo tu perfil.',
  notifUnread: '{count} sin leer',
  notifPing: 'Ping de {name}',
  notifMatch: 'Match con {name}',
  notifMessage: 'Mensaje de {name}',
  notifOpenPings: 'Ver bandeja',
  notifRead: 'Marcar leída',
  notifEmpty: 'Todavía no hay avisos en esta sesión.',
  notifError: 'No se pudieron leer las notificaciones ({code}).',

  // Errores por código (bloqueos y reportes).
  errorGuest: 'Sos invitado: no hay un perfil propio con el que hacer esto.',
  errorTarget: 'Ese perfil ya no está disponible.',
  errorValidation: 'El pedido no pasó la validación del server.',
  errorSession: 'La sesión se cerró: volvé a abrirla.',
  errorBlocked: 'Hay un bloqueo de por medio: no se puede hacer eso.',
  errorRate: 'Demasiadas acciones seguidas. Esperá un momento.',
  errorNetwork: 'No se pudo hablar con la API. Probá de nuevo.',
  errorGeneric: 'No se pudo completar la acción ({code}).',
} as const;

export type SafetyCopyKey = keyof typeof safetyCopy;

/** Interpolación `{param}` igual que `fmt()` y `liveText()`. */
export function safetyText(key: SafetyCopyKey, params: Record<string, string> = {}): string {
  const template = safetyCopy[key] as string;
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => params[name] ?? `{${name}}`);
}

/** Motivo del contrato → clave de copy del motivo. */
const REASON_KEYS = {
  spam: 'reasonSpam',
  harassment: 'reasonHarassment',
  inappropriate: 'reasonInappropriate',
  impersonation: 'reasonImpersonation',
  other: 'reasonOther',
} as const satisfies Record<string, SafetyCopyKey>;

export function reasonText(reason: keyof typeof REASON_KEYS): string {
  return safetyText(REASON_KEYS[reason]);
}
