#!/usr/bin/env bash
#
# Backup lógico de la demo (pg_dump, formato custom) con evidencia de conteos.
#
# Uso:
#   ./scripts/backup-db.sh                       # dump + .meta en ./backups/
#   ./scripts/backup-db.sh /ruta/demo.dump       # destino explícito
#   DB_SERVICE=db ./scripts/backup-db.sh         # (default) Postgres del compose
#   DATABASE_URL=postgres://... ./scripts/backup-db.sh   # base administrada
#
# Modos:
#   * **compose (default)** — `docker compose exec db pg_dump`. El contenedor
#     `postgis/postgis` trae el cliente; el host no necesita Postgres instalado.
#     Respeta `COMPOSE_FILES` (default `-f compose.yml -f compose.dev.yml`).
#   * **DATABASE_URL** — corre `pg_dump` en un contenedor efímero
#     `postgis/postgis:16-3.4` con la URL de la base administrada. Es el camino
#     de producción; requiere que el host alcance la base (red/allowlist).
#
# El dump se escribe en un archivo temporal y se renombra al final: un backup
# cortado a la mitad no queda con nombre de backup. Se verifica leyendo el
# índice con `pg_restore --list` antes de declararlo bueno.
#
# Sin secretos en el repo ni en el nombre del archivo: la contraseña viaja por
# `PGPASSWORD` o por la URL del entorno, nunca en el comando visible.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${BACKEND_DIR}"

COMPOSE_FILES="${COMPOSE_FILES:--f compose.yml -f compose.dev.yml}"
DB_SERVICE="${DB_SERVICE:-db}"
POSTGRES_USER="${POSTGRES_USER:-nearbyig}"
POSTGRES_DB="${POSTGRES_DB:-nearbyig}"
PG_IMAGE="${PG_IMAGE:-postgis/postgis:16-3.4}"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
destino="${1:-backups/nearbyig-${timestamp}.dump}"
mkdir -p "$(dirname "${destino}")"
destino_abs="$(cd "$(dirname "${destino}")" && pwd)/$(basename "${destino}")"
temporal="${destino_abs}.partial"

echo "[backup] destino: ${destino_abs}"

# shellcheck disable=SC2086 # COMPOSE_FILES es una lista de flags a propósito.
compose() { docker compose ${COMPOSE_FILES} "$@"; }

dump() {
  if [ -n "${DATABASE_URL:-}" ]; then
    # Los mensajes van a stderr: el stdout de esta función ES el dump.
    echo "[backup] modo DATABASE_URL (contenedor efímero ${PG_IMAGE})" >&2
    docker run --rm -i "${PG_IMAGE}" pg_dump "${DATABASE_URL}" --format=custom --no-owner --no-privileges
  else
    echo "[backup] modo compose (servicio ${DB_SERVICE})" >&2
    compose exec -T "${DB_SERVICE}" pg_dump \
      --username "${POSTGRES_USER}" \
      --dbname "${POSTGRES_DB}" \
      --format=custom \
      --no-owner \
      --no-privileges
  fi
}

verify() {
  if [ -n "${DATABASE_URL:-}" ]; then
    docker run --rm -i "${PG_IMAGE}" pg_restore --list <"${1}" >/dev/null
  else
    compose exec -T "${DB_SERVICE}" pg_restore --list <"${1}" >/dev/null
  fi
}

counts() {
  if [ -n "${DATABASE_URL:-}" ]; then
    docker run --rm -i "${PG_IMAGE}" psql "${DATABASE_URL}" --tuples-only --no-align --command \
      "SELECT 'profiles=' || count(*) FROM profiles; SELECT 'regions=' || count(*) FROM regions; SELECT 'zones=' || count(*) FROM zones;"
  else
    compose exec -T "${DB_SERVICE}" psql --username "${POSTGRES_USER}" --dbname "${POSTGRES_DB}" \
      --tuples-only --no-align --command \
      "SELECT 'profiles=' || count(*) FROM profiles; SELECT 'regions=' || count(*) FROM regions; SELECT 'zones=' || count(*) FROM zones;"
  fi
}

trap 'rm -f "${temporal}"' EXIT

dump >"${temporal}"
verify "${temporal}"
mv "${temporal}" "${destino_abs}"
trap - EXIT

bytes="$(wc -c <"${destino_abs}" | tr -d ' ')"
sha="$(sha256sum "${destino_abs}" | cut -d' ' -f1)"

{
  echo "file=$(basename "${destino_abs}")"
  echo "created_at=${timestamp}"
  echo "format=custom (pg_dump -Fc)"
  echo "bytes=${bytes}"
  echo "sha256=${sha}"
  echo "source=$( [ -n "${DATABASE_URL:-}" ] && echo "DATABASE_URL" || echo "compose:${DB_SERVICE}/${POSTGRES_DB}" )"
  echo "--- conteos del origen ---"
  counts
} >"${destino_abs}.meta"

echo "[backup] ok  bytes=${bytes}  sha256=${sha}"
cat "${destino_abs}.meta"
