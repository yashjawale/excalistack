import type {
  BinaryFilesMap,
  CreateDrawingInput,
  DrawingScene,
  DrawingSummary,
  StoredDrawing,
  UpdateDrawingInput,
} from "@excalistack/shared";
import { countLiveElements } from "@excalistack/shared";
import { nanoid } from "nanoid";
import type BetterSqlite3 from "better-sqlite3";

/**
 * Persistence interface for drawings. Routes depend on this abstraction
 * rather than SQLite directly, keeping the door open for alternative
 * backends and API surfaces (e.g. a future MCP server).
 */
export interface DrawingStore {
  /**
   * Lists all drawings, most recently updated first.
   *
   * @returns Drawing metadata without scene payloads.
   */
  list(): DrawingSummary[];

  /**
   * Fetches one drawing including its full scene and files.
   *
   * @param id - Drawing identifier.
   * @returns The stored drawing, or `null` when no such id exists.
   */
  get(id: string): StoredDrawing | null;

  /**
   * Persists a new drawing.
   *
   * @param input - Initial name, scene, files, and thumbnail.
   * @returns The freshly created drawing.
   */
  create(input: CreateDrawingInput): StoredDrawing;

  /**
   * Replaces parts of an existing drawing (editor autosave semantics:
   * every provided field is overwritten; omitted fields are kept).
   *
   * @param id - Drawing identifier.
   * @param input - Scene, files, and/or thumbnail replacements.
   * @returns The updated drawing, or `null` when no such id exists.
   */
  update(id: string, input: UpdateDrawingInput): StoredDrawing | null;

  /**
   * Renames a drawing without touching its content.
   *
   * @param id - Drawing identifier.
   * @param name - New display name.
   * @returns The updated summary, or `null` when no such id exists.
   */
  rename(id: string, name: string): DrawingSummary | null;

  /**
   * Permanently removes a drawing.
   *
   * @param id - Drawing identifier.
   * @returns `true` when a row was deleted, `false` otherwise.
   */
  delete(id: string): boolean;
}

/** Internal row shape as stored in the `drawings` table. */
interface DrawingRow {
  id: string;
  name: string;
  elements: string;
  app_state: string;
  files: string;
  thumbnail: string | null;
  element_count: number;
  created_at: number;
  updated_at: number;
}

/**
 * SQLite-backed {@link DrawingStore} used in production and tests
 * (via an in-memory database).
 */
export class SqliteDrawingStore implements DrawingStore {
  readonly #db: BetterSqlite3.Database;
  readonly #insert: BetterSqlite3.Statement;
  readonly #selectAll: BetterSqlite3.Statement;
  readonly #selectById: BetterSqlite3.Statement;
  readonly #updateContent: BetterSqlite3.Statement;
  readonly #rename: BetterSqlite3.Statement;
  readonly #delete: BetterSqlite3.Statement;

  /**
   * @param db - An open database connection whose schema has been migrated.
   */
  constructor(db: BetterSqlite3.Database) {
    this.#db = db;
    this.#insert = db.prepare(
      `INSERT INTO drawings (id, name, elements, app_state, files, thumbnail, element_count, created_at, updated_at)
       VALUES (@id, @name, @elements, @app_state, @files, @thumbnail, @element_count, @created_at, @updated_at)`,
    );
    this.#selectAll = db.prepare(
      "SELECT * FROM drawings ORDER BY updated_at DESC",
    );
    this.#selectById = db.prepare("SELECT * FROM drawings WHERE id = ?");
    this.#updateContent = db.prepare(
      `UPDATE drawings
       SET name = @name,
           elements = @elements,
           app_state = @app_state,
           files = @files,
           thumbnail = @thumbnail,
           element_count = @element_count,
           updated_at = @updated_at
       WHERE id = @id`,
    );
    this.#rename = db.prepare(
      "UPDATE drawings SET name = ?, updated_at = ? WHERE id = ?",
    );
    this.#delete = db.prepare("DELETE FROM drawings WHERE id = ?");
  }

  /** @inheritDoc */
  list(): DrawingSummary[] {
    return (this.#selectAll.all() as DrawingRow[]).map((row) => this.#toSummary(row));
  }

  /** @inheritDoc */
  get(id: string): StoredDrawing | null {
    const row = this.#selectById.get(id) as DrawingRow | undefined;
    return row ? this.#toStored(row) : null;
  }

  /** @inheritDoc */
  create(input: CreateDrawingInput): StoredDrawing {
    const now = Date.now();
    const id = nanoid();
    const scene: DrawingScene = {
      elements: input.scene?.elements ?? [],
      appState: input.scene?.appState ?? {},
    };
    const files: BinaryFilesMap = input.files ?? {};
    const row: DrawingRow = {
      id,
      name: input.name ?? "Untitled drawing",
      elements: JSON.stringify(scene.elements),
      app_state: JSON.stringify(scene.appState),
      files: JSON.stringify(files),
      thumbnail: input.thumbnail ?? null,
      element_count: countLiveElements(scene.elements),
      created_at: now,
      updated_at: now,
    };
    this.#insert.run(row);
    return this.#toStored(row);
  }

  /** @inheritDoc */
  update(id: string, input: UpdateDrawingInput): StoredDrawing | null {
    const existing = this.get(id);
    if (!existing) {
      return null;
    }
    const scene: DrawingScene = input.scene ?? existing.scene;
    const row: DrawingRow = {
      id,
      name: existing.name,
      elements: JSON.stringify(scene.elements),
      app_state: JSON.stringify(scene.appState),
      files: JSON.stringify(input.files ?? existing.files),
      thumbnail: input.thumbnail !== undefined ? input.thumbnail : existing.thumbnail,
      element_count: countLiveElements(scene.elements),
      updated_at: Date.now(),
      created_at: existing.createdAt,
    };
    this.#updateContent.run(row);
    return this.#toStored({ ...row });
  }

  /** @inheritDoc */
  rename(id: string, name: string): DrawingSummary | null {
    const result = this.#rename.run(name, Date.now(), id);
    if (result.changes === 0) {
      return null;
    }
    const row = this.#selectById.get(id) as DrawingRow;
    return this.#toSummary(row);
  }

  /** @inheritDoc */
  delete(id: string): boolean {
    return this.#delete.run(id).changes > 0;
  }

  /**
   * Maps a raw table row to its public summary shape.
   *
   * @param row - Row as read from SQLite.
   * @returns Public drawing metadata.
   */
  #toSummary(row: DrawingRow): DrawingSummary {
    return {
      id: row.id,
      name: row.name,
      thumbnail: row.thumbnail,
      elementCount: row.element_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Maps a raw table row to the full stored-drawing shape, parsing all
   * serialized JSON columns.
   *
   * @param row - Row as read from SQLite.
   * @returns Full drawing with scene and files.
   */
  #toStored(row: DrawingRow): StoredDrawing {
    return {
      ...this.#toSummary(row),
      scene: {
        elements: JSON.parse(row.elements) as DrawingScene["elements"],
        appState: JSON.parse(row.app_state) as Record<string, unknown>,
      },
      files: JSON.parse(row.files) as BinaryFilesMap,
    };
  }
}
