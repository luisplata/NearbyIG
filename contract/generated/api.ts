/**
 * GENERATED FILE — do not edit.
 *
 * Source: contract/openapi.yaml
 * Generator: openapi-typescript 7.13.0 (pinned exact in package.json)
 * Contract: x-contract-id 8f239137c03c
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
         *     devuelve `PresenceState`: `profileId`, `regionKey`, `zoneKey` y `online`.
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
         * @description Motivo del error, cerrado a estos 21 valores. `code` es el discriminante
         *     estable: el cliente decide con él, nunca con `title` ni con `detail` (esos
         *     son texto para humanos, traducible y variable).
         *
         *     No existe código 400: un cursor malformado es `VALIDATION_FAILED` (422) y uno
         *     fuera de retención es `CURSOR_EXPIRED` (410). La tabla completa —cuándo
         *     corresponde cada uno— vive en la spec del change.
         * @enum {string}
         */
        ErrorCode: "UNAUTHENTICATED" | "TICKET_EXPIRED" | "TICKET_REUSED" | "REGION_MISMATCH" | "CHAT_BLOCKED" | "PING_FORBIDDEN" | "PROFILE_NOT_FOUND" | "MATCH_NOT_FOUND" | "PING_NOT_FOUND" | "PROFILE_IN_USE" | "PRESENCE_STALE" | "PING_DUPLICATE" | "PING_RESOLVED" | "CURSOR_EXPIRED" | "PING_EXPIRED" | "RATE_LIMITED" | "REGION_UNAVAILABLE" | "ZONE_UNKNOWN" | "VALIDATION_FAILED" | "INTERNAL" | "NOT_IMPLEMENTED";
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
             */
            online: boolean;
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
         *     No hay `GET /matches` ni chat en esta versión: el `Match` se entrega en el
         *     `200` de aceptar y el emisor lo descubre por `Ping.matchId`. La conversación
         *     llega en S5.
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
         * @description Cuerpo de `PUT /presence`. Exactamente uno de los dos caminos:
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
            403: components["responses"]["responses-PingForbidden"];
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
}
