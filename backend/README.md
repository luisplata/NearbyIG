# Backend — NearbyIG demo

API NestJS + PostGIS de la demo. **Sprints 0–5 implementados**, contrato v0.5
(`x-contract-id 3225f7e3ecd7`, 27 operations): el contrato de `contract/` manda y
acá se implementa, no se renegocia.

| Pieza | Estado |
|---|---|
| `GET /health`, `GET /health/ready` | listo (fuera del contrato, ver abajo) |
| `GET /demo/profiles` | listo, según `contract/paths/profiles.yaml`: incluye `inUse` |
| `POST /auth/demo-session` | listo: claim de slot, invitado si no hay slots, 409 `PROFILE_IN_USE` |
| `POST /auth/takeover` | listo (contrato v0.2): desalojo explícito, 200 `DemoSession` |
| `POST /auth/logout` | listo, según el contrato: 204, idempotente, revoca en el acto |
| `POST /auth/stream-ticket` | listo: ticket de 30 s, un uso; lo consume `GET /events` |
| `PUT /presence` | listo (S2): punto privado **o** `demoZoneKey`; región y zona por `ST_Covers`; `visibility` visible/ghost (S5) |
| `DELETE /presence` | listo (S2): 204, o 409 `PRESENCE_STALE` si no había presencia viva; apaga la presencia (no es ghost) |
| `GET /events` | listo (S2): SSE con ticket, `Last-Event-ID` y `: keepalive` cada 15 s |
| `GET /events/poll` | listo (S2): misma secuencia que el SSE desde el mismo cursor |
| `GET /discovery` | listo (S3): radio, intención, género, verificado y online; medidas por observador |
| Bots | listo (S2): 2 por humano vivo, 4 waypoints, ticker de 2 s, cap de 6 por observador |
| CORS | listo (S3): allowlist configurable (`CORS_ALLOWED_ORIGINS`) + túneles de ngrok en desarrollo |
| `POST /demo/reset`, `/demo/reset/self` | listo (fuera del contrato, §11 del plan) |
| `GET /matches` | listo (S4, contrato v0.4): bandeja con peer, `lastMessage` y `unreadCount` |
| `GET\|POST /matches/{matchId}/messages` | listo (v0.4): conversación paginada con cursor; escritura idempotente por `clientMessageId` |
| `POST /matches/{matchId}/read` | listo (v0.4): marca leídos los del otro lado, `204` |
| `GET /me` | listo (v0.4): `SelfProfile` de la sesión, no el `self` del dataset |
| `GET\|POST /blocks`, `DELETE /blocks/{profileId}` | listo (S5, v0.5): bloqueo idempotente, efecto simétrico, un bot canoniza a su dueño |
| `POST /reports` | listo (v0.5): registro con motivo cerrado, `202` y acuse sin PII |
| `GET /notifications`, `POST /notifications/read` | listo (v0.5): ping/match/mensaje persistidos, `unreadCount` y marca de leídas |
| Bot del chat | listo (v0.4): responde a los ~2 s con texto fijo, emite `typing.started` y `message.created` |
| Migraciones + seeds idempotentes | listo (`001_init` … `007_privacy`) |

## Empezar desde cero

Requisitos: Docker Desktop corriendo. Node 22 sólo si vas a correr tooling o tests
en el host (`docker compose` ya trae todo adentro).

```bash
cd backend
cp .env.example .env
docker compose -f compose.yml -f compose.dev.yml up --build -d
```

Eso levanta, en orden y esperando healthchecks:

1. `db` — `postgis/postgis:16-3.4`, volumen `pgdata`, `pg_isready` sobre TCP.
2. `migrate` — one-shot: `scripts/migrate.mjs && scripts/seed.mjs`. Si falla, `api` no arranca.
3. `api` — `start:dev` (tsc en watch + `node --watch`, debug en `9229`), healthcheck `/health/ready`.

Verificación rápida:

```bash
curl -s http://localhost:3000/health          # 200 liveness
curl -s http://localhost:3000/health/ready    # 200 si la base responde
```

`GET /demo/profiles` exige `Authorization: Bearer` (el contrato lo declara con
`demoSession`), así que primero se abre una sesión:

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/auth/demo-session \
  -H 'content-type: application/json' -d '{}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')

curl -s "http://localhost:3000/demo/profiles?regionKey=mx" -H "Authorization: Bearer $TOKEN"
# → {"profiles":[ … 10 filas ordenadas por demoSlot … ]}
```

Navegador simulado completo (dos sesiones, un tercero, logout):

```bash
API=http://localhost:3000

