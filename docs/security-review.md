# Revisión de seguridad — demo live (S7)

> **Alcance:** API NestJS + PostGIS de la demo, artefacto de GitHub Pages y el
> camino de deploy documentado en [`runbook-demo.md`](runbook-demo.md).
> **Qué NO cubre:** autenticación real (no existe: la identidad es una sesión
> demo firmada), la app Flutter, OAuth, pagos, PII de personas reales.
> **Método:** lectura del código, barrido de endpoints con cuerpos inválidos
> contra el stack real, y los tests de integración/contrato del repo. Los
> hallazgos son reproducibles: cada uno trae el comando o el test.

## Resumen

| ID | Severidad | Hallazgo | Estado |
|---|---|---|---|
| **H-1** | **Alta** | El ZIP versionado en el repo público contiene una keystore de firma Android con su contraseña en texto plano | **Abierto** — requiere rotar clave y purgar historial (decisión del dueño) |
| **M-1** | Media | Un `profileId` con `\0` llegaba a Postgres y devolvía `500 INTERNAL` en 4 endpoints | Corregido + tests |
| **M-2** | Media | `GET /discovery` no tenía límite de frecuencia (DI-12): un loop multiplicaba `ST_DWithin` contra la base | Corregido + tests |
| **M-3** | Media | `POST /demo/reset` global era anónimo y sin límite: cualquiera con la URL borraba la demo | Corregido + tests de arranque |
| **M-4** | Media (aceptado) | Cualquiera puede abrir las 10 sesiones de una región y dejar el resto como invitados | Aceptado para la demo; mitigado por TTL de 2 h y reset global |
| **L-1** | Baja | JSON roto / primitivo / >100 KB devolvía `400`/`413`, códigos que el contrato no declara | Corregido + tests |
| **L-2** | Baja | `?cursor` repetido en `/events/poll` se trataba como "sin cursor" (replay silencioso) | Corregido + test |
| **L-3** | Baja | `POST /blocks` y `POST /reports` no tenían tope: un loop llenaba tablas | Corregido (30/min y 10/min) |
| **L-4** | Baja (aceptado) | Una ruta inexistente responde `404 PROFILE_NOT_FOUND` (el contrato no tiene un código de "ruta no encontrada") | Aceptado; no filtra nada |
| **L-5** | Baja (aceptado) | `compose.yml` base corre con `NODE_ENV=production` y el `JWT_SECRET` de desarrollo | Mitigado: `compose.prod.yml` lo exige; documentado |

## 1. Autorización e IDOR

**Regla del proyecto** (SA-3, SA-4, XS-1): la identidad sale **sólo** del `sub`
verificado del Bearer; un recurso ajeno responde **404**, nunca 403.

| Superficie | Control | Evidencia |
|---|---|---|
| `GET /me`, `GET /demo/profiles` | perfil de la sesión / catálogo público | `test/integration/me.test.mjs`, `profiles.test.mjs` |
| `PUT/DELETE /presence` | `presence.session_id = $1` | `presence.test.mjs` |
| `GET /discovery` | excluye al propio perfil y bloqueados | `discovery.test.mjs`, `privacy.test.mjs` |
| `GET /pings`, `accept`/`reject` | filtro por emisor/destinatario; tercero → 404 | `pings.test.mjs` |
| `GET/POST /matches/{id}/messages`, `read` | participante del match; tercero → 404 | `chat.test.mjs`, `privacy.test.mjs` |
| `GET/POST/DELETE /blocks`, `POST /reports` | perfil propio; bot canonicalizado al dueño | `privacy.test.mjs` |
| `GET /notifications`, `read` | `recipient_profile_id = sub` | `privacy.test.mjs` |
| `POST /demo/reset/self` | borra **sólo** lo del `sub` | `expiry-reset.test.mjs` |

**No se encontraron IDOR.** Lo que sí hay que decir: la identidad demo no es una
credencial fuerte (cualquiera puede pedir el slot 3). Es el diseño declarado de
la demo, no un bug; el próximo SDD de auth real lo reemplaza.

## 2. Fuga de coordenadas

