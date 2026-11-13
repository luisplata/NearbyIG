# Runbook — demo live de NearbyIG

> **Estado real:** el backend de S1–S5 está implementado y verificado en local.
> **No hay deploy hecho**: no existe Droplet, dominio ni credenciales de base
> administrada en este repo. Todo lo que sigue es el procedimiento para hacerlo,
> con los comandos exactos y la verificación de cada paso. Lo que necesita tus
> credenciales está marcado como **pendiente**.

## 0. Resumen en una tabla

| Paso | Qué | Verificación | Estado |
|---|---|---|---|
| 1 | Droplet con Docker + reverse proxy TLS | `docker compose version`, `curl https://api…/health` | **pendiente** (sin Droplet) |
| 2 | Postgres 16 + PostGIS administrado | `psql -c 'select postgis_version()'` | **pendiente** (sin credenciales) |
| 3 | `.env.production` con secretos | `docker compose … config` sin error | listo para ejecutar |
| 4 | Migraciones y seeds | `migrate` sale 0, `/health/ready` 200 | listo para ejecutar |
| 5 | API arriba en loopback | `curl 127.0.0.1:3000/health/ready` | listo para ejecutar |
| 6 | CORS con el origen de Pages | preflight con y sin `Origin` | verificado en local (`boot-config`) |
| 7 | Landing apuntando al live | `https://luisplata.github.io/NearbyIG/expo/?api=…` | **pendiente** (depende de 1) |
| 8 | Backup + restore | `backup-db.sh` + `restore-db.sh --target-db` | verificado en local |
| 9 | Load test de la densidad | `load-test.mjs --humans=10` | verificado en local |
| 10 | Rollback al mock | quitar `?api=` y el link | procedimiento listo |

## 1. Prerrequisitos

| Componente | Mínimo | Notas |
|---|---|---|
| Droplet | 2 vCPU / 2 GB / 40 GB | Docker + compose plugin; el stack no compila en el host |
| PostgreSQL | 16 + PostGIS 3.4 | Administrado o contenedor aparte. **No** se publica en el stack de la API |
| DNS | `api.<dominio>` → IP del Droplet | El certificado se emite recién cuando el DNS resuelve |
| GitHub Pages | repo `luisplata/NearbyIG` | El origen CORS es `https://luisplata.github.io` |

El backend no necesita Node en el host: todo corre en la imagen.

## 2. Variables de entorno

Copiá [`backend/.env.production.example`](../backend/.env.production.example) y
completá los cuatro valores obligatorios:

```bash
cd backend
cp .env.production.example .env.production
# editar .env.production
```

| Variable | Obligatoria | Qué pasa si falta |
|---|---|---|
| `DATABASE_URL` | sí | compose no interpola y el deploy no arranca |
| `JWT_SECRET` | sí (32+ caracteres) | idem; un secreto corto aborta el boot |
| `CORS_ALLOWED_ORIGINS` | sí | compose no interpola; sin ella el navegador de Pages no puede llamar la API |
| `DEMO_RESET_TOKEN` | para operar | en producción sin token el reset global responde 401 |
| `SESSION_TTL_SECONDS` | no (2 h) | — |
| `DEFAULT_REGION_KEY` | no (`mx`) | — |
| `PORT` | no (`3000`) | puerto de **loopback** que consume el reverse proxy |

**No** uses el `.env` de desarrollo: ahí `JWT_SECRET` es el default inseguro y
`NODE_ENV=development`, que permite túneles de ngrok por patrón.

## 3. Validar antes de tocar nada

```bash
cd backend
docker compose --env-file .env.production -f compose.yml -f compose.prod.yml config
```

El overlay de producción:

- **no levanta** el servicio `db` (queda detrás del perfil `local-db`),
- **no publica** el 5432,
- publica la API **sólo en `127.0.0.1`**,
- exige `DATABASE_URL`, `JWT_SECRET` y `CORS_ALLOWED_ORIGINS` con `:?`.

Si falta una, `config` falla con el mensaje:

