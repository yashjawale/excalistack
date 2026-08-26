import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { nanoid } from "nanoid";

/** File name of the SQLite database inside the configured data directory. */
export const DB_FILENAME = "excalistack.db";

/** Sentinel directory value selecting an in-memory database (used by tests). */
export const IN_MEMORY_DB = ":memory:";

/** Display name of the folder new drawings land in by default. */
export const DEFAULT_FOLDER_NAME = "Drafts";

/**
 * Opens the excalistack SQLite database, creating parent directories and
 * applying schema migrations as needed.
 *
 * @param dataDir - Directory holding the database file, or
 * {@link IN_MEMORY_DB} for a transient in-memory database.
 * @param filename - Database file name override; defaults to {@link DB_FILENAME}.
 * @returns An open connection with WAL journalling enabled.
 */
export function openDatabase(
  dataDir: string,
  filename: string = DB_FILENAME,
): Database.Database {
  if (dataDir === IN_MEMORY_DB) {
    return migrate(new Database(IN_MEMORY_DB));
  }
  mkdirSync(dataDir, { recursive: true });
  const db = new Database(path.join(dataDir, filename));
  db.pragma("journal_mode = WAL");
  return migrate(db);
}

/**
 * Applies pending schema migrations to the given connection. Each step is
 * idempotent so the sequence safely re-runs on every start:
 *
 * 1. Base `drawings` table.
 * 2. `folders` table, a `drawings.folder_id` column, a seeded default
 *    "Drafts" folder, and a backfill of all folderless drawings into it.
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

  const hasFolderColumn = db
    .prepare("PRAGMA table_info(drawings)")
    .all()
    .some((column) => (column as { name: string }).name === "folder_id");

  if (!hasFolderColumn) {
    db.exec("ALTER TABLE drawings ADD COLUMN folder_id TEXT");
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);

  const hasParentColumn = db
    .prepare("PRAGMA table_info(folders)")
    .all()
    .some((column) => (column as { name: string }).name === "parent_id");

  if (!hasParentColumn) {
    db.exec("ALTER TABLE folders ADD COLUMN parent_id TEXT");
  }

  const draftsExists =
    db
      .prepare("SELECT 1 FROM folders WHERE name = ?")
      .get(DEFAULT_FOLDER_NAME) !== undefined;
  if (!draftsExists) {
    db.prepare("INSERT INTO folders (id, name, created_at) VALUES (?, ?, ?)").run(
      nanoid(),
      DEFAULT_FOLDER_NAME,
      Date.now(),
    );
  }

  db.prepare(
    `UPDATE drawings
     SET folder_id = (SELECT id FROM folders WHERE name = ? LIMIT 1)
     WHERE folder_id IS NULL`,
  ).run(DEFAULT_FOLDER_NAME);

  db.exec(`
    CREATE TABLE IF NOT EXISTS mcp_checkpoints (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);

  return db;
}