| Vector | Control | Evidencia |
|---|---|---|
| Respuestas de discovery | sólo `distanceM` redondeado a 10 m y `bearingDeg` a 5° | `discovery.test.mjs` (múltiplos), `contract/test/no-coordinates.test.mjs` |
| Presencia propia | `GET/PUT` no existe lectura de punto; `GET /presence/me` devuelve metadatos | `presence.test.mjs` |
| Stream SSE | eventos con distancia/rumbo, sin `lat/lng` | `events.test.mjs` |
| Logs | sin coordenadas, tokens ni cuerpos | `logs-no-pii.test.mjs` |
| Chat/pings/notificaciones | no consultan geometría en la proyección | `privacy.test.mjs` (barrido) |

Sin hallazgos. La triangulación por distancia redondeada + límite de discovery
(§7) es el control real; no hay geohash ni precisión extra en ningún DTO.

## 3. Tickets SSE

- `POST /auth/stream-ticket` emite un ticket de **30 s**, guardado como hash.
- `GET /events` lo consume **una vez**, antes de escribir el stream; reuso → 401
  `TICKET_REUSED`, vencido → 401 `TICKET_EXPIRED`.
- `logout` y `takeover` **borran** los tickets de la sesión: un ticket emitido
  antes del desalojo no abre un stream después.
- El Bearer no viaja en la URL (requisito XS-6).

Evidencia: `test/integration/stream-ticket.test.mjs`, `logout.test.mjs`,
`takeover.test.mjs`. Sin hallazgos.

## 4. Reset global (M-3, corregido)

**Antes:** `POST /demo/reset` no pedía nada. Cualquiera con la URL —incluida una
página abierta por un invitado— borraba sesiones, matches, mensajes y eventos.

**Ahora** (política en `ResetService.assertOperator`, probada en
`test/integration/boot-config.test.mjs`):

1. **Origen**: si la request trae `Origin`, tiene que estar en
   `CORS_ALLOWED_ORIGINS`; si no, 401.
2. **Token**: con `DEMO_RESET_TOKEN` configurado se exige Bearer (comparación en
   tiempo constante con SHA-256). En producción **sin** token el endpoint
   responde 401: no existe.
3. **Ritmo**: uno cada 10 s (`DEMO_RESET_MIN_INTERVAL_MS`), 429 al exceder.

En desarrollo queda abierto y sin throttle para que la suite y el runbook local
funcionen; está documentado en el runbook y es una decisión, no un olvido.

## 5. Validación de entrada (M-1, L-1, L-2)

**El hallazgo real** fue un `\0` en un `profileId`: el parámetro llegaba a
Postgres y `invalid byte sequence for encoding "UTF8": 0x00` se convertía en
`500 INTERNAL`. Reproducido en 4 endpoints:

| Endpoint | Antes | Ahora |
|---|---|---|
| `POST /pings` (`targetProfileId`) | 500 | 422 `VALIDATION_FAILED` |
| `POST /blocks` (`profileId`) | 500 | 422 |
| `DELETE /blocks/{profileId}` | 500 | 422 |
| `POST /reports` (`profileId`) | 500 | 422 |

Fix: `PROFILE_ID_PATTERN` en `common/validation.ts` (minúsculas, dígitos y `-`,
≤ 64 caracteres), usado por los tres servicios. Un `profileId` de 70 KB o con
`../../etc/passwd` también pasa a 422 en vez de 404 mentiroso.

Además se normalizaron los errores de body-parser al contrato: `400` (JSON roto
o primitivo), `413` (>100 KB) y `415` (charset) → **422** `VALIDATION_FAILED`,
porque `errors.yaml` declara que no existe 400. Y `?cursor` repetido en
`/events/poll` ahora es 422 en vez de "sin cursor".

Cobertura: `test/integration/validation.test.mjs` (14 casos, incluido un test que
falla si cualquiera de las ~200 sondas devuelve 5xx).

## 6. CORS

- Allowlist exacta (`CORS_ALLOWED_ORIGINS`), sin `*` (el boot lo rechaza), sin
  credenciales (`credentials: false`; la demo usa Bearer).
