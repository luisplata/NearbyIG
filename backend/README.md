# Backend — NearbyIG demo

API NestJS + PostGIS de la demo. **Sprint 1, batch S1-B**: identidad completa y reset.
El contrato de `contract/` está congelado: acá se implementa, no se renegocia.

| Pieza | Estado |
|---|---|
| `GET /health`, `GET /health/ready` | listo (fuera del contrato, ver abajo) |
| `GET /demo/profiles` | listo, según `contract/paths/profiles.yaml` |
| `POST /auth/demo-session` | listo: claim de slot, invitado si no hay slots, 409 `PROFILE_IN_USE` |
| `POST /auth/logout` | listo, según el contrato: 204, idempotente, revoca en el acto |
| `POST /auth/stream-ticket` | listo: ticket de 30 s, un uso; el consumidor es S2 |
| `POST /demo/reset`, `/demo/reset/self` | listo (fuera del contrato, §11 del plan) |
| Migraciones + seeds idempotentes | listo |
| Takeover | **no implementado**: el contrato no lo modela (ver abajo) |

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
acto), tickets de stream (un solo uso), reset propio y global, logs sin PII y
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
| `POST /demo/reset` | — | **no** | reset global: borra sesiones e invitados, no el catálogo (§11) |
| `POST /demo/reset/self` | Bearer | **no** | reset de la propia sesión; idempotente |

### Takeover: por qué no está

El plan (§3) nombra "claim y takeover", pero **el contrato no modela el takeover**:
`DemoSessionRequest` es `additionalProperties: false` y sólo acepta `regionKey` y
`demoSlot`; la única respuesta de conflicto declarada es `409 PROFILE_IN_USE`, y no
existe operation de takeover. Implementarlo por fuera (un `takeover: true` o un
`POST /auth/takeover`) sería inventar superficie y, además, romper el schema del
request. Por eso hoy el servidor **nunca** desaloja a nadie: pedir un slot ocupado
es 409 y el cliente elige otro. Si la demo necesita el gesto, primero se congela en
`contract/` y después se implementa.

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

## Modelo de datos (S1)

| Tabla | Clave | Invariante |
|---|---|---|
| `regions` | `region_key` | ISO alpha-2 en minúscula |
| `zones` | `(region_key, zone_key)` | `geometry(Polygon, 4326)` válido + índice GIST |
| `profiles` | `(region_key, profile_id)` | `demo_slot` único por región; `demo_slot IS NULL` ⇔ `source_type = 'guest'` |
| `sessions` | `session_id` | un solo slot vivo por región (índice único parcial); invitado ⇔ slot `NULL` |
| `stream_tickets` | `ticket_id` | hash del ticket, no el valor (S2) |
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
- **El contrato no expone ocupación.** `ProfileSummary` no tiene `inUse`, así que
  `/demo/profiles` devuelve siempre las 10 filas y el cliente descubre "en uso"
  por el `409 PROFILE_IN_USE`. Mostrar el estado sin intentar el claim necesita un
  cambio de contrato.
- **`migrate` da `ECONNREFUSED` con `db` healthy.** La imagen de Postgres levanta un
  servidor temporal por socket durante la inicialización. El healthcheck usa
  `-h 127.0.0.1` para esperar TCP y el runner reintenta al conectar.
- **`tsc -w` y `node --watch` en el mismo contenedor**: si un rebuild queda a medio
  escribir, `node --watch` reinicia; no hay estado que se corrompa, pero el log
  puede mostrar un error de módulo por un instante.
- **Puerto 3000 tomado**: `PORT=3100 docker compose up …` (el `.env` también sirve).
- **Tests contra la base equivocada**: exportá `DATABASE_URL`/`API_BASE_URL`; los
  defaults apuntan al compose local.
