# Backend — NearbyIG demo

API NestJS + PostGIS de la demo. **Sprint 3 en curso (S3-A: descubrimiento y
CORS)**, sin cambios de contrato: el contrato de `contract/` manda y acá se
implementa, no se renegocia.

| Pieza | Estado |
|---|---|
| `GET /health`, `GET /health/ready` | listo (fuera del contrato, ver abajo) |
| `GET /demo/profiles` | listo, según `contract/paths/profiles.yaml`: incluye `inUse` |
| `POST /auth/demo-session` | listo: claim de slot, invitado si no hay slots, 409 `PROFILE_IN_USE` |
| `POST /auth/takeover` | listo (contrato v0.2): desalojo explícito, 200 `DemoSession` |
| `POST /auth/logout` | listo, según el contrato: 204, idempotente, revoca en el acto |
| `POST /auth/stream-ticket` | listo: ticket de 30 s, un uso; lo consume `GET /events` |
| `PUT /presence` | listo (S2): punto privado **o** `demoZoneKey`; región y zona por `ST_Covers` |
| `DELETE /presence` | listo (S2): 204, o 409 `PRESENCE_STALE` si no había presencia viva; es el ghost/pausa |
| `GET /events` | listo (S2): SSE con ticket, `Last-Event-ID` y `: keepalive` cada 15 s |
| `GET /events/poll` | listo (S2): misma secuencia que el SSE desde el mismo cursor |
| `GET /discovery` | listo (S3): radio, intención, género, verificado y online; medidas por observador |
| Bots | listo (S2): 2 por humano vivo, 4 waypoints, ticker de 2 s, cap de 6 por observador |
| CORS | listo (S3): allowlist configurable (`CORS_ALLOWED_ORIGINS`) + túneles de ngrok en desarrollo |
| `POST /demo/reset`, `/demo/reset/self` | listo (fuera del contrato, §11 del plan) |
| Migraciones + seeds idempotentes | listo (`001_init`, `002_presence`, `003_bots_events`) |

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
`online` y `fallbackRequired`. La coordenada no vuelve nunca —ni en la response ni
en un log— aunque se guarde en la columna privada `presence.point`.

