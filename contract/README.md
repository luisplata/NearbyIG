# Contrato de la API

El contrato es el producto de Sprint 0. Vive en `contract/`, la tercera raíz del
repo junto a `demo/` y `backend/`, y se escribe **antes** del server: Sprint 1 lo
consume y lo cumple, no lo define.

Es un único documento OpenAPI `3.1.0` repartido en varios archivos. Nada acá se
ejecuta en producción y nada acá toca la demo: `demo/` queda intacto. Lo único
que sale de este directorio hacia el artefacto publicado es el doc HTML de
`/contract/` (ver [Docs publicados](#docs-publicados)).

| Sí hay | No hay (todavía) |
|---|---|
| OpenAPI 3.1 a mano + lint + tests | Server, DB, Docker, NestJS |
| Superficie congelada S1–S4 con sprint por operation | Ninguna operation implementada |
| `ErrorCode` cerrado, envelope de eventos, catálogo MX/CO | Firebase, OAuth, secretos |
| Cliente TS type-only generado y commiteado | Cliente runtime |

El primer `curl` es Sprint 1. Hasta que `npm run contract:check` esté verde, no
hay contrato que implementar.

## Comandos

Corré `npm ci` una vez en la raíz. El tooling del contrato son cuatro
devDependencies pinneadas exactas: `@redocly/cli`, `openapi-typescript`,
`typescript` y `yaml`. Ninguna es runtime: el contrato no depende de nada en
producción.

| Comando | Qué hace |
|---|---|
| `npm run contract:validate` | `redocly lint` + invariantes estructurales |
| `npm run contract:generate` | regenera `generated/api.ts` desde el spec |
| `npm run contract:generate:check` | falla si el generado difiere **por bytes** |
| `npm run contract:typecheck` | `tsc -p contract/tsconfig.json` (`strict`, `noEmit`) |
| `npm run contract:seed` | emite el catálogo en forma canónica + `seed/manifest.json` |
| `npm run contract:seed:check` | falla si lo commiteado difiere de lo emitido |
| `npm run contract:seed:dry-run` | tabla `path \| rows \| sha \| estado`, sin escribir |
| `npm run contract:event-log` | deriva `event/sample-log.json` del catálogo |
| `npm run contract:event-log:check` | falla si el log commiteado no es el derivado |
| `npm run contract:test` | `node --test` sobre `contract/test/*.test.mjs` |
| `npm run contract:docs` | genera el doc HTML estático en `contract/dist/` |
| `npm run contract:gates` | los 5 gates de Sprint 0, pass/fail por gate |
| `npm run contract:check` | el gate completo (ver abajo) |

`contract:check` compone, en este orden:

```text
contract:validate      →  el spec es OpenAPI 3.1 y cumple sus invariantes
contract:generate:check →  api.ts commiteado == regenerado (bytes)
contract:seed:check    →  catálogo y manifest sin drift
contract:event-log:check →  sample-log.json == derivado del catálogo
contract:test          →  los casos de node:test (hoy 85)
contract:typecheck     →  el cliente compila en strict
git diff --exit-code   →  red secundaria: nada quedó sin commitear
```

El seed se verifica antes de los tests porque un `manifest` viejo invalida
cualquier verde posterior. El orden importa: cada paso barato falla primero y con
un mensaje propio, en vez de dejar que un test lejano explique el síntoma.

Corre en CI en `.github/workflows/contract.yml`, un workflow propio: `push` a `main`
y PRs que toquen `contract/`, `package.json`, `package-lock.json` o el workflow.
El job corre `contract:check`, además `contract:generate:check` como paso propio
(para que el drift del cliente se vea en el log de CI) y `npm run test:scripts`
para que el mock siga verde. Permisos mínimos (`contents: read`) y `concurrency`
por ref. El workflow de Pages (`pages.yml`) no se toca y sigue siendo el único que
publica Pages; un test lo verifica en `scripts/lib/workflow.test.mjs`.

## Docs publicados

El mismo contrato, legible en el navegador:

| Dónde | Qué |
|---|---|
| Local | `npm run contract:docs` → abrí `contract/dist/index.html` |
| Pages | `/contract/` — `https://<owner>.github.io/<repo>/contract/`, o `/contract/` si es sitio de usuario |

`contract/dist/` está ignorado por git: el doc se **regenera** en cada build de
Pages y nunca se commitea. Lo escribe `scripts/build-contract-docs.mjs` con el
`@redocly/cli` pinneado del `node_modules` (sin `npx`, sin red) y tres cosas que
importan:

| Pieza | Por qué |
|---|---|
| `--inlineBundle` | mete el bundle de Redoc **dentro** del HTML; sin eso el doc baja el JS de `cdn.redocly.com` en runtime |
| `REDOCLY_TELEMETRY=off` | Redoc deja la telemetría prendida por default y manda trazas a `otel.cloud.redocly.com` |
| `--openapi.router=hash` | deep links `#/operation/...`: el doc no depende del base path de Pages |

El resultado es **un único HTML autocontenido** (~2.5 MB): no hay carpeta de
assets ni rewrite por base path. El doc no entra en `contract:check`: no se
revisa a mano, se regenera. Un cambio de prosa en el contrato es un cambio en
`openapi.yaml`/`paths/`/`schemas/`, nunca en el HTML.

`scripts/assemble-site.mjs` lo copia a `site/contract/` y lo audita antes del
upload. El gate del doc es más fuerte que la allowlist de hosts del artefacto:

| Regla | Cómo falla |
|---|---|
| existe `contract/index.html` cuando el artefacto es el de publicación (`--strict`) | exit 1 |
| `contract/` tiene **un solo archivo** | exit 1 si aparece un hermano (`.yaml`, `.js`, `.map`) |
| el doc no carga subrecursos (`src`/`href` en tags que cargan, `url(http…)`, `@import http…`) | exit 1 |
| `disableTelemetry` en `true` | exit 1 (se generó sin el env) |
| el HTML contiene el `x-contract-id` vigente | exit 1 (docs viejos: regenerá) |

## Estructura

```text
contract/
  openapi.yaml              raíz: info, servers, security global, tags, montaje de paths
  redocly.yaml              ruleset (extends: recommended)
  paths/auth.yaml           path items de auth (S1)
  paths/events.yaml         GET /events (SSE) y GET /events/poll (S2)
  paths/catalog.yaml        GET /demo/regions y GET /demo/zones (S2), sin geometría
  paths/profiles.yaml       GET /demo/profiles (S1), sin geometría
  paths/presence.yaml       PUT y DELETE /presence (S2): la única entrada con coordenadas
  paths/discovery.yaml      GET /discovery (S3): radio y filtros, sin geometría
  paths/pings.yaml          POST y GET /pings, accept y reject (S4)
  paths/matches.yaml        GET /matches, mensajes y read (S4, delta v0.4)
  paths/me.yaml             GET /me: el perfil de la propia sesión (delta v0.4)
  schemas/auth.yaml         DemoSession, DemoSessionRequest, TakeoverRequest, StreamTicket
  schemas/events.yaml       envelope, los 6 tipos, los 6 payloads, EventsPage
  schemas/region.yaml       Region, RegionList, ZoneSummary, ZoneList
  schemas/profile.yaml      ProfileSummary, ProfileList, SelfProfile
  schemas/presence.yaml     PresenceUpdate (no montado), PrivatePoint (no montado), PresenceState
  schemas/discovery.yaml    DiscoveryQuery, DiscoveryResult
  schemas/pings.yaml        Ping, PingList (con PingPeer), PingCreate y Match
  schemas/chat.yaml         Message, MessageCreate, MessagePage, MatchListItem y MatchList
  schemas/common.yaml       RegionKey, SourceType, Gender, Intention, KeyLabel, Page
  catalog/regions.json      dos regiones: mx, co (con defaultZoneKey)
  catalog/zones.json        geometría de CDMX y Bogotá: anillos [lng, lat]
  catalog/profiles.mx.json  10 perfiles derivados de fixtures.json (posición a posición)
  catalog/profiles.co.json  10 perfiles autorados, mismo shape
  seed/manifest.json        versión, contractId, hash de fixtures y sha de cada archivo emitido
  event/sample-log.json     log derivado del catálogo: 40 eventos con un duplicado
  generated/api.ts          cliente TS type-only, generado y commiteado
  tsconfig.json             strict + noEmit, sólo generated/
  scripts/lib/spec.mjs      carga los YAML, resuelve $ref, calcula x-contract-id
  scripts/lib/events.mjs    proyecciones puras: parseEnvelopeId, toSseFrames, toPollPage
  scripts/lib/walk.mjs      DFS de schemas: properties, items, allOf, oneOf, examples
  scripts/seed.mjs          emisor canónico del catálogo + manifest (--check, --dry-run)
  scripts/event-log.mjs     deriva el sample log del catálogo (--check, --dry-run)
  scripts/generate-client.mjs  openapi-typescript + header fijo + --check por bytes
  scripts/validate-spec.mjs gate: lint + invariantes
  scripts/gates.mjs         los 5 gates de Sprint 0 con exit code agregado
  test/spec-valid.test.mjs  inventario de operations + invariantes
  test/takeover-contract.test.mjs  inUse + takeover: forma del delta v0.2
  test/events-contract.test.mjs  envelope, dedupe, paridad SSE ≡ polling y log derivado
  test/zones-geometry.test.mjs   anillos válidos + geometría inalcanzable desde el spec
  test/fixtures-parity.test.mjs  paridad campo a campo con fixtures (fixtures gana)
  test/seed-idempotent.test.mjs  doble emisión byte-idéntica + gate anti-drift
  test/chat-contract.test.mjs   el delta v0.4: chat, idempotencia y SelfProfile
  test/presence-discovery.test.mjs  punto o zona, fallback y el filtro de discovery
  test/no-coordinates.test.mjs   walk de responses y eventos: ninguna coordenada sale
  test/client-drift.test.mjs     api.ts == regenerado, determinista y type-only
  test/secrets.test.mjs          denylist + Firebase sobre todo contract/
```

### Cómo se arma un path

Los archivos de `paths/` son un **mapa nombre → path item**, sin `/` en la clave.
La raíz es la que monta el path público, así el path real vive en un solo lugar y
el `$ref` se lee sin punteros escapados:

```yaml
# openapi.yaml
paths:
  /auth/demo-session:
    $ref: './paths/auth.yaml#/demo-session'
```

```yaml
# paths/auth.yaml
demo-session:
  post:
    operationId: createDemoSession
    tags: [auth]
    security: []
    x-implementation-sprint: 1
```

## Superficie congelada (S1–S4)

Lo que está adentro es la superficie de la demo. Lo que está afuera se congela
cuando exista un diseño que lo congele: block, report y `/health` no tienen path.
Desde v0.4 un match **sí** es un recurso: `GET /matches` es la bandeja y su
conversación cuelga de `GET|POST /matches/{matchId}/messages` (ver
[Chat (delta v0.4)](#chat-delta-v04)).

| Operation | Sprint | Archivo | Entra en |
|---|---:|---|---|
| `POST /auth/demo-session` | 1 | `paths/auth.yaml` | PR1 |
| `POST /auth/takeover` | 1 | `paths/auth.yaml` | **v0.2** |
| `POST /auth/logout` | 1 | `paths/auth.yaml` | PR1 |
| `POST /auth/stream-ticket` | 1 | `paths/auth.yaml` | PR1 |
| `GET /demo/profiles` | 1 | `paths/profiles.yaml` | PR5 |
| `GET /events`, `GET /events/poll` | 2 | `paths/events.yaml` | PR3 |
| `GET /demo/regions`, `GET /demo/zones` | 2 | `paths/catalog.yaml` | PR4 |
| `PUT /presence`, `DELETE /presence` | 2 | `paths/presence.yaml` | PR6 |
| `GET /discovery` | 3 | `paths/discovery.yaml` | PR6 |
| `POST /pings`, `GET /pings` | 4 | `paths/pings.yaml` | **v0.3** |
| `POST /pings/{pingId}/accept`, `POST /pings/{pingId}/reject` | 4 | `paths/pings.yaml` | **v0.3** |
| `GET /matches` | 4 | `paths/matches.yaml` | **v0.4** |
| `GET /matches/{matchId}/messages`, `POST /matches/{matchId}/messages` | 4 | `paths/matches.yaml` | **v0.4** |
| `POST /matches/{matchId}/read` | 4 | `paths/matches.yaml` | **v0.4** |
| `GET /me` | 4 | `paths/me.yaml` | **v0.4** |

## Ocupación y takeover (delta v0.2)

La demo de Sprint 1 tiene selector de perfiles: hay que ver "en uso" **antes** de
intentar reclamar, y hay que poder desalojar. v0.1 no modelaba ninguna de las dos
cosas, así que el cliente sólo descubría la ocupación comiendo un `409` y no
tenía forma de desalojar sin mentir. El delta es chico y no cambia ningún DTO
existente:

| Pieza | Forma | Qué resuelve |
|---|---|---|
| `ProfileSummary.inUse` | `boolean` obligatorio | El selector pinta "en uso" con una sola lectura |
| `POST /auth/takeover` | body `{ regionKey, demoSlot }` → 200 `DemoSession` | El desalojo es explícito y con sujeto |

Reglas que el contrato fija y el server no puede reinterpretar:

| Caso | Respuesta | Por qué |
|---|---|---|
| slot ocupado por otra sesión viva | **200** `DemoSession` | El token nuevo es el único que sirve: el anterior queda revocado en el acto y sus tickets se queman |
| slot libre | **200** `DemoSession` | La postcondición ("ocupás el slot") se cumple igual; `inUse` es una foto y la carrera es benigna |
| slot ocupado por la **propia** sesión | **409** `PROFILE_IN_USE` | No hay nada que desalojar y "renovar" el token apagaría la credencial en uso |
| `regionKey` distinta a la de la sesión | **403** `REGION_MISMATCH` | Un takeover nunca cruza regiones, ni siquiera para "liberar" |
| body inválido o slot sin perfil | **422** `VALIDATION_FAILED` | Es schema, no estado |
| sin token | **401** `UNAUTHENTICATED` | El takeover hereda `demoSession`: el desalojo tiene sujeto |

**Por qué `inUse` no está en el seed.** `catalog/profiles.*.json` es data
congelada y determinista; la ocupación es estado que cambia con cada login. Si
`inUse` viviera en el catálogo, `contract:seed:check` fallaría en cada sesión
abierta. Por eso `fixtures-parity` separa las 16 claves del seed de las 17 de la
respuesta (`inUse` es la única respuesta-only).

**Por qué takeover es una operation y no un flag.** Un `takeover: true` dentro de
`DemoSessionRequest` convierte el claim en un desalojo opcional y el cliente que
lo olvida descubre el bug en producción. Como operation aparte, el contrato
obliga a nombrar el slot y a elegir el verbo: `demo-session` dice "dale, sin
desalojar"; `takeover` dice "este slot es mío". `POST /auth/demo-session` sobre un
slot ocupado sigue siendo `409 PROFILE_IN_USE`.

`inUse` viaja también en `DiscoveryResult`, que reusa `ProfileSummary`: es el
mismo dato (¿hay alguien en ese slot?) y no se agrega un DTO nuevo para esconderlo.

## Pings y matches (delta v0.3)

Sprint 4 entra con el slice mínimo que hace que la demo se sienta viva: enviar
un ping, verlo en la bandeja, aceptarlo o rechazarlo, y que el match exista. No
hay chat, ni `GET /matches`, ni bloqueo.

| Operation | Sprint | Respuesta | Qué hace |
|---|---:|---|---|
| `POST /pings` | 4 | 201 `Ping` | Crea el ping `A → B`. Si `B` es un bot, vuelve `accepted` con `matchId` |
| `GET /pings?box=inbox\|sent` | 4 | 200 `PingList` | Bandeja: `createdAt` desc, con la proyección del otro perfil |
| `POST /pings/{pingId}/accept` | 4 | 200 `Match` | Sólo el destinatario. Un match por par |
| `POST /pings/{pingId}/reject` | 4 | 204 | Sólo el destinatario. Sin match |

**La máquina de estados.** `pending` es el único estado del que se sale; los
otros tres son terminales. La transición la decide el server, no el reloj del
cliente:

| Caso | Respuesta | Por qué |
|---|---|---|
| ping a sí mismo | 422 `VALIDATION_FAILED` | El body está bien; el pedido no |
| destino de otra región, inexistente o bot sin dueño vivo | 404 `PROFILE_NOT_FOUND` | Un ping no cruza regiones y un bot sin presencia no está |
| ya hay un pendiente en ese par dirigido | 409 `PING_DUPLICATE` | Un pendiente por par (`A → B` y `B → A` son distintos) |
| el pendiente del par ya venció | 410 `PING_EXPIRED` | Se cierra el viejo; reintentar crea uno nuevo |
| cuota de envíos agotada | 429 `RATE_LIMITED` | El body no se corrige, se espera |
| aceptar/rechazar un ping ajeno | 403 `PING_FORBIDDEN` | Sólo el destinatario resuelve |
| aceptar/rechazar uno ya resuelto | 409 `PING_RESOLVED` | Idempotencia explícita: el cliente sabe que no cambió nada |
| aceptar/rechazar uno vencido | 410 `PING_EXPIRED` | Y no se crea match |
| `pingId` que no es uuid | 422 `VALIDATION_FAILED` | Mal escrito antes de faltar |

**El bot acepta solo.** Si el destinatario es un bot (`<owner>-b1`), el ping
vuelve ya `accepted` con `matchId` en la misma transacción. No hay job que
despierte bots a los 2 s: la demo se siente viva y el cliente no tiene un caso
especial, porque mira el mismo `Ping`.

**Un match por par, y lo dice la base.** `matches` tiene `UNIQUE (region_key,
profile_a_id, profile_b_id)` con el par ordenado (`a < b`): dos pings aceptados
en direcciones opuestas no producen dos matches. La aplicación acepta el ping con
un `UPDATE … WHERE status = 'pending'`, así que de dos aceptaciones simultáneas
sólo una gana y la otra es 409.

**Cómo ve el match el emisor.** El `Match` viaja en el `200` de aceptar y
`Ping.matchId` lo publica en la bandeja: `A` lo descubre poleando
`GET /pings?box=sent` y viendo el ping en `accepted` con su `matchId`. Desde v0.4
además lo ve en `GET /matches`, que es la bandeja de conversaciones; el
`Ping.matchId` sigue siendo el camino más corto entre "aceptaron mi ping" y
"abrime el chat".

**`PingList` no es un array de `Ping`.** Cada fila es `PingListItem { ping,
peer }`: el ping y el otro perfil (nickname, iniciales, foto, intención,
`sourceType`). Sin eso, la bandeja obligaría al cliente a cruzar el ping contra
`/demo/profiles`, que además no conoce a los bots. El `peer` de un bot hereda la
proyección de su dueño, igual que en `GET /discovery`.

**Tres códigos nuevos y dos que dejan de estar reservados.** `PING_DUPLICATE` y
`PING_EXPIRED` salen de `x-reserved` porque ahora tienen operation. Se suman
`PING_FORBIDDEN` (403), `PING_NOT_FOUND` (404) y `PING_RESOLVED` (409) porque
son tres decisiones distintas del cliente: "no es tuyo", "no existe" y "ya está
resuelto" no se pueden colapsar en un código sin que el cliente mienta.
`MATCH_NOT_FOUND` y `CHAT_BLOCKED` quedaron reservados para S5 hasta que v0.4
les dio operation (ver [Chat](#chat-delta-v04)).

**TTL.** Un ping pendiente vence a las 24 h (`expiresAt` en la fila). El
vencimiento es perezoso: se aplica al leer la bandeja y al resolver, no con un
cron. La demo no tiene volumen para un job de barrido y un ping vencido sólo
importa cuando alguien lo mira.

## Chat (delta v0.4)

v0.3 entregó un match sin conversación. v0.4 cierra el flujo: la bandeja de
matches, la conversación paginada, la escritura idempotente y el perfil propio
que el tab Perfil necesita.

| Operation | Sprint | Respuesta | Qué hace |
|---|---:|---|---|
| `GET /matches` | 4 | 200 `MatchList` | Bandas de conversaciones: el match, el peer del otro, `lastMessage` y `unreadCount` |
| `GET /matches/{matchId}/messages` | 4 | 200 `MessagePage` | La conversación, cronológica, paginada con cursor opaco |
| `POST /matches/{matchId}/messages` | 4 | 201 `Message` | Escribe; idempotente por `clientMessageId` |
| `POST /matches/{matchId}/read` | 4 | 204 | Marca leídos los mensajes del otro lado |
| `GET /me` | 4 | 200 `SelfProfile` | El perfil de la propia sesión, no el `self` del dataset |

Reglas que el contrato fija y el server no reinterpreta:

| Caso | Respuesta | Por qué |
|---|---|---|
| match inexistente en la región | 404 `MATCH_NOT_FOUND` | Un match no cruza regiones |
| match de la región del que no sos parte | 403 `CHAT_BLOCKED` | El recurso existe; el derecho, no |
| conversación cerrada (el otro lado ya no está) | 409 `MATCH_CLOSED` | La historia queda legible; escribir, no |
| `body` vacío o con campos de más | 422 `VALIDATION_FAILED` | Es schema, no estado |
| `matchId` o `cursor` malformado | 422 `VALIDATION_FAILED` | Mal escrito antes de faltar |
| cuota de envíos agotada | 429 `RATE_LIMITED` | El body no se corrige, se espera |
| `GET /me` sin perfil de catálogo (invitado) | 404 `PROFILE_NOT_FOUND` | No hay nickname que devolver sin inventarlo |

**Por qué `Message.clientMessageId` vuelve en la response.** Es la clave que
puso el cliente para reintentar sin duplicar: sin ella, un refresh de la lista no
puede reconciliar el mensaje del server con la burbuja optimista que ya está en
pantalla, y termina comparando por texto y hora. La idempotencia es por `(match,
emisor)`: dos personas pueden usar el mismo valor en la misma conversación.

**El cursor es opaco.** `nextCursor` no es un `seq` de evento ni un `createdAt`:
es lo que el server necesite para no perder ni repetir filas cuando dos mensajes
llegan en el mismo milisegundo, y el cliente lo devuelve tal cual. `hasMore`
dice si quedó algo; una página vacía al final devuelve `nextCursor: null`.

**El bot responde solo.** Si el otro lado de un match es un bot, el server agenda
una respuesta a los ~2 s y emite `typing.started` en el acto. El cliente no
simula nada y no hay timer duplicado: la espera es del server y la respuesta
llega como `message.created` por el stream, igual que la de un humano.

**Los eventos del chat son de los participantes.** `message.created` lleva
`matchId`, no `profileId`, así que la visibilidad no puede ser la del resto del
stream (humanos de la región + bots visibles): filtrar por región le mostraría a
cualquiera las conversaciones ajenas. La regla es "soy uno de los dos lados de
ese match", y el payload no lleva el texto: el evento avisa, la conversación se
lee por HTTP.

**Dos códigos dejan de estar reservados y entra uno.** `MATCH_NOT_FOUND` y
`CHAT_BLOCKED` ya tienen operation, así que salen de `x-reserved`; se suma
`MATCH_CLOSED` (409) porque "la conversación ya no acepta mensajes" no se podía
expresar con los códigos existentes sin mentir. **Desde v0.4 no queda ningún
código reservado**: el bloqueo de S5 reusará `CHAT_BLOCKED`.

## Regiones y zonas: la geometría existe y nunca viaja

El catálogo **tiene** polígonos: `contract/catalog/zones.json` guarda CDMX y
Bogotá como anillos de pares `[lng, lat]`. Lo que no puede pasar es que una
coordenada llegue a un response o a un payload de evento. La frontera es el spec:

| Qué | Dónde vive | Sale por HTTP |
|---|---|---|
| `ZoneSummary { zoneKey, nameKey, regionKey }` | `schemas/region.yaml` → `components.schemas.ZoneSummary` | sí, y nada más |
| `Region { regionKey, nameKey, defaultZoneKey }` | `schemas/region.yaml` → `components.schemas.Region` | sí |
| `polygon[]` de anillos con vértices `[lng, lat]` | **sólo** `catalog/zones.json` | **nunca** |

Por qué alcanza con eso: un `$ref` del contrato resuelve dentro del spec y el
catálogo no es un schema, es un archivo de datos. Si alguien agrega
`ZonePolygon` a `components.schemas`, el guard de abajo lo ve; si alguien lo
apunta a `catalog/zones.json`, `contract:validate` falla porque el `$ref` sale
del spec y el guard de geometría falla porque ningún `$ref` puede nombrar
`catalog/`. Las dos puertas están cerradas.

`contract/test/zones-geometry.test.mjs` **no** usa una allowlist de schemas: una
lista de nombres permitidos deja pasar el próximo schema que nadie sumó. Recorre
el grafo resuelto desde toda `responses.*.content.*.schema` y desde todo
`components.schemas`, y falla nombrando la ruta cuando aparece:

- una propiedad `polygon`, `polygons`, `ring`, `rings`, `center`, `geometry`,
  `coordinates`, `lat`, `lng`, `lon`, `latitude` o `longitude`;
- un array de exactamente dos números (`prefixItems`) o un literal `[n, n]`, que
  es una coordenada sin nombre;
- un `$ref` que apunte a `catalog/`.

| Regla del anillo | Valor |
|---|---|
| Forma del vértice | par posicional `[lng, lat]`; prohibido `{"lng": …}` y `{"lat": …}` |
| Cierre | primer vértice == último |
| Vértices | ≥3 distintos (≥4 puntos contando el cierre) |
| Precisión | exactamente 6 decimales **en el archivo** (no es cosmético: es el formato del seed) |
| Rango | `lng` ∈ [−180, 180], `lat` ∈ [−90, 90] |
| Prohibido en el catálogo | `center`: no hay centro, el polígono alcanza |

Los datos son aproximados y plausibles, no catastrales: la demo dibuja una zona,
no resuelve límites administrativos.

### Cómo agregar una zona

1. Sumar la fila a `catalog/zones.json` con `zoneKey`, `regionKey`, `nameKey` y
   `polygon` (anillo cerrado, 6 decimales). Sin `center`.
2. Si es la zona por defecto de su región, apuntarla desde
   `defaultZoneKey` en `catalog/regions.json`. El test verifica que exista y que
   sea de la misma región.
3. `npm run contract:test`. Nada del spec cambia: `ZoneSummary` ya la proyecta.

## Perfiles: 20 filas y la paridad con fixtures

`GET /demo/profiles` devuelve los 10 perfiles de una región, ordenados por
`demoSlot`. La fila es `ProfileSummary`: los 13 campos del dataset más
`regionKey`, `demoSlot`, `sourceType` y —desde v0.2— `inUse`, que es estado de
runtime y no está en el seed (ver [Ocupación y takeover](#ocupación-y-takeover-delta-v02)).

| Archivo | Filas | De dónde sale |
|---|---:|---|
| `catalog/profiles.mx.json` | 10 | **derivado** de `demo/shared/fixtures.json` → `profiles[i]`, posición por posición |
| `catalog/profiles.co.json` | 10 | **autorado**: mismo shape, otros valores, `profileId` distintos |
| `schemas/profile.yaml` | — | `ProfileSummary`, `ProfileList`, `SelfProfile` |

Quién manda en cada campo:

| Campo | Origen |
|---|---|
| los 13 del dataset (`nickname`, `initials`, `intention`, `gender`, `verified`, `online`, `distanceM`, `bearingDeg`, `photoId`, `instagramHandle`, `statusKey`, `bioKey` y el `id`) | **`fixtures.json` gana**: el catálogo no puede cambiar el valor |
| `profileId` | `"{regionKey}-" + fixtures.profiles[i].id` (`mx-p01`), la identidad que usan los eventos |
| `regionKey`, `demoSlot` (`i + 1`), `sourceType: human` | los agrega el contrato |

`contract/test/fixtures-parity.test.mjs` no comprueba que el campo exista:
compara el valor, y cuando difiere falla con perfil, campo y ambos valores. El
mapping es una tabla de datos, así que además falla si `fixtures.json` estrena un
campo sin entrada en la tabla (el catálogo se quedaría sin ese dato en silencio).

Reglas que el catálogo cumple y el test congela:

- 10 filas por región, `demoSlot` 1..10 sin huecos ni repetidos, `sourceType: human`.
- los 20 `profileId` son únicos; `mx` y `co` no comparten ninguno.
- cada intención (`networking`, `friendship`, `activities`) la usan ≥2 perfiles por región y los 3 géneros aparecen.
- **sin objeto `avatar`**: la foto se resuelve por `photoId` contra el bundle de la demo, así el catálogo no duplica los datos del avatar.
- `ProfileSummary` cierra con `additionalProperties: false` y declara exactamente esas 16 claves más `inUse`: un campo que no existe en el schema no llega a la respuesta, y `inUse` no llega al catálogo.

Los invitados no están en el catálogo: son sesión de relleno, no perfiles
descubribles. `demoSlot: null` está en el schema porque `SourceType` lo admite,
pero ninguna de las 20 filas es `guest`.

### Cómo cambiar un perfil

1. Si es de `mx`, el valor se cambia **en `demo/shared/fixtures.json`** y se
   regenera el catálogo. Editar `profiles.mx.json` a mano rompe la paridad.
2. Si es de `co`, se edita `profiles.co.json` respetando el shape y la cobertura.
3. `npm run contract:test`. El schema no cambia: `ProfileSummary` ya lo proyecta.

## Seeds deterministas

El seed **es** el catálogo emitido. `npm run contract:seed` escribe los cuatro
archivos de `catalog/` en una forma única y `seed/manifest.json` con lo que emitió:

| Archivo | Forma | `rows` |
|---|---|---:|
| `catalog/regions.json` | una fila por línea, claves ordenadas, orden `(regionKey)` | 2 |
| `catalog/zones.json` | una zona por línea, vértices `[lng, lat]` con **6 decimales** | 2 |
| `catalog/profiles.mx.json`, `catalog/profiles.co.json` | una fila por línea, orden `(regionKey, demoSlot)` | 10 + 10 |

`seed/manifest.json`:

| Campo | Qué ata |
|---|---|
| `seedVersion` | versión del **formato** (sube cuando cambia la forma, no los datos) |
| `contractId` | el `x-contract-id` vigente: el seed y el contrato no pueden desincronizarse |
| `sources.fixtures.sha256` | el hash de `demo/shared/fixtures.json` con LF: tocarlo sin regenerar rompe el gate |
| `files[{ path, rows, sha256 }]` | qué se emitió; `path` relativo a `contract/` |
| `seedId` | `seed-` + 12 hex de lo emitido (sin incluirse a sí mismo) |

| Comando | Qué hace | Exit |
|---|---|---:|
| `npm run contract:seed` | emite y escribe; muestra la tabla con el estado previo | 0 |
| `npm run contract:seed:check` | compara lo emitido con lo commiteado | 1 si hay `drift` o `nuevo` |
| `npm run contract:seed:dry-run` | imprime la tabla y **no escribe nada** | 0 |

La tabla es `path | rows | sha | estado` y el estado es uno de `sin cambios`,
`drift` (existe y difiere) o `nuevo` (falta). `contract:check` corre
`contract:seed:check` antes de los tests: un manifest viejo invalida cualquier
verde posterior.

**Qué se prueba:** dos emisiones producen bytes idénticos y el mismo `seedId`
(`test/seed-idempotent.test.mjs`, emitiendo a dos directorios temporales). Eso es
idempotencia de **emisión**, una función pura del input.

**Qué no se prueba todavía:** la idempotencia de **inserción**. No hay DB en
Sprint 0, así que cualquier `INSERT` acá sería una invención. En Sprint 1 se
garantiza por claves naturales — `region_key + zone_key` para zonas y
`region_key + demo_slot` para perfiles — con `ON CONFLICT DO NOTHING`. El seed ya
trae esas dos claves: es lo único que S1 tiene que agregar al esquema.

### Cómo regenerar el seed

1. Cambiá el catálogo (o `fixtures.json`, si es un perfil `mx`).
2. `npm run contract:seed`.
3. Revisá el `git diff`: si aparece un archivo entero reescrito, es que el input
   no estaba canónico. `--check` lo habría detectado igual.
4. `npm run contract:check` y commiteá catálogo + manifest juntos.

## Eventos: envelope y replay

Un solo envelope para las dos proyecciones. `GET /events` (SSE) y
`GET /events/poll` (cursor) entregan la misma secuencia desde el mismo cursor, y
`contract/test/events-contract.test.mjs` lo prueba sobre el log congelado: las
dos son funciones puras del mismo archivo.

| Pieza | Regla |
|---|---|
| `id` | `<regionKey>:<seq:012d>` (`mx:000000000042`). `seq` es monotónico **por región** |
| Orden | lo da `seq`. `occurredAt` es RFC 3339 UTC con ms y **no ordena** |
| Reanudar | `Last-Event-ID` (SSE) o `?cursor=` (poll) = último `id` entregado → se sigue en `seq + 1` |
| Dedupe | el cliente descarta `seq <= lastSeen`; el log trae un duplicado idéntico a propósito |
| Página vacía | `nextCursor` vuelve igual al recibido y `hasMore: false` |
| Cursor viejo / malformado | 410 `CURSOR_EXPIRED` / 422 `VALIDATION_FAILED` (no hay 400) |
| Ticket | `streamTicket` en query, **sólo** en `GET /events`: `EventSource` no manda headers |

`contract/event/sample-log.json` es **derivado**, no escrito a mano: lo emite
`scripts/event-log.mjs` desde `catalog/profiles.*.json`. Cada entrada referencia un
perfil real y copia sus valores (`distanceM`/`bearingDeg`, `online`), así que editar
un perfil sin regenerar el log rompe `contract:event-log:check` (y el test de
bytes). El fixture conserva lo que PR3 congeló: 40 entradas, 24 `seq` de `mx` y 15
de `co`, un duplicado exacto de `mx:000000000007` y el quinto evento de `mx` con
`occurredAt` anterior al anterior (`17:59:50`, el reloj no ordena).

### Cómo regenerar el log de eventos

1. Cambiá el catálogo (o `fixtures.json`, y después `npm run contract:seed`).
2. `npm run contract:event-log`.
3. `npm run contract:event-log:check` y `npm run contract:test`.
4. Commiteá catálogo, manifest y log juntos: el test compara bytes, no fechas.

Si lo que querés es más o menos volumen, la agenda está en `TRACK` dentro de
`scripts/event-log.mjs` — no se edita el JSON.

### Cómo agregar un tipo de evento

1. El valor ya está en `EventType` si es uno de los seis congelados. Si no,
   sumalo ahí: el enum es el contrato con el cliente.
2. Declarar `<Tipo>Payload` con `additionalProperties: false` — sin `lat`, `lng`,
   `latitude` ni `longitude`; distancia y rumbo van como `distanceM`/`bearingDeg`.
3. Sumarlo al `oneOf` de `EventPayload` y montarlo en `components.schemas`. El
   envelope **no** cambia.
4. Extender `PAYLOAD_SCHEMA` en `contract/test/events-contract.test.mjs`.

## Presencia y descubrimiento: la coordenada entra, no sale

`PUT /presence` es la **única** entrada del contrato que acepta coordenadas.
`GET /discovery` mide desde esa presencia y devuelve perfiles, nunca el punto.

| Pieza | Regla |
|---|---|
| `PUT /presence` | acepta `point` **o** `demoZoneKey`, exactamente uno; los dos o ninguno es 422 |
| `point` | `lat` + `lng` en grados decimales; se redondea a 6 decimales antes de `ST_Covers` |
| región y zona | el server las deriva con `ST_Covers` contra `catalog/zones.json`; el contrato describe el resultado, no el algoritmo |
| fallback | punto fuera de todo polígono → 200 con `fallbackRequired: true` y `zoneKey: null`; **no** es un `Problem` |
| `DELETE /presence` | 204, o 409 `PRESENCE_STALE` si no había presencia viva |
| `GET /discovery` | `radiusM` 200–5000 (default 5000), `intention`, `gender`, `verified`, `online` |
| fila del resultado | `ProfileSummary`: descubrir no agrega campos, mide |
| distancia | `distanceM` y `bearingDeg` server-side, redondeados al metro y al grado (half-up) |
| exclusiones | el propio perfil, los bloqueados, los pausados y los perfiles de otra región |
| sin implementar | en S1/S2, `GET /discovery` responde 501 `NOT_IMPLEMENTED` |

**Por qué el request no está en `components.schemas`.** `PresenceUpdate` y
`PrivatePoint` viven en `schemas/presence.yaml` pero **no** se montan en
`openapi.yaml`. Montarlos los metería en `components.schemas`, que es la
superficie que `zones-geometry.test.mjs` recorre entera: el guard fallaría —con
razón— al ver un `lat`. La frontera no es "no hay coordenadas en el repo", es
"ninguna coordenada puede salir"; poner el punto del lado de la entrada y dejar
`components` del lado de la salida es lo que hace que el guard siga cerrado sin
excepciones. El `requestBody` lo referencia directo, que es donde se usa.

**El 422 de presencia lleva dos `code`.** `VALIDATION_FAILED` si el body no trae
exactamente uno de `point`/`demoZoneKey`, `ZONE_UNKNOWN` si la zona no existe en
el catálogo. El status es uno y `Problem.code` discrimina; por eso `x-error-code`
acepta una lista (ver [Reglas de la casa](#reglas-de-la-casa)).

### Cómo agregar un filtro de descubrimiento

1. Sumar la propiedad a `DiscoveryQuery` en `schemas/discovery.yaml`.
2. Sumar el parámetro con el mismo nombre, tipo, borde, `default` y `enum` en
   `paths/discovery.yaml`. El test falla si las dos listas difieren.
3. `npm run contract:test`. Si el filtro necesita datos que `ProfileSummary` no
   tiene, primero se agrega al dataset y al catálogo (no al response).


## Cliente TypeScript: generado, commiteado, sin runtime

`contract/generated/api.ts` es el contrato con tipos. S3 lo importa; no hay
cliente HTTP, ni hooks, ni cliente mock: eso lo pone la app, porque ningún
generador sabe si la demo corre contra el mock o contra el server.

| Pieza | Regla |
|---|---|
| Origen | sólo `openapi.yaml`; `openapi-typescript` **pinneado exacto** en `package.json` |
| Header | versión del generador instalada + `x-contract-id` vigente, sin timestamps |
| Formato | LF, claves en el orden del spec: dos corridas dan los mismos bytes |
| Runtime | cero: el archivo no importa ni ejecuta nada (un test lo verifica) |
| Gate | `contract:generate:check` compara **bytes**; `git diff --exit-code` es la red secundaria |
| Tipos | `paths`, `components` (con `schemas`, `responses`, `securitySchemes`) y `operations` |
| Compilación | `contract/tsconfig.json`: `strict`, `exactOptionalPropertyTypes`, `noEmit`, sólo `generated/` |

### Cómo regenerar el cliente

1. Cambiá el spec (`openapi.yaml`, `paths/`, `schemas/`).
2. `npm run contract:validate` → si el `x-contract-id` cambió, copialo al spec y
   repetí hasta que valide.
3. `npm run contract:generate`.
4. `npm run contract:typecheck` (tiene que compilar en `strict`).
5. `npm run contract:check` y commit del spec **y** del generado juntos.

### Cuando el gate de drift falla

`contract:generate:check` falla en tres casos, y el mensaje dice cuál:

| Caso | Qué hacer |
|---|---|
| falta `generated/api.ts` | `npm run contract:generate` |
| el archivo difiere del regenerado | `npm run contract:generate` y commitear; **nunca** editar a mano |
| difiere sólo en el header | el `x-contract-id` cambió: regenerá después de que `contract:validate` esté verde |

Si después de regenerar el comando sigue fallando, el problema no es el archivo:
es que el generador no es determinista. En ese caso **pará** y reportalo — un gate
de drift inestable es peor que no tener gate, porque enseña a ignorarlo.

## Los cinco gates de Sprint 0

`npm run contract:gates` corre los cinco y reporta pass/fail por gate con exit code
agregado. No corta en el primero: el reporte muestra el estado real de todos.

```text
G1 · el contrato compila y el cliente TS se genera
   ✓ contract:validate · contract:generate:check · contract:typecheck
G2 · los seeds corren dos veces sin duplicar
   ✓ seed-idempotent · contract:seed:dry-run
G3 · ningún DTO expone coordenadas
   ✓ no-coordinates
G4 · el mock sigue intacto y publicable
   ✓ validate · sync:check · test:scripts · diff demo/ site/ · assemble --strict
G5 · sin secretos ni configuración de Firebase
   ✓ secrets
```

| Gate | Qué lo prueba |
|---|---|
| 1. Contrato compila y cliente se genera | `contract:validate` + `contract:generate:check` + `contract:typecheck` |
| 2. Seeds dos veces sin duplicar | `seed-idempotent.test.mjs` + `contract:seed:dry-run` |
| 3. Ningún DTO expone coordenadas | `no-coordinates.test.mjs` (walk de responses + eventos) |
| 4. Mock intacto y publicable | `validate` + `sync:check` + `test:scripts` + `git diff -- demo site` + `assemble --strict` |
| 5. Sin secretos ni Firebase | `secrets.test.mjs` (denylist compartida + claves de Firebase) |

`contract:gates` es para el verify y para leer el estado de un vistazo;
`contract:check` sigue siendo el gate que corre CI y que bloquea el merge.

## `x-contract-id`

`info.x-contract-id` es el hash corto del contrato: 12 hex de SHA-256 sobre el
documento **resuelto** y serializado canónicamente (claves ordenadas, sin
espacios), con el propio campo reemplazado por `pending` para que el hash no
dependa de sí mismo.

Consecuencias que importan al revisar:

- Renombrar un archivo de `paths/` **no** cambia el id; cambiar un tipo **sí**.
- Si tocás el contrato, `contract:validate` falla e imprime el id nuevo. Copialo.
- Sprint 1 loguea este id al arrancar: así se ve en los logs qué contrato está
  sirviendo el server que se revisó.

## Cómo extender en Sprint 1

1. Declarar el path item en `paths/<recurso>.yaml`: clave sin `/`, `operationId`
   único, `summary`, `description`, `tags` y `x-implementation-sprint` (1, 2, 3 o 4).
2. Montarlo en `openapi.yaml` → `paths`.
3. Si hay DTO nuevo, `schemas/<recurso>.yaml` con `additionalProperties: false` y
   los nombres del dataset (no `distanceMeters`, no `intent`).
4. Agregar la fila a `EXPECTED_OPERATIONS` en `contract/test/spec-valid.test.mjs`.
5. `npm run contract:validate` → copiar el `x-contract-id` que imprime.
6. `npm run contract:generate && npm run contract:typecheck` y cerrar con
   `npm run contract:check`. El cliente commiteado es parte del cambio, no un
   artefacto que se genera después.
7. Si la operation nueva trae coordenadas de entrada, montarla fuera de
   `components.schemas` como `PresenceUpdate`: ver [Cliente TypeScript](#cliente-typescript-generado-commiteado-sin-runtime).

## Reglas de la casa

- **`additionalProperties: false`** en todo DTO de respuesta. Un campo que no está
  declarado no viaja.
- **El generado no se edita.** `generated/api.ts` y `event/sample-log.json` se
  regeneran con `contract:generate` y `contract:event-log`; los gates comparan
  bytes, así que una edición a mano no sobrevive ni al primer `contract:test`.
- **Sprint por operation.** `x-implementation-sprint` ∈ {1,2,3,4}. Ninguna
  operation declara 0 ni 5.
- **Errores en `application/problem+json`** (RFC 9457) con `code` del enum cerrado.
  `operation-4xx-response` está activa en `redocly.yaml`, pero su severidad es
  `warning`: el gate duro son los tests "toda operation declara ≥1 error 4xx/5xx" y
  "ningún código no reservado queda huérfano".
- **`x-error-code` es un string o una lista.** Un status puede volver con más de un
  `code` (los dos del `streamTicket`, los dos del 422 de presencia) y `Problem.code`
  es el discriminante. La lista es lo que permite que la regla de huérfanos vea
  `TICKET_EXPIRED` y `ZONE_UNKNOWN` como usados de verdad.
- **Nunca coordenadas a la salida.** Ningún response ni payload de evento puede
  alcanzar `lat`/`lng`/`latitude`/`longitude` ni un par `[n, n]`. Los polígonos
  viven sólo en `contract/catalog/zones.json`, y el punto privado de
  `PUT /presence` vive fuera de `components.schemas` (ver
  [Presencia y descubrimiento](#presencia-y-descubrimiento-la-coordenada-entra-no-sale)).
- **Sin `/v1`.** El versionado vive en `info`, no en el path.
- **`Page` es metadata, no wrapper.** `allOf` + `additionalProperties: false`
  bloquea campos hermanos: las proyecciones declaran sus campos planos.

## Límites conocidos

- El cliente `generated/api.ts` es **type-only**: S3 necesita igual un wrapper
  `fetch` con selector mock/live que ningún generador produce. Los tipos están;
  el transporte lo pone la app.
- `contract/catalog/` no se sirve nunca a clientes: sólo se exponen proyecciones
  (`ZoneSummary`, DTOs de perfil).
- La idempotencia de **emisión** de seeds es S0; la de **inserción** es Sprint 1
  (claves naturales + `ON CONFLICT DO NOTHING`). Ver [Seeds deterministas](#seeds-deterministas).
- El log de eventos prueba paridad de **proyección** (SSE ≡ poll sobre el mismo
  archivo). Que el server de S2 emita esos `seq` es su gate, no el de S0.
