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
| Superficie congelada S1–S3 con sprint por operation | Ninguna operation implementada |
| `ErrorCode` cerrado, envelope de eventos, catálogo MX/CO | Firebase, OAuth, secretos |
| Cliente TS type-only generado (PR8) | Cliente runtime |

El primer `curl` es Sprint 1. Hasta que `npm run contract:check` esté verde, no
hay contrato que implementar.

## Comandos

Corré `npm ci` una vez en la raíz (el tooling del contrato son dos devDependencies
pinneadas: `@redocly/cli` y `yaml`).

| Comando | Qué hace |
|---|---|
| `npm run contract:validate` | `redocly lint` + invariantes estructurales |
| `npm run contract:seed` | emite el catálogo en forma canónica + `seed/manifest.json` |
| `npm run contract:seed:check` | falla si lo commiteado difiere de lo emitido |
| `npm run contract:seed:dry-run` | tabla `path \| rows \| sha \| estado`, sin escribir |
| `npm run contract:test` | `node --test` sobre `contract/test/*.test.mjs` |
| `npm run contract:docs` | genera el doc HTML estático en `contract/dist/` |
| `npm run contract:check` | `contract:validate` → `contract:seed:check` → `contract:test` → `git diff --exit-code` |

`contract:check` es el gate: el seed se verifica antes de los tests, porque un
`manifest` viejo invalida cualquier verde posterior. PR8 sumará `generate:check`
y `typecheck`.

Corre en CI en `.github/workflows/contract.yml`, un workflow propio: `push` a `main`
y PRs que toquen `contract/`, `package.json`, `package-lock.json` o el workflow.
Permisos mínimos (`contents: read`) y `concurrency` por ref. El workflow de Pages
(`pages.yml`) no se toca y sigue siendo el único que publica Pages; un test lo
verifica en `scripts/lib/workflow.test.mjs`.

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
  schemas/auth.yaml         DemoSession, DemoSessionRequest, StreamTicket
  schemas/events.yaml       envelope, los 6 tipos, payloads S2, EventsPage
  schemas/region.yaml       Region, RegionList, ZoneSummary, ZoneList
  schemas/profile.yaml      ProfileSummary, ProfileList, SelfProfile
  schemas/common.yaml       RegionKey, SourceType, Gender, Intention, KeyLabel, Page
  catalog/regions.json      dos regiones: mx, co (con defaultZoneKey)
  catalog/zones.json        geometría de CDMX y Bogotá: anillos [lng, lat]
  catalog/profiles.mx.json  10 perfiles derivados de fixtures.json (posición a posición)
  catalog/profiles.co.json  10 perfiles autorados, mismo shape
  seed/manifest.json        versión, contractId, hash de fixtures y sha de cada archivo emitido
  event/sample-log.json     fixture congelado: 40 eventos con un duplicado
  scripts/lib/spec.mjs      carga los YAML, resuelve $ref, calcula x-contract-id
  scripts/lib/events.mjs    proyecciones puras: parseEnvelopeId, toSseFrames, toPollPage
  scripts/seed.mjs          emisor canónico del catálogo + manifest (--check, --dry-run)
  scripts/validate-spec.mjs gate: lint + invariantes
  test/spec-valid.test.mjs  inventario de operations + invariantes
  test/events-contract.test.mjs  envelope, dedupe y paridad SSE ≡ polling
  test/zones-geometry.test.mjs   anillos válidos + geometría inalcanzable desde el spec
  test/fixtures-parity.test.mjs  paridad campo a campo con fixtures (fixtures gana)
  test/seed-idempotent.test.mjs  doble emisión byte-idéntica + gate anti-drift
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

## Superficie congelada (S1–S3)

Lo que está adentro es la superficie de la demo. Lo que está afuera se congela
cuando exista un diseño que lo congele: pings, matches, chat, block, report y
`/health` no tienen path.