```bash
API=http://localhost:3000
T=$(curl -s -X POST $API/auth/demo-session -H 'content-type: application/json' \
  -d '{"regionKey":"mx","demoSlot":3}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')

# punto real en CDMX                  → 200 zoneKey cdmx, fallbackRequired false
curl -s -X PUT $API/presence -H "Authorization: Bearer $T" -H 'content-type: application/json' \
  -d '{"point":{"lat":19.432608,"lng":-99.133209}}'
# → {"profileId":"mx-p03","regionKey":"mx","zoneKey":"cdmx","online":true,"fallbackRequired":false}

# GPS denegado: la zona la elige el usuario → 200 cdmx (sin coordenada guardada)
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
| visibilidad | humanos de la región (menos uno mismo) + bots visibles, **propios incluidos**, cap 6 |
| propio | el humano no se ve a sí mismo, pero **sí ve sus 2 bots** (S3: es la densidad que el plan promete) |
| ghost | `DELETE /presence` apaga la presencia ⇒ los 2 bots propios desaparecen para los demás, en la lectura y en la tabla |

**Ghost/pausa = `DELETE /presence`.** El contrato no tiene una operation de
visibilidad y no se inventó una: apagar la presencia es la superficie que ya
existe, y es coherente con §5 ("ghost oculta humano y bots a los demás"). El
humano también deja de aparecer (su `profile.presence` sale con `online: false`),
que es lo que la demo quiere mostrar. Un ghost que mantenga la presencia viva
necesita un delta de contrato (un `visibility` en `PresenceUpdate`, por ejemplo) —
está anotado como deuda para S5.

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

`004` es aditiva pero **el orden del rollback importa**: el código que usa
`presence_anchors` es el de este batch, así que revertir la migración con ese
binario corriendo deja el ticker sin vista (`relation "presence_anchors" does not
exist` en el `warn` del tick, sin tumbar la API). Para volver atrás hay que
revertir el código primero (o aceptar que los bots no se resiembren hasta
re-aplicarla). El `down` no borra sesiones, presencia ni catálogo.

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
combinados, 422, ghost, región, cap y tope de página), eventos (ticket, cursor,
replay, paridad SSE↔polling, dedupe), logs sin PII y migraciones/seeds
idempotentes + `ST_Covers`.

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
| `events.test.mjs` | ticket de un uso, `Last-Event-ID`, cursor y `limit` 422/410, página vacía, paridad SSE↔polling, `profile.presence`, dedupe |
| `migrations-seeds.test.mjs` | idempotencia de migraciones y seeds, `ST_Covers` |

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
| `POST /demo/reset` | — | **no** | reset global: borra sesiones e invitados, no el catálogo (§11) |
| `POST /demo/reset/self` | Bearer | **no** | reset de la propia sesión; idempotente |

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

## Modelo de datos (S1 + S2)

| Tabla | Clave | Invariante |
|---|---|---|
| `regions` | `region_key` | ISO alpha-2 en minúscula |
| `zones` | `(region_key, zone_key)` | `geometry(Polygon, 4326)` válido + índice GIST |
| `profiles` | `(region_key, profile_id)` | `demo_slot` único por región; `demo_slot IS NULL` ⇔ `source_type = 'guest'` |
| `sessions` | `session_id` | un solo slot vivo por región (índice único parcial); invitado ⇔ slot `NULL` |
| `stream_tickets` | `ticket_id` | hash del ticket, no el valor (S2) |
| `presence` | `session_id` | **una fila por sesión** (upsert); `geometry(Point, 4326)` privado + `expires_at` de 12 s; zona ⇔ región por FK compuesto |
| `bots` | `(region_key, bot_profile_id)` | 2 por humano (`UNIQUE (region_key, owner_profile_id, bot_index)`); `<owner>-b1/b2`; `anchor`/centro/posición privados + `distanceM`/`bearingDeg` publicables |
| `bot_waypoints` | `(region_key, bot_profile_id, waypoint_index)` | 4 waypoints por bot, `geometry(Point, 4326)` privados; cascada con el bot |
| `event_seq` | `region_key` | contador monotónico por región (el orden de `id`) |
| `events` | `(region_key, seq)` | log de las dos proyecciones; `payload` jsonb sin coordenadas; retención de 5000 por región |
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
curl -s -X POST http://localhost:3000/demo/reset
# → {"scope":"global","sessionsDeleted":14,"guestsDeleted":1,"ticketsDeleted":0,
#    "regions":[{"regionKey":"co","freeSlots":10},{"regionKey":"mx","freeSlots":10}]}

# sólo mi sesión (el token deja de servir para todo)
curl -s -X POST http://localhost:3000/demo/reset/self -H "Authorization: Bearer $TOKEN"
# → {"scope":"self","sessionsDeleted":1,"ticketsDeleted":2,"regionKey":"mx","demoSlot":1,"sourceType":"human"}
```

Los dos son idempotentes: repetirlos devuelve `sessionsDeleted: 0` y no rompe nada.
El global además vacía `bots`, `events` y `event_seq`: la demo arranca con el stream
vacío y el `seq` de cada región en 1. El reset propio retira los bots de su perfil en
la misma transacción (no espera al tick).

## Imágenes y compose

| Archivo | Qué es |
|---|---|
| `compose.yml` | producción/local: target `runtime`, usuario `node` (uid 1000), sin bind mounts |
| `compose.dev.yml` | overlay: target `development`, bind mount del código, `start:dev`, puerto 9229, Postgres publicado |
| `Dockerfile` | multi-stage (`deps` → `build` → `runtime-deps` → `runtime`, y `development`) |
| `Dockerfile.dockerignore` | el contexto es la raíz del repo (hace falta `contract/`), así que se excluye todo lo demás |

El `.env` está ignorado por git; `.env.example` es el único versionado. En
producción la API no arranca sin `DATABASE_URL` y sin un `JWT_SECRET` de 32+
caracteres (`src/config/env.ts` falla en el boot, no en la primera request).

## Problemas conocidos

- **`tsc -w` no siempre ve los cambios a través del bind mount de Docker Desktop
  (Windows).** El watch no dispara y la API sigue sirviendo el `dist/` anterior:
  después de tocar `src/`, corré `docker compose … exec api npm run build` y
  reiniciá el servicio si el cambio agrega archivos nuevos.
- **`POST /demo/reset` es anónimo.** Es el comando de operación de §11 y corre
  desde una terminal limpia, pero en una demo pública cualquiera puede vaciarla.
  Se endurece en S5/S7 (rate limit y/o secreto de operación); hoy el stack es local.
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