```text
error while interpolating services.api.environment.CORS_ALLOWED_ORIGINS:
required variable CORS_ALLOWED_ORIGINS is missing a value: CORS_ALLOWED_ORIGINS
es obligatoria en producción (el origen de Pages)
```

Eso es lo que querés ver cuando falta: **falla cerrado**. Verificado en local con
`docker compose -f compose.yml -f compose.prod.yml config`.

## 4. TLS (HTTPS) con Caddy

El stack no termina TLS: lo hace un reverse proxy en el host contra
`127.0.0.1:3000`. Caddy es el camino corto porque emite y renueva solo.

```caddyfile
# /etc/caddy/Caddyfile
api.example.com {
    encode zstd gzip
    reverse_proxy 127.0.0.1:3000 {
        # El SSE necesita que no se bufferee y que no corte la conexión ociosa.
        flush_interval -1
        transport http {
            read_timeout 0
        }
    }
}
```

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
curl -s https://api.example.com/health/ready
```

Notas:

- El certificado se emite cuando `api.example.com` ya resuelve al Droplet.
- `flush_interval -1` es lo que hace que `GET /events` llegue evento por evento;
  sin eso el proxy acumula y el radar se ve congelado.
- nginx equivalente: `proxy_buffering off; proxy_read_timeout 1h;` y
  `proxy_set_header Connection '';` en la location de `/events`.
- La API ya manda `x-accel-buffering: no`, que cubre nginx, pero no a todos los
  proxies: el `flush_interval` del proxy sigue siendo necesario.

## 5. Deploy

```bash
cd /opt/nearbyig/backend
docker compose --env-file .env.production -f compose.yml -f compose.prod.yml up --build -d
docker compose --env-file .env.production -f compose.yml -f compose.prod.yml ps
docker compose --env-file .env.production -f compose.yml -f compose.prod.yml logs -f migrate
```

`migrate` es one-shot: aplica migraciones y seeds y termina. La API tiene
`depends_on: service_completed_successfully`, así que no arranca con el esquema a
medio migrar. Si `migrate` falla, la API no levanta (a propósito).

## 6. Verificación post-deploy

```bash
# 1. Salud completa: base, PostGIS, migraciones y seed.
curl -s https://api.example.com/health/ready | jq

# 2. CORS del origen de Pages: tiene que devolver ACAO.
curl -si -X OPTIONS https://api.example.com/presence \
  -H 'Origin: https://luisplata.github.io' \
  -H 'Access-Control-Request-Method: PUT' \
  -H 'Access-Control-Request-Headers: authorization,content-type' \
  | grep -i 'access-control-allow-origin'

# 3. CORS de un origen ajeno: NO tiene que devolver ACAO.
curl -si -X OPTIONS https://api.example.com/presence \
  -H 'Origin: https://evil.example' \
  -H 'Access-Control-Request-Method: PUT' | grep -i 'access-control-allow-origin' || echo 'sin ACAO (correcto)'

# 4. Una sesión real y un discovery.
TOKEN=$(curl -s -X POST https://api.example.com/auth/demo-session \
  -H 'content-type: application/json' -d '{}' | jq -r .token)
curl -s https://api.example.com/discovery -H "Authorization: Bearer $TOKEN"
```

Después, en el navegador:

```text
https://luisplata.github.io/NearbyIG/expo/?api=https://api.example.com
```

La app live resuelve la base en este orden: `?api=` → `localStorage` → base
compilada. Ver §8.

## 7. Operación durante la demo

| Acción | Comando | Cuándo |
|---|---|---|
| Reset de una persona | `POST /demo/reset/self` con su Bearer | Alguien quedó con estado raro y no quiere cerrar sesión |
| Reset global | `curl -X POST https://api…/demo/reset -H "Authorization: Bearer $DEMO_RESET_TOKEN"` | Entre demos, con la audiencia mirando otra cosa |
| Logs de la API | `docker compose … logs -f api` | Cada línea lleva `requestId`, ruta, status y duración; **no** coordenadas ni tokens |
| Estado de salud | `curl https://api…/health/ready` | Antes de habilitar el link live |
| Backup | `npm run db:backup` (o `bash scripts/backup-db.sh`) | Antes de un reset grande |
| Restore de prueba | `bash scripts/restore-db.sh backups/x.dump --target-db nearbyig_restore` | Sin tocar la demo |

