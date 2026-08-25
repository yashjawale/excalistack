import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

/** File name of the SQLite database inside the configured data directory. */
export const DB_FILENAME = "excalistack.db";

/** Sentinel directory value selecting an in-memory database (used by tests). */
export const IN_MEMORY_DB = ":memory:";

/**
 * Opens the excalistack SQLite database, creating parent directories and
 * applying schema migrations as needed.
 *
 * @param dataDir - Directory holding the database file, or
 * {@link IN_MEMORY_DB} for a transient in-memory database.
 * @param filename - Database file name override; defaults to {@link DB_FILENAME}.
 * @returns An open connection with WAL journalling enabled.
 */
export function openDatabase(dataDir: string, filename: string = DB_FILENAME): Database.Database {
  if (dataDir === IN_MEMORY_DB) {
    return migrate(new Database(IN_MEMORY_DB));
  }
  mkdirSync(dataDir, { recursive: true });
  const db = new Database(path.join(dataDir, filename));
  db.pragma("journal_mode = WAL");
  return migrate(db);
}

/**
 * Applies pending schema migrations to the given connection. Currently a
 * single idempotent statement; future migrations append here.
 *
 * @param db - Connection to migrate.
 * @returns The same connection, for call-site convenience.
 */
function migrate(db: Database.Database): Database.Database {
  db.exec(`
    CREATE TABLE IF NOT EXISTS drawings (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      elements TEXT NOT NULL,
      app_state TEXT NOT NULL DEFAULT '{}',
      files TEXT NOT NULL DEFAULT '{}',
      thumbnail TEXT,
      element_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  return db;
}
