/**
 * Copy del chat real.
 *
 * Vive acá y no en `demo/shared/copy.json` por la misma razón que `liveCopy`,
 * `pingsCopy` y `mapCopy`: el catálogo es la fuente del artefacto mock congelado
 * (Flutter + golden) y agregar claves mueve su `datasetId`. Estos textos son de
 * la conversación real, que no existe en ese artefacto.
 *
 * Lo que sí se reutiliza por `fmt()` es lo que ya estaba: `chat.typing`,
 * `chat.blockedNotice`, `chat.self.*`, `profile.report`, `profile.block`.
 */
export const chatCopy = {
  /** Etiqueta del tab principal. El overlay sigue siendo `pings` en el reducer. */
  navChat: 'Chat',
  title: 'Chat',

  segConversations: 'Conversaciones',
  hintConversations: 'Abrí una conversación para chatear. Los pings viven en Recibidos y Enviados.',
  segInbox: 'Recibidos',
  segSent: 'Enviados',

  tabMatches: 'Matches',
  matchesHint: 'Matches reales de esta sesión: abrí uno para conversar.',
  matchesEmpty:
    'Todavía no hay matches. Mandá un ping: en la demo los bots aceptan solos y la conversación aparece acá.',
  matchesEmptyCta: 'Buscar gente',
  matchNoMessages: 'Match creado. Todavía no hay mensajes.',
  matchYouPrefix: 'Vos: ',
  matchBotTag: 'bot',
  unreadA11y: '{count} mensajes sin leer',
  openChat: 'Abrir chat',
  opening: 'Abriendo…',

  conversationEmpty: 'Match creado. Escribí el primer mensaje.',
  botNote: 'Bot de la demo: responde solo con texto fijo.',
  loading: 'Cargando conversación…',
  loadingMore: 'Cargando mensajes…',
  loadMore: 'Cargar mensajes nuevos',
  refreshMatches: 'Actualizar',

  placeholder: 'Escribí un mensaje…',
  send: 'Enviar',
  sending: 'enviando…',
  failed: 'no se pudo enviar',
  retry: 'Reintentar',
  readError: 'No se pudieron marcar los mensajes como leídos ({code}).',

  errorBlocked: 'El chat está bloqueado con este perfil.',
  errorMatchNotFound: 'Ese match ya no existe.',
  errorMatchClosed: 'Ese match está cerrado.',
  errorValidation: 'El mensaje no es válido: escribí algo antes de enviar.',
  errorRate: 'Mandaste demasiados mensajes seguidos. Esperá un momento.',
  errorNetwork: 'No se pudo hablar con la API. Probá de nuevo.',
  errorSession: 'La sesión se cerró: volvé a abrirla para seguir chateando.',
  errorGeneric: 'No se pudo completar la acción ({code}).',
} as const;

export type ChatCopyKey = keyof typeof chatCopy;

/** Interpolación `{param}` igual que `fmt()`, `liveText()` y `pingText()`. */
export function chatText(key: ChatCopyKey, params: Record<string, string> = {}): string {
  const template = chatCopy[key] as string;
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => params[name] ?? `{${name}}`);
}
