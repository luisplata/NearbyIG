# Backend — NearbyIG demo

API NestJS + PostGIS de la demo. **Sprint 2, batch S2-A**: presencia y región
(contrato v0.2, sin cambios de contrato en este batch). El contrato de `contract/`
manda: acá se implementa, no se renegocia.

| Pieza | Estado |
|---|---|
| `GET /health`, `GET /health/ready` | listo (fuera del contrato, ver abajo) |
| `GET /demo/profiles` | listo, según `contract/paths/profiles.yaml`: incluye `inUse` |
| `POST /auth/demo-session` | listo: claim de slot, invitado si no hay slots, 409 `PROFILE_IN_USE` |
| `POST /auth/takeover` | listo (contrato v0.2): desalojo explícito, 200 `DemoSession` |
| `POST /auth/logout` | listo, según el contrato: 204, idempotente, revoca en el acto |
| `POST /auth/stream-ticket` | listo: ticket de 30 s, un uso; el consumidor es S2 |
| `PUT /presence` | listo (S2): punto privado **o** `demoZoneKey`; región y zona por `ST_Covers` |
| `DELETE /presence` | listo (S2): 204, o 409 `PRESENCE_STALE` si no había presencia viva |
| `POST /demo/reset`, `/demo/reset/self` | listo (fuera del contrato, §11 del plan) |
| Migraciones + seeds idempotentes | listo (`001_init`, `002_presence`) |

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

`002` es aditiva y reversible sin pérdida: la única tabla nueva referencia a
`sessions` y `zones` (no al revés), así que el `down` no desarma nada. Aplicar y
revertir en el stack:

```bash
docker compose -f compose.yml -f compose.dev.yml exec api npm run migrate:rollback
# → rollback ok: 002_presence
docker compose -f compose.yml -f compose.dev.yml exec api npm run migrate
# → migrate ok: 002_presence
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
real → zona, fallback, TTL, cambio de región, `DELETE`), logs sin PII y
migraciones/seeds idempotentes + `ST_Covers`.

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
| **Sin CORS todavía** | Lo agrega S6 con la allowlist de Pages/localhost; hoy el único origen es `localhost` y no hay cliente web en este batch. |
| **TTL de presencia por filtro de lectura, sin cron** | `expires_at` es la única autoridad y toda consulta que cuente presencias filtra `expires_at > now()`. Un barrido siempre llega tarde (la presencia vencida seguiría contando hasta la próxima pasada) y la tabla tiene a lo sumo una fila por sesión viva, así que no hay nada que compactar. La fila se reusa por upsert y cae en cascada con la sesión (`logout`, reset, `down -v`). |
| **La región de una presencia es la de la sesión** | `regionKey` no viene del body: es parte de la identidad (`JWT` + `sessions`). Un punto de la otra región cae en fallback (`zoneKey: null`, `fallbackRequired: true`) en vez de mudar la sesión, porque mudarla en silencio dejaría dos presencias de la misma sesión en dos regiones. Cambiar de región = abrir sesión nueva. |
| **El punto se guarda, la coordenada no sale** | `presence.point` es `geometry(Point, 4326)` privado (lo va a necesitar S3 para distancia/rumbo). Ningún `SELECT` de la API lo proyecta y ningún log lo interpola: lo que sale es `regionKey`/`zoneKey`/`fallbackRequired`. |

## Modelo de datos (S1 + S2)

| Tabla | Clave | Invariante |
|---|---|---|
| `regions` | `region_key` | ISO alpha-2 en minúscula |
| `zones` | `(region_key, zone_key)` | `geometry(Polygon, 4326)` válido + índice GIST |
| `profiles` | `(region_key, profile_id)` | `demo_slot` único por región; `demo_slot IS NULL` ⇔ `source_type = 'guest'` |
| `sessions` | `session_id` | un solo slot vivo por región (índice único parcial); invitado ⇔ slot `NULL` |
| `stream_tickets` | `ticket_id` | hash del ticket, no el valor (S2) |
| `presence` | `session_id` | **una fila por sesión** (upsert); `geometry(Point, 4326)` privado + `expires_at` de 12 s; zona ⇔ región por FK compuesto |
| `demo_meta` | `key` | `seed_id` y `contract_id` aplicados |

El slot se reclama con la base, no con un `SELECT` previo: si dos navegadores piden
el mismo, el índice único parcial decide y el segundo recibe `409 PROFILE_IN_USE`.

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