### Reset global: cómo queda protegido

- **Origen**: si la request trae `Origin`, tiene que estar en
  `CORS_ALLOWED_ORIGINS`. Un origen ajeno recibe 401 y no ejecuta.
- **Token**: con `DEMO_RESET_TOKEN` configurado, exige
  `Authorization: Bearer <token>`. En producción **sin** token el endpoint
  directamente no existe (401): no hay botón público de "borrar todo".
- **Ritmo**: uno cada 10 s (`DEMO_RESET_MIN_INTERVAL_MS`).

En desarrollo el throttle es 0 y el token es opcional, para que la suite y el
runbook local puedan resetear seguido.

## 8. `API_BASE_URL`: `?api=` hoy, build-time mañana

El artefacto publicado **no** lleva el host de la API adentro. La app live lo
resuelve en runtime, en este orden:

1. `?api=https://api.example.com` en la URL de la página,
2. `localStorage['nearbyig.api']` (el último `?api=` válido),
3. `EXPO_PUBLIC_API_URL` del build.

**Por qué hoy no se usa `EXPO_PUBLIC_API_URL` en `pages.yml`:**

| Razón | Consecuencia |
|---|---|
| El artefacto se audita con `assemble-site --strict` y sólo puede pedir **un** host (`tiles.openfreemap.org`) | Un host de API horneado obliga a cambiar la allowlist y a versionar un artefacto por entorno |
| El mock tiene que seguir haciendo **cero** requests de red | Un valor horneado en el build live no debe poder filtrarse al chunk mock; hoy la separación es por entrada, no por env |
| Un túnel cambia de URL sin rebuild | `?api=` permite apuntar el mismo artefacto publicado a un ngrok o al Droplet sin correr el workflow |
| Todavía no hay host fijo | No existe Droplet; hornear una URL que no existe rompería el link |

Cuando el host sea estable, la alternativa es agregar el env al paso `Expo
export` del workflow:

```yaml
- name: Expo export
  env:
    EXPO_BASE_URL: ${{ steps.pages.outputs.base_path }}/expo
    EXPO_PUBLIC_API_URL: https://api.example.com   # build-time
```

…y sumar `api.example.com` a `ALLOWED_REQUEST_HOSTS` en
`scripts/lib/request-hosts.mjs`, con el mismo PR que actualiza la auditoría. Hoy
`?api=` cubre eso sin tocar el artefacto.

## 9. Backup y restore

Los scripts viven en `backend/scripts/` y no necesitan Postgres en el host.

```bash
cd backend

# Backup (formato custom + .meta con sha256 y conteos del origen)
npm run db:backup
# → backups/nearbyig-YYYYmmddTHHMMSSZ.dump y .dump.meta

# Preflight de un backup, sin restaurar nada
bash scripts/restore-db.sh backups/nearbyig-….dump --verify-only

# Restore de prueba en una base aparte (no toca la demo)
bash scripts/restore-db.sh backups/nearbyig-….dump --target-db nearbyig_restore

# Restore real sobre la base viva (exige --yes)
bash scripts/restore-db.sh backups/nearbyig-….dump --yes
```

En producción, la base es administrada: usá `DATABASE_URL=… npm run db:backup`.
El script corre `pg_dump` en un contenedor efímero `postgis/postgis:16-3.4`
(necesita que el host alcance la base).

**Evidencia local del restore** (ver §12): se hizo backup, se restauró en
`nearbyig_restore`, se borró `messages` (`DROP TABLE … CASCADE`), se restauró de
nuevo y los conteos volvieron a `sessions=3, messages=12, matches=3, pings=3`.

## 10. Load test

```bash
cd backend
node scripts/load-test.mjs                      # 10 humanos/región, 60 s
node scripts/load-test.mjs --humans=2 --duration=20   # versión reducida
API_BASE_URL=https://api.example.com node scripts/load-test.mjs --humans=10 --duration=60
```