# A y B reclaman slots distintos de la misma región
A=$(curl -s -X POST $API/auth/demo-session -H 'content-type: application/json' -d '{"regionKey":"mx","demoSlot":1}')
B=$(curl -s -X POST $API/auth/demo-session -H 'content-type: application/json' -d '{"regionKey":"mx","demoSlot":2}')
TA=$(printf '%s' "$A" | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')

# el tercero choca:              → 409 PROFILE_IN_USE
curl -s -X POST $API/auth/demo-session -H 'content-type: application/json' -d '{"regionKey":"mx","demoSlot":1}'
# con los 10 ocupados, sin slot  → 201 guest, demoSlot null
curl -s -X POST $API/auth/demo-session -H 'content-type: application/json' -d '{"regionKey":"mx"}'
# logout                        → 204 (y el token deja de servir en el acto)
curl -s -o /dev/null -w '%{http_code}\n' -X POST $API/auth/logout -H "Authorization: Bearer $TA"
```

### "En uso" y takeover (contrato v0.2)

`GET /demo/profiles` trae `inUse` por fila, así el selector pinta el estado sin
intentar reclamar. Desalojar exige `POST /auth/takeover` con el slot nombrado; el
ocupante anterior pierde la sesión **en la misma transacción** (su token da 401 y
sus tickets de stream se borran).

```bash
API=http://localhost:3000

# A ocupa el slot 3 de mx; B ocupa otro
A=$(curl -s -X POST $API/auth/demo-session -H 'content-type: application/json' -d '{"regionKey":"mx","demoSlot":3}')
B=$(curl -s -X POST $API/auth/demo-session -H 'content-type: application/json' -d '{"regionKey":"mx","demoSlot":4}')
TA=$(printf '%s' "$A" | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
TB=$(printf '%s' "$B" | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')

# el slot 3 sale inUse
curl -s "$API/demo/profiles?regionKey=mx" -H "Authorization: Bearer $TB" \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).profiles.filter(p=>p.inUse).map(p=>p.demoSlot).join(",")'
# → 3,4

# B desaloja el slot 3                    → 200 DemoSession (token nuevo de B)
TB2=$(curl -s -X POST $API/auth/takeover -H "Authorization: Bearer $TB" \
  -H 'content-type: application/json' -d '{"regionKey":"mx","demoSlot":3}' \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
# A (desalojado) y el token viejo de B  → 401 UNAUTHENTICATED
curl -s -o /dev/null -w '%{http_code}\n' "$API/demo/profiles?regionKey=mx" -H "Authorization: Bearer $TA"
curl -s -o /dev/null -w '%{http_code}\n' "$API/demo/profiles?regionKey=mx" -H "Authorization: Bearer $TB"
# takeover sobre el propio slot          → 409 PROFILE_IN_USE (conserva el token)
curl -s -X POST $API/auth/takeover -H "Authorization: Bearer $TB2" \
  -H 'content-type: application/json' -d '{"regionKey":"mx","demoSlot":3}'
```

Los cuatro desenlaces están fijados en `contract/paths/auth.yaml#/takeover`: slot
ajeno → 200, slot libre → 200, slot propio → 409, otra región → 403.

### Presencia y región (Sprint 2)

`PUT /presence` acepta **exactamente uno** de los dos caminos: el punto privado del
navegador o una `demoZoneKey` del catálogo (el flujo sin permiso de ubicación). El
server deriva la zona con `ST_Covers` contra `zones.polygon` **de la región de la
sesión** y devuelve sólo la proyección: `profileId`, `regionKey`, `zoneKey`,
`online`, `visibility` y `fallbackRequired`. La coordenada no vuelve nunca —ni en
la response ni en un log— aunque se guarde en la columna privada `presence.point`.

```bash
API=http://localhost:3000
T=$(curl -s -X POST $API/auth/demo-session -H 'content-type: application/json' \
  -d '{"regionKey":"mx","demoSlot":3}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')

# punto real en CDMX                  → 200 zoneKey cdmx, fallbackRequired false
curl -s -X PUT $API/presence -H "Authorization: Bearer $T" -H 'content-type: application/json' \
  -d '{"point":{"lat":19.432608,"lng":-99.133209}}'
# → {"profileId":"mx-p03","regionKey":"mx","zoneKey":"cdmx","online":true,"visibility":"visible","fallbackRequired":false}

# GPS denegado: la zona la elige el usuario → 200 cdmx (sin coordenada guardada)
curl -s -X PUT $API/presence -H "Authorization: Bearer $T" -H 'content-type: application/json' \
  -d '{"demoZoneKey":"cdmx"}'

# ghost: online pero invisible (S5)     → visibility ghost, online true
curl -s -X PUT $API/presence -H "Authorization: Bearer $T" -H 'content-type: application/json' \
  -d '{"demoZoneKey":"cdmx","visibility":"ghost"}'
# el heartbeat sin visibility conserva el ghost
curl -s -X PUT $API/presence -H "Authorization: Bearer $T" -H 'content-type: application/json' \
  -d '{"demoZoneKey":"cdmx"}'

# fuera de todo polígono              → 200, zoneKey null, fallbackRequired true (NO es error)
curl -s -X PUT $API/presence -H "Authorization: Bearer $T" -H 'content-type: application/json' \
  -d '{"point":{"lat":0,"lng":0}}'

# zona inexistente o de otra región   → 422 ZONE_UNKNOWN
curl -s -X PUT $API/presence -H "Authorization: Bearer $T" -H 'content-type: application/json' \
  -d '{"demoZoneKey":"bogota"}'
# ni punto ni zona, o los dos         → 422 VALIDATION_FAILED

curl -s -o /dev/null -w '%{http_code}\n' -X DELETE $API/presence -H "Authorization: Bearer $T"  # 204
curl -s -X DELETE $API/presence -H "Authorization: Bearer $T"                                   # 409 PRESENCE_STALE
```

TTL: la presencia vive **12 s**. `expires_at` es la única autoridad y toda lectura
filtra `expires_at > now()`; no hay cron ni barrido (ver "Decisiones").

### Eventos, bots y ghost (Sprint 2 · S2-B)

Un humano con presencia viva arrastra **2 bots** derivados de su perfil
(`<profileId>-b1`, `<profileId>-b2`) que orbitan **su punto** en 4 waypoints y
avanzan uno cada 5 s. Lo que se mueve nunca es una coordenada en el wire: el
evento lleva `profileId` + `distanceM`/`bearingDeg` contra la presencia del dueño.

**El ancla es la persona, no la ciudad.** Si el dueño tiene GPS, el loop se siembra
a 900–1200 m de su punto con 300–449 m de radio; si eligió una zona demo (sin
coordenada), el ancla es el centroide de la zona. `presence_anchors` (migración
`004`) es la única definición de ese punto y la comparten reconciliación,
waypoints y métricas. Antes el ancla era `ST_PointOnSurface(zones.polygon)` para
todos: un humano en el norte de Bogotá (a ~7.7 km del centroide) veía sus propios
bots a kilómetros, fuera de cualquier radio del radar, porque discovery mide desde
su punto real.

`bots.anchor` guarda el ancla con la que se sembró el loop y es privada. Sirve
para decidir si un `PUT /presence` con otro punto obliga a reubicar: se recrea
cuando el dueño se movió **más de 250 m** del ancla (menos que el radio mínimo del
loop, para que el círculo siga rodeándolo) y no por el ruido del GPS. La
comparación es `ST_Distance` en PostGIS, así que TypeScript no ve la distancia ni
el punto. Cerca del borde del polígono no se recorta nada: el loop puede salir de
la zona mientras la persona siga en el centro.

Dos proyecciones del **mismo** log, con la misma secuencia para el mismo cursor:

| Camino | Auth | Cursor | Uso |
|---|---|---|---|
| `GET /events?ticket=` | ticket de 30 s, **un solo uso** (`POST /auth/stream-ticket`) | header `Last-Event-ID` | cliente vivo (`EventSource`) |
| `GET /events/poll?cursor=&limit=` | Bearer `demoSession` | query `cursor` | fallback y móvil |

```bash
API=http://localhost:3000
# A observa; B es el humano cuyos bots va a ver
TA=$(curl -s -X POST $API/auth/demo-session -H 'content-type: application/json' -d '{"regionKey":"mx","demoSlot":8}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
TB=$(curl -s -X POST $API/auth/demo-session -H 'content-type: application/json' -d '{"regionKey":"mx","demoSlot":9}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
curl -s -X PUT $API/presence -H "Authorization: Bearer $TA" -H 'content-type: application/json' -d '{"demoZoneKey":"cdmx"}' > /dev/null
curl -s -X PUT $API/presence -H "Authorization: Bearer $TB" -H 'content-type: application/json' -d '{"demoZoneKey":"cdmx"}' > /dev/null

# stream SSE: preámbulo retry: 5000 y un frame por evento
TICKET=$(curl -s -X POST $API/auth/stream-ticket -H "Authorization: Bearer $TA" | node -pe 'JSON.parse(require("fs").readFileSync(0)).ticket')
curl -N "$API/events?ticket=$TICKET"
# retry: 5000
#
# id: mx:000000000006
# event: profile.moved
# data: {"id":"mx:000000000006","type":"profile.moved","occurredAt":"…","payload":{"distanceM":1208,"profileId":"mx-p09-b1","bearingDeg":9}}
#
# : keepalive          ← cada 15 s, para que un proxy no corte

# la misma secuencia por polling
curl -s "$API/events/poll?cursor=mx:000000000005&limit=2" -H "Authorization: Bearer $TA"
# → {"events":[{"id":"mx:000000000006",…}],"nextCursor":"mx:000000000006","hasMore":true}

# el ticket no se reusa
curl -s "$API/events?ticket=$TICKET" | head -c 120   # → 401 {"code":"TICKET_REUSED",…}
```

Reglas de la proyección:

| Regla | Comportamiento |
|---|---|
| orden | `seq` por región (`mx:000000000042`); `occurredAt` es informativo y no ordena |
| dedupe | el cliente descarta `seq <= lastSeen`; el server no reentrega el `Last-Event-ID` |
| replay | `Last-Event-ID`/`cursor` ⇒ arranca en `seq + 1` |
| página vacía | no avanza el cursor (`nextCursor` = el recibido, `hasMore: false`) |
| retención | últimos 5000 eventos por región (~20 min a densidad tope); un cursor más viejo es `410 CURSOR_EXPIRED` |
| visibilidad | humanos de la región (menos uno mismo) + bots visibles, **propios incluidos**, cap 6; ghost y bloqueados quedan afuera |
| propio | el humano no se ve a sí mismo, pero **sí ve sus 2 bots** (S3: es la densidad que el plan promete) |
| ghost | `visibility: ghost` oculta al humano y a sus bots de los demás, sin apagar la sesión; `DELETE /presence` apaga la presencia para todos (ver "Privacidad") |

**Ghost (v0.5) vs. apagar la presencia.** `DELETE /presence` apaga la presencia
para todos, incluido el dueño: sin presencia viva no hay origen para
`GET /discovery`, así que el humano también deja de ver. `PUT /presence` con
`visibility: ghost` es "online pero invisible": la fila sigue viva, el dueño se
sigue viendo (sus bots incluidos) y los demás dejan de recibir sus movimientos. El
`profile.presence online:false` del heartbeat de ghost es lo que saca la tarjeta
del radar ajeno sin revelar que sigue conectado.

### Descubrimiento (Sprint 3 · S3-A)

`GET /discovery` responde **quién está cerca de la sesión**, ordenado por
distancia. Es la única operation que el contrato declaraba `501 NOT_IMPLEMENTED`
(`x-implementation-sprint: 3`): hoy ninguna operation de S3 queda sin implementar.

```bash
API=http://localhost:3000
A=$(curl -s -X POST $API/auth/demo-session -H 'content-type: application/json' -d '{"regionKey":"mx","demoSlot":1}')
B=$(curl -s -X POST $API/auth/demo-session -H 'content-type: application/json' -d '{"regionKey":"mx","demoSlot":2}')
TA=$(printf '%s' "$A" | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
TB=$(printf '%s' "$B" | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')

# dos humanos en la misma zona de mx (puntos reales dentro del polígono cdmx)
curl -s -X PUT $API/presence -H "Authorization: Bearer $TA" -H 'content-type: application/json' \
  -d '{"point":{"lat":19.44,"lng":-99.127297}}' > /dev/null
curl -s -X PUT $API/presence -H "Authorization: Bearer $TB" -H 'content-type: application/json' \
  -d '{"point":{"lat":19.435,"lng":-99.12}}' > /dev/null
sleep 3   # el ticker siembra los 2 bots de cada uno

curl -s "$API/discovery" -H "Authorization: Bearer $TA" \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).results.map(r=>`${r.profileId} ${r.sourceType} ${r.distanceM}m`).join("\n")'
# mx-p02      human  945m      ← el otro humano
# mx-p02-b1   bot    1358m     ← sus bots
# mx-p02-b2   bot    1364m
# mx-p01-b2   bot    1410m     ← MIS bots (el propio perfil humano no aparece)
# mx-p01-b1   bot    1416m
# → 5 perfiles = 1 humano + 4 bots. Es la validación del plan §4/§5.

# filtros: uno por uno y combinados (todos opcionales)
curl -s "$API/discovery?radiusM=1000" -H "Authorization: Bearer $TA"          # sólo el humano
curl -s "$API/discovery?intention=friendship" -H "Authorization: Bearer $TA"  # 3 (el otro humano y sus bots)
curl -s "$API/discovery?gender=male" -H "Authorization: Bearer $TA"
curl -s "$API/discovery?verified=true" -H "Authorization: Bearer $TA"         # los 2 bots propios
curl -s "$API/discovery?online=true&intention=friendship&radiusM=1500" -H "Authorization: Bearer $TA"

# fuera de rango o enum inválido → 422 VALIDATION_FAILED (no clamp)
curl -s "$API/discovery?radiusM=150" -H "Authorization: Bearer $TA"
```

| Regla | Comportamiento |
|---|---|
| fila | `ProfileSummary` (17 campos, `additionalProperties: false`): no hay DTO nuevo |
| orden | `distanceM` ascendente, desempatado por `profileId` |
| medidas | `distanceM`/`bearingDeg` **desde la presencia del observador**, redondeados half-up al metro y al grado |
| sin GPS | el observador es el ancla de su zona demo; el sujeto de zona demo se ubica en el ancla + su vector de catálogo (así el radar conserva la dispersión del mock) |
| radio | 200–5000 m, default 5000; fuera de rango es `422 VALIDATION_FAILED`, nunca un clamp |
| filtros | `intention`, `gender`, `verified`, `online`; `verified`/`online` filtran **sólo** con `true` (el contrato lo dice así) |
| query de más | se ignora (OpenAPI no valida parámetros fuera de la operation); el body sí es estricto |
| exclusiones | el propio humano (sus bots **sí**), sin presencia viva (ghost/pausa), fuera de la región, bloqueados (ver abajo) |
| bots | los visibles de `BotsService.visibleBotIds`: propios primero, cap de 6, corte determinista por `bot_profile_id` |
| página | `maxItems: 10` del contrato: sin paginación, y con la región llena gana el más cercano |
| sin presencia | `{"results": []}`: sin origen no hay descubrimiento, y un fantasma no ve (invisible ⇒ ciego) |
| región | la de la sesión; no hay parámetro para pedir otra |

**Cómo se ubica a cada quien (el observador es el origen).** El origen del radar
es el observador: su punto privado o, si eligió zona demo sin GPS, el ancla de esa
zona —no hay mejor origen para quien dijo "estoy en CDMX"—. Del otro lado, un
perfil con punto real se ubica en su punto; un perfil que también eligió zona demo
se ubica en el ancla de **su** zona más su vector de catálogo (`distanceM` /
`bearingDeg` del dataset, la posición con la que el mock lo dibuja). Sin ese
vector, dos personas que eligen la misma zona caen en el mismo punto y todo el
radar se aplana en el piso de 200 m. Con el vector, el flujo sin GPS devuelve
exactamente la dispersión del dataset (mx-p02 a 480 m y 118° del ancla) y el flujo
con GPS mide donde corresponde.

**Por qué el observador ve sus propios bots.** Un bot es una proyección de su
dueño, no un desconocido. El plan promete que con dos humanos en la misma región
cada uno ve **1 humano + 4 bots = 5 perfiles**, y ese 5 sólo cierra si los 2
propios están: 1 ajeno + 2 propios + 2 del otro. El perfil humano propio sigue
fuera: no se descubre a sí mismo. La fila del bot hereda la del dueño (nickname,
foto, intención, género, verificación, slot) y se distingue por `profileId` +
`sourceType: 'bot'`: no se inventó un segundo catálogo de personas para la demo.

**Los bloqueados son de S5.** No existe tabla `blocks` en el esquema (el bloqueo
llega con privacidad, S5), así que hoy la exclusión es vacía por construcción: no
hay pares bloqueados que excluir. Cuando S5 agregue la tabla, el filtro es una
condición más en el mismo `WHERE` (`NOT EXISTS (… blocks …)`); el contrato ya lo
documenta como exclusión server-side y por eso no hay ningún parámetro.

#### Frames de distancia

`GET /discovery` mide desde el observador. El payload de `profile.moved` mide
desde **el dueño del bot** (su presencia o el centroide de su zona demo): un log
compartido y append-only no puede llevar una medida por receptor sin guardar una
coordenada (el contrato prohíbe que salga alguna) o recalcular en lectura (el
mismo `seq` dejaría de valer lo mismo y el replay dejaría de ser honesto). El
contrato de `ProfileMovedPayload` dice "relativos a quien recibe", así que el
stream conserva una deuda de frame declarada para el observador ajeno; lo que sí
cambió con la migración `004` es que el dueño ve en su radar exactamente la
distancia que publica el evento de sus propios bots. Consecuencia práctica: **las
posiciones del radar salen de discovery** (y se interpolan entre snapshots);
`profile.moved` sirve para saber que algo se movió, no para sumarle su `distanceM`
a la fila de discovery de un tercero. Las dos proyecciones **sí** coinciden en el
conjunto de perfiles visibles, que es lo que corrigió S3-A.

### Pings y matches (Sprint 4)

El flujo de conexión mínimo: **enviar ping → ver la bandeja → aceptar o rechazar →
match → chatear**. El match viaja en el `200` de aceptar y `Ping.matchId` lo
publica en la bandeja; desde v0.4 también se llega por `GET /matches`.

```bash
API=http://localhost:3000
A=$(curl -s -X POST $API/auth/demo-session -H 'content-type: application/json' -d '{"regionKey":"mx","demoSlot":1}')
B=$(curl -s -X POST $API/auth/demo-session -H 'content-type: application/json' -d '{"regionKey":"mx","demoSlot":2}')
TA=$(printf '%s' "$A" | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
TB=$(printf '%s' "$B" | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
PB=$(printf '%s' "$B" | node -pe 'JSON.parse(require("fs").readFileSync(0)).profileId')

# A pinguea a B → 201 Ping pending
PING=$(curl -s -X POST $API/pings -H "Authorization: Bearer $TA"   -H 'content-type: application/json' -d "{\"targetProfileId\":\"$PB\"}")
ID=$(printf '%s' "$PING" | node -pe 'JSON.parse(require("fs").readFileSync(0)).id')

# B lo ve en su inbox, con el peer ya proyectado
curl -s "$API/pings?box=inbox" -H "Authorization: Bearer $TB"

# B acepta → 200 Match; A lo ve aceptado en su bandeja de enviados
curl -s -X POST $API/pings/$ID/accept -H "Authorization: Bearer $TB"
curl -s "$API/pings?box=sent" -H "Authorization: Bearer $TA"
```

| Regla | Cómo |
|---|---|
| un pendiente por par dirigido | índice único parcial; el segundo envío es `409 PING_DUPLICATE` |
| un match por par | `UNIQUE (region_key, profile_a_id, profile_b_id)` con el par ordenado |
| aceptar/rechazar dos veces | `409 PING_RESOLVED` (idempotencia explícita, no un 204 silencioso) |
| vencimiento | 24 h (`expiresAt`); perezoso, al leer y al resolver; `410 PING_EXPIRED` |
| sólo el destinatario resuelve | `403 PING_FORBIDDEN` |
| el bot acepta solo | si el destino es `<owner>-b1`, el `201` vuelve ya `accepted` con `matchId` |
| cuota | 30 envíos por minuto por perfil; después, `429 RATE_LIMITED` |
| sin coordenadas | ni `lat`/`lng` ni `distanceM`/`bearingDeg` en ninguna response |

**Por qué el bot acepta en la misma transacción.** Un job que despierte bots "a
los 2 s" sería otro proceso, otra tabla de agenda y otro estado que puede quedar a
medio camino. Aceptar en el `INSERT` da el mismo resultado para la demo y el
cliente no tiene un caso especial: mira el mismo `Ping`.

**Por qué la bandeja es `{ ping, peer }`.** La fila muestra al **otro**: nickname,
iniciales, foto e intención. Sin `peer`, el cliente tendría que cruzar el ping
contra `/demo/profiles`, que además no conoce a los bots. El peer de un bot hereda
la proyección de su dueño y se distingue por `sourceType`, igual que en discovery.

**Por qué `reset` global los borra.** `pings` y `matches` son estado de demo, no
catálogo: el reset global los vacía (pings primero, por la FK) y deja la bandeja
como recién migrada. El reset propio **no** los toca: cerrar sesión no borra la
bandeja de un perfil, que es lo mismo que pasa con los pings que ya recibió.

### Chat: match → conversación (contrato v0.4)

El match de arriba ya se puede chatear. `GET /matches` es la bandeja; el
`matchId` de esa response (o el de `Ping.matchId`) abre la conversación.

```bash
API=http://localhost:3000
# $TA, $TB y $MATCH vienen del flujo de pings

# el perfil de la propia sesión (tab Perfil)
curl -s $API/me -H "Authorization: Bearer $TA"

# A escribe dos mensajes; la clave de idempotencia la elige el cliente
curl -s -X POST $API/matches/$MATCH/messages -H "Authorization: Bearer $TA" \
  -H 'content-type: application/json' -d '{"clientMessageId":"m-1","body":"hola"}'
curl -s -X POST $API/matches/$MATCH/messages -H "Authorization: Bearer $TA" \
  -H 'content-type: application/json' -d '{"clientMessageId":"m-2","body":"¿nos vemos?"}'

# B ve el badge, lee la conversación y la marca leída
curl -s $API/matches -H "Authorization: Bearer $TB"                    # unreadCount: 2
curl -s "$API/matches/$MATCH/messages" -H "Authorization: Bearer $TB"  # cronológico
curl -s -X POST $API/matches/$MATCH/read -H "Authorization: Bearer $TB"  # 204
curl -s $API/matches -H "Authorization: Bearer $TB"                    # unreadCount: 0
```

| Regla | Cómo |
|---|---|
| idempotencia del envío | `UNIQUE (match_id, sender_profile_id, client_message_id)`; reintentar devuelve el mismo `Message` |
| quién puede leer/escribir | sólo los dos lados del match; desde otra sesión, `403 CHAT_BLOCKED` |
| match inexistente o de otra región | `404 MATCH_NOT_FOUND` (el 404 y el 403 no se colapsan) |
| conversación cerrada | `409 MATCH_CLOSED` si el otro lado ya no se puede proyectar; la historia sigue legible |
| orden y cursor | `message_seq` (identity) ordena y pagina; el cursor es base64url opaco para el cliente |
| no leídos | watermark `match_reads.last_read_seq` por `(match, perfil)`; los propios nunca cuentan |
| body | se recorta en los bordes; vacío o de más de 2000 es `422 VALIDATION_FAILED` |
| cuota | 60 mensajes por minuto por perfil; después, `429 RATE_LIMITED` |
| el bot contesta | un timer por match (~2 s); emite `typing.started` y después `message.created` |
| stream | `message.created` y `typing.started` se filtran por **participante del match**, no por región |

**Por qué el cursor no es `createdAt`.** Dos mensajes pueden caer en el mismo
milisegundo; un cursor por tiempo pierde o repite filas. `message_seq` es un
`IDENTITY` que ordena y desempata sin mirar el reloj.

**Por qué el bot no contesta dos veces.** El timer vive en un `Map` por `matchId`:
tres mensajes seguidos agendan **una** respuesta. El texto sale de una lista fija
y se elige para no repetir la última línea del mismo bot; no hay LLM ni costo por
mensaje, y dos corridas de la demo dicen lo mismo.

**Por qué los eventos del chat no usan la visibilidad del resto del stream.** El
resto del log se filtra por sujetos visibles (humanos de la región + bots
visibles). Un `message.created` lleva `matchId` y no `profileId`; filtrar por
región le mostraría a cualquiera las conversaciones ajenas. La regla es "soy uno
de los dos lados de ese match", y el payload no lleva el texto: el evento avisa,
la página de mensajes es la fuente del contenido.

**Por qué `GET /me` existe.** `DemoSession` da `profileId` y `demoSlot`, pero no
el nickname ni la foto: el tab Perfil mostraba el `self` del dataset, que es otra
persona en cuanto alguien entra con otro slot. `SelfProfile` estaba declarado
desde S0 sin consumer; ahora lo tiene. Un invitado no tiene fila de catálogo y
recibe `404 PROFILE_NOT_FOUND`: inventarle un nombre sería mentir sobre quién es.

### Privacidad: ghost, bloqueo, reporte y notificaciones (contrato v0.5)

Sprint 5 agrega la superficie que faltaba para usar la demo con desconocidos. Es
**aditiva**: ninguna operation de S1–S4 cambia de forma salvo `PresenceState`, que
suma `visibility` (el cliente generado lo recibe solo; el front live ignora el
campo hasta que lo consuma).

| Pieza | Regla |
|---|---|
| ghost | `PUT /presence` con `visibility: ghost`; la sesión sigue viendo, los demás no la ven (ni a sus bots); `DELETE /presence` apaga la presencia para todos |
| bloqueo | `POST /blocks` idempotente (201 con el `createdAt` original), `DELETE /blocks/{profileId}` idempotente (204), `GET /blocks` con la identidad del otro |
| efecto del bloqueo | el par desaparece de discovery **en las dos direcciones**, `POST /pings` es `403 CHAT_BLOCKED` y la conversación existente no acepta mensajes (`403 CHAT_BLOCKED`); la historia sigue legible |
| bot | bloquear o reportar `<owner>-b1` canoniza al dueño: el bot no existe sin la persona |
| reporte | `POST /reports` → `202` con `{reportId, createdAt}`; motivo cerrado (`spam`, `harassment`, `inappropriate`, `impersonation`, `other`); no bloquea ni cambia discovery |
| notificaciones | `GET /notifications` (`{notifications, unreadCount}`, 100 más recientes) y `POST /notifications/read` (todas o por id) → `{marked, unreadCount}` |
| invitados | `POST /blocks`, `DELETE /blocks/{profileId}` y `POST /reports` responden `403 PROFILE_REQUIRED`: un invitado no tiene perfil |
| reset | el propio borra **sus** bloqueos/reportes/avisos; el global vacía las tres tablas. Un bloqueo ajeno sobre mi perfil no se toca |

**El bloqueo es asimétrico en la fila y simétrico en el efecto.** Se guarda
`A → B` (para que `GET /blocks` liste sólo lo que yo bloqueé y no exponga "quién me
bloqueó"), pero discovery, stream y pings excluyen el par en las dos direcciones.
El bloqueado recibe `CHAT_BLOCKED` sin saber quién bloqueó a quién.

**Ghost no borra los bots.** El ticker los sigue moviendo y el dueño los sigue
viendo (es la densidad del radar propio); lo que cambia es el filtro de lectura de
los demás: `visibleBotIds` incluye los propios sin mirar `visibility`, y para el
resto exige `visibility = 'visible'` y el par no bloqueado. Si el ghost borrara las
filas, `reconcile()` las recrearía en el tick siguiente y el dueño vería sus bots
parpadear.

**Notificaciones persistidas, no derivadas.** `PingsService` y `ChatService`
insertan la fila en la misma transacción que el hecho (ping, match, mensaje); el
bot que contesta también deja su aviso. `read_at` es la única autoridad de lectura
(`null` = no leída), y `unreadCount` cuenta la tabla, no la página de 100.

**Compatibilidad del badge.** El cliente live ya usa los pings pendientes
(`bellBadgeCount(state, live.pings.pending)`) y **eso no cambió**: `GET /pings`,
`Ping.status` y el `unreadCount` de `MatchListItem` siguen igual. La campana de
`/notifications` es la superficie nueva; cuando el front la adopte, el badge de
pings queda como fallback documentado.

**Cierre por zona.** Cuando un match tiene un bot, `matches.bot_zone_key` guarda la
zona en la que nació. Si el dueño cambia de zona, `reconcile()` vuelve a sembrar el
bot en otra y `POST /matches/{matchId}/messages` responde `409 MATCH_CLOSED`; la
conversación sigue legible. La demo tiene **una zona por región** (`mx → cdmx`,
`co → bogota`), así que el escenario de test mueve el valor registrado del match —
la invariante que compara el server es la misma: `matches.bot_zone_key ==
bots.zone_key`.

**Sin PII nueva.** `blocks` guarda dos `profileId` y una fecha; `reports`, dos
`profileId`, el motivo del enum y la fecha; `notifications`, el destinatario, el
actor y referencias. Nada de nombres, fotos, texto libre ni coordenadas. Los logs
llevan región y conteos.

```bash
API=http://localhost:3000
TA=$(curl -s -X POST $API/auth/demo-session -H 'content-type: application/json' -d '{"regionKey":"mx","demoSlot":2}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')

# bloquear                                    → 201 {"profileId":"mx-p04","createdAt":"…"}
curl -s -X POST $API/blocks -H "Authorization: Bearer $TA" -H 'content-type: application/json' -d '{"profileId":"mx-p04"}'
# repetirlo es idempotente                    → 201 con el mismo createdAt
# listar                                      → {"blocks":[{"block":{…},"peer":{…}}]}
curl -s $API/blocks -H "Authorization: Bearer $TA"
# desbloquear                                 → 204 (también si no estaba)
curl -s -o /dev/null -w '%{http_code}\n' -X DELETE $API/blocks/mx-p04 -H "Authorization: Bearer $TA"

# reportar                                    → 202 {"reportId":"…","createdAt":"…"}
curl -s -X POST $API/reports -H "Authorization: Bearer $TA" -H 'content-type: application/json' \
  -d '{"profileId":"mx-p07","reason":"spam"}'

# campana                                     → {"notifications":[…],"unreadCount":1}
curl -s $API/notifications -H "Authorization: Bearer $TA"
# marcar todas                                → {"marked":1,"unreadCount":0}
curl -s -X POST $API/notifications/read -H "Authorization: Bearer $TA"
```

### CORS

La API responde `Access-Control-Allow-Origin` sólo a los orígenes de una allowlist
(`CORS_ALLOWED_ORIGINS`, separados por coma). Sin `*`, sin credenciales: la demo
autentica con `Authorization: Bearer`, no con cookies.

| Entorno | Orígenes |
|---|---|
| desarrollo / test (default) | `http://localhost:8081` (Expo web dev), `http://localhost:4173` (`npx serve site -l 4173`), `http://localhost:8080`, más los túneles de ngrok (`*.ngrok-free.app`, `*.ngrok-free.dev`, `*.ngrok.io`) |
| producción | **ninguno** hasta que se declare; el boot lo avisa por log. Los túneles **no** se aceptan |
| S6 (GitHub Pages) | agregar el origen del sitio: `CORS_ALLOWED_ORIGINS=https://usuario.github.io` |

**Qué origen importa.** El navegador manda el `Origin` de la **página** que sirve
el JS, no el de la API. Si la app se abre en `https://<pagina>.ngrok-free.app` y
llama a `https://<api>.ngrok-free.app`, el que tiene que estar permitido es el de
la página; el de la API nunca aparece en un `Origin`.

**Túneles en desarrollo.** Un túnel de ngrok cambia de subdominio en cada sesión,
así que se acepta por patrón en `development`/`test` en vez de obligar a editar
`CORS_ALLOWED_ORIGINS` cada vez. Sigue sin haber `*` y sigue sin credenciales. En
producción no hay patrones: los orígenes son exactamente los declarados.

```bash
# preflight de discovery con el origen de Expo web
curl -s -i -X OPTIONS http://localhost:3000/discovery \
  -H 'Origin: http://localhost:8081' \
  -H 'Access-Control-Request-Method: GET' \
  -H 'Access-Control-Request-Headers: authorization' | head -6
# HTTP/1.1 204 No Content
# Access-Control-Allow-Origin: http://localhost:8081
# Access-Control-Allow-Methods: GET,POST,PUT,DELETE,OPTIONS
# Access-Control-Allow-Headers: authorization,content-type,last-event-id

# el mismo preflight desde el túnel de la página (sólo desarrollo)
curl -s -i -X OPTIONS http://localhost:3000/discovery \
  -H 'Origin: https://abc123.ngrok-free.app' \
  -H 'Access-Control-Request-Method: GET' | head -3
# HTTP/1.1 204 No Content
# Access-Control-Allow-Origin: https://abc123.ngrok-free.app
```

Un origen fuera de la lista recibe la respuesta **sin** `Access-Control-Allow-Origin`
(el browser la bloquea; `curl` la sigue viendo, que es lo esperado). `last-event-id`
está en `allowedHeaders` porque `EventSource` lo manda solo al reconectar. En S6 el
origen de Pages se agrega por entorno, no en código: el `.env` del despliegue.

Sin Docker (sólo si tenés Postgres 16 + PostGIS en el host):

```bash
cd backend
npm ci
DATABASE_URL=postgres://nearbyig:nearbyig@localhost:5432/nearbyig npm run db:setup
npm run build && npm start
```

## Migraciones

SQL crudo en `sql/`, sin ORM. El runner (`scripts/migrate.mjs`) aplica lo pendiente
en una transacción por archivo y registra `id + sha256` en `schema_migrations`.

| Comando | Qué hace |
|---|---|
| `npm run migrate` | aplica las pendientes (no-op si ya están) |
| `npm run migrate:status` | lista aplicadas, pendientes y archivos con drift |
| `npm run migrate:rollback` | revierte la última (usa el `.down.sql`) |
| `npm run migrate -- --rollback-all` | revierte todo |
| `npm run migrate -- --dry-run` | dice qué aplicaría, sin escribir |

Reglas:

- Toda migración `NNN_nombre.sql` necesita su `NNN_nombre.down.sql` (un test lo exige).
- Un archivo ya aplicado **no se edita**: si su sha256 cambió, `migrate` sale con
  error (`drift`). El cambio va en una migración nueva.
- El hash se calcula sobre el contenido normalizado (LF), así que el mismo archivo
  da igual en Windows y en el contenedor.
- Rollback completo: `down -v` + `up` (ver Reset). `--rollback` no dropea PostGIS.

Migraciones actuales:

| # | Archivo | Qué crea | Rollback |
|---|---|---|---|
| 001 | `001_init.sql` | `regions`, `zones`, `profiles`, `sessions`, `stream_tickets`, `demo_meta` | dropea las 6 tablas |
| 002 | `002_presence.sql` | `presence` (una fila por sesión, `Point,4326` privado, `expires_at`) | `DROP TABLE presence`; catálogo y sesiones intactas |
| 003 | `003_bots_events.sql` | `bots`, `bot_waypoints`, `event_seq`, `events` | dropea las 4 tablas; catálogo, sesiones y presencia intactas |
| 004 | `004_bots_anchor.sql` | `bots.anchor` (ancla privada del loop) + vista `presence_anchors` (punto del dueño: GPS o centroide de su zona) | `DROP VIEW presence_anchors` + `DROP COLUMN bots.anchor`; los bots siguen y el ticker los vuelve a sembrar con el ancla de zona |
| 005 | `005_pings.sql` | `pings` (un pendiente por par dirigido, TTL y estados) + `matches` (un match por par) | `DROP TABLE pings` y después `matches`; catálogo, sesiones, presencia y bots intactos |
| 006 | `006_chat.sql` | `messages` (orden por `message_seq`, idempotencia por `(match, emisor, clientMessageId)`), `match_reads` (watermark de lectura), FK compuesta `(region_key, match_id)` y el CHECK de `events` ampliado a los dos tipos del chat | borra los eventos del chat, vuelve el CHECK a dos tipos, dropea `match_reads`, `messages` y el único agregado a `matches`; los matches de 005 quedan |
| 007 | `007_privacy.sql` | `presence.visibility` (`visible`/`ghost`), `blocks`, `reports`, `notifications` y `matches.bot_zone_key` (cierre por cambio de zona) | dropea las cuatro tablas, después las dos columnas; sesiones, presencia, bots, pings, matches y mensajes quedan intactos |

`002` es aditiva y reversible sin pérdida: la única tabla nueva referencia a
`sessions` y `zones` (no al revés), así que el `down` no desarma nada. Aplicar y
revertir en el stack:

```bash
docker compose -f compose.yml -f compose.dev.yml exec api npm run migrate:rollback
# → rollback ok: 003_bots_events
docker compose -f compose.yml -f compose.dev.yml exec api npm run migrate
# → migrate ok: 003_bots_events
```

`003` sigue la misma regla: los waypoints referencian a `bots`, y `bots` a
`profiles`/`zones` (nunca al revés). Un `003` revertido deja `GET /events` sin
esquema (500) hasta volver a aplicarlo; no hay datos de catálogo que se pierdan y
el log de la demo no es histórico (la retención ya lo recorta).

`006` es la primera que **amplía** una restricción existente: el `CHECK` de
`events.event_type` pasa de dos tipos a cuatro (los dos del chat). Por eso el
`down` borra primero los eventos del chat y recién después vuelve al `CHECK`
viejo; si no, el `ALTER TABLE` falla con las filas nuevas adentro. Las tablas
`messages` y `match_reads` se van después (la FK compuesta de `messages` cuelga
del par `(region_key, match_id)` y `match_reads` de `matches`), y al final el
único `(region_key, match_id)` que `006` le agregó a `matches`.

`004` es aditiva pero **el orden del rollback importa**: el código que usa
`presence_anchors` es el de este batch, así que revertir la migración con ese
binario corriendo deja el ticker sin vista (`relation "presence_anchors" does not
exist` en el `warn` del tick, sin tumbar la API). Para volver atrás hay que
revertir el código primero (o aceptar que los bots no se resiembren hasta
re-aplicarla). El `down` no borra sesiones, presencia ni catálogo.

`007` es **reversible sin tocar S1–S4** y está probada: el `down` dropea las
cuatro tablas (primero `notifications`, que referencia pings/matches/messages) y
después las dos columnas. `presence.visibility` vuelve a leerse como `visible`
(el default histórico) y los matches pierden `bot_zone_key`, así que una
conversación con un bot deja de cerrarse por cambio de zona. No hay FK de otras
tablas hacia las nuevas: ni sesiones, ni catálogo, ni chat dependen de ellas. La
prueba (`test/integration/migrations-seeds.test.mjs`) corre `down` y `up` dentro
de una transacción y la revierte: ensaya el SQL real del runner sin dejar la base
compartida a medio migrar.

```bash
docker compose -f compose.yml -f compose.dev.yml exec api npm run migrate:rollback
# → rollback ok: 007_privacy
docker compose -f compose.yml -f compose.dev.yml exec api npm run migrate
# → migrate ok: 007_privacy
```

Dentro de Docker los comandos son los mismos, con `docker compose exec`:

```bash
docker compose -f compose.yml -f compose.dev.yml exec api npm run migrate:status
docker compose -f compose.yml -f compose.dev.yml exec api npm run migrate:rollback
```

## Seeds

Salen de `contract/catalog/*.json` y `contract/seed/manifest.json` (raíz del
contrato montada como `/seed` en dev y copiada en la imagen de producción). El
script verifica el `sha256` de cada archivo contra el manifiesto: el contrato es la
fuente de verdad, no hay copia local de los datos.

| Comando | Qué hace |
|---|---|
| `npm run seed` | upsert de regiones, zonas (geometría) y perfiles |
| `npm run seed:check` | no escribe: compara base vs manifiesto (conteos, valores, seedId) |
| `npm run seed -- --dry-run` | valida manifiesto y archivos, no conecta |

Idempotencia: `INSERT … ON CONFLICT DO UPDATE` sobre la clave natural
(`regions.region_key`, `(region_key, zone_key)`, `(region_key, profile_id)`).
Correrlo dos veces **no duplica** y no borra nada: una sesión viva no se cae por
re-seedear. Los conteos que imprime son el antes→después.

## Tests de integración

Corren contra la API y la base reales (no hay mocks ni contenedores efímeros).
Cubren health, sesión demo (claim, 409, invitado, slot vencido), perfiles
(401/403/422, orden, shape exacto, cero coordenadas), logout (token revocado en el
acto), tickets de stream (un solo uso), reset propio y global, presencia (punto
real → zona, fallback, TTL, cambio de región, `DELETE`), bots (2 por humano,
waypoints, ghost, cap de 6, aislamiento regional), ancla de los bots (la persona
con GPS vs. el centroide de la zona demo, reubicación por desplazamiento),
descubrimiento (5 perfiles con los bots propios, medidas por observador, filtros y
combinados, 422, ghost, región, cap y tope de página), pings y matches (bandeja de
los dos lados, dedupe, aceptar/rechazar, bot que acepta solo, vencimiento y el
único match por par), eventos (ticket, cursor, replay, paridad SSE↔polling,
dedupe), privacidad (ghost, bloqueo, reporte, notificaciones y cierre por cambio
de zona), expiración de sesión y reset de las tablas nuevas, logs sin PII y
migraciones/seeds idempotentes + `ST_Covers`.

Los tests del mundo (`bots`, `events`, `discovery`) empujan el vencimiento de las
presencias del escenario con un `UPDATE` (`extendPresence`) para no depender de los
12 s de TTL: el TTL se sigue probando en `presence.test.mjs`, y la lectura sigue
filtrando `expires_at > now()`.

```bash
# dentro del stack (recomendado)
docker compose -f compose.yml -f compose.dev.yml exec api npm run test:integration

# o desde el host con el `db` publicado por compose.dev.yml
cd backend && npm run test:integration
```

Variables: `API_BASE_URL` (default `http://localhost:3000`) y `DATABASE_URL`
(default `postgres://nearbyig:nearbyig@localhost:5432/nearbyig`). Si el stack no
está arriba, el test falla nombrando el comando exacto para levantarlo: no hace
skip silencioso.

Los archivos corren en serie (`--test-concurrency=1`) y cada uno borra sólo las
sesiones que creó: se puede correr contra una base con demo en curso. La excepción
es el test del reset global, que borra **todas** las sesiones por definición: las
guarda antes y las repone al terminar.

| Archivo | Qué cubre |
|---|---|
| `health.test.mjs` | `/health`, `/health/ready`, base caída |
| `demo-session.test.mjs` | claim de slot, 409, invitado, slot vencido, 422 |
| `profiles.test.mjs` | 200/401/403/422, orden, shape, cero coordenadas |
| `logout.test.mjs` | 204, token muerto en el acto, slot liberado, doble logout, aislamiento |
| `stream-ticket.test.mjs` | emisión, hash persistido, un solo uso, vencimiento, muerte con logout |
| `reset.test.mjs` | reset propio, aislamiento, reset global, idempotencia, catálogo intacto |
| `logs-no-pii.test.mjs` | ningún call site de log interpola token/ticket/coordenada/identidad |
| `presence.test.mjs` | `PUT`/`DELETE /presence`: punto → zona, fallback, `demoZoneKey`, `ZONE_UNKNOWN`, cambio de región, TTL, 404 y upsert |
| `bots.test.mjs` | 2 bots por humano con `profileId` estable, waypoints y métricas, bots propios dentro del stream, ghost, cap de 6, aislamiento mx/co |
| `bots-anchor.test.mjs` | ancla en la persona (GPS en el norte de Bogotá), `demoZoneKey` ⇒ centroide, reubicación por desplazamiento > 250 m, ruido de GPS que no recrea, borde del polígono sin recorte |
| `discovery.test.mjs` | 5 perfiles (1 humano + 4 bots), medidas por observador vs ancla, radio, filtros y combinados, 422, ghost, región, cap de 6 y tope de 10 |
| `pings.test.mjs` | 201 pendiente, inbox/sent con `peer`, `409 PING_DUPLICATE`, accept → un match por par, reject 204, bot que acepta solo, 403/404/410/422 y bandeja que sobrevive al logout |
| `chat.test.mjs` | bandeja con `unreadCount` y preview, dos mensajes con orden y recorte, cursor de dos páginas, idempotencia por `clientMessageId` (y por emisor), read → 0, bot que contesta distinto cada vez, `message.created`/`typing.started` por SSE y el tercero que no ve la conversación ajena |
| `me.test.mjs` | `SelfProfile` de la sesión (no el `self` del dataset), 10 campos sin medidas, dos slots distintos, `404 PROFILE_NOT_FOUND` y 401 |
| `privacy.test.mjs` | ghost (discovery, stream y vista propia, ida y vuelta), bloqueo (idempotencia, efecto simétrico, ping/chat bloqueados, bot ⇒ dueño, unblock), reporte (202 sin PII, discovery intacto, 422/404), notificaciones (ping/match/mensaje/bot, contador, marcar una y todas, persistencia) y cierre por cambio de zona (`MATCH_CLOSED` y reapertura) |
| `expiry-reset.test.mjs` | sesión vencida (401, slot libre, presencia sin contar, bots retirados, fuera del radar), reset propio (lo mío sí, lo ajeno no) y reset global (bloques/reportes/notificaciones a cero, sin bots huérfanos) |
| `events.test.mjs` | ticket de un uso, `Last-Event-ID`, cursor y `limit` 422/410, página vacía, paridad SSE↔polling, `profile.presence`, dedupe |
| `migrations-seeds.test.mjs` | idempotencia de migraciones y seeds, `ST_Covers` y rollback de `007` dentro de una transacción |

## Endpoints

| Endpoint | Auth | Contrato | Notas |
|---|---|---|---|
| `GET /health` | — | **no** | liveness: responde sin tocar la base |
| `GET /health/ready` | — | **no** | 200 si `SELECT 1` contesta, 503 si no |
| `POST /auth/demo-session` | pública | `paths/auth.yaml` | `201 DemoSession`; `409 PROFILE_IN_USE`; invitado si no hay slots |
| `POST /auth/logout` | Bearer | `paths/auth.yaml` | `204` sin cuerpo; idempotente; revoca sesión y quema sus tickets |
| `POST /auth/stream-ticket` | Bearer | `paths/auth.yaml` | `201 StreamTicket`; 30 s, un uso, sólo para `GET /events` (S2) |
| `GET /demo/profiles?regionKey=` | Bearer | `paths/profiles.yaml` | 10 perfiles ordenados por `demoSlot`; `403 REGION_MISMATCH` |
| `PUT /presence` | Bearer | `paths/presence.yaml` | 200 `PresenceState`; `point` **o** `demoZoneKey`; `422 ZONE_UNKNOWN`/`VALIDATION_FAILED`; `404 PROFILE_NOT_FOUND` |
| `DELETE /presence` | Bearer | `paths/presence.yaml` | `204` sin cuerpo; `409 PRESENCE_STALE` si no había presencia viva |
| `GET /events?ticket=` | ticket | `paths/events.yaml` | SSE: `retry: 5000`, `Last-Event-ID`, `: keepalive` cada 15 s; `401 TICKET_EXPIRED`/`TICKET_REUSED`; `410 CURSOR_EXPIRED`; `422` |
| `GET /events/poll?cursor=&limit=` | Bearer | `paths/events.yaml` | `EventsPage` del mismo log; `limit` 1..500 (default 100); misma secuencia que el SSE desde el mismo cursor |
| `GET /discovery?radiusM=&intention=&gender=&verified=&online=` | Bearer | `paths/discovery.yaml` | `DiscoveryResult`: filas `ProfileSummary` ordenadas por distancia, medidas desde el observador; `422 VALIDATION_FAILED` fuera de rango |
| `POST /pings` | Bearer | `paths/pings.yaml` | `201 Ping`; `409 PING_DUPLICATE`; `404 PROFILE_NOT_FOUND`; `410 PING_EXPIRED`; `429 RATE_LIMITED`; `403 PING_FORBIDDEN` (invitado) o `403 CHAT_BLOCKED` (par bloqueado); un bot vuelve `accepted` |
| `GET /pings?box=inbox\|sent` | Bearer | `paths/pings.yaml` | `PingList` (`{ping, peer}`) más nuevo primero; `422 VALIDATION_FAILED` sin `box` |
| `POST /pings/{pingId}/accept` | Bearer | `paths/pings.yaml` | `200 Match`; `403 PING_FORBIDDEN`; `404 PING_NOT_FOUND`; `409 PING_RESOLVED`; `410 PING_EXPIRED` |
| `POST /pings/{pingId}/reject` | Bearer | `paths/pings.yaml` | `204` sin cuerpo; mismas guardas que accept; nunca crea match |
| `GET /matches` | Bearer | `paths/matches.yaml` | `MatchList` más reciente primero; `peer` del otro, `lastMessage` y `unreadCount` |
| `GET /matches/{matchId}/messages?cursor=` | Bearer | `paths/matches.yaml` | `MessagePage` cronológica, cursor opaco; `403 CHAT_BLOCKED`; `404 MATCH_NOT_FOUND`; `422` |
| `POST /matches/{matchId}/messages` | Bearer | `paths/matches.yaml` | `201 Message`; idempotente por `clientMessageId`; `409 MATCH_CLOSED` (otro lado fuera o zona cambiada); `403 CHAT_BLOCKED` (par bloqueado); `429 RATE_LIMITED`; el bot contesta solo |
| `POST /matches/{matchId}/read` | Bearer | `paths/matches.yaml` | `204` sin cuerpo; idempotente por resultado; baja el `unreadCount` |
| `GET /me` | Bearer | `paths/me.yaml` | `200 SelfProfile` de la sesión; `404 PROFILE_NOT_FOUND` si es invitado |
| `GET /blocks` | Bearer | `paths/blocks.yaml` | `BlockList` con `{block, peer}`; `403 PROFILE_REQUIRED` si es invitado |
| `POST /blocks` | Bearer | `paths/blocks.yaml` | `201 Block` idempotente; `404 PROFILE_NOT_FOUND`; `422` auto-bloqueo/body |
| `DELETE /blocks/{profileId}` | Bearer | `paths/blocks.yaml` | `204` idempotente; un bot revierte el bloqueo de su dueño |
| `POST /reports` | Bearer | `paths/reports.yaml` | `202 {reportId, createdAt}`; `404 PROFILE_NOT_FOUND`; `422` auto-reporte/motivo |
| `GET /notifications` | Bearer | `paths/notifications.yaml` | `{notifications, unreadCount}`; 100 más recientes; sin PII del mensaje |
| `POST /notifications/read` | Bearer | `paths/notifications.yaml` | `{marked, unreadCount}`; todas sin body, o `notificationIds`; idempotente |
| `POST /demo/reset` | — | **no** | reset global: borra sesiones, invitados, bots, eventos, pings, matches, mensajes, acuses, bloqueos, reportes y notificaciones; no el catálogo (§11) |
| `POST /demo/reset/self` | Bearer | **no** | reset de la propia sesión (y de lo privado propio); idempotente |

### Takeover: por qué es otra operation

El plan (§3) nombra "claim y takeover". El claim (`POST /auth/demo-session`) **no**
desaloja: pedir un slot ocupado es `409 PROFILE_IN_USE`. El desalojo es explícito,
`POST /auth/takeover` con `{regionKey, demoSlot}`, y desde el contrato v0.2 tiene
sus propios desenlaces (slot ajeno/libre → 200, slot propio → 409, otra región →
403). Un flag en el claim habría roto el `additionalProperties: false` del body y
escondido el gesto más peligroso de la demo detrás de un booleano.

### `/demo/reset` fuera del contrato

§11 lo define como el equivalente de `down -v` sin perder el volumen: es una
operación de operación, no de producto, y `openapi.yaml` congela sólo S1–S3. Igual
que `/health`, vive al lado del contrato con shape propio. El global no pide
credencial para poder correrse desde una terminal limpia; el riesgo (cualquiera
puede resetear la demo pública) está anotado en los límites conocidos.

### Por qué el reset no borra perfiles

`regions`, `zones`, `profiles` y `demo_meta` son **catálogo**: los escribe el seed y
son la razón por la que no hay que volver a migrar. Un reset borra `sessions` y
`stream_tickets`; los 10 slots quedan libres porque no hay sesión viva, no porque se
haya tocado el catálogo.

### Por qué `/health` no está en el contrato

`openapi.yaml` congela la superficie **de producto** de S1–S3 y su descripción dice
explícitamente que `/health` queda afuera hasta que exista un diseño que la
congele. Un liveness/readiness no es dominio de la demo: es lo que usa el compose
para decidir si reiniciar el contenedor o esperar antes de arrancar la API. Meterlo
en el contrato obligaría a versionar un endpoint de infraestructura junto a los
DTOs de la demo. El shape es propio y sólo lo consumen Docker y el runbook.

## Decisiones de stack

| Decisión | Por qué |
|---|---|
| **CommonJS** (`tsconfig` → `commonjs`, sin `"type": "module"`) | El paquete es independiente del root (que sí es ESM) y NestJS + `reflect-metadata` + decoradores están en su camino estable en CJS. No hay dependencia ESM-only que lo justifique. Los scripts de tooling (`scripts/*.mjs`) son ESM por convención del repo; viven fuera del build. |
| **`tsc` en vez de `@nestjs/cli`** | El CLI agrega una matriz de versiones (TypeScript propio, webpack/swc) por cero beneficio: acá el build es `tsc` y el watch es `tsc -w` + `node --watch`. Menos piezas, mismo resultado. |
| **SQL crudo con `pg`, sin ORM** | Las migraciones son el contrato de datos y se leen tal cual. La proyección HTTP se mapea a mano (`toProfileSummary`) para que ningún campo —ni una geometría— salga por accidente. Un ORM escondería justo lo que hay que auditar. |
| **Validación a mano** | `class-validator` sería una segunda copia de `contract/schemas/*`. Acá se valida forma/rango y se responde el `Problem` del contrato. |
| **JWT HS256 + fila en `sessions`** | El token es corto y sin refresh; la fila permite revocar (logout) sin esperar al `exp`. El guard verifica firma **y** fila. |
| **Ticket de stream hasheado** | Se guarda el sha256, no el valor: la tabla decide si el ticket sirve y una copia de la base no entrega tickets. El consumo es un solo `UPDATE` atómico (`consumed_at IS NULL AND expires_at > now()`), así dos usos simultáneos no ganan los dos. |
| **Dos guards, a propósito** | `DemoSessionGuard` verifica firma **y** fila (lectura y emisión). `TeardownSessionGuard` verifica sólo firma y se usa únicamente en logout y reset propio: son desarmes, el contrato pide que sean idempotentes, y su único efecto sobre una sesión ya cerrada es un no-op. Un token revocado no lee ni emite nada. |
| **CORS con allowlist, no `*`** | `app.enableCors({ origin: […CORS_ALLOWED_ORIGINS] })`, sin credenciales (la demo usa Bearer, no cookies). La lista sale del entorno: los tres puertos del front local en desarrollo y **vacía en producción** hasta que S6 declare el origen de Pages. El wildcard se rechaza en el boot: aceptarlo convertiría la allowlist en su contrario sin cambiar el nombre de la variable. |
| **TTL de presencia por filtro de lectura, sin cron** | `expires_at` es la única autoridad y toda consulta que cuente presencias filtra `expires_at > now()`. Un barrido siempre llega tarde (la presencia vencida seguiría contando hasta la próxima pasada) y la tabla tiene a lo sumo una fila por sesión viva, así que no hay nada que compactar. La fila se reusa por upsert y cae en cascada con la sesión (`logout`, reset, `down -v`). |
| **La región de una presencia es la de la sesión** | `regionKey` no viene del body: es parte de la identidad (`JWT` + `sessions`). Un punto de la otra región cae en fallback (`zoneKey: null`, `fallbackRequired: true`) en vez de mudar la sesión, porque mudarla en silencio dejaría dos presencias de la misma sesión en dos regiones. Cambiar de región = abrir sesión nueva. |
| **El punto se guarda, la coordenada no sale** | `presence.point` es `geometry(Point, 4326)` privado (lo va a necesitar S3 para distancia/rumbo). Ningún `SELECT` de la API lo proyecta y ningún log lo interpola: lo que sale es `regionKey`/`zoneKey`/`fallbackRequired`. |
| **Una sola proyección de eventos** | SSE y polling llaman a `EventsService.readPage`. La paridad no se mantiene sincronizando dos implementaciones: hay una. El SSE pagina el log cada 250 ms después del replay y manda `: keepalive` cada 15 s. |
| **`seq` por región, no un reloj** | `event_seq` se incrementa con `UPDATE … RETURNING` (serializa la fila y no reparte el mismo número). `occurredAt` viaja porque el contrato lo exige, pero no ordena: entre requests concurrentes el reloj se invierte. |
| **Ticker del mundo, un solo proceso** | El movimiento se escribe una vez y todas las lecturas ven lo mismo; si se calculara al leer, dos clientes con el mismo cursor verían posiciones distintas para el mismo `seq`. Con más de una instancia hace falta un job con lock (límite anotado, no resuelto antes de tener el problema). |
| **Bots derivados, geometría en PostGIS** | El `profileId` del bot es `<owner>-b1/b2` (estable entre logins del mismo slot) y su centro/waypoints se calculan en SQL: TypeScript nunca ve una coordenada. El ancla es **la persona** (`presence_anchors`: su punto GPS o el centroide de su zona demo) y `distanceM`/`bearingDeg` se miden contra ella, así el payload no depende de quién lo lee. `bots.anchor` guarda el ancla usada y la reubicación por desplazamiento (> 250 m) se decide con `ST_Distance`, también en SQL. |
| **Discovery mide desde el observador** | `GET /discovery` es una proyección por sesión: `ST_Distance`/`ST_Azimuth` desde la presencia viva (o el ancla de su zona demo, que es el origen del radar) hasta cada perfil, redondeados half-up. Un perfil de zona demo se ubica en el ancla + su vector de catálogo, que es su posición autorada. Desde la migración `004` los bots orbitan a su dueño, así que el dueño ve sus propios bots a la misma distancia que publica su `profile.moved`; para un observador ajeno el frame sigue siendo el observador (ver "Frames de distancia"). |
| **Una sola definición de "bots visibles"** | `BotsService.visibleBotIds` (propios primero, cap 6, corte por `bot_profile_id`) la usan el stream y discovery. Dos consultas con el mismo nombre se desincronizan; una sola no. |
| **`distanceM` proyectado a la banda 200–5000** | El schema congelado no tiene dónde poner "a 30 m" y el cliente valida 200–5000. El clamp es monótono (no reordena: el orden se calcula sobre la medida real) y está aislado en la proyección, no en el filtro del radio. |
| **Ghost = `DELETE /presence`** | Es la superficie que el contrato ya tiene; apagar la presencia oculta al humano y retira sus 2 bots de las lecturas. Un ghost que mantenga la presencia viva pide un delta de contrato (S5). |

## Modelo de datos (S1 + S5)

| Tabla | Clave | Invariante |
|---|---|---|
| `regions` | `region_key` | ISO alpha-2 en minúscula |
| `zones` | `(region_key, zone_key)` | `geometry(Polygon, 4326)` válido + índice GIST |
| `profiles` | `(region_key, profile_id)` | `demo_slot` único por región; `demo_slot IS NULL` ⇔ `source_type = 'guest'` |
| `sessions` | `session_id` | un solo slot vivo por región (índice único parcial); invitado ⇔ slot `NULL` |
| `stream_tickets` | `ticket_id` | hash del ticket, no el valor (S2) |
| `presence` | `session_id` | **una fila por sesión** (upsert); `geometry(Point, 4326)` privado + `expires_at` de 12 s; zona ⇔ región por FK compuesto; `visibility` `visible`/`ghost` (S5) |
| `bots` | `(region_key, bot_profile_id)` | 2 por humano (`UNIQUE (region_key, owner_profile_id, bot_index)`); `<owner>-b1/b2`; `anchor`/centro/posición privados + `distanceM`/`bearingDeg` publicables |
| `bot_waypoints` | `(region_key, bot_profile_id, waypoint_index)` | 4 waypoints por bot, `geometry(Point, 4326)` privados; cascada con el bot |
| `event_seq` | `region_key` | contador monotónico por región (el orden de `id`) |
| `events` | `(region_key, seq)` | log de las dos proyecciones; `payload` jsonb sin coordenadas; retención de 5000 por región |
| `pings` | `ping_id` | un pendiente por par dirigido (índice único parcial); `pending` ⇔ `resolved_at IS NULL`; `accepted` ⇔ `match_id IS NOT NULL`; TTL 24 h |
| `matches` | `match_id` | **uno por par no dirigido** (`UNIQUE (region_key, profile_a_id, profile_b_id)` con `a < b`); `bot_zone_key` guarda la zona de nacimiento cuando hay un bot (S5) |
| `blocks` | `(region_key, blocker_profile_id, blocked_profile_id)` | un bloqueo por par dirigido, sin auto-bloqueo; guarda al humano canónico (un bot ⇒ su dueño) |
| `reports` | `report_id` | registro con motivo del enum; sin estado ni consola; reportar un bot guarda al dueño |
| `notifications` | `notification_id` | campana persistida: `kind` + referencias (ping/match/message, exactamente las de su tipo) + `read_at` |
| `demo_meta` | `key` | `seed_id` y `contract_id` aplicados |

El slot se reclama con la base, no con un `SELECT` previo: si dos navegadores piden
el mismo, el índice único parcial decide y el segundo recibe `409 PROFILE_IN_USE`.

S3-A no agrega tablas ni columnas: `GET /discovery` es una **proyección** sobre
`profiles`, `sessions`, `presence`, `zones` y `bots`. La migración `004` sí es de
S3-B: agrega `bots.anchor` (el ancla con la que se sembró el loop) y la vista
`presence_anchors` (el punto de cada perfil, `Point,4326` privado, una fila por
perfil). Nada de eso se proyecta en la API.

## Reset

```bash
# todo: esquema, seeds y volumen
docker compose -f compose.yml -f compose.dev.yml down -v
docker compose -f compose.yml -f compose.dev.yml up --build -d

# sólo datos de demo, sin tocar el volumen ni volver a migrar (§11)
# En desarrollo: abierto. En producción exige DEMO_RESET_TOKEN (ver S7).
curl -s -X POST http://localhost:3000/demo/reset
# → {"scope":"global","sessionsDeleted":14,"guestsDeleted":1,"ticketsDeleted":0,
#    "regions":[{"regionKey":"co","freeSlots":10},{"regionKey":"mx","freeSlots":10}]}

# en producción, desde la terminal del operador
curl -s -X POST https://api.example.com/demo/reset \
  -H "Authorization: Bearer $DEMO_RESET_TOKEN"

# sólo mi sesión (el token deja de servir para todo)
curl -s -X POST http://localhost:3000/demo/reset/self -H "Authorization: Bearer $TOKEN"
# → {"scope":"self","sessionsDeleted":1,"ticketsDeleted":2,"regionKey":"mx","demoSlot":1,"sourceType":"human"}
```

Los dos son idempotentes: repetirlos devuelve `sessionsDeleted: 0` y no rompe nada.
El global además vacía `bots`, `events`, `event_seq`, `pings`, `matches`,
`notifications`, `blocks` y `reports`: la demo arranca con el stream vacío, el
`seq` de cada región en 1, la bandeja limpia y sin bloqueos ni avisos de una
corrida anterior. El reset propio retira los bots de su perfil en la misma
transacción (no espera al tick) y borra **sus** bloqueos, **sus** reportes y
**sus** notificaciones, pero **no** pings ni matches (cerrar sesión no vacía una
bandeja) ni el bloqueo que otra persona puso sobre su perfil (eso es de la otra
persona).

## Imágenes y compose

| Archivo | Qué es |
|---|---|
| `compose.yml` | producción/local: target `runtime`, usuario `node` (uid 1000), sin bind mounts |
| `compose.dev.yml` | overlay: target `development`, bind mount del código, `start:dev`, puerto 9229, Postgres publicado |
| `compose.prod.yml` | overlay de producción: base administrada por `DATABASE_URL`, `db` detrás del perfil `local-db`, API sólo en loopback, secretos obligatorios |
| `Dockerfile` | multi-stage (`deps` → `build` → `runtime-deps` → `runtime`, y `development`), `HEALTHCHECK` sobre `/health/ready` |
| `Dockerfile.dockerignore` | el contexto es la raíz del repo (hace falta `contract/`), así que se excluye todo lo demás |
| `.env.production.example` | variables de producción documentadas, sin secretos reales |

El `.env` está ignorado por git; `.env.example` y `.env.production.example` son
los únicos versionados. En producción la API no arranca sin `DATABASE_URL`, sin
un `JWT_SECRET` de 32+ caracteres y sin `CORS_ALLOWED_ORIGINS`
(`src/config/env.ts` y `compose.prod.yml` fallan en el boot, no en la primera
request). Deploy completo: [`docs/runbook-demo.md`](../docs/runbook-demo.md).

## Hardening (S7)

| Tema | Dónde | Qué hace |
|---|---|---|
| Validación de entrada | `src/common/validation.ts` + services | todo pedido mal formado es `422 VALIDATION_FAILED`; `PROFILE_ID_PATTERN` impide que un `\0` o 70 KB de basura lleguen a Postgres (antes: 500) |
| Errores de body-parser | `src/common/problem.filter.ts` | `400`/`413`/`415` se normalizan a `422` (el contrato no tiene 400) |
| Rate limits | `src/common/rate-limit.service.ts` | bucket en memoria para discovery (2/s, ráfaga 60), reset global (1/10 s), blocks (30/min) y reports (10/min); pings (30/min) y mensajes (60/min) siguen contando filas en SQL |
| Backup / restore | `scripts/backup-db.sh`, `scripts/restore-db.sh` | `pg_dump -Fc` con `.meta` y sha256; restore verificado en una base aparte con `--target-db`; sobre la viva exige `--yes` |
| Load test | `scripts/load-test.mjs` | 10 humanos + 20 bots por región, presencia/discovery/stream/chat, p50/p95/p99, sale 1 si hay 5xx |
| Revisión de seguridad | [`docs/security-review.md`](../docs/security-review.md) | autorización, IDOR, coordenadas, tickets SSE, reset, CORS y hallazgos con severidad |

Los tests nuevos son `test/integration/{validation,rate-limits,boot-config}.test.mjs`:
barrido de cuerpos inválidos (con un test que falla ante cualquier 5xx), los 429
hasta el límite real, y el arranque de producción (CORS cerrado, `*` rechazado,
reset con y sin token).

## Problemas conocidos

- **`tsc -w` no siempre ve los cambios a través del bind mount de Docker Desktop
  (Windows).** El watch no dispara y la API sigue sirviendo el `dist/` anterior:
  después de tocar `src/`, corré `docker compose … exec api npm run build` y
  reiniciá el servicio si el cambio agrega archivos nuevos.
- **`POST /demo/reset` es anónimo en desarrollo.** Es el comando de operación de
  §11 y corre desde una terminal limpia. En producción exige
  `DEMO_RESET_TOKEN` (sin token el endpoint responde 401), restringe el `Origin`
  a la allowlist de CORS y permite uno cada 10 s. En desarrollo queda abierto y
  sin throttle para que la suite no dependa del reloj.
- **El contrato ya expone ocupación (v0.2).** `ProfileSummary.inUse` sale de un
  `EXISTS` contra `sessions` con la misma condición que hace fallar un claim
  (`revoked_at IS NULL AND expires_at > now()`). Una fila vencida sin revocar no
  cuenta como viva porque el claim la limpia antes de reclamar el slot. Si algún
  día `inUse` no coincide con `409 PROFILE_IN_USE`, la que miente es la consulta,
  no el índice.
- **El contrato dice `501` para `/discovery`.** `contract/paths/discovery.yaml`
  (congelado) todavía describe la operation como `NOT_IMPLEMENTED` y declara la
  response 501; el server ya responde 200 desde S3-A. Es drift de prosa del
  contrato congelado: no rompe ningún gate (el test del contrato sigue verde
  porque el 501 está declarado, no ejercitado) y se corrige en el próximo delta de
  contrato, no acá.
- **Bloqueos: la exclusión no existe todavía.** `GET /discovery` documenta
  "bloqueados" como exclusión server-side, pero no hay tabla `blocks` (S5). Hasta
  entonces no hay pares bloqueados que excluir; el `WHERE` está listo para sumar
  la condición sin cambiar la forma de la respuesta.
- **El stream de eventos mide desde el dueño del bot, discovery desde el
  observador.** Un log compartido no puede llevar una medida por receptor sin
  guardar una coordenada o romper el replay. El cliente arma posiciones con
  discovery; la deuda de frame de `profile.moved` para un observador ajeno (el
  contrato dice "relativos a quien recibe") es de S4 y pide `events.position`
  privado + proyección por receptor. El dueño sí ve en su radar la misma distancia
  que publica el evento de sus propios bots.
- **`maxItems: 10` acota la página de discovery.** Con la región llena (9 humanos
  + 6 bots) se devuelven 10 filas: gana el más cercano. No hay cursor porque el
  contrato dice que una página es el resultado entero; si S4/S5 necesita más,
  primero se congela el cursor.
- **`migrate` da `ECONNREFUSED` con `db` healthy.** La imagen de Postgres levanta un
  servidor temporal por socket durante la inicialización. El healthcheck usa
  `-h 127.0.0.1` para esperar TCP y el runner reintenta al conectar.
- **`tsc -w` y `node --watch` en el mismo contenedor**: si un rebuild queda a medio
  escribir, `node --watch` reinicia; no hay estado que se corrompa, pero el log
  puede mostrar un error de módulo por un instante.
- **Puerto 3000 tomado**: `PORT=3100 docker compose up …` (el `.env` también sirve).
- **Una presencia vencida deja la fila.** El TTL es de lectura: la fila sigue en
  `presence` con `expires_at` en el pasado y no cuenta para nada (el siguiente
  `PUT` la reusa, el `logout`/reset la borra en cascada). No es un leak: es una
  fila por sesión, no una por latido. Si S5 quiere la tabla impecable, ahí sí
  conviene un barrido — no antes, porque no resuelve nada que el filtro no
  resuelva.
- **Tests contra la base equivocada**: exportá `DATABASE_URL`/`API_BASE_URL`; los
  defaults apuntan al compose local.
- **El ticker del mundo corre en la API.** Con una sola instancia no hay problema;
  con varias, cada proceso mueve bots y el log recibiría eventos duplicados (el
  avance es idempotente por `leg_started_at`, la emisión no). S6/S7: job aparte o
  `pg_advisory_lock` por tick.
- **`distanceM`/`bearingDeg` de un bot son contra la presencia de su dueño**, no
  contra la de cada observador. El contrato dice "relativos a quien recibe"; con
  un log único por región, la única forma de que el mismo `seq` valga lo mismo para
  todos es una referencia fija, y la referencia natural de un bot es la persona
  que lo arrastra. El cálculo por observador es `/discovery`.
- **La posición privada de un bot puede caer fuera de su polígono.** Desde que el
  ancla es la persona, un humano cerca del borde tiene bots que salen de la zona:
  se aceptó a propósito (recortar el centro al polígono era lo que apilaba los bots
  en el centroide). `bots.zone_key` sigue siendo la zona del dueño y no se usa para
  contener la geometría, sólo para el fallback del ancla y para la FK.
- **El ghost apaga también al humano.** `DELETE /presence` es la única superficie
  de pausa que el contrato tiene; si S5 pide "invisible pero online", primero hay
  que congelar el campo en `PresenceUpdate`.
