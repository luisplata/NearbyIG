/**
 * GENERATED FILE — do not edit.
 *
 * Source: contract/openapi.yaml
 * Generator: openapi-typescript 7.13.0 (pinned exact in package.json)
 * Contract: x-contract-id 3225f7e3ecd7
 *
 * Type-only client: no runtime code and no imports. Regenerate with
 * `npm run contract:generate`. The drift gate is `npm run contract:generate:check`.
 */

export interface paths {
    "/auth/demo-session": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Abre una sesión demo
         * @description Abre una sesión demo en una región y ocupa un slot. Es la única operation
         *     pública del contrato: no hay sesión previa que presentar.
         */
        post: operations["createDemoSession"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/takeover": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Desaloja el slot demo de otra sesión y lo ocupa
         * @description La sesión que llama pasa a ocupar `(regionKey, demoSlot)`. Si el slot lo
         *     tenía otra sesión viva, esa sesión se revoca **en el acto**: su token deja
         *     de servir para todo (leer perfiles, pedir ticket, volver a entrar) y sus
         *     tickets de stream se queman. No hay gracia ni ventana de solapamiento: el
         *     índice único de slot vivo no admite dos ocupantes, y fingir que sí daría
         *     un estado que la base no puede sostener.
         *
         *     **No es un claim que "por suerte" desaloja.** Pedir un slot ocupado con
         *     `POST /auth/demo-session` sigue siendo `409 PROFILE_IN_USE`; desalojar
         *     exige nombrar el slot acá. El desalojo implícito no existe en el contrato.
         *
         *     **Slot libre: 200, no 409.** La postcondición de la operation es "la sesión
         *     que llama ocupa el slot", y esa postcondición se cumple igual si el slot
         *     estaba libre. `inUse` es una foto: entre que el selector lo pinta y el
         *     cliente toca "usar", el ocupante pudo hacer logout. Devolver 409 en ese
         *     caso convertiría una carrera benigna en un error que el cliente tiene que
         *     reintentar, y mentiría sobre el único código disponible: `PROFILE_IN_USE`
         *     significa "lo tiene otro y no pedí desalojarlo".
         *
         *     **Ya es mío: 409.** Si el slot lo ocupa la propia sesión que llama no hay
         *     nada que desalojar. Responder 200 "renovando" el token apagaría la
         *     credencial que el cliente está usando en ese mismo instante, así que el
         *     contrato declara el conflicto y el cliente conserva su token.
         *
         *     **Invitado → humano.** La operation es el camino natural para que un
         *     invitado (`demoSlot: null`) deje de serlo cuando se libera un slot: el
         *     invitado no tiene slot que desalojar, y su sesión de relleno se revoca como
         *     cualquier otra.
         *
         *     La región va en el body y tiene que ser la de la sesión: desalojar un slot
         *     de otra región es `403 REGION_MISMATCH`, no un cruce silencioso.
         */
        post: operations["takeoverDemoSlot"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/logout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Cierra la sesión demo
         * @description Libera el slot demo ocupado. Idempotente: cerrar una sesión ya cerrada no
         *     rompe nada. Hereda la seguridad global (`demoSession`).
         */
        post: operations["logoutSession"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/stream-ticket": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Emite un ticket de un solo uso para el stream
         * @description Emite `{ ticket, expiresAt }` con 30 s de vida y un solo uso. Existe porque
         *     `EventSource` no puede mandar headers: el ticket viaja en la query `ticket`
         *     de `GET /events` (S2) y en ningún otro lado. Hereda la seguridad global.
         */
        post: operations["createStreamTicket"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Abre el stream de eventos de la sesión (SSE)
         * @description Responde `text/event-stream` con un frame por evento: `id:` = envelope `id`,
         *     `event:` = su `type` y `data:` = el envelope en una línea JSON, terminado en
         *     línea vacía. Al abrir manda `retry: 5000`; sin `Last-Event-ID` arranca en
         *     vivo y con `Last-Event-ID` reenvía desde `seq + 1` sin duplicar el último
         *     entregado. El stream sólo entrega eventos de la región de la sesión.
         */
        get: operations["streamEvents"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/events/poll": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Pagina el log de eventos de la sesión
         * @description Misma secuencia que el stream desde el mismo cursor, con `limit` default 100
         *     y máximo 500. Sin `cursor` arranca desde el principio. Para cualquier cursor
         *     C, concatenar las páginas da exactamente el replay SSE desde C: mismos `id`,
         *     mismo orden, mismo `payload`. Una página vacía no avanza el cursor.
         */
        get: operations["pollEvents"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/demo/regions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Lista las regiones del catálogo
         * @description Dos filas: `mx` y `co`. Sin paginación (son dos) y sin geometría. Cada
         *     región trae la `zoneKey` por defecto con la que una sesión demo arranca.
         */
        get: operations["listDemoRegions"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/demo/zones": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Lista las zonas de una región
         * @description Proyecta cada zona a `ZoneSummary`: `zoneKey`, `nameKey` y `regionKey`.
         *     El polígono no sale por HTTP en ninguna forma — ni como GeoJSON, ni como
         *     pares `[lng, lat]`, ni como `center`. El cliente dibuja con datos que ya
         *     están en el bundle de la demo (S3), no con la respuesta.
         */
        get: operations["listDemoZones"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/demo/profiles": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Lista los perfiles de una región
         * @description Los 10 perfiles del catálogo de una región, ordenados por `demoSlot`. Cada
         *     fila es `ProfileSummary`: los 13 campos del dataset más `regionKey`,
         *     `demoSlot` y `sourceType`. El avatar se resuelve por `photoId`, no viaja.
         *
         *     Aislamiento regional: un `profileId` de `mx` no aparece en una respuesta de
         *     `co` ni al revés. Pedir una región distinta a la de la sesión es 403
         *     `REGION_MISMATCH`, no un catálogo vacío.
         *
         *     Los invitados no están en el catálogo: son sesión de relleno, no perfiles
         *     descubribles.
         */
        get: operations["listDemoProfiles"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/presence": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Registra la presencia de la sesión
         * @description Recibe **o** un `point` privado **o** una `demoZoneKey`, nunca los dos y
         *     nunca ninguno. El server resuelve región y zona contra el catálogo y
         *     devuelve `PresenceState`: `profileId`, `regionKey`, `zoneKey`, `online`,
         *     `visibility` y `fallbackRequired`.
         *
         *     `visibility` (opcional, desde v0.5) es `visible` o `ghost`. En `ghost` la
         *     sesión sigue online y sigue viendo, pero ni el humano ni sus dos bots
         *     aparecen en `GET /discovery` ni en el stream de los demás; el dueño se
         *     sigue viendo a sí mismo (sus bots incluidos). Omitir `visibility` conserva
         *     la vigente: el heartbeat de posición no saca a nadie de ghost.
         *
         *     Fuera de todo polígono no es un error: responde 200 con
         *     `fallbackRequired: true` y `zoneKey: null`, y el cliente ofrece el selector
         *     de zona demo. El fallback viaja en el body, no en un `Problem`.
         *
         *     El punto no se guarda ni se repite: entra, se resuelve y se descarta. Un
         *     segundo `PUT` reemplaza la presencia anterior (no acumula).
         *
         *     `demoZoneKey` de otra región es 422 `ZONE_UNKNOWN`: para el cliente esa zona
         *     no es una opción de esta sesión.
         */
        put: operations["updatePresence"];
        post?: never;
        /**
         * Apaga la presencia de la sesión
         * @description La sesión deja de aparecer en el descubrimiento de los demás y `online` pasa
         *     a `false` para quien la tenía en su lista, con un `profile.presence` por el
         *     stream. No borra el perfil: `GET /demo/profiles` lo sigue devolviendo.
         *
         *     **No es lo mismo que `visibility: ghost`.** Apagar la presencia retira al
         *     dueño y a sus bots para todos —incluido el dueño, que ya no tiene origen
         *     para `GET /discovery`—; ghost los retira sólo para los demás y mantiene la
         *     sesión viendo. Para "online pero invisible" es `PUT /presence` con
         *     `visibility: ghost`.
         *
         *     Es idempotente en el resultado pero no en el status: si no hay presencia
         *     viva —porque ya se borró o porque venció— responde 409 `PRESENCE_STALE` en
         *     vez de 204. El cliente que sale dos veces no debería inventar una sesión
         *     nueva por un 204 fantasma.
         */
        delete: operations["clearPresence"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/discovery": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Descubre perfiles cerca de la sesión
         * @description Perfiles de la región de la sesión que caen dentro de `radiusM` de la
         *     presencia registrada, ordenados por `distanceM` ascendente y desempatados
         *     por `profileId`.
         *
         *     Exclusiones, todas server-side: el propio perfil, los bloqueados, los
         *     pausados y los perfiles de otra región. No hay parámetro para pedir "todos":
         *     el aislamiento regional no se negocia con un query.
         *
         *     `distanceM` y `bearingDeg` los calcula el server desde la presencia y se
         *     redondean al metro y al grado, half-up. El cliente no recalcula: dos
         *     clientes con la misma sesión ven el mismo entero.
         *
         *     Sin filtros devuelve la región entera dentro del radio. `radiusM` fuera de
         *     200–5000 es 422, no un clamp.
         *
         *     En S1 y S2 el server responde 501 `NOT_IMPLEMENTED`: la operation existe en
         *     el contrato y se implementa en S3. El path existe, la implementación no.
         */
        get: operations["listDiscovery"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pings": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Lista la bandeja de pings
         * @description Los pings del perfil de la sesión, más nuevo primero (`createdAt`
         *     descendente). `box` elige el lado de la dirección:
         *
         *     * `inbox` — los que recibió (`toProfileId` = la sesión);
         *     * `sent` — los que envió (`fromProfileId` = la sesión).
         *
         *     Cada fila es `PingListItem`: el ping y la proyección del **otro** perfil
         *     (nickname, iniciales, foto e intención). Ni coordenadas ni distancias: la
         *     bandeja cuenta quién escribió, no dónde está.
         *
         *     **Vencimiento perezoso.** Antes de listar, el server marca `expired` los
         *     pendientes cuya hora pasó. El cliente no tiene que recalcular nada: si ve
         *     `pending`, todavía se puede aceptar.
         *
         *     Sin cursor: devuelve hasta las 100 más recientes (`maxItems` del schema).
         *     La demo no tiene volumen para paginar y un cursor inventado obligaría al
         *     cliente a un loop que no necesita.
         */
        get: operations["listPings"];
        put?: never;
        /**
         * Envía un ping a un perfil
         * @description Crea un ping del perfil de la sesión hacia `targetProfileId` y devuelve la
         *     fila con su estado. `201`, no `200`: el ping es un recurso nuevo con
         *     identidad propia.
         *
         *     **Destinatario.** Tiene que existir en la región de la sesión: un humano
         *     del catálogo o un bot con dueño vivo. Un `profileId` de otra región, uno
         *     inexistente y un bot cuyo dueño ya no tiene presencia son todos `404
         *     PROFILE_NOT_FOUND`: el ping no cruza regiones y un bot sin presencia no
         *     está.
         *
         *     **Uno pendiente por par dirigido.** `A → B` y `B → A` son dos pings
         *     distintos, pero `A → B` no puede tener dos pendientes a la vez: el segundo
         *     es `409 PING_DUPLICATE` y el cliente muestra "ya le mandaste un ping". La
         *     carrera la resuelve un índice único parcial, no un chequeo previo.
         *
         *     **Vencimiento.** Si el par tenía un pendiente que ya venció, la respuesta
         *     es `410 PING_EXPIRED`: el anterior quedó cerrado y el cliente reintenta para
         *     crear uno nuevo. Devuelve `410` y no `409` porque el ping que estorba ya no
         *     existe como pendiente: lo que se perdió es la ventana, no el derecho.
         *
         *     **Bot.** Un bot acepta solo. El ping vuelve ya `accepted`, con `matchId` y
         *     sin que ningún humano toque nada: es el camino que hace que la demo se
         *     sienta viva.
         *
         *     **Bloqueo (v0.5).** Si el emisor bloqueó al destinatario, o el destinatario
         *     bloqueó al emisor, el ping es `403 CHAT_BLOCKED`. El mensaje no dice quién
         *     bloqueó a quién: para el bloqueado, el otro simplemente dejó de existir.
         *     Bloquear un bot bloquea a su dueño, así que el caso del bot cae en la misma
         *     regla.
         *
         *     **Cuota.** Hay un tope de envíos por ventana. Superarlo es `429
         *     RATE_LIMITED`: el pedido está bien, falta cuota.
         */
        post: operations["createPing"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pings/{pingId}/accept": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Acepta un ping y crea el match
         * @description Sólo el destinatario (`toProfileId`) puede aceptar. El ping pasa a
         *     `accepted` y nace un `Match` —uno por par, no uno por ping— que se devuelve
         *     en el `200`.
         *
         *     **Idempotencia explícita.** Repetir el accept de un ping ya resuelto es
         *     `409 PING_RESOLVED`, no un `200` con el match: el cliente tiene que saber
         *     que su acción no cambió nada. Aun así, la base garantiza que no haya un
         *     segundo match para el mismo par: el único lo impone la tabla, no la
         *     aplicación.
         *
         *     Si el ping venció antes de llegar la aceptación, es `410 PING_EXPIRED` y no
         *     se crea match.
         */
        post: operations["acceptPing"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pings/{pingId}/reject": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Rechaza un ping
         * @description Sólo el destinatario puede rechazar. El ping pasa a `rejected` y **no se
         *     crea match**: `204`, sin body, porque no hay recurso nuevo que devolver.
         *
         *     Mismas guardas que aceptar: `403` si el ping no es tuyo, `404` si no
         *     existe, `410` si venció y `409` si ya estaba resuelto. Rechazar dos veces
         *     no es un `204` silencioso: es `409 PING_RESOLVED`, para que el cliente
         *     sepa que el segundo toque no hizo nada.
         */
        post: operations["rejectPing"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/matches": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Lista los matches de la sesión
         * @description Los matches del perfil de la sesión —y sólo los suyos— con la proyección
         *     del otro lado y el estado de la conversación. El más reciente primero.
         *
         *     Cada fila es `MatchListItem { match, peer, lastMessage, unreadCount }`: el
         *     `peer` es el otro perfil (humano o bot, con la misma forma que la bandeja
         *     de pings) y `unreadCount` cuenta los mensajes del otro lado posteriores a
         *     tu última lectura. Un match recién aceptado viene con `lastMessage: null` y
         *     `unreadCount: 0`.
         *
         *     **Sólo el perfil de la sesión.** Un match entre otro humano y un bot —aun
         *     cuando el bot sea de tu propiedad— no es tuyo y no aparece: la lista es de
         *     conversaciones propias, no del mundo visible.
         *
         *     Sin cursor: hasta los 100 matches más recientes (`maxItems`). La demo tiene
         *     un match por par y no necesita paginar.
         */
        get: operations["listMatches"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/matches/{matchId}/messages": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Lee la conversación de un match
         * @description Los mensajes del match, en orden **cronológico ascendente** (el más viejo
         *     primero) y paginados con un cursor opaco.
         *
         *     **Quién puede leer.** Sólo los dos lados del match. Desde una sesión ajena
         *     el match existe pero la conversación no es suya: `403 CHAT_BLOCKED`. Un
         *     `matchId` de otra región es `404 MATCH_NOT_FOUND`.
         *
         *     **Paginación.** Sin `cursor` devuelve la primera página (hasta 100
         *     mensajes). Con el `nextCursor` de la página anterior devuelve lo que sigue;
         *     `null` y `hasMore: false` significan que la conversación se terminó. El
         *     cursor es opaco: el cliente no lo parsea ni lo construye, sólo lo repite.
         *
         *     **Un match cerrado se puede leer.** La conversación vieja queda legible; lo
         *     que no se puede es escribir (`409 MATCH_CLOSED`).
         */
        get: operations["listMessages"];
        put?: never;
        /**
         * Envía un mensaje al match
         * @description Escribe en la conversación del match como el perfil de la sesión y devuelve
         *     el mensaje persistido con `201`.
         *
         *     **Idempotencia.** `clientMessageId` es la clave: es única por `(match,
         *     emisor)`. Reintentar el mismo pedido devuelve **el mismo** `Message` —mismo
         *     `id`, mismo `createdAt`— y no crea una segunda fila ni un segundo evento.
         *     Es lo que hace que un doble toque o un reintento de red no dupliquen el
         *     mensaje.
         *
         *     **Validación.** `body` vacío o sólo espacios, un `clientMessageId` ausente
         *     o un campo de más es `422 VALIDATION_FAILED`. El server recorta los bordes
         *     del texto antes de guardarlo.
         *
         *     **Un match cerrado no acepta mensajes.** Si el otro lado ya no existe (un
         *     bot cuyo dueño se fue de la demo, un perfil regenerado), la conversación
         *     queda legible pero escribir es `409 MATCH_CLOSED`.
         *
         *     **El bot responde solo.** Si el otro lado es un bot, el server agenda su
         *     respuesta (~2 s) y emite `typing.started` y `message.created` en el stream.
         *     El cliente no simula nada: el mismo camino sirve para humano y bot.
         *
         *     **Cuota.** Hay un tope de mensajes por ventana: superarlo es `429
         *     RATE_LIMITED`.
         */
        post: operations["sendMessage"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/matches/{matchId}/read": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Marca leída la conversación
         * @description Marca como leídos los mensajes **del otro lado** en este match. `204`, sin
         *     body: no hay recurso nuevo que devolver y el efecto se lee en
         *     `GET /matches`.
         *
         *     **Idempotente por resultado.** Repetirlo deja el mismo estado
         *     (`unreadCount: 0`) y no es un error: marcar leído dos veces no miente sobre
         *     nada, a diferencia de aceptar dos veces un ping.
         *
         *     **Un match cerrado se puede marcar leído.** El badge tiene que poder
         *     apagarse aunque ya no se pueda responder.
         */
        post: operations["markMatchRead"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Devuelve el perfil de la propia sesión
         * @description El perfil que encarna la sesión —el que el tab Perfil muestra como "yo"—
         *     con la forma de `SelfProfile`: la identidad (`profileId`, `regionKey`,
         *     `demoSlot`, `sourceType`) y la fila de display del catálogo (nickname,
         *     iniciales, intención, foto, Instagram, clave de estado).
         *
         *     **No es el dataset.** El `self` de `fixtures.json` es el perfil de la demo
         *     mock; acá sale la fila del catálogo que la sesión reclamó, así que dos
         *     navegadores en slots distintos ven cada uno el suyo.
         *
         *     **Un invitado no tiene perfil.** Cuando los 10 slots están ocupados, la
         *     sesión es de relleno: no existe fila de catálogo y el nickname, la foto y el
         *     handle no se pueden inventar. La respuesta es `404 PROFILE_NOT_FOUND`, el
         *     mismo código que un perfil borrado por un seed nuevo: la credencial sirve,
         *     el recurso no está.
         *
         *     **Sin `distanceM`/`bearingDeg` ni `online`.** El perfil propio no se mide
         *     contra sí mismo y la sesión está viva por definición.
         */
        get: operations["getSelfProfile"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/blocks": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Lista los perfiles que bloqueó la sesión
         * @description Los bloqueos propios, más reciente primero, cada uno con la proyección
         *     pública del otro perfil (`PingPeer`) y la fecha en que se creó.
         *
         *     Es una lista de **lo que yo bloqueé**, no de quién me bloqueó: el bloqueo
         *     ajeno es invisible para el bloqueado, que sólo nota el efecto (deja de
         *     aparecer y sus pings reciben `403 CHAT_BLOCKED`).
         *
         *     Un perfil que ya no está en el catálogo no se lista, pero el bloqueo sigue
         *     en la base y se revierte con `DELETE`.
         */
        get: operations["listBlocks"];
        put?: never;
        /**
         * Bloquea un perfil
         * @description Crea el bloqueo de la sesión contra `profileId` y devuelve el bloqueo
         *     canonizado con `201`.
         *
         *     Es **idempotente**: repetirlo sobre un par ya bloqueado devuelve el mismo
         *     `Block` con el `createdAt` original y no crea una segunda fila. Por eso no
         *     hay `409` de duplicado: bloquear dos veces es la misma intención, no un
         *     conflicto.
         *
         *     Bloquearse a sí mismo es `422 VALIDATION_FAILED`. Un bot se canoniza a su
         *     dueño; un `profileId` inexistente en la región es `404 PROFILE_NOT_FOUND`.
         */
        post: operations["createBlock"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/blocks/{profileId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Revierte el bloqueo de un perfil
         * @description Borra el bloqueo propio contra `profileId` y responde `204`.
         *
         *     Es **idempotente en el resultado**: si el par no estaba bloqueado, también
         *     es `204`. No hay `404` por "no había nada que borrar" porque el cliente que
         *     desbloquea dos veces (doble toque, reintento) no tiene que distinguir un
         *     no-op de un error.
         *
         *     `profileId` se canoniza igual que en `POST`: desbloquear un bot revierte el
         *     bloqueo de su dueño. Un invitado de relleno recibe `403 PROFILE_REQUIRED`.
         */
        delete: operations["deleteBlock"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/reports": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Registra un reporte contra un perfil
         * @description Guarda el reporte de la sesión contra `profileId` con uno de los motivos
         *     del enum y devuelve `202` con el acuse.
         *
         *     Reportar **no bloquea ni oculta** al reportado: para eso está
         *     `POST /blocks`, que es una decisión distinta y con efecto inmediato. El
         *     reporte tampoco cambia el descubrimiento de quien reporta.
         *
         *     Un bot se canoniza a su dueño: el reporte nombra a la persona, igual que el
         *     bloqueo. Reportarse a sí mismo es `422 VALIDATION_FAILED`.
         */
        post: operations["createReport"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/notifications": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Lista las notificaciones de la sesión
         * @description Hasta 100 notificaciones del perfil de la sesión, más reciente primero, con
         *     `unreadCount` sobre **todas** las del perfil (no sólo las de la página).
         *
         *     La lista es una proyección de perfiles: una notificación cuyo otro extremo
         *     ya no está en el catálogo no se dibuja. El contador de no leídas se cuenta
         *     sobre la tabla, no sobre las filas proyectadas, para que el badge no mienta
         *     por un filtro de presentación.
         */
        get: operations["listNotifications"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/notifications/read": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Marca notificaciones como leídas
         * @description Marca leídas **todas** las no leídas del perfil (sin body o con
         *     `notificationIds` ausente) o **sólo las nombradas** (`notificationIds`).
         *     Devuelve cuántas se marcaron y cuántas quedan.
         *
         *     Es idempotente por resultado: la segunda llamada devuelve `marked: 0` y el
         *     mismo `unreadCount`. Un id ajeno o inexistente se ignora —la operación ya
         *     está acotada al perfil de la sesión—; un body mal formado es 422.
         */
        post: operations["readNotifications"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /**
         * @description Sesión demo abierta. `demoSlot` es la identidad del slot (1..10) y la clave
         *     natural para que los seeds sean idempotentes en S1.
         *
         *     Invariante: `demoSlot == null` si y sólo si `sourceType == guest`. Un invitado
         *     no ocupa slot; un humano o un bot siempre ocupa uno.
         */
        DemoSession: {
            /** @description JWT corto. Viaja sólo en el header `Authorization`. */
            token: string;
            /**
             * Format: date-time
             * @description Vencimiento del JWT, RFC 3339 en UTC.
             */
            expiresAt: string;
            regionKey: components["schemas"]["RegionKey"];
            /** @description Identidad del perfil dentro de la región; `(regionKey, profileId)` es la identidad global. */
            profileId: string;
            /** @description Slot demo ocupado (1..10), o `null` para invitados. */
            demoSlot: number | null;
            sourceType: components["schemas"]["SourceType"];
        } & (unknown & unknown);
        /**
         * @description Pedido de sesión demo. Sin body el server elige la región por defecto y el
         *     primer slot libre. Un slot ya reclamado responde 409 `PROFILE_IN_USE`
         *     (declarado en PR2, con el catálogo de errores).
         */
        DemoSessionRequest: {
            regionKey?: components["schemas"]["RegionKey"];
            /** @description Slot pedido explícitamente (1..10). Omitirlo deja que el server elija. */
            demoSlot?: number;
        };
        /**
         * @description Pedido **explícito** de takeover: la sesión que llama pasa a ocupar el slot
         *     pedido, desalojando a quien lo tenga.
         *
         *     Los dos campos son obligatorios y no hay default. Un takeover "del que esté
         *     libre" o "del primero" sería un desalojo implícito elegido por el server, y
         *     el contrato no permite eso: el cliente nombra el slot que quiere.
         *
         *     El slot es el mismo espacio que `DemoSessionRequest.demoSlot` (1..10 por
         *     región), así que `(regionKey, demoSlot)` identifica al ocupante sin pedir su
         *     `profileId` y sin abrir la puerta a desalojar un perfil de otra región.
         */
        TakeoverRequest: {
            regionKey: components["schemas"]["RegionKey"];
            /** @description Slot demo que se quiere ocupar (1..10). */
            demoSlot: number;
        };
        /**
         * @description Ticket de un solo uso para abrir `GET /events` (S2) en la query `ticket`.
         *     Vive 30 s, no se loguea y no viaja en el payload de ningún evento.
         */
        StreamTicket: {
            /** @description Valor opaco. Se consume al abrir el stream; reusarlo es 401 `TICKET_REUSED`. */
            ticket: string;
            /**
             * Format: date-time
             * @description Vencimiento absoluto, RFC 3339 en UTC.
             */
            expiresAt: string;
        };
        /**
         * @description Forma única de evento, idéntica en `data:` del SSE y en `events[]` del
         *     polling. `id` = `<regionKey>:<seq:012d>`; stream y poll de una región nunca
         *     entregan el prefijo de otra.
         */
        EventEnvelope: {
            /**
             * @description `<regionKey>:<seq>` con `seq` de 12 dígitos, monotónico por región. El
             *     cliente sólo parsea el sufijo para deduplicar; el resto es opaco.
             * @example mx:000000000042
             */
            id: string;
            type: components["schemas"]["EventType"];
            /**
             * @description RFC 3339 UTC con milisegundos y sufijo `Z`. **Informativo: no ordena.** Dos
             *     eventos con este campo invertido siguen ordenados por `seq`.
             * @example 2026-11-12T18:00:00.000Z
             */
            occurredAt: string;
            payload: components["schemas"]["EventPayload"];
        };
        /**
         * @description Cuerpo por `type`. La unión cubre hoy los seis tipos del enum: los dos de S2
         *     (`profile.moved`, `profile.presence`) y los cuatro de S4/S5, que se declaran
         *     ahora para que el cliente no cambie de unión cuando S4 los emita. Ningún
         *     payload lleva coordenadas: `profile.moved` usa `distanceM`/`bearingDeg` como el
         *     resto del sistema.
         */
        EventPayload: components["schemas"]["ProfileMovedPayload"] | components["schemas"]["ProfilePresencePayload"] | components["schemas"]["PingReceivedPayload"] | components["schemas"]["MatchCreatedPayload"] | components["schemas"]["MessageCreatedPayload"] | components["schemas"]["TypingStartedPayload"];
        /**
         * @description Nombre del evento, cerrado a estos seis. El enum y los seis payloads entran
         *     completos ahora aunque S2 sólo emita los dos primeros: S4/S5 agregan campos a
         *     su payload, no tipos ni uniones nuevas, así que el cliente no cambia.
         * @enum {string}
         */
        EventType: "profile.moved" | "profile.presence" | "ping.received" | "match.created" | "message.created" | "typing.started";
        /**
         * @description Página de polling. Tres campos planos a propósito: `Page` es metadata y
         *     `allOf` + `additionalProperties: false` bloquearía los hermanos. No hay
         *     `truncated`: `hasMore` ya dice si queda algo y `nextCursor` es el `id` del
         *     último entregado — una página vacía lo devuelve igual al recibido.
         */
        EventsPage: {
            events: components["schemas"]["EventEnvelope"][];
            /**
             * @description Cursor de la próxima página: el `id` del último evento entregado. `null`
             *     sólo cuando no se recibió cursor y la página salió vacía.
             */
            nextCursor: string | null;
            /** @description Si quedan eventos después de esta página. */
            hasMore: boolean;
        };
        /** @description El perfil se movió. Distancia y rumbo relativos a quien recibe. */
        ProfileMovedPayload: {
            /** @description Id del perfil dentro de la región (la región la da el `id`). */
            profileId: string;
            /** @description Distancia en metros, ya calculada por el server. */
            distanceM: number;
            /** @description Rumbo en grados desde el norte, sentido horario. */
            bearingDeg: number;
        };
        /** @description El perfil cambió de estado de presencia. No hay coordenadas ni zona. */
        ProfilePresencePayload: {
            profileId: string;
            /** @description Nunca null. */
            online: boolean;
        };
        /**
         * @description Alguien hizo ping a la sesión. `expiresAt` es lo que hace que el ping se pueda
         *     vencer (`PING_EXPIRED`): llega con el evento para que el cliente apague el
         *     botón sin adivinar el TTL.
         */
        PingReceivedPayload: {
            /** @description Id del ping, único por región. */
            pingId: string;
            /** @description Perfil que hizo el ping (la región la da el `id` del envelope). */
            profileId: string;
            /** @description RFC 3339 UTC con milisegundos, igual que `occurredAt`. */
            expiresAt: string;
        };
        /** @description El ping fue aceptado y hay match. Sin coordenadas ni mensajes. */
        MatchCreatedPayload: {
            /** @description Id del match; es lo que referencian los mensajes. */
            matchId: string;
            /** @description La otra parte del match. */
            profileId: string;
        };
        /**
         * @description Mensaje nuevo en un match. El cuerpo del mensaje no viaja acá a propósito: el
         *     evento avisa que hay algo nuevo y el cliente lo pide con el `messageId`.
         */
        MessageCreatedPayload: {
            matchId: string;
            messageId: string;
            /** @description Quién escribió; la sesión se reconoce por su propio `profileId`. */
            senderProfileId: string;
        };
        /** @description La otra parte está escribiendo. Efímero: no se persiste ni se replica. */
        TypingStartedPayload: {
            matchId: string;
            profileId: string;
        };
        /**
         * @description Motivo del error, cerrado a estos 23 valores. `code` es el discriminante
         *     estable: el cliente decide con él, nunca con `title` ni con `detail` (esos
         *     son texto para humanos, traducible y variable).
         *
         *     No existe código 400: un cursor malformado es `VALIDATION_FAILED` (422) y uno
         *     fuera de retención es `CURSOR_EXPIRED` (410). La tabla completa —cuándo
         *     corresponde cada uno— vive en la spec del change.
         * @enum {string}
         */
        ErrorCode: "UNAUTHENTICATED" | "TICKET_EXPIRED" | "TICKET_REUSED" | "REGION_MISMATCH" | "CHAT_BLOCKED" | "PING_FORBIDDEN" | "PROFILE_REQUIRED" | "PROFILE_NOT_FOUND" | "MATCH_NOT_FOUND" | "PING_NOT_FOUND" | "PROFILE_IN_USE" | "PRESENCE_STALE" | "PING_DUPLICATE" | "PING_RESOLVED" | "MATCH_CLOSED" | "CURSOR_EXPIRED" | "PING_EXPIRED" | "RATE_LIMITED" | "REGION_UNAVAILABLE" | "ZONE_UNKNOWN" | "VALIDATION_FAILED" | "INTERNAL" | "NOT_IMPLEMENTED";
        /**
         * @description Cuerpo único de error, RFC 9457 (`application/problem+json`). Toda respuesta
         *     4xx/5xx del contrato devuelve exactamente esto: un shape cerrado, sin campos
         *     por operation, así el cliente tiene un solo parser de errores.
         *
         *     `type` y `title` son estables y traducibles sólo uno de los dos a la vez:
         *     `type` identifica el problema para el código del cliente, `title` es el copy
         *     —el server lo devuelve ya resuelto en el idioma de la sesión, igual que
         *     `KeyLabel.label`— y `detail` explica esta ocurrencia concreta (qué campo,
         *     qué slot). `requestId` es el único dato que se usa para reportar el bug.
         */
        Problem: {
            /**
             * Format: uri
             * @description URI que identifica el tipo de problema, estable entre ocurrencias. Con
             *     `about:blank` el problema es exactamente lo que dice el status HTTP.
             * @example about:blank
             */
            type: string;
            /** @description Resumen corto del status, listo para mostrar. No se decide con él. */
            title: string;
            /**
             * @description Status HTTP, repetido en el body para que un log o un proxy que se come el
             *     header igual conserve el dato. Debe coincidir con `ErrorCode.x-status`.
             */
            status: number;
            code: components["schemas"]["ErrorCode"];
            /**
             * @description Identificador de la request. El cliente lo reporta tal cual: es lo que
             *     permite encontrar el log de esa ocurrencia sin adivinar por timestamp.
             */
            requestId: string;
            /**
             * @description Explicación de esta ocurrencia, en el idioma de la sesión. Puede venir
             *     vacía cuando no hay nada útil que agregar al `title`.
             */
            detail: string;
        };
        /**
         * @description Fila de copy ya resuelta por el server: `key` estable para tests y `label` en
         *     el idioma de la sesión. El cliente nunca resuelve claves de i18n por su cuenta.
         */
        KeyLabel: {
            /** @description Clave del dataset (`copy.*`), estable entre regiones. */
            key: string;
            /** @description Texto listo para mostrar. */
            label: string;
        };
        /**
         * @description Metadatos de paginación por cursor. No envuelve el array a propósito: la
         *     proyección concreta (`EventsPage` en S2) declara sus tres campos planos,
         *     porque `allOf` + `additionalProperties: false` bloquea los campos hermanos
         *     y convierte la composición en una trampa.
         */
        Page: {
            /**
             * @description Cursor de la próxima página (`null` cuando no hay más). En eventos es el
             *     `id` del último envelope entregado; una página vacía no lo mueve.
             */
            nextCursor: string | null;
            /** @description Si quedan páginas después de esta. */
            hasMore: boolean;
        };
        /**
         * @description Fila del catálogo de regiones. `defaultZoneKey` existe para que la sesión
         *     demo tenga una zona concreta sin que el cliente elija: el flujo no tiene
         *     selector de país, la región se deriva de la sesión.
         */
        Region: {
            regionKey: components["schemas"]["RegionKey"];
            /**
             * @description Clave de copy (`region.mx`), estable entre idiomas.
             * @example region.mx
             */
            nameKey: string;
            /**
             * @description `zoneKey` de la zona por defecto de la región. Tiene que existir en
             *     `contract/catalog/zones.json`; el test de geometría lo verifica.
             * @example cdmx
             */
            defaultZoneKey: string;
        };
        /**
         * @description ISO 3166-1 alpha-2 en minúscula (`mx`, `co`). Este schema fija la forma; el
         *     catálogo de regiones (`contract/catalog/regions.json`) es la fuente de
         *     verdad y vive fuera del spec, así que agregar una región no renombra nada acá.
         * @example mx
         */
        RegionKey: string;
        /**
         * @description Respuesta de `GET /demo/regions`. Objeto con un array adentro, no array
         *     pelado: es el mismo idioma que `EventsPage` (un sobre chico y cerrado deja
         *     lugar a metadata sin romper el shape).
         */
        RegionList: {
            regions: components["schemas"]["Region"][];
        };
        /**
         * @description Origen del perfil o de la sesión. `guest` es la sesión de relleno que se abre
         *     cuando los 10 slots de una región están tomados: no tiene `demoSlot`.
         * @enum {string}
         */
        SourceType: "human" | "bot" | "guest";
        /** @description Respuesta de `GET /demo/zones`: las zonas de una sola región. */
        ZoneList: {
            zones: components["schemas"]["ZoneSummary"][];
        };
        /**
         * @description Proyección pública de una zona: `zoneKey`, `nameKey` y `regionKey`. Nada
         *     más. El polígono, el centro y cualquier coordenada se quedan en el catálogo
         *     (`contract/catalog/zones.json`) y son inalcanzables desde este schema: no
         *     hay propiedad que los nombre ni `$ref` que los traiga.
         */
        ZoneSummary: {
            /**
             * @description Clave estable de la zona (`cdmx`, `bogota`).
             * @example cdmx
             */
            zoneKey: string;
            /**
             * @description Clave de copy (`zone.cdmx`).
             * @example zone.cdmx
             */
            nameKey: string;
            regionKey: components["schemas"]["RegionKey"];
        };
        /**
         * @description Género declarado del perfil. Son los tres valores del dataset
         *     (`demo/shared/fixtures.json` → `filters.genders`) y las tres tienen que
         *     aparecer en cada región del catálogo. No hay `other` ni `prefer not to say`:
         *     lo que no cae en estos tres valores no viaja.
         * @enum {string}
         */
        Gender: "female" | "male" | "nonbinary";
        /**
         * @description Intención con la que el perfil abrió la demo (`filters.intentions` del
         *     dataset). El filtro de descubrimiento de S3 usa el mismo enum: agregar un
         *     valor es un cambio de vocabulario, no un parámetro nuevo de un endpoint.
         * @enum {string}
         */
        Intention: "networking" | "friendship" | "activities";
        /**
         * @description Respuesta de `GET /demo/profiles`: los perfiles de **una** región, en orden
         *     de `demoSlot`. Objeto con array adentro, no array pelado: mismo idioma que
         *     `RegionList`, `ZoneList` y `EventsPage`.
         */
        ProfileList: {
            profiles: components["schemas"]["ProfileSummary"][];
        };
        /**
         * @description Fila del catálogo tal como viaja por HTTP. `(regionKey, profileId)` es la
         *     identidad global: el mismo `profileId` puede existir en `mx` y en `co` sin ser
         *     el mismo perfil, y ningún response puede mezclar regiones.
         *
         *     Invariante: `demoSlot == null` si y sólo si `sourceType == guest`. Las 20
         *     filas del catálogo son `human` con `demoSlot` 1..10; un invitado no ocupa
         *     slot y no aparece en el catálogo.
         *
         *     Los 13 campos del dataset son 1:1 con `fixtures.json`: si un valor del
         *     catálogo no coincide, el gate de paridad falla nombrando perfil y campo.
         */
        ProfileSummary: {
            /**
             * @description Identidad del perfil dentro de su región. Único por región y estable: es
             *     lo que referencian los eventos (`payload.profileId`) y los matches de S4.
             * @example mx-p01
             */
            profileId: string;
            regionKey: components["schemas"]["RegionKey"];
            /**
             * @description Slot demo ocupado (1..10), único por región. Es la clave natural de los
             *     seeds de S1 (`region_key + demo_slot`). `null` sólo para invitados.
             */
            demoSlot: number | null;
            sourceType: components["schemas"]["SourceType"];
            /**
             * @description Nombre visible del perfil, ya resuelto (no es una clave de copy).
             * @example Vale
             */
            nickname: string;
            /**
             * @description Dos letras para el avatar de respaldo cuando no hay foto.
             * @example VA
             */
            initials: string;
            intention: components["schemas"]["Intention"];
            gender: components["schemas"]["Gender"];
            /** @description Si el perfil pasó la verificación de la demo. Nunca `null`. */
            verified: boolean;
            /**
             * @description Presencia del último heartbeat. Es estado, no evento: los cambios llegan
             *     por `profile.presence` en S2. Nunca `null`.
             */
            online: boolean;
            /**
             * @description Ocupación del slot en el momento de la respuesta: `true` si existe una
             *     sesión demo viva ocupando `(regionKey, demoSlot)`.
             *
             *     Es el dato que hace que el selector de perfiles muestre "en uso" sin
             *     intentar un claim y comer un 409. La consistencia la garantiza el índice
             *     único parcial de `sessions` (una sola sesión viva por slot), no el server:
             *     `inUse: true` es exactamente la condición que haría fallar un
             *     `POST /auth/demo-session` sobre ese slot.
             *
             *     No viene del seed y no se persiste: es estado, igual que `online`.
             *     Cancelar la sesión (logout, reset o takeover) lo vuelve a `false`.
             */
            inUse: boolean;
            /**
             * @description Distancia a la sesión en metros. En el seed sale del dataset; en runtime
             *     (S2) la calcula el server. Nunca se serializa como coordenada.
             */
            distanceM: number;
            /**
             * @description Rumbo en grados desde la sesión (0 = norte, sentido horario). Junto con
             *     `distanceM` ubica al perfil sin exponer latitud ni longitud.
             */
            bearingDeg: number;
            /**
             * @description Id de la foto en el bundle de la demo (`ph01`…`ph10`). El avatar se
             *     resuelve por este id: no hay objeto `avatar` en el contrato.
             * @example ph01
             */
            photoId: string;
            /**
             * @description Handle de Instagram de la demo, sin `@`. Sólo se revela tras el match.
             * @example vale.works
             */
            instagramHandle: string;
            /**
             * @description Clave de copy del estado (`status.p01`). El texto lo resuelve el server.
             * @example status.p01
             */
            statusKey: string;
            /**
             * @description Clave de copy de la bio (`bio.p01`). El texto lo resuelve el server.
             * @example bio.p01
             */
            bioKey: string;
        } & (unknown & unknown);
        /**
         * @description Perfil de la propia sesión. Declara exactamente los campos que el dataset
         *     guarda en `fixtures.self` más la identidad (`regionKey`, `demoSlot`,
         *     `sourceType`): el self no aparece en su propio resultado de descubrimiento,
         *     así que no lleva `distanceM`, `bearingDeg` ni `online`, y el dataset tampoco
         *     le da `gender`, `verified` ni `bioKey`.
         *
         *     No tiene consumer en S1–S3 (no hay `GET /me`): se declara para que Sprint 1
         *     no lo invente con otro nombre ni con alias.
         */
        SelfProfile: {
            /** @description Identidad del perfil propio dentro de su región. */
            profileId: string;
            regionKey: components["schemas"]["RegionKey"];
            /** @description Slot demo de la sesión; `null` para invitados. */
            demoSlot: number | null;
            sourceType: components["schemas"]["SourceType"];
            /** @description Nombre visible propio, ya resuelto. */
            nickname: string;
            /** @description Iniciales para el avatar de respaldo. */
            initials: string;
            intention: components["schemas"]["Intention"];
            /** @description Id de la foto propia en el bundle de la demo. */
            photoId: string;
            /** @description Handle de Instagram propio, sin `@`. */
            instagramHandle: string;
            /** @description Clave de copy del estado propio. */
            statusKey: string;
        };
        /**
         * @description Respuesta de `PUT /presence`: la presencia **proyectada**, sin coordenadas.
         *     `regionKey` y `zoneKey` son lo que el server derivó del punto o de la
         *     `demoZoneKey`; el punto queda en el server y no se repite en ningún response.
         *
         *     `fallbackRequired` es el fallback del flujo, no un error: `true` cuando el
         *     punto cayó fuera de todo polígono del catálogo y el server no pudo derivar
         *     zona. En ese caso la presencia queda en la región de la sesión con
         *     `zoneKey: null` y el cliente muestra el selector de zona demo. Por eso el
         *     fallback viaja acá y **no** en el `Problem` de un 422: no falló el pedido,
         *     falló la derivación, y el cliente tiene una acción concreta que ofrecer.
         *
         *     Invariante: `zoneKey == null` si y sólo si `fallbackRequired == true`.
         *
         *     `visibility` es la vigente después del `PUT`: `ghost` deja la sesión online
         *     pero fuera del descubrimiento y del stream de los demás (sus bots incluidos),
         *     sin apagar la sesión. `online` sigue siendo `true` en ghost: la presencia
         *     existe; lo que cambia es a quién se le muestra.
         */
        PresenceState: {
            /**
             * @description Perfil de la sesión. Es `(regionKey, profileId)` la identidad global, así
             *     que el par no se separa en ningún response.
             * @example mx-p03
             */
            profileId: string;
            regionKey: components["schemas"]["RegionKey"];
            /**
             * @description Zona derivada, o `null` cuando `fallbackRequired` es `true`. Nunca es
             *     `null` con un punto válido: si el punto cayó adentro de un polígono, hay
             *     zona.
             * @example cdmx
             */
            zoneKey: string | null;
            /**
             * @description Presencia activa de la sesión. Se apaga con `DELETE /presence`; los
             *     cambios de presencia ajena llegan por `profile.presence`, no por acá.
             *
             *     `ghost` **no** apaga `online`: una sesión en ghost sigue viva y sigue
             *     viendo; lo que no hace es mostrarse. `online: false` sólo llega por
             *     `DELETE /presence` o por vencimiento del TTL.
             */
            online: boolean;
            visibility: components["schemas"]["Visibility"];
            /**
             * @description `true` = el punto no cae en ninguna zona del catálogo y el cliente tiene
             *     que ofrecer el selector de zona. `false` = la zona se derivó.
             */
            fallbackRequired: boolean;
        } & (unknown & unknown);
        /**
         * @description Filtros de `GET /discovery`, todos opcionales: sin filtros devuelve la región
         *     entera que cae dentro del radio. Se declara acá como objeto (para el cliente
         *     generado y para el contrato legible) **y** como parámetros de query en
         *     `paths/discovery.yaml` (que es lo que OpenAPI necesita para validarlos). Un
         *     test exige que las dos listas coincidan en nombre, tipo, borde, `default` y
         *     `enum`: la copia que sobra es la que se desincroniza.
         *
         *     Los nombres son los del dataset (`intention`, no `intent`; `radiusM`, no
         *     `distance`): un alias obliga al cliente a traducir y al server a mantener dos
         *     vocabularios.
         */
        DiscoveryQuery: {
            /**
             * @description Radio en metros, medido desde la presencia de la sesión. El rango es el
             *     del dataset (`distanceM` 200–5000) y el default cubre la demo entera.
             *     Fuera de rango es 422 `VALIDATION_FAILED`, no un clamp silencioso.
             * @default 5000
             */
            radiusM: number;
            intention?: components["schemas"]["Intention"];
            gender?: components["schemas"]["Gender"];
            /** @description Si se pide sólo perfiles verificados (`true`) o no se filtra (ausente). */
            verified?: boolean;
            /** @description Si se pide sólo perfiles online (`true`) o no se filtra (ausente). */
            online?: boolean;
        };
        /**
         * @description Respuesta de `GET /discovery`: los perfiles de la región de la sesión que
         *     pasan los filtros, ordenados por `distanceM` ascendente (y por `profileId`
         *     como desempate, para que dos filas equidistantes no cambien de orden).
         *
         *     La fila no agrega datos, mide: `distanceM` y `bearingDeg` vienen ya calculados
         *     y redondeados por el server al metro y al grado (half-up), así el mismo par
         *     sesión↔perfil devuelve siempre el mismo entero.
         *
         *     Exclusiones, todas server-side y ninguna representada en el contrato: el
         *     propio perfil (no se descubre a sí mismo), los bloqueados, los pausados y los
         *     perfiles de otra región. El resultado es un objeto con array adentro —mismo
         *     idioma que `ProfileList`, `ZoneList` y `EventsPage`—, no un array pelado.
         */
        DiscoveryResult: {
            results: components["schemas"]["ProfileSummary"][];
        };
        /**
         * @description Estado del ping. `pending` es el único estado del que se puede salir; los
         *     otros tres son terminales.
         *
         *     `expired` es el paso del tiempo, no una decisión de nadie: el server lo
         *     aplica cuando `expiresAt` ya pasó, tanto al leer la bandeja como al intentar
         *     resolver. Un ping vencido que nadie miró nunca no queda `pending` para
         *     siempre.
         *
         *     La transición es la autoridad del estado, no el reloj del cliente: aceptar
         *     un ping ya resuelto es `409 PING_RESOLVED` y aceptar uno vencido es
         *     `410 PING_EXPIRED`, aunque el cliente crea que llegó a tiempo.
         * @enum {string}
         */
        PingStatus: "pending" | "accepted" | "rejected" | "expired";
        /**
         * @description Body de `POST /pings`. Nombra el destinatario y nada más: el emisor es la
         *     sesión (no se puede mandar un ping "de otro") y el TTL lo fija el server.
         *
         *     No hay mensaje, emoji ni contra-ping: el contenido del primer contacto no es
         *     parte de esta versión del contrato. Un ping es una señal, no un chat.
         */
        PingCreate: {
            /**
             * @description `profileId` del destinatario tal como lo devolvió `GET /discovery`: un
             *     humano del catálogo (`mx-p01`) o un bot (`mx-p01-b1`). Un `profileId` de
             *     otra región es `404 PROFILE_NOT_FOUND` (el ping no cruza regiones) y el
             *     propio es `422 VALIDATION_FAILED` (no se pinguea a sí mismo).
             */
            targetProfileId: string;
        };
        /**
         * @description Un ping y su estado. Es lo que devuelve `201` de `POST /pings` y lo que
         *     viaja adentro de cada fila de la bandeja.
         *
         *     `fromProfileId`/`toProfileId` son la dirección del ping y no cambian nunca.
         *     `matchId` es el puente al `Match`: `null` mientras no haya match y el id del
         *     match cuando `status` es `accepted`. Es lo que le permite al emisor enterarse
         *     de que su ping fue aceptado y con qué match, sin un `GET /matches`.
         */
        Ping: {
            /**
             * Format: uuid
             * @description Identidad del ping. Opaca para el cliente.
             */
            id: string;
            /** @description Quien envió el ping. Para la bandeja de entrada, es "el otro". */
            fromProfileId: string;
            /** @description Quien lo recibió. Para la bandeja de enviados, es "el otro". */
            toProfileId: string;
            status: components["schemas"]["PingStatus"];
            /**
             * Format: date-time
             * @description Cuándo se envió (RFC 3339 UTC con ms).
             */
            createdAt: string;
            /**
             * Format: date-time
             * @description Cuándo deja de estar pendiente si nadie lo resuelve. Después de este
             *     instante el ping es `expired` y aceptarlo o rechazarlo es
             *     `410 PING_EXPIRED`.
             */
            expiresAt: string;
            /**
             * @description `Match` creado al aceptar, o `null` si todavía no hay match. Un ping
             *     `rejected` o `expired` nunca tiene `matchId`.
             */
            matchId: string | null;
        };
        /**
         * @description El otro lado del ping, reducido a lo que la bandeja dibuja: quién es y cómo
         *     se ve. Nada de `distanceM`/`bearingDeg` (un ping no es un resultado de
         *     descubrimiento y la distancia de hace horas no dice nada), nada de
         *     coordenadas y nada del dataset que la fila no use.
         *
         *     Un bot hereda la proyección de su dueño (`nickname`, `initials`, `photoId`,
         *     `intention`) y se distingue por `profileId` + `sourceType: bot`, igual que en
         *     `GET /discovery`: no existe un segundo catálogo de personas para rellenar la
         *     demo.
         */
        PingPeer: {
            /** @description El `profileId` del otro perfil (humano o bot). */
            profileId: string;
            /** @description Nombre visible. */
            nickname: string;
            /** @description Iniciales para el avatar sin foto. */
            initials: string;
            intention: components["schemas"]["Intention"];
            /**
             * @description Id de la foto. El avatar se resuelve contra el bundle de la demo, igual
             *     que en `ProfileSummary`: la imagen no viaja.
             */
            photoId: string;
            sourceType: components["schemas"]["SourceType"];
        };
        /**
         * @description Una fila de la bandeja: el ping y el otro perfil. La bandeja no repite el
         *     shape del ping: lo anida, así el `Ping` sigue teniendo un solo lugar donde
         *     declararse.
         */
        PingListItem: {
            ping: components["schemas"]["Ping"];
            peer: components["schemas"]["PingPeer"];
        };
        /**
         * @description Respuesta de `GET /pings`: objeto con array adentro —mismo idioma que
         *     `ProfileList`, `ZoneList` y `DiscoveryResult`—, no un array pelado.
         *
         *     Orden: `createdAt` descendente, que es "lo más nuevo arriba". Sin cursor: la
         *     demo tiene pocos pings por perfil y el server corta en las 100 filas más
         *     recientes (`maxItems`). Cuando la bandeja real necesite paginar, el cursor se
         *     agrega con la misma forma que `GET /events/poll`.
         */
        PingList: {
            pings: components["schemas"]["PingListItem"][];
        };
        /**
         * @description El match que nace cuando el destinatario acepta un ping. Es **uno por par**:
         *     dos personas pueden mandarse pings en las dos direcciones, pero el par
         *     aceptado produce un solo match (`profileIds` es un conjunto, no una
         *     secuencia).
         *
         *     `profileIds` viene ordenado por `profileId` ascendente, no `[yo, el otro]`:
         *     los dos lados reciben exactamente el mismo objeto y el cliente sabe cuál es
         *     el propio porque ya conoce su `profileId`.
         *
         *     El `Match` se entrega en el `200` de aceptar y el emisor lo descubre por
         *     `Ping.matchId`. Desde v0.4 también es un recurso: `GET /matches` es la
         *     bandeja de conversaciones y sus mensajes cuelgan de
         *     `GET|POST /matches/{matchId}/messages` (ver `schemas/chat.yaml`).
         */
        Match: {
            /**
             * Format: uuid
             * @description Identidad del match. Opaca para el cliente.
             */
            id: string;
            /**
             * @description Los dos perfiles del match, ordenados por `profileId` ascendente. El
             *     orden es parte del contrato: es lo que hace determinista el objeto.
             */
            profileIds: string[];
            /**
             * Format: date-time
             * @description Cuándo se aceptó el ping que lo creó (RFC 3339 UTC con ms).
             */
            createdAt: string;
        };
        /**
         * @description Un mensaje de la conversación de un match. Es lo que devuelve el `201` de
         *     `POST /matches/{matchId}/messages` y lo que viaja en cada fila de
         *     `MessagePage`.
         *
         *     **`clientMessageId` viaja de vuelta a propósito.** Es la clave que puso el
         *     cliente para reintentar sin duplicar: sin ella en la respuesta, un refresh de
         *     la lista no podría reconciliar el mensaje del server con la burbuja optimista
         *     que el cliente ya tenía en pantalla, y terminaría comparando por texto y hora.
         *
         *     **El cuerpo viaja completo.** El evento `message.created` sólo lleva ids (el
         *     cliente pide la página y la encuentra); el `Message` de esta response es el
         *     contenido.
         */
        Message: {
            /**
             * Format: uuid
             * @description Identidad del mensaje. Opaca para el cliente y estable.
             */
            id: string;
            /**
             * Format: uuid
             * @description El match al que pertenece. Un mensaje nunca cambia de match.
             */
            matchId: string;
            /**
             * @description Quién escribió: el `profileId` del humano o el del bot (`<owner>-b1`). La
             *     sesión se reconoce por su propio `profileId`; los mensajes del otro lado
             *     son los que cuentan para `unreadCount`.
             */
            senderProfileId: string;
            /**
             * @description Clave de idempotencia del emisor. Es única **por match y por emisor**: dos
             *     personas pueden usar el mismo valor en la misma conversación sin pisarse,
             *     y reintentar el mismo `clientMessageId` devuelve este mensaje en vez de
             *     crear otro.
             * @example 0f9c2a7e-1b44-4a51-9d3e-m1
             */
            clientMessageId: string;
            /**
             * @description Texto del mensaje, ya recortado de espacios en los bordes por el server.
             *     Vacío o sólo espacios es `422 VALIDATION_FAILED`: un mensaje sin cuerpo no
             *     es un mensaje.
             */
            body: string;
            /**
             * Format: date-time
             * @description Cuándo se aceptó el mensaje (RFC 3339 UTC con ms). El orden de la
             *     conversación es el del server, no el del reloj del cliente.
             */
            createdAt: string;
        };
        /**
         * @description Body de `POST /matches/{matchId}/messages`. Nombra al mensaje y nada más: el
         *     emisor es la sesión y el `matchId` viene en el path.
         *
         *     **Idempotencia.** `clientMessageId` es la clave: el server la guarda única
         *     por `(matchId, emisor)`. Reintentar el mismo pedido —un reintento de red, un
         *     doble toque— devuelve **el mismo** `Message` con el mismo `id` y no crea una
         *     segunda fila ni un segundo evento.
         *
         *     **Sin reply-to, sin adjuntos, sin emoji.** La demo no los dibuja; agregarlos
         *     sin consumer sería superficie que nadie ejercita.
         */
        MessageCreate: {
            /**
             * @description Clave de idempotencia elegida por el cliente. Se recomienda un uuid por
             *     mensaje; el server no la interpreta, sólo la compara.
             */
            clientMessageId: string;
            /**
             * @description Texto del mensaje. El server recorta los espacios de los bordes antes de
             *     guardarlo: un body que queda vacío después del recorte es `422
             *     VALIDATION_FAILED`.
             */
            body: string;
        };
        /**
         * @description Una página de la conversación, en orden **cronológico ascendente** (el más
         *     viejo primero): un chat se lee de arriba abajo y la demo pide la primera
         *     página al abrir.
         *
         *     Tres campos planos —mismo idioma que `EventsPage`— porque `Page` es metadata
         *     y `allOf` + `additionalProperties: false` bloquearía los hermanos.
         *
         *     **Cursor opaco.** `nextCursor` es un valor que el cliente no interpreta: lo
         *     devuelve tal cual en `?cursor=` para pedir lo que sigue. No es un `seq` de
         *     evento ni un `createdAt`: es lo que el server necesite para no perder ni
         *     repetir mensajes cuando dos llegan en el mismo milisegundo.
         */
        MessagePage: {
            /** @description Hasta 100 mensajes, del más viejo al más nuevo dentro de la página. */
            messages: components["schemas"]["Message"][];
            /**
             * @description Cursor de la próxima página, o `null` si no queda nada después de esta.
             *     Opaco: el cliente lo repite sin parsearlo. Una página vacía sobre el
             *     final devuelve `null`, no el cursor recibido, porque no hay nada que
             *     seguir leyendo.
             */
            nextCursor: string | null;
            /** @description Si quedan mensajes después de esta página. */
            hasMore: boolean;
        };
        /**
         * @description Una fila de la bandeja de matches: el match, el otro perfil y el estado de la
         *     conversación. Está anidado —como `PingListItem`— para que `Match` y `Message`
         *     tengan un solo lugar donde declararse.
         *
         *     **`peer` es el otro lado, siempre.** El cliente no cruza el match contra
         *     `/demo/profiles` (que no conoce a los bots) ni busca su propio perfil en una
         *     lista: la fila ya trae a quién dibujar, igual que la bandeja de pings.
         *
         *     **`unreadCount` es del que mira.** Son los mensajes del otro lado posteriores
         *     a su última lectura de este match; los propios nunca cuentan, aunque el
         *     cliente no haya marcado leídos.
         */
        MatchListItem: {
            match: components["schemas"]["Match"];
            peer: components["schemas"]["PingPeer"];
            /**
             * @description El último mensaje de la conversación, o `null` si todavía no hay ninguno
             *     (el match recién aceptado). Es lo que la lista muestra como preview.
             */
            lastMessage: components["schemas"]["Message"] | null;
            /**
             * @description Mensajes del otro lado que el perfil de la sesión no marcó como leídos.
             *     Baja a `0` al hacer `POST /matches/{matchId}/read`; un mensaje nuevo del
             *     otro lado lo vuelve a subir.
             */
            unreadCount: number;
        };
        /**
         * @description Respuesta de `GET /matches`: objeto con array adentro —mismo idioma que
         *     `PingList` y `ProfileList`—, no un array pelado.
         *
         *     Orden: el match más reciente primero (`createdAt` descendente), que es "lo
         *     que necesita respuesta arriba". Sin cursor: la demo tiene un match por par y
         *     el server corta en los 100 más recientes (`maxItems`). Cuando el volumen lo
         *     pida, el cursor se agrega con la misma forma que `MessagePage`.
         */
        MatchList: {
            matches: components["schemas"]["MatchListItem"][];
        };
        /**
         * @description Visibilidad de la presencia. Es una **preferencia de la sesión**, no un
         *     estado de la conexión:
         *
         *     - `visible` (default): la presencia aparece en el descubrimiento de los demás
         *       y sus bots se mueven para ellos.
         *     - `ghost`: la sesión sigue viva y sigue viendo (a los demás y a sus propios
         *       bots), pero ni el humano ni sus bots aparecen en el descubrimiento ni en el
         *       stream de nadie más. Es "online pero invisible", distinto de
         *       `DELETE /presence`, que apaga la presencia para todos —incluido uno mismo—.
         *
         *     Un `PUT /presence` sin `visibility` no cambia la visibilidad vigente: el
         *     heartbeat de posición del cliente (cada pocos segundos) no puede sacar a
         *     alguien de ghost por olvidar el campo. Un `PUT` con `visibility` la fija.
         * @enum {string}
         */
        Visibility: "visible" | "ghost";
        /**
         * @description Body de `POST /blocks`. Nombra a quién bloquear y nada más: el bloqueador es
         *     la sesión.
         *
         *     `profileId` puede ser un humano del catálogo (`mx-p03`) o un bot
         *     (`mx-p03-b1`). En el segundo caso el server canoniza al dueño: bloquear un
         *     bot bloquea a su dueño, porque el bot no tiene identidad propia que
         *     sobreviva al dueño. La response publica el `profileId` canonizado, así el
         *     cliente no tiene que repetir la regla.
         *
         *     Bloquearse a sí mismo es `422 VALIDATION_FAILED`; un `profileId` que no
         *     existe en la región es `404 PROFILE_NOT_FOUND`.
         */
        BlockCreate: {
            /**
             * @description `profileId` del perfil a bloquear, tal como lo devolvió `GET /discovery`
             *     o `GET /matches` (humano o bot).
             * @example mx-p04
             */
            profileId: string;
        };
        /**
         * @description Un bloqueo propio. `profileId` es el perfil **canonizado** (si se pidió un
         *     bot, el dueño): es la identidad con la que el bloqueo se guardó y con la que
         *     `DELETE /blocks/{profileId}` lo revierte.
         *
         *     `createdAt` es cuándo se creó el bloqueo. Repetir `POST /blocks` sobre un par
         *     ya bloqueado es idempotente: devuelve el mismo `createdAt` y no crea una
         *     segunda fila.
         */
        Block: {
            /**
             * @description Perfil bloqueado, ya canonizado al humano.
             * @example mx-p04
             */
            profileId: string;
            /**
             * Format: date-time
             * @description Cuándo se creó el bloqueo (RFC 3339 UTC con ms).
             */
            createdAt: string;
        };
        /**
         * @description Una fila de `GET /blocks`: el bloqueo y la identidad del otro, con la misma
         *     proyección que la bandeja de pings (`PingPeer`). Sin eso el cliente tendría
         *     que cruzar el `profileId` contra `/demo/profiles` para dibujar la fila.
         *
         *     Un perfil que ya no está en el catálogo no se lista: la lista es una
         *     proyección de perfiles, no un log. El bloqueo sigue en la base y se
         *     revierte con `DELETE` aunque no se pueda dibujar.
         */
        BlockListItem: {
            block: components["schemas"]["Block"];
            peer: components["schemas"]["PingPeer"];
        };
        /**
         * @description Respuesta de `GET /blocks`: objeto con array adentro —mismo idioma que
         *     `PingList` y `MatchList`—, no un array pelado.
         *
         *     Orden: `createdAt` descendente, el bloqueo más reciente arriba. Sin cursor:
         *     la demo no acumula bloqueos y el server corta en los 100 más recientes.
         */
        BlockList: {
            blocks: components["schemas"]["BlockListItem"][];
        };
        /**
         * @description Motivo del reporte, cerrado a cinco valores. Es el vocabulario mínimo que un
         *     moderador humano puede accionar sin un formulario libre: texto libre en un
         *     reporte es una bandeja de PII que nadie va a leer en la demo.
         * @enum {string}
         */
        ReportReason: "spam" | "harassment" | "inappropriate" | "impersonation" | "other";
        /**
         * @description Body de `POST /reports`. Nombra a quién se reporta y por qué; el reportante
         *     es la sesión.
         *
         *     `profileId` acepta un humano del catálogo o un bot. Como en los bloqueos, un
         *     bot se canoniza a su dueño: el bot no existe sin la persona.
         *
         *     Reportarse a sí mismo es `422 VALIDATION_FAILED`; un `profileId` inexistente
         *     en la región es `404 PROFILE_NOT_FOUND`.
         */
        ReportCreate: {
            /**
             * @description Perfil reportado (humano o bot). Se guarda canonizado al humano.
             * @example mx-p07
             */
            profileId: string;
            reason: components["schemas"]["ReportReason"];
        };
        /**
         * @description Acuse de `POST /reports` (202): el registro existe, sin más datos. Es
         *     deliberadamente corto —id y fecha— porque un acuse que repite el motivo o el
         *     perfil reportado convierte cada reporte en una lectura de PII.
         */
        ReportReceipt: {
            /**
             * Format: uuid
             * @description Identidad del reporte. Opaca para el cliente.
             */
            reportId: string;
            /**
             * Format: date-time
             * @description Cuándo se registró (RFC 3339 UTC con ms).
             */
            createdAt: string;
        };
        /**
         * @description Tipo de aviso. Los tres valores son los tres hechos de la demo que generan
         *     una notificación, con los mismos nombres que los eventos del stream.
         *
         *     `ping.received` lo produce `POST /pings` para el destinatario humano;
         *     `match.created`, la aceptación de un ping; `message.created`, un mensaje
         *     nuevo del otro lado (incluida la respuesta automática de un bot).
         * @enum {string}
         */
        NotificationKind: "ping.received" | "match.created" | "message.created";
        /**
         * @description Una notificación con lo que la campana necesita para dibujarse: el tipo, la
         *     fecha, si está leída y la identidad del otro.
         *
         *     **`readAt` es el estado, no un flag aparte.** `null` = no leída. El cliente
         *     cuenta las que tienen `readAt: null`, y `POST /notifications/read` lo
         *     completa. No hay `unread: boolean` que pueda contradecir la fecha.
         *
         *     **Las referencias son opcionales por tipo.** `ping.received` llena `pingId`;
         *     `match.created` llena `matchId`; `message.created` llena `matchId` y
         *     `messageId`. Las tres no viajan como una unión de schemas: dos `null` y una
         *     referencia es más simple para el cliente que tres shapes distintos.
         */
        NotificationItem: {
            /**
             * Format: uuid
             * @description Identidad de la notificación. Opaca.
             */
            id: string;
            kind: components["schemas"]["NotificationKind"];
            /**
             * Format: date-time
             * @description Cuándo se generó (RFC 3339 UTC con ms).
             */
            createdAt: string;
            /**
             * Format: date-time
             * @description Cuándo se marcó leída, o `null` si sigue sin leer. Es la única autoridad
             *     del estado de lectura.
             */
            readAt: string | null;
            peer: components["schemas"]["PingPeer"];
            /**
             * Format: uuid
             * @description El ping recibido, cuando `kind` es `ping.received`.
             */
            pingId: string | null;
            /**
             * Format: uuid
             * @description El match creado (`match.created`) o el match del mensaje
             *     (`message.created`).
             */
            matchId: string | null;
            /**
             * Format: uuid
             * @description El mensaje nuevo, cuando `kind` es `message.created`.
             */
            messageId: string | null;
        };
        /**
         * @description Respuesta de `GET /notifications`: la campana completa (hasta 100, más
         *     reciente primero) y el total de no leídas.
         *
         *     **`unreadCount` es del perfil de la sesión, no de la página.** Se cuenta
         *     sobre todas las notificaciones del perfil, no sobre las 100 que viajan: si la
         *     campana creciera, el badge no puede mentir por el corte. No hay cursor: la
         *     demo no acumula avisos y 100 es el techo declarado.
         */
        NotificationList: {
            notifications: components["schemas"]["NotificationItem"][];
            /** @description Notificaciones propias con `readAt: null`. */
            unreadCount: number;
        };
        /**
         * @description Body de `POST /notifications/read`. Marca leídas **todas** o **las que
         *     nombra**:
         *
         *     - sin body, `{}` o `notificationIds` ausente → todas las no leídas del perfil;
         *     - `notificationIds: [...]` → sólo esas (1 a 100 ids).
         *
         *     Un id de otra región o de otro perfil no falla ni se marca: se ignora, porque
         *     la operación ya está acotada al perfil de la sesión. Lo que sí es 422 es un
         *     body con una forma inválida (`notificationIds` no es un array de uuid, o hay
         *     campos de más).
         */
        NotificationReadRequest: {
            /** @description Ids a marcar. Ausente = todas las no leídas. */
            notificationIds?: string[];
        };
        /**
         * @description Resultado de `POST /notifications/read`: cuántas se marcaron en esta llamada
         *     y cuántas quedan sin leer. El cliente actualiza el badge con el segundo sin
         *     un `GET` extra.
         *
         *     Repetirlo es idempotente por resultado: la segunda vez `marked` es `0` y
         *     `unreadCount` no cambia.
         */
        NotificationReadResult: {
            /** @description Notificaciones que pasaron de no leídas a leídas en esta llamada. */
            marked: number;
            /** @description Notificaciones propias que siguen sin leer después de la llamada. */
            unreadCount: number;
        };
        /**
         * @description Punto privado de la sesión, en grados decimales WGS 84. Es la contraparte de
         *     los vértices de `contract/catalog/zones.json`, que se guardan posicionales y
         *     en orden `[lng, lat]`; acá las dos componentes llevan nombre para que el body
         *     no dependa de una posición que nadie documenta.
         *
         *     `lat`/`lng` son las palabras del vocabulario geográfico a propósito: el guard
         *     de geometría las reconoce como coordenada, y ése es justamente el punto —es un
         *     schema de entrada, no de salida—. Cualquier otra forma (`x`/`y`, un string
         *     `"lng,lat"`) sería un alias que esconde lo que viaja.
         */
        PrivatePoint: {
            /**
             * @description Latitud en grados decimales.
             * @example 19.432608
             */
            lat: number;
            /**
             * @description Longitud en grados decimales.
             * @example -99.133209
             */
            lng: number;
        };
        /**
         * @description Cuerpo de `PUT /presence`. Exactamente uno de los dos caminos de posición:
         *
         *     - `point`: la posición privada de la sesión (geolocalización del navegador).
         *     - `demoZoneKey`: la zona demo elegida a mano, para el flujo sin permiso de
         *       ubicación.
         *
         *     Mandar los dos o ninguno es 422 `VALIDATION_FAILED`. El punto no se persiste
         *     como coordenada ni se devuelve: el server lo resuelve contra el catálogo y
         *     guarda `regionKey` + `zoneKey`.
         *
         *     El punto se redondea a 6 decimales antes de `ST_Covers`, igual que los
         *     vértices del catálogo: dos pedidos con el mismo punto redondeado caen en la
         *     misma zona.
         *
         *     `visibility` es opcional y ortogonal al camino de posición: se puede fijar
         *     ghost o volver a visible sin cambiar de punto ni de zona. Omitirla conserva la
         *     visibilidad vigente (default `visible` para una presencia nueva).
         */
        PresenceUpdate: {
            point?: components["schemas"]["PrivatePoint"];
            /**
             * @description `zoneKey` del catálogo (`cdmx`, `bogota`). Tiene que existir y pertenecer a
             *     la región de la sesión: si no existe es 422 `ZONE_UNKNOWN`, si existe pero
             *     es de otra región es 422 `ZONE_UNKNOWN` también (para el cliente es el
             *     mismo caso: esa zona no es una opción).
             * @example cdmx
             */
            demoZoneKey?: string;
            visibility?: components["schemas"]["Visibility"];
        } & (unknown | unknown);
    };
    responses: {
        /**
         * @description Falta la credencial o el JWT venció (`UNAUTHENTICATED`). Es el 401 de toda
         *     operation que autentica con `demoSession`; el ticket de stream tiene su
         *     propio 401 porque sus dos códigos no existen fuera de `GET /events`.
         */
        Unauthorized: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /**
         * @description 401 de `GET /events`, que autentica con `streamTicket` en lugar del header.
         *     El ticket ausente o vencido es `TICKET_EXPIRED`; el ya consumido es
         *     `TICKET_REUSED`. Los dos códigos viajan acá y en ningún otro lado: un
         *     status puede volver con más de un `code` y `Problem.code` es el
         *     discriminante.
         */
        StreamTicketInvalid: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /**
         * @description El pedido choca con el estado del slot demo (`PROFILE_IN_USE`). En
         *     `POST /auth/demo-session` es un slot que ya ocupa otra sesión viva: el
         *     claim no desaloja, así que el cliente tiene que elegir otro o pedir el
         *     takeover. En `POST /auth/takeover` es un pedido sobre el slot que ya
         *     ocupa la propia sesión que llama: no hay nada que desalojar y reemitir el
         *     token apagaría la credencial en uso.
         */
        Conflict: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /**
         * @description El pedido está bien formado como HTTP pero no cumple el schema: body,
         *     query o cursor (`VALIDATION_FAILED`).
         */
        Unprocessable: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /**
         * @description Falla no clasificada (`INTERNAL`). Se declara acá y la cablea S2 en las
         *     operations de events y presence; en auth no hay nada que pueda romperse
         *     del lado del cliente más allá del slot.
         */
        Internal: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /**
         * @description El cursor (`Last-Event-ID` de `GET /events` o `?cursor=` de
         *     `GET /events/poll`) quedó fuera de la retención del log (`CURSOR_EXPIRED`).
         *     No es un 400: el pedido está bien formado, lo que ya no existe es el
         *     evento. Un cursor malformado es `VALIDATION_FAILED` (422).
         */
        CursorExpired: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /**
         * @description La región pedida está bien formada pero el catálogo no la sirve: sólo
         *     existen `mx` y `co` (`REGION_UNAVAILABLE`). Un `regionKey` ausente o con
         *     otra forma es `VALIDATION_FAILED`, mismo 422.
         */
        RegionUnavailable: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /**
         * @description El recurso pedido pertenece a otra región que la de la sesión
         *     (`REGION_MISMATCH`). Es un 403 y no un 404 a propósito: el perfil existe,
         *     lo que no existe es el derecho a verlo desde esta sesión.
         */
        RegionMismatch: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /**
         * @description El `profileId` que nombra la sesión ya no existe en el catálogo
         *     (`PROFILE_NOT_FOUND`): se regeneró el seed debajo de una sesión viva, así
         *     que el token es válido pero apunta a un perfil que no está. Es un 404 y no
         *     un 401: la credencial no está mal, el recurso sí.
         */
        ProfileNotFound: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /**
         * @description La sesión no encarna un perfil del catálogo (`PROFILE_REQUIRED`): es un
         *     invitado de relleno, porque los 10 slots de la región estaban ocupados.
         *     Bloquear y reportar son actos de una persona contra otra y el invitado no
         *     es una persona de la demo. Es un 403 y no un 404: la credencial es válida,
         *     lo que falta es el sujeto.
         */
        ProfileRequired: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /**
         * @description No hay presencia viva que apagar (`PRESENCE_STALE`): nunca se registró, ya
         *     se borró o venció. La operación es idempotente en el resultado, no en el
         *     status, para que el cliente distinga "apagué mi presencia" de "no había
         *     nada que apagar".
         */
        PresenceStale: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /**
         * @description 422 de `PUT /presence`, con dos `code`: `VALIDATION_FAILED` cuando el body
         *     no trae exactamente uno de `point`/`demoZoneKey` (o no cumple su forma), y
         *     `ZONE_UNKNOWN` cuando la `demoZoneKey` existe como forma pero no en el
         *     catálogo de la región. El status es uno y el discriminante es
         *     `Problem.code`, igual que en el 401.
         */
        PresenceUnprocessable: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /**
         * @description El cliente superó el límite de pedidos de la ventana (`RATE_LIMITED`). Es
         *     un 429 y no un 422: el pedido está bien formado, lo que falta es cuota. El
         *     cliente reintenta con backoff, no corrigiendo el body.
         */
        RateLimited: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /**
         * @description La operation existe en el contrato y todavía no está implementada en el
         *     sprint que la sirve (`NOT_IMPLEMENTED`). Un server de S1/S2 que recibe
         *     `GET /discovery` responde esto en vez de 404: el path existe, la
         *     implementación no. Así `x-implementation-sprint` es accionable.
         */
        NotImplemented: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /**
         * @description El ping existe pero la sesión no es su destinatario (`PING_FORBIDDEN`).
         *     Es un 403 y no un 404: el recurso está, lo que falta es el derecho a
         *     resolverlo. También es el 403 de `POST /pings` cuando la sesión no tiene
         *     perfil propio (invitado de relleno): un invitado no es una persona a la
         *     que otro pueda contestarle.
         */
        PingForbidden: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /**
         * @description El emisor no puede pinguear a ese destinatario por una de dos razones, y
         *     `Problem.code` las separa: `PING_FORBIDDEN` cuando la sesión no tiene
         *     perfil propio (invitado de relleno) y `CHAT_BLOCKED` cuando el par está
         *     bloqueado en cualquier dirección. El mensaje no revela quién bloqueó a
         *     quién.
         */
        PingForbiddenOrBlocked: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /**
         * @description El destinatario de `POST /pings` no existe para esta sesión
         *     (`PROFILE_NOT_FOUND`): `profileId` de otra región, id inexistente, o un
         *     bot cuyo dueño ya no tiene presencia viva. Un ping no cruza regiones y un
         *     bot sin presencia no está.
         */
        PingTargetNotFound: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /**
         * @description El `pingId` del path no existe (`PING_NOT_FOUND`). Un id malformado (no
         *     uuid) es 422 `VALIDATION_FAILED`, no un 404: el pedido está mal escrito
         *     antes de que el recurso falte.
         */
        PingNotFound: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /**
         * @description El par dirigido ya tiene un ping pendiente (`PING_DUPLICATE`). No es un
         *     error del cliente que se corrige con un body distinto: hay que esperar a
         *     que el otro conteste o venza. La carrera entre dos envíos simultáneos la
         *     resuelve un índice único parcial, no un chequeo previo.
         */
        PingDuplicate: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /**
         * @description El ping ya no está pendiente (`PING_RESOLVED`): lo aceptaron, lo
         *     rechazaron o lo cerró una aceptación previa. Repetir la acción no es un
         *     no-op silencioso; el cliente se entera y deja de reintentar.
         */
        PingResolved: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /**
         * @description El ping venció (`PING_EXPIRED`). En `POST /pings` es el pendiente del par
         *     que ya pasó su `expiresAt`: queda cerrado y el próximo envío crea uno
         *     nuevo. En `accept`/`reject` es un ping que se resolvió tarde: no hay
         *     match. El reloj del server es la autoridad, no el del cliente.
         */
        PingExpired: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /**
         * @description El `matchId` del path no existe en la región de la sesión
         *     (`MATCH_NOT_FOUND`). Un match de otra región es exactamente eso: no
         *     existe para esta sesión. Un id malformado (no uuid) es 422
         *     `VALIDATION_FAILED`, no un 404.
         */
        MatchNotFound: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /**
         * @description El match existe en la región pero la sesión no es parte de él
         *     (`CHAT_BLOCKED`). Es un 403 y no un 404: el recurso está, lo que falta es
         *     el derecho a leer o escribir esa conversación.
         *
         *     Desde v0.5 el mismo código cubre el bloqueo real en las dos puertas del
         *     par: `POST /pings` cuando cualquiera de los dos bloqueó al otro, y
         *     `POST /matches/{matchId}/messages` cuando la conversación existe pero el
         *     par está bloqueado. El mensaje de error no dice quién bloqueó a quién:
         *     el bloqueo ajeno es invisible para el bloqueado.
         */
        ChatBlocked: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /**
         * @description La conversación no acepta mensajes nuevos (`MATCH_CLOSED`): el otro lado
         *     ya no existe para la demo (un bot cuyo dueño se fue, un perfil regenerado
         *     por un seed) o la conversación se cerró porque el dueño del bot cambió de
         *     zona demo y el bot se volvió a sembrar en otra (`v0.5`). Se puede leer
         *     —la historia queda legible— y marcar leída; lo que no se puede es
         *     escribir.
         */
        MatchClosed: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /**
         * @description El pedido choca con el estado del slot demo (`PROFILE_IN_USE`). En
         *     `POST /auth/demo-session` es un slot que ya ocupa otra sesión viva: el
         *     claim no desaloja, así que el cliente tiene que elegir otro o pedir el
         *     takeover. En `POST /auth/takeover` es un pedido sobre el slot que ya
         *     ocupa la propia sesión que llama: no hay nada que desalojar y reemitir el
         *     token apagaría la credencial en uso.
         */
        "responses-Conflict": {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /**
         * @description El pedido está bien formado como HTTP pero no cumple el schema: body,
         *     query o cursor (`VALIDATION_FAILED`).
         */
        "responses-Unprocessable": {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /**
         * @description Falta la credencial o el JWT venció (`UNAUTHENTICATED`). Es el 401 de toda
         *     operation que autentica con `demoSession`; el ticket de stream tiene su
         *     propio 401 porque sus dos códigos no existen fuera de `GET /events`.
         */
        "responses-Unauthorized": {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /**
         * @description El recurso pedido pertenece a otra región que la de la sesión
         *     (`REGION_MISMATCH`). Es un 403 y no un 404 a propósito: el perfil existe,
         *     lo que no existe es el derecho a verlo desde esta sesión.
         */
        "responses-RegionMismatch": {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /**
         * @description 401 de `GET /events`, que autentica con `streamTicket` en lugar del header.
         *     El ticket ausente o vencido es `TICKET_EXPIRED`; el ya consumido es
         *     `TICKET_REUSED`. Los dos códigos viajan acá y en ningún otro lado: un
         *     status puede volver con más de un `code` y `Problem.code` es el
         *     discriminante.
         */
        "responses-StreamTicketInvalid": {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /**
         * @description El cursor (`Last-Event-ID` de `GET /events` o `?cursor=` de
         *     `GET /events/poll`) quedó fuera de la retención del log (`CURSOR_EXPIRED`).
         *     No es un 400: el pedido está bien formado, lo que ya no existe es el
         *     evento. Un cursor malformado es `VALIDATION_FAILED` (422).
         */
        "responses-CursorExpired": {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /**
         * @description El cliente superó el límite de pedidos de la ventana (`RATE_LIMITED`). Es
         *     un 429 y no un 422: el pedido está bien formado, lo que falta es cuota. El
         *     cliente reintenta con backoff, no corrigiendo el body.
         */
        "responses-RateLimited": {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /**
         * @description La región pedida está bien formada pero el catálogo no la sirve: sólo
         *     existen `mx` y `co` (`REGION_UNAVAILABLE`). Un `regionKey` ausente o con
         *     otra forma es `VALIDATION_FAILED`, mismo 422.
         */
        "responses-RegionUnavailable": {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /**
         * @description El `profileId` que nombra la sesión ya no existe en el catálogo
         *     (`PROFILE_NOT_FOUND`): se regeneró el seed debajo de una sesión viva, así
         *     que el token es válido pero apunta a un perfil que no está. Es un 404 y no
         *     un 401: la credencial no está mal, el recurso sí.
         */
        "responses-ProfileNotFound": {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /**
         * @description 422 de `PUT /presence`, con dos `code`: `VALIDATION_FAILED` cuando el body
         *     no trae exactamente uno de `point`/`demoZoneKey` (o no cumple su forma), y
         *     `ZONE_UNKNOWN` cuando la `demoZoneKey` existe como forma pero no en el
         *     catálogo de la región. El status es uno y el discriminante es
         *     `Problem.code`, igual que en el 401.
         */
        "responses-PresenceUnprocessable": {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /**
         * @description Falla no clasificada (`INTERNAL`). Se declara acá y la cablea S2 en las
         *     operations de events y presence; en auth no hay nada que pueda romperse
         *     del lado del cliente más allá del slot.
         */
        "responses-Internal": {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /**
         * @description No hay presencia viva que apagar (`PRESENCE_STALE`): nunca se registró, ya
         *     se borró o venció. La operación es idempotente en el resultado, no en el
         *     status, para que el cliente distinga "apagué mi presencia" de "no había
         *     nada que apagar".
         */
        "responses-PresenceStale": {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /**
         * @description La operation existe en el contrato y todavía no está implementada en el
         *     sprint que la sirve (`NOT_IMPLEMENTED`). Un server de S1/S2 que recibe
         *     `GET /discovery` responde esto en vez de 404: el path existe, la
         *     implementación no. Así `x-implementation-sprint` es accionable.
         */
        "responses-NotImplemented": {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /**
         * @description El emisor no puede pinguear a ese destinatario por una de dos razones, y
         *     `Problem.code` las separa: `PING_FORBIDDEN` cuando la sesión no tiene
         *     perfil propio (invitado de relleno) y `CHAT_BLOCKED` cuando el par está
         *     bloqueado en cualquier dirección. El mensaje no revela quién bloqueó a
         *     quién.
         */
        "responses-PingForbiddenOrBlocked": {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /**
         * @description El destinatario de `POST /pings` no existe para esta sesión
         *     (`PROFILE_NOT_FOUND`): `profileId` de otra región, id inexistente, o un
         *     bot cuyo dueño ya no tiene presencia viva. Un ping no cruza regiones y un
         *     bot sin presencia no está.
         */
        "responses-PingTargetNotFound": {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /**
         * @description El par dirigido ya tiene un ping pendiente (`PING_DUPLICATE`). No es un
         *     error del cliente que se corrige con un body distinto: hay que esperar a
         *     que el otro conteste o venza. La carrera entre dos envíos simultáneos la
         *     resuelve un índice único parcial, no un chequeo previo.
         */
        "responses-PingDuplicate": {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /**
         * @description El ping venció (`PING_EXPIRED`). En `POST /pings` es el pendiente del par
         *     que ya pasó su `expiresAt`: queda cerrado y el próximo envío crea uno
         *     nuevo. En `accept`/`reject` es un ping que se resolvió tarde: no hay
         *     match. El reloj del server es la autoridad, no el del cliente.
         */
        "responses-PingExpired": {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /**
         * @description El ping existe pero la sesión no es su destinatario (`PING_FORBIDDEN`).
         *     Es un 403 y no un 404: el recurso está, lo que falta es el derecho a
         *     resolverlo. También es el 403 de `POST /pings` cuando la sesión no tiene
         *     perfil propio (invitado de relleno): un invitado no es una persona a la
         *     que otro pueda contestarle.
         */
        "responses-PingForbidden": {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /**
         * @description El `pingId` del path no existe (`PING_NOT_FOUND`). Un id malformado (no
         *     uuid) es 422 `VALIDATION_FAILED`, no un 404: el pedido está mal escrito
         *     antes de que el recurso falte.
         */
        "responses-PingNotFound": {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /**
         * @description El ping ya no está pendiente (`PING_RESOLVED`): lo aceptaron, lo
         *     rechazaron o lo cerró una aceptación previa. Repetir la acción no es un
         *     no-op silencioso; el cliente se entera y deja de reintentar.
         */
        "responses-PingResolved": {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /**
         * @description El match existe en la región pero la sesión no es parte de él
         *     (`CHAT_BLOCKED`). Es un 403 y no un 404: el recurso está, lo que falta es
         *     el derecho a leer o escribir esa conversación.
         *
         *     Desde v0.5 el mismo código cubre el bloqueo real en las dos puertas del
         *     par: `POST /pings` cuando cualquiera de los dos bloqueó al otro, y
         *     `POST /matches/{matchId}/messages` cuando la conversación existe pero el
         *     par está bloqueado. El mensaje de error no dice quién bloqueó a quién:
         *     el bloqueo ajeno es invisible para el bloqueado.
         */
        "responses-ChatBlocked": {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /**
         * @description El `matchId` del path no existe en la región de la sesión
         *     (`MATCH_NOT_FOUND`). Un match de otra región es exactamente eso: no
         *     existe para esta sesión. Un id malformado (no uuid) es 422
         *     `VALIDATION_FAILED`, no un 404.
         */
        "responses-MatchNotFound": {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /**
         * @description La conversación no acepta mensajes nuevos (`MATCH_CLOSED`): el otro lado
         *     ya no existe para la demo (un bot cuyo dueño se fue, un perfil regenerado
         *     por un seed) o la conversación se cerró porque el dueño del bot cambió de
         *     zona demo y el bot se volvió a sembrar en otra (`v0.5`). Se puede leer
         *     —la historia queda legible— y marcar leída; lo que no se puede es
         *     escribir.
         */
        "responses-MatchClosed": {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /**
         * @description La sesión no encarna un perfil del catálogo (`PROFILE_REQUIRED`): es un
         *     invitado de relleno, porque los 10 slots de la región estaban ocupados.
         *     Bloquear y reportar son actos de una persona contra otra y el invitado no
         *     es una persona de la demo. Es un 403 y no un 404: la credencial es válida,
         *     lo que falta es el sujeto.
         */
        "responses-ProfileRequired": {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
    };
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    createDemoSession: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Sin body, el server elige región por defecto y primer slot libre. */
        requestBody?: {
            content: {
                "application/json": components["schemas"]["DemoSessionRequest"];
            };
        };
        responses: {
            /** @description Sesión demo abierta. El token viaja en el body, nunca en la URL. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DemoSession"];
                };
            };
            409: components["responses"]["responses-Conflict"];
            422: components["responses"]["responses-Unprocessable"];
        };
    };
    takeoverDemoSlot: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TakeoverRequest"];
            };
        };
        responses: {
            /**
             * @description Takeover hecho: la sesión que llama ocupa el slot y el token nuevo es
             *     el único que sirve. El ocupante anterior quedó revocado.
             */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DemoSession"];
                };
            };
            401: components["responses"]["responses-Unauthorized"];
            403: components["responses"]["responses-RegionMismatch"];
            409: components["responses"]["responses-Conflict"];
            422: components["responses"]["responses-Unprocessable"];
        };
    };
    logoutSession: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sesión cerrada. Sin body. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["responses-Unauthorized"];
        };
    };
    createStreamTicket: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Ticket emitido. No se persiste en logs. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StreamTicket"];
                };
            };
            401: components["responses"]["responses-Unauthorized"];
        };
    };
    streamEvents: {
        parameters: {
            query?: never;
            header?: {
                /**
                 * @description Último `id` entregado. Se reanuda en `seq + 1`. Reenviar el mismo id no
                 *     duplica el evento: la regla de dedupe es `seq <= lastSeen`.
                 */
                "Last-Event-ID"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /**
             * @description Stream abierto. La conexión no se cierra al terminar el replay: sigue en
             *     vivo, con `: keepalive` cada 15 s.
             */
            200: {
                headers: {
                    /** @description El stream no se cachea en ningún intermediario. */
                    "Cache-Control"?: "no-cache";
                    [name: string]: unknown;
                };
                content: {
                    "text/event-stream": string;
                };
            };
            401: components["responses"]["responses-StreamTicketInvalid"];
            410: components["responses"]["responses-CursorExpired"];
            422: components["responses"]["responses-Unprocessable"];
        };
    };
    pollEvents: {
        parameters: {
            query?: {
                /**
                 * @description Último `id` entregado. Se reanuda en `seq + 1`. Malformado →
                 *     `VALIDATION_FAILED`; fuera de retención → `CURSOR_EXPIRED`.
                 */
                cursor?: string;
                /** @description Eventos por página. */
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Página de eventos, en orden ascendente por `seq`. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EventsPage"];
                };
            };
            401: components["responses"]["responses-Unauthorized"];
            410: components["responses"]["responses-CursorExpired"];
            422: components["responses"]["responses-Unprocessable"];
            429: components["responses"]["responses-RateLimited"];
        };
    };
    listDemoRegions: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Las regiones disponibles con su zona por defecto. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RegionList"];
                };
            };
            401: components["responses"]["responses-Unauthorized"];
        };
    };
    listDemoZones: {
        parameters: {
            query: {
                /**
                 * @description Región cuyas zonas se listan. El catálogo sólo conoce `mx` y `co`;
                 *     cualquier otra cosa bien formada es `REGION_UNAVAILABLE`.
                 */
                regionKey: components["schemas"]["RegionKey"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Zonas de la región, sin geometría. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ZoneList"];
                };
            };
            401: components["responses"]["responses-Unauthorized"];
            422: components["responses"]["responses-RegionUnavailable"];
        };
    };
    listDemoProfiles: {
        parameters: {
            query: {
                /**
                 * @description Región cuyos perfiles se listan. Tiene que coincidir con la región de
                 *     la sesión; el catálogo sólo conoce `mx` y `co`.
                 */
                regionKey: components["schemas"]["RegionKey"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Los perfiles de la región, en orden de `demoSlot`. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProfileList"];
                };
            };
            401: components["responses"]["responses-Unauthorized"];
            403: components["responses"]["responses-RegionMismatch"];
            422: components["responses"]["responses-Unprocessable"];
        };
    };
    updatePresence: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PresenceUpdate"];
            };
        };
        responses: {
            /**
             * @description Presencia registrada. `zoneKey` es la zona derivada, o `null` con
             *     `fallbackRequired: true` cuando el punto no cae en ninguna zona.
             */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PresenceState"];
                };
            };
            401: components["responses"]["responses-Unauthorized"];
            404: components["responses"]["responses-ProfileNotFound"];
            422: components["responses"]["responses-PresenceUnprocessable"];
            429: components["responses"]["responses-RateLimited"];
            500: components["responses"]["responses-Internal"];
        };
    };
    clearPresence: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Presencia apagada; no hay body. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["responses-Unauthorized"];
            409: components["responses"]["responses-PresenceStale"];
        };
    };
    listDiscovery: {
        parameters: {
            query?: {
                /** @description Radio en metros desde la presencia de la sesión (200–5000). */
                radiusM?: number;
                /** @description Filtra por intención del perfil. */
                intention?: components["schemas"]["Intention"];
                /** @description Filtra por género del perfil. */
                gender?: components["schemas"]["Gender"];
                /** @description Sólo perfiles verificados cuando es `true`. */
                verified?: boolean;
                /** @description Sólo perfiles online cuando es `true`. */
                online?: boolean;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Perfiles dentro del radio, en orden de distancia. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DiscoveryResult"];
                };
            };
            401: components["responses"]["responses-Unauthorized"];
            429: components["responses"]["responses-RateLimited"];
            500: components["responses"]["responses-Internal"];
            501: components["responses"]["responses-NotImplemented"];
        };
    };
    listPings: {
        parameters: {
            query: {
                /**
                 * @description Lado de la bandeja. Obligatorio a propósito: un default implícito haría
                 *     que el cliente que olvida el parámetro crea que su inbox está vacío.
                 */
                box: "inbox" | "sent";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description La bandeja pedida, más nuevo primero. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PingList"];
                };
            };
            401: components["responses"]["responses-Unauthorized"];
            422: components["responses"]["responses-Unprocessable"];
            500: components["responses"]["responses-Internal"];
        };
    };
    createPing: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PingCreate"];
            };
        };
        responses: {
            /**
             * @description Ping creado. `status` es `pending` o, si el destinatario es un bot,
             *     `accepted` con `matchId` ya resuelto.
             */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Ping"];
                };
            };
            401: components["responses"]["responses-Unauthorized"];
            403: components["responses"]["responses-PingForbiddenOrBlocked"];
            404: components["responses"]["responses-PingTargetNotFound"];
            409: components["responses"]["responses-PingDuplicate"];
            410: components["responses"]["responses-PingExpired"];
            422: components["responses"]["responses-Unprocessable"];
            429: components["responses"]["responses-RateLimited"];
            500: components["responses"]["responses-Internal"];
        };
    };
    acceptPing: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Id del ping a aceptar. Un id malformado es 422, no 404. */
                pingId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Ping aceptado y match resultante (el mismo para los dos perfiles). */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Match"];
                };
            };
            401: components["responses"]["responses-Unauthorized"];
            403: components["responses"]["responses-PingForbidden"];
            404: components["responses"]["responses-PingNotFound"];
            409: components["responses"]["responses-PingResolved"];
            410: components["responses"]["responses-PingExpired"];
            422: components["responses"]["responses-Unprocessable"];
            500: components["responses"]["responses-Internal"];
        };
    };
    rejectPing: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Id del ping a rechazar. Un id malformado es 422, no 404. */
                pingId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Ping rechazado. No hay match ni body. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["responses-Unauthorized"];
            403: components["responses"]["responses-PingForbidden"];
            404: components["responses"]["responses-PingNotFound"];
            409: components["responses"]["responses-PingResolved"];
            410: components["responses"]["responses-PingExpired"];
            422: components["responses"]["responses-Unprocessable"];
            500: components["responses"]["responses-Internal"];
        };
    };
    listMatches: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Los matches de la sesión, más reciente primero. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MatchList"];
                };
            };
            401: components["responses"]["responses-Unauthorized"];
            500: components["responses"]["responses-Internal"];
        };
    };
    listMessages: {
        parameters: {
            query?: {
                /**
                 * @description `nextCursor` de la página anterior. Opaco: devolvelo tal cual. Vacío o
                 *     ausente es la primera página; un valor que el server no emitió es `422
                 *     VALIDATION_FAILED`.
                 */
                cursor?: string;
            };
            header?: never;
            path: {
                /** @description Id del match. Un id malformado es 422, no 404. */
                matchId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Una página de la conversación, del más viejo al más nuevo. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MessagePage"];
                };
            };
            401: components["responses"]["responses-Unauthorized"];
            403: components["responses"]["responses-ChatBlocked"];
            404: components["responses"]["responses-MatchNotFound"];
            422: components["responses"]["responses-Unprocessable"];
            500: components["responses"]["responses-Internal"];
        };
    };
    sendMessage: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Id del match. Un id malformado es 422, no 404. */
                matchId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["MessageCreate"];
            };
        };
        responses: {
            /**
             * @description Mensaje aceptado. Si ya existía uno con el mismo `clientMessageId` del
             *     mismo emisor, es ese mismo mensaje, sin duplicar.
             */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Message"];
                };
            };
            401: components["responses"]["responses-Unauthorized"];
            403: components["responses"]["responses-ChatBlocked"];
            404: components["responses"]["responses-MatchNotFound"];
            409: components["responses"]["responses-MatchClosed"];
            422: components["responses"]["responses-Unprocessable"];
            429: components["responses"]["responses-RateLimited"];
            500: components["responses"]["responses-Internal"];
        };
    };
    markMatchRead: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Id del match. Un id malformado es 422, no 404. */
                matchId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Leído. No hay body. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["responses-Unauthorized"];
            403: components["responses"]["responses-ChatBlocked"];
            404: components["responses"]["responses-MatchNotFound"];
            422: components["responses"]["responses-Unprocessable"];
            500: components["responses"]["responses-Internal"];
        };
    };
    getSelfProfile: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description El perfil de la sesión. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SelfProfile"];
                };
            };
            401: components["responses"]["responses-Unauthorized"];
            404: components["responses"]["responses-ProfileNotFound"];
            500: components["responses"]["responses-Internal"];
        };
    };
    listBlocks: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Los bloqueos propios, más reciente primero. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BlockList"];
                };
            };
            401: components["responses"]["responses-Unauthorized"];
            403: components["responses"]["responses-ProfileRequired"];
            500: components["responses"]["responses-Internal"];
        };
    };
    createBlock: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["BlockCreate"];
            };
        };
        responses: {
            /** @description Bloqueo creado (o el existente, si era idempotente). */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Block"];
                };
            };
            401: components["responses"]["responses-Unauthorized"];
            403: components["responses"]["responses-ProfileRequired"];
            404: components["responses"]["responses-ProfileNotFound"];
            422: components["responses"]["responses-Unprocessable"];
            500: components["responses"]["responses-Internal"];
        };
    };
    deleteBlock: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /**
                 * @description Perfil a desbloquear: el humano canonizado, o el bot cuyo dueño se
                 *     quiere desbloquear (se canoniza al dueño).
                 */
                profileId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description El par quedó sin bloqueo; no hay body. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["responses-Unauthorized"];
            403: components["responses"]["responses-ProfileRequired"];
            500: components["responses"]["responses-Internal"];
        };
    };
    createReport: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ReportCreate"];
            };
        };
        responses: {
            /** @description Reporte registrado; sólo el acuse, sin identidad del reportado. */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ReportReceipt"];
                };
            };
            401: components["responses"]["responses-Unauthorized"];
            403: components["responses"]["responses-ProfileRequired"];
            404: components["responses"]["responses-ProfileNotFound"];
            422: components["responses"]["responses-Unprocessable"];
            500: components["responses"]["responses-Internal"];
        };
    };
    listNotifications: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Notificaciones propias y total de no leídas. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NotificationList"];
                };
            };
            401: components["responses"]["responses-Unauthorized"];
            500: components["responses"]["responses-Internal"];
        };
    };
    readNotifications: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["NotificationReadRequest"];
            };
        };
        responses: {
            /** @description Cuántas se marcaron y cuántas quedan sin leer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NotificationReadResult"];
                };
            };
            401: components["responses"]["responses-Unauthorized"];
            422: components["responses"]["responses-Unprocessable"];
            500: components["responses"]["responses-Internal"];
        };
    };
}