Genera presencia cada 2,5 s, discovery cada 3 s, un stream SSE por humano, un
ping a su bot y dos mensajes. Los 20 bots por región los crea el servidor: con 10
humanos por región la densidad es la del plan. Sale con código 1 si hay 5xx o si
los no-2xx superan el 2 %.

## 11. Rollback al mock

El mock (`/expo/` y `/flutter/`) es el mismo artefacto de siempre y no depende
de la API. Para volver atrás:

1. **Rápido, sin tocar el deploy:** abrir `https://luisplata.github.io/NearbyIG/expo/`
   sin `?api=`. La app arranca en modo mock (cero red).
2. **Cortar el link live:** quitar el `?api=` de la URL compartida / del link de
   la landing. La API puede quedar arriba sin afectar al mock.
3. **Bajar la API:**

   ```bash
   docker compose --env-file .env.production -f compose.yml -f compose.prod.yml down
   ```

   Sin `-v`: el volumen no aplica en producción (la base es administrada), pero
   `down -v` en un host con Postgres local borraría los datos.
4. **Volver a la versión anterior:** `git checkout <tag>` en el Droplet y
   `up --build -d`. Las migraciones son forward-only: no hay rollback de esquema
   automático (ver `backend/README.md`).

## 12. Qué NO hacer

| No hagas | Por qué |
|---|---|
| Publicar el reset global sin `DEMO_RESET_TOKEN` | Cualquiera con la URL borra la demo en medio de la presentación |
| Poner `CORS_ALLOWED_ORIGINS=*` | El boot lo rechaza; y si lo permitiera, cualquier página podría llamar la API con el token de un usuario |
| Publicar el 5432 al internet | Postgres queda expuesto con una clave que está en un `.env` |
| Correr `docker compose … down -v` en producción | Borra el volumen de datos si algún día hay base local |
| Restaurar un backup sobre la base viva sin `--target-db` ni `--yes` | El script lo exige; saltearlo es restaurar a ciegas |
| Commitear `.env.production`, dumps o `backups/` | Contienen secretos y datos de sesión. Están en `.gitignore` |
| Meter `Co-Authored-By` u otra atribución de IA | Regla del repo |
| Usar `NODE_ENV=production` con el `JWT_SECRET` de desarrollo | La API arranca y loguea el warning, pero la demo queda con un secreto público |

## 13. Pendiente de tus credenciales

| Pendiente | Qué necesito | Cómo se verifica |
|---|---|---|
| Droplet | IP, acceso SSH, Docker instalado | `docker compose version` |
| Base administrada | `DATABASE_URL` con PostGIS 16/3.4 | `/health/ready` 200 |
| DNS + TLS | registro `api.<dominio>` y acceso al proxy | `curl https://…/health/ready` |
| Pages | habilitar el link `?api=` en la landing | abrir el live desde otro dispositivo |
| Rotación de la keystore filtrada | ver `docs/security-review.md` (hallazgo H-1) | keystore nueva y clave rotada |

## 14. Evidencia local de esta entrega

| Gate | Resultado |
|---|---|
| `docker compose -f compose.yml -f compose.dev.yml up --build -d` | stack verde (`api` healthy, `/health/ready` 200) |
| `docker compose -f compose.yml -f compose.prod.yml config` | válido con las 3 variables; falla con mensaje si falta una |
| Backup | `bytes=65117`, `sha256=8d6c2c…`, `profiles=20`, `regions=2`, `zones=2` |
| Restore destructivo | `sessions=3, messages=12, matches=3, pings=3` → `DROP TABLE messages` → restore → mismos conteos, `postgis=1` |
| Load test 4 humanos / 8 bots | 0 errores, p95 ≤ 36 ms |
| Load test 20 humanos / 40 bots | 20 streams, 786 eventos, 0 errores, p95 ≤ 128 ms |
| `npm run test:integration` | 184/184 (157 previos + 27 nuevos), 0 fallos |
| `npm run contract:gates` | 4/5: G1, G2, G3, G5 verdes; **G4** falla sólo en el paso `diff demo/ site/` por cambios en curso de otro agente en `demo/` (esta entrega no tocó esa carpeta) |
| `npm run test:scripts` | 83/83 |
