import type { CheckpointStore } from "./vendor/checkpoint-store.js";
import type BetterSqlite3 from "better-sqlite3";

/**
 * Maximum serialized checkpoint size (5 MB), mirroring the upstream
 * {@link FileCheckpointStore} limit.
 */
const MAX_CHECKPOINT_BYTES = 5 * 1024 * 1024;

/** Maximum number of checkpoints retained before pruning oldest. */
const MAX_CHECKPOINTS = 100;

/**
 * Validates a checkpoint identifier, mirroring upstream's
 * {@link validateCheckpointId}.
 *
 * @param id - Checkpoint identifier to validate.
 * @throws Error when the id contains unsafe characters or is too long.
 */
function validateCheckpointId(id: string): void {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error(`Invalid checkpoint id: must be alphanumeric, hyphens, or underscores`);
  }
  if (id.length > 64) {
    throw new Error(`Invalid checkpoint id: exceeds 64 character limit`);
  }
}

/**
 * SQLite-backed {@link CheckpointStore} that survives container restarts,
 * unlike the upstream in-memory and/tmp-file stores.
 */
export class SqliteCheckpointStore implements CheckpointStore {
  readonly #db: BetterSqlite3.Database;
  readonly #insert: BetterSqlite3.Statement;
  readonly #selectById: BetterSqlite3.Statement;
  readonly #count: BetterSqlite3.Statement;

  /**
   * @param db - An open database connection whose schema has been migrated
   * to include the `mcp_checkpoints` table.
   */
  constructor(db: BetterSqlite3.Database) {
    this.#db = db;
    this.#insert = db.prepare(
      `INSERT INTO mcp_checkpoints (id, data, created_at)
       VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET data = excluded.data, created_at = excluded.created_at`,
    );
    this.#selectById = db.prepare("SELECT data FROM mcp_checkpoints WHERE id = ?");
    this.#count = db.prepare("SELECT COUNT(*) AS c FROM mcp_checkpoints");
  }

  /**
   * Persists checkpoint data under the given id.
   *
   * @param id - Checkpoint identifier.
   * @param data - Checkpoint payload (`{ elements }`).
   */
  async save(id: string, data: { elements: unknown[] }): Promise<void> {
    validateCheckpointId(id);
    const serialized = JSON.stringify(data);
    if (serialized.length > MAX_CHECKPOINT_BYTES) {
      throw new Error(`Checkpoint data exceeds ${MAX_CHECKPOINT_BYTES} byte limit`);
    }
    this.#insert.run(id, serialized, Date.now());
    await this.#pruneIfNeeded();
  }

  /**
   * Loads checkpoint data by id.
   *
   * @param id - Checkpoint identifier.
   * @returns The checkpoint payload, or `null` when not found.
   */
  async load(id: string): Promise<{ elements: unknown[] } | null> {
    validateCheckpointId(id);
    const row = this.#selectById.get(id) as { data: string } | undefined;
    if (!row) return null;
    try {
      return JSON.parse(row.data) as { elements: unknown[] };
    } catch {
      return null;
    }
  }

  /**
   * Removes oldest checkpoints when the count exceeds the limit.
   */
  async #pruneIfNeeded(): Promise<void> {
    const { c } = this.#count.get() as { c: number };
    if (c <= MAX_CHECKPOINTS) return;
    const toRemove = c - MAX_CHECKPOINTS;
    this.#db
      .prepare(
        `DELETE FROM mcp_checkpoints
         WHERE id IN (
           SELECT id FROM mcp_checkpoints ORDER BY created_at ASC LIMIT ?
         )`,
      )
      .run(toRemove);
  }
}
