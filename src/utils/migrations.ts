import type { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import logger from './logger';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Runs pending SQL migrations from the migrations directory.
 * Tracks applied migrations in a `migrations` table so it is idempotent.
 * Safe to call on every startup — only unapplied migrations run.
 */
export async function runMigrations(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const migrationsDir = path.join(__dirname, '../../migrations');
    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        run_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const { rows: completedMigrations } = await client.query('SELECT name FROM migrations');
    const completedMigrationNames = new Set(completedMigrations.map((m) => m.name));

    let applied = 0;
    for (const file of migrationFiles) {
      if (!completedMigrationNames.has(file)) {
        logger.info(`Running migration: ${file}`);
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        await client.query(sql);
        await client.query('INSERT INTO migrations (name) VALUES ($1)', [file]);
        applied++;
      }
    }

    await client.query('COMMIT');

    if (applied > 0) {
      logger.info(`Migrations complete: ${applied} applied, ${migrationFiles.length} total`);
    } else {
      logger.debug(`Migrations up to date (${migrationFiles.length} total)`);
    }
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}
