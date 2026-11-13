#!/usr/bin/env bash
#
# Restore de un backup de `backup-db.sh` (pg_restore, formato custom, PostGIS).
#
# Uso:
#   ./scripts/restore-db.sh backups/demo.dump --target-db nearbyig_restore
#   ./scripts/restore-db.sh backups/demo.dump --yes          # base del compose
#   DATABASE_URL=postgres://... ./scripts/restore-db.sh backups/demo.dump --yes
#
# Seguridad:
#   * Restaurar sobre la base **viva** exige `--yes` explícito.
#   * `--target-db NOMBRE` crea (si falta) una base aparte y restaura ahí: es la
#     forma de probar un backup sin tocar la demo. El script nunca borra la base
#     destino; `pg_restore --clean` limpia objetos, no la base.
#   * `--verify-only` valida el índice del dump y sale: sirve como preflight.
#
# Qué restaura: todo el dump (esquema, datos, secuencias y la extensión PostGIS).
# `--no-owner --no-privileges` evita que un restore en otra máquina dependa de los
# roles del origen. Las sesiones de la demo viven en la base: después de un
# restore sobre la base viva hay que volver a abrir el selector (los tokens
# siguen siendo válidos si la fila volvió, pero el estado es el del backup).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${BACKEND_DIR}"

COMPOSE_FILES="${COMPOSE_FILES:--f compose.yml -f compose.dev.yml}"
DB_SERVICE="${DB_SERVICE:-db}"
POSTGRES_USER="${POSTGRES_USER:-nearbyig}"
POSTGRES_DB="${POSTGRES_DB:-nearbyig}"
PG_IMAGE="${PG_IMAGE:-postgis/postgis:16-3.4}"

archivo=""
target_db=""
confirmado="no"
verify_only="no"

while [ $# -gt 0 ]; do
  case "$1" in
    --yes) confirmado="si" ;;
    --verify-only) verify_only="si" ;;
    --target-db)
      shift
      target_db="${1:-}"
      [ -n "${target_db}" ] || { echo "falta el nombre de --target-db" >&2; exit 2; }
      ;;
    -h|--help)
      sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      if [ -z "${archivo}" ]; then archivo="$1"; else echo "argumento inesperado: $1" >&2; exit 2; fi
      ;;
  esac
  shift
done

[ -n "${archivo}" ] || { echo "uso: $0 <backup.dump> [--target-db NOMBRE | --yes] [--verify-only]" >&2; exit 2; }
[ -f "${archivo}" ] || { echo "no existe el backup: ${archivo}" >&2; exit 2; }
archivo_abs="$(cd "$(dirname "${archivo}")" && pwd)/$(basename "${archivo}")"

if [ -n "${target_db}" ] && ! printf '%s' "${target_db}" | grep -Eq '^[a-z][a-z0-9_]{0,62}$'; then
  echo "--target-db inválido: usá minúsculas, dígitos y guion bajo (^[a-z][a-z0-9_]*$)" >&2
  exit 2
fi

# shellcheck disable=SC2086 # COMPOSE_FILES es una lista de flags a propósito.
compose() { docker compose ${COMPOSE_FILES} "$@"; }

# Destino efectivo de la restauración.
destino_db="${POSTGRES_DB}"
if [ -n "${target_db}" ]; then destino_db="${target_db}"; fi

admin() {
  # `psql` contra la base de mantenimiento del contenedor.
  compose exec -T "${DB_SERVICE}" psql \
    --username "${POSTGRES_USER}" \
    --dbname "${POSTGRES_DB}" \
    --tuples-only --no-align --command "$1"
}

psql_db() {
  compose exec -T "${DB_SERVICE}" psql \
    --username "${POSTGRES_USER}" \
    --dbname "${destino_db}" \
    --tuples-only --no-align --command "$1"
}

pg_restore_stdin() {
  compose exec -T "${DB_SERVICE}" pg_restore \
    --username "${POSTGRES_USER}" \
    --dbname "${destino_db}" \
    --no-owner \
    --no-privileges \
    --clean --if-exists \
    "$@"
}

dump_list() {
  if [ -n "${DATABASE_URL:-}" ]; then
    docker run --rm -i "${PG_IMAGE}" pg_restore --list <"${archivo_abs}" >/dev/null
  else
    compose exec -T "${DB_SERVICE}" pg_restore --list <"${archivo_abs}" >/dev/null
  fi
}

echo "[restore] archivo: ${archivo_abs}"
echo "[restore] destino: ${destino_db} (servicio ${DB_SERVICE})"

echo "[restore] verificando el índice del dump…"
dump_list
echo "[restore] índice ok"

if [ "${verify_only}" = "si" ]; then
  exit 0
fi

if [ -n "${DATABASE_URL:-}" ]; then
  echo "[restore] modo DATABASE_URL (contenedor efímero)"
  if [ -z "${target_db}" ] && [ "${confirmado}" != "si" ]; then
    echo "[restore] abortado: restaurar sobre la base viva exige --yes" >&2
    exit 3
  fi
  docker run --rm -i "${PG_IMAGE}" pg_restore \
    --dbname "${DATABASE_URL}" --no-owner --no-privileges --clean --if-exists <"${archivo_abs}"
else
  if [ -n "${target_db}" ]; then
    existe="$(admin "SELECT 1 FROM pg_database WHERE datname = '${target_db}'")"
    if [ -z "${existe}" ]; then
      echo "[restore] creando base ${target_db}…"
      admin "CREATE DATABASE ${target_db}"
      compose exec -T "${DB_SERVICE}" psql --username "${POSTGRES_USER}" --dbname "${target_db}" \
        --command 'CREATE EXTENSION IF NOT EXISTS postgis' >/dev/null
    fi
  elif [ "${confirmado}" != "si" ]; then
    echo "[restore] abortado: restaurar sobre la base viva (${POSTGRES_DB}) exige --yes" >&2
    exit 3
  fi

  echo "[restore] restaurando…"
  pg_restore_stdin <"${archivo_abs}"
fi

echo "[restore] conteos del destino:"
if [ -n "${DATABASE_URL:-}" ]; then
  docker run --rm -i "${PG_IMAGE}" psql "${DATABASE_URL}" --tuples-only --no-align --command \
    "SELECT 'profiles=' || count(*) FROM profiles; SELECT 'regions=' || count(*) FROM regions; SELECT 'zones=' || count(*) FROM zones;"
else
  psql_db "SELECT 'profiles=' || count(*) FROM profiles;"
  psql_db "SELECT 'regions=' || count(*) FROM regions;"
  psql_db "SELECT 'zones=' || count(*) FROM zones;"
fi

echo "[restore] ok"