- En producción no hay default: sin variable, no se emiten headers CORS.
- Túneles de ngrok sólo en desarrollo/test (patrón, nunca en producción).
- Origenes verificados: `https://luisplata.github.io` responde ACAO; un origen
  ajeno no. Evidencia: `cors.test.mjs` y `boot-config.test.mjs`.

## 7. Límites de frecuencia (M-2)

| Clase | Tope | Dónde | Test |
|---|---|---|---|
| Pings | 30 / 60 s por perfil | SQL sobre `pings` | `rate-limits.test.mjs` |
| Mensajes | 60 / 60 s por perfil | SQL sobre `messages` | `rate-limits.test.mjs` |
| Discovery | 2 / s por sesión (ráfaga 60) | bucket en memoria | `rate-limits.test.mjs` |
| Bloqueos | 30 / min por perfil | bucket en memoria | — (mismo servicio) |
| Reportes | 10 / min por perfil | bucket en memoria | — (mismo servicio) |
| Reset global | 1 / 10 s | bucket en memoria | `boot-config.test.mjs` |

Los buckets en memoria asumen **un proceso** (BC-10). Si el deploy escala a más
de una réplica, cada réplica cuenta lo suyo: para la demo (20 humanos) es
suficiente, y está dicho acá para que no sorprenda.

## 8. Secretos y artefacto

| Control | Resultado |
|---|---|
| `.env` versionado | No. Sólo `backend/.env.example` y `.env.production.example`, sin valores reales |
| Secretos en la imagen | No: la imagen no copia `.env`; las variables llegan por entorno |
| Tokens en logs/URLs | No: el log no lleva Authorization; el ticket SSE va en query pero es de un uso y 30 s |
| Artefacto de Pages | `assemble-site --strict` audita denylist, hosts y secretos; el mock sigue sin requests de red |
| **Keystore en el repo** | **H-1, ver abajo** |

### H-1 — Keystore de firma Android en un repo público (abierto)

`nearbyig-app-complete.zip` está versionado y contiene:

```text
android/app/upload-key.keystore
android/app/build.gradle  →  storePassword 'nearbyig123'
                             keyPassword   'nearbyig123'
                             keyAlias      'nearbyig'
```

Es el prototipo, no el backend, pero el repositorio es **público**: cualquiera
puede descargar la keystore y firmar un APK que Android acepte como actualización
de una app firmada con esa clave.

**Qué hacer (requiere al dueño del repo, no se hizo acá):**

1. Generar una keystore nueva y rotar la contraseña (`keytool -genkeypair`).
2. Purga del historial (el archivo sigue en commits aunque se borre):
   `git filter-repo --path nearbyig-app-complete.zip --invert-paths` y
   force-push coordinado.
3. Invalidar la clave vieja en Play Console si alguna vez se subió un artefacto.
4. Recién después, actualizar el `README` que menciona el ZIP.

No se tocó el archivo por esta vía porque borrarlo **no** saca la clave del
historial y daría una falsa sensación de cierre.

## 9. Superficie y otras observaciones

| Tema | Estado |
|---|---|
| SQL injection | Sin hallazgos: todos los valores son parámetros de `pg`; los fragmentos interpolados (`BOX_COLUMNS`, `OWNER_VISIBLE`) son constantes del módulo |
| IDOR en notificaciones | un id ajeno se ignora (el `WHERE` está acotado al `sub`); no confirma existencia |
| Moderación | no existe consola ni lectura de reportes: no hay PII que proteger |
| Push/email | no existen por diseño (NO-6) |
| SSRF | la API no hace requests salientes |
| Dependency audit | **pendiente**: `npm audit` requiere red y no se corrió en esta sesión |
| Rate limit de creación de sesiones | no hay; 10 slots por región y TTL 2 h (M-4, aceptado) |

## 10. Cómo reproducir esta revisión

```bash
cd backend
docker compose -f compose.yml -f compose.dev.yml up --build -d
docker compose -f compose.yml -f compose.dev.yml exec api npm run test:integration
docker compose -f compose.yml -f compose.dev.yml exec api npm run test:integration -- validation
# Sonda manual: mandar cuerpos inválidos a todos los endpoints y buscar 5xx
# (el test `validation.test.mjs` es esa sonda, versionada)
```
