#!/usr/bin/env node
/**
 * Runner de migraciones de NearbyIG.
 *
 *   node scripts/migrate.mjs              aplica las pendientes
 *   node scripts/migrate.mjs --status     muestra aplicadas y pendientes
 *   node scripts/migrate.mjs --dry-run    dice qué aplicaría, sin tocar la base
 *   node scripts/migrate.mjs --rollback   revierte la última migración
 *   node scripts/migrate.mjs --rollback-all
 *
 * Contrato:
 *   * `sql/NNN_nombre.sql` sube, `sql/NNN_nombre.down.sql` baja.
 *   * Todo se aplica dentro de una transacción: si el SQL falla, no queda nada.
 *   * La tabla `schema_migrations` guarda el sha256 del archivo normalizado
 *     (LF). Si un archivo ya aplicado cambia, el runner falla en vez de
 *     reaplicarlo: el drift se arregla con una migración nueva, no editando la
 *     vieja.
 *   * Correrlo dos veces es no-op: las aplicadas se saltean.
 */
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR
  ? resolve(process.env.MIGRATIONS_DIR)
  : resolve(HERE, '..', 'sql');

const LOCK_KEY = 720_165_421; // advisory lock propio del runner

const args = new Set(process.argv.slice(2));
const statusOnly = args.has('--status');
const dryRun = args.has('--dry-run');
const rollbackOne = args.has('--rollback');
const rollbackAll = args.has('--rollback-all');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('migrate: falta DATABASE_URL');
  process.exit(2);
}

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

/** Normaliza CRLF: el mismo archivo en Windows y en Linux da el mismo hash. */
const normalize = (text) => text.replace(/\r\n/g, '\n');

async function readMigrationFiles() {
  if (!existsSync(MIGRATIONS_DIR)) {
    throw new Error(`migrate: no existe el directorio de migraciones ${MIGRATIONS_DIR}`);
  }
  const entries = await readdir(MIGRATIONS_DIR);
  const ups = [];
  const downs = new Map();
  for (const name of entries) {
    if (name.endsWith('.down.sql')) {
      downs.set(name.slice(0, -'.down.sql'.length), join(MIGRATIONS_DIR, name));
    } else if (name.endsWith('.sql')) {
      ups.push(name.slice(0, -'.sql'.length));
    }
  }
  ups.sort();
  const migrations = [];
  for (const id of ups) {
    if (!/^\d{3}_[a-z0-9_]+$/.test(id)) {
      throw new Error(`migrate: nombre inválido ${id}.sql (esperado NNN_nombre.sql)`);
    }
    const upPath = join(MIGRATIONS_DIR, `${id}.sql`);
    const upSql = normalize(await readFile(upPath, 'utf8'));
    const downPath = downs.get(id);
    migrations.push({
      id,
      upSql,
      checksum: sha256(upSql),
      downPath: downPath ?? null,
    });
  }
  return migrations;
}

async function ensureTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id           text PRIMARY KEY,
      checksum     text NOT NULL,
      applied_at   timestamptz NOT NULL DEFAULT now(),
      execution_ms integer NOT NULL
    )
  `);
}

async function appliedMap(client) {
  const { rows } = await client.query('SELECT id, checksum, applied_at FROM schema_migrations');
  return new Map(rows.map((r) => [r.id, r]));
}

function reportStatus(migrations, applied) {
  console.log(`migraciones en ${MIGRATIONS_DIR}`);
  if (migrations.length === 0) {
    console.log('  (no hay archivos .sql)');
    return;
  }
  for (const m of migrations) {
    const row = applied.get(m.id);
    if (!row) {
      console.log(`  [pendiente] ${m.id}`);
    } else if (row.checksum !== m.checksum) {
      console.log(`  [drift]     ${m.id} — el archivo cambió después de aplicarse`);
    } else {
      console.log(`  [aplicada]  ${m.id} — ${new Date(row.applied_at).toISOString()}`);
    }
  }
}

/**
 * El healthcheck del compose ya espera a la base, pero un `db` recién creado
 * puede aceptar el socket y todavía no el puerto TCP. Reintentar acá hace que el
 * one-shot no dependa de la carrera.
 */
async function connectWithRetry(attempts = 30, delayMs = 1_000) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const client = new pg.Client({ connectionString });
    try {
      await client.connect();
      return client;
    } catch (error) {
      lastError = error;
      await client.end().catch(() => {});
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function main() {
  const client = await connectWithRetry();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
    await ensureTable(client);

    const migrations = await readMigrationFiles();
    const applied = await appliedMap(client);

    if (statusOnly) {
      reportStatus(migrations, applied);
      return;
    }

    const drifted = migrations.filter((m) => applied.has(m.id) && applied.get(m.id).checksum !== m.checksum);
    if (drifted.length > 0) {
      for (const m of drifted) {
        console.error(`migrate: drift en ${m.id}: el archivo cambió y ya estaba aplicado.`);
      }
      process.exitCode = 1;
      return;
    }

    if (rollbackOne || rollbackAll) {
      const targets = migrations.filter((m) => applied.has(m.id)).reverse();
      if (targets.length === 0) {
        console.log('rollback: no hay migraciones aplicadas');
        return;
      }
      const steps = rollbackAll ? targets : targets.slice(0, 1);
      for (const m of steps) {
        if (!m.downPath) {
          throw new Error(`rollback: ${m.id} no tiene archivo .down.sql`);
        }
        const downSql = normalize(await readFile(m.downPath, 'utf8'));
        if (dryRun) {
          console.log(`rollback (dry-run): ${m.id}`);
          continue;
        }
        await client.query('BEGIN');
        try {
          await client.query(downSql);
          await client.query('DELETE FROM schema_migrations WHERE id = $1', [m.id]);
          await client.query('COMMIT');
          console.log(`rollback ok: ${m.id}`);
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
      }
      return;
    }

    const pending = migrations.filter((m) => !applied.has(m.id));
    if (pending.length === 0) {
      console.log(`migrate: nada que hacer — ${applied.size} migración(es) ya aplicada(s)`);
      return;
    }
    for (const m of pending) {
      if (dryRun) {
        console.log(`migrate (dry-run): aplicaría ${m.id}`);
        continue;
      }
      const started = Date.now();
      await client.query('BEGIN');
      try {
        await client.query(m.upSql);
        await client.query(
          'INSERT INTO schema_migrations (id, checksum, execution_ms) VALUES ($1, $2, $3)',
          [m.id, m.checksum, Date.now() - started],
        );
        await client.query('COMMIT');
        console.log(`migrate ok: ${m.id} (${Date.now() - started} ms)`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
    console.log(`migrate: ${pending.length} aplicada(s), ${applied.size + pending.length} en total`);
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]);
    } catch {
      /* la conexión se cierra igual */
    }
    await client.end();
  }
}

main().catch((error) => {
  console.error(`migrate: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