| Operation | Sprint | Archivo | Entra en |
|---|---:|---|---|
| `POST /auth/demo-session` | 1 | `paths/auth.yaml` | PR1 |
| `POST /auth/logout` | 1 | `paths/auth.yaml` | PR1 |
| `POST /auth/stream-ticket` | 1 | `paths/auth.yaml` | PR1 |
| `GET /demo/profiles` | 1 | `paths/profiles.yaml` | PR5 |
| `GET /events`, `GET /events/poll` | 2 | `paths/events.yaml` | PR3 |
| `GET /demo/regions`, `GET /demo/zones` | 2 | `paths/catalog.yaml` | PR4 |
| `PUT /presence`, `DELETE /presence` | 2 | `paths/presence.yaml` | PR6 |
| `GET /discovery` | 3 | `paths/discovery.yaml` | PR6 |

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
`regionKey`, `demoSlot` y `sourceType`.

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
- `ProfileSummary` cierra con `additionalProperties: false` y declara exactamente esas 16 claves: un campo que no existe en el schema no llega al catálogo.

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

`contract/event/sample-log.json` es un fixture congelado (40 entradas: 24 `seq`
de `mx`, 15 de `co` y un duplicado). Todavía no se regenera desde el catálogo: el
generador y el test de bytes llegan con los perfiles (PR5).

### Cómo agregar un tipo de evento

1. El valor ya está en `EventType` si es uno de los seis congelados. Si no,
   sumalo ahí: el enum es el contrato con el cliente.
2. Declarar `<Tipo>Payload` con `additionalProperties: false` — sin `lat`, `lng`,
   `latitude` ni `longitude`; distancia y rumbo van como `distanceM`/`bearingDeg`.
3. Sumarlo al `oneOf` de `EventPayload`. El envelope **no** cambia.
4. Extender `PAYLOAD_SCHEMA` en `contract/test/events-contract.test.mjs`.

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
   único, `summary`, `description`, `tags` y `x-implementation-sprint` (1, 2 o 3).
2. Montarlo en `openapi.yaml` → `paths`.
3. Si hay DTO nuevo, `schemas/<recurso>.yaml` con `additionalProperties: false` y
   los nombres del dataset (no `distanceMeters`, no `intent`).
4. Agregar la fila a `EXPECTED_OPERATIONS` en `contract/test/spec-valid.test.mjs`.
5. `npm run contract:validate` → copiar el `x-contract-id` que imprime.
6. Regenerar el cliente (PR8) y cerrar con `npm run contract:check`.

## Reglas de la casa

- **`additionalProperties: false`** en todo DTO de respuesta. Un campo que no está
  declarado no viaja.
- **Sprint por operation.** `x-implementation-sprint` ∈ {1,2,3}. Ninguna operation
  declara 0, 4 o 5.
- **Errores en `application/problem+json`** (RFC 9457) con `code` del enum cerrado.
  `operation-4xx-response` está activa en `redocly.yaml`, pero su severidad es
  `warning`: el gate duro es el test "toda operation declara ≥1 error 4xx/5xx".
- **Nunca coordenadas.** Ningún response ni payload de evento puede alcanzar
  `lat`/`lng`/`latitude`/`longitude` ni un par `[n, n]`. Los polígonos viven sólo
  en `contract/catalog/zones.json`, fuera del spec y sin keys (ver
  [Regiones y zonas](#regiones-y-zonas-la-geometría-existe-y-nunca-viaja)).
- **Sin `/v1`.** El versionado vive en `info`, no en el path.
- **`Page` es metadata, no wrapper.** `allOf` + `additionalProperties: false`
  bloquea campos hermanos: las proyecciones declaran sus campos planos.

## Límites conocidos

- El cliente `generated/api.ts` es **type-only** y llega en PR8: S3 necesita igual
  un wrapper `fetch` con selector mock/live que ningún generador produce.
- `contract/catalog/` no se sirve nunca a clientes: sólo se exponen proyecciones
  (`ZoneSummary`, DTOs de perfil).
- La idempotencia de **emisión** de seeds es S0; la de **inserción** es Sprint 1
  (claves naturales + `ON CONFLICT DO NOTHING`). Ver [Seeds deterministas](#seeds-deterministas).
