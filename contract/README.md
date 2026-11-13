# Contrato de la API

El contrato es el producto de Sprint 0. Vive en `contract/`, la tercera raíz del
repo junto a `demo/` y `backend/`, y se escribe **antes** del server: Sprint 1 lo
consume y lo cumple, no lo define.

Es un único documento OpenAPI `3.1.0` repartido en varios archivos. Nada acá se
ejecuta en producción y nada acá toca la demo: `demo/` y `site/` quedan intactos.

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
| `npm run contract:test` | `node --test` sobre `contract/test/*.test.mjs` |
| `npm run contract:check` | `contract:validate` → `contract:test` → `git diff --exit-code` |

`contract:check` es el gate. Suma un guard por PR: seeds en PR7, `generate:check`
y `typecheck` en PR8.

## Estructura

```text
contract/
  openapi.yaml              raíz: info, servers, security global, tags, montaje de paths
  redocly.yaml              ruleset (extends: recommended)
  paths/auth.yaml           path items de auth (S1)
  schemas/auth.yaml         DemoSession, DemoSessionRequest, StreamTicket
  schemas/common.yaml       RegionKey, SourceType, KeyLabel, Page
  scripts/lib/spec.mjs      carga los YAML, resuelve $ref, calcula x-contract-id
  scripts/validate-spec.mjs gate: lint + invariantes
  test/spec-valid.test.mjs  inventario de operations + invariantes
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
  Entran en PR2; por eso `operation-4xx-response` está en `off` en `redocly.yaml`
  y se reactiva con el catálogo.
- **Nunca coordenadas.** Ningún response ni payload de evento puede alcanzar
  `lat`/`lng`/`latitude`/`longitude`. Los polígonos viven sólo en
  `contract/catalog/zones.json`, fuera del spec y sin keys (`[lng, lat]`).
- **Sin `/v1`.** El versionado vive en `info`, no en el path.
- **`Page` es metadata, no wrapper.** `allOf` + `additionalProperties: false`
  bloquea campos hermanos: las proyecciones declaran sus campos planos.

## Límites conocidos

- El cliente `generated/api.ts` es **type-only** y llega en PR8: S3 necesita igual
  un wrapper `fetch` con selector mock/live que ningún generador produce.
- `contract/catalog/` no se sirve nunca a clientes: sólo se exponen proyecciones
  (`ZoneSummary`, DTOs de perfil).
- Idempotencia de **emisión** de seeds es S0; la de **inserción** es Sprint 1
  (claves naturales + `ON CONFLICT DO NOTHING`). PR7 lo documenta acá.
