import type {
  BinaryFilesMap,
  CreateDrawingInput,
  DrawingScene,
  DrawingSummary,
  FolderSummary,
  StoredDrawing,
  UpdateDrawingInput,
} from "@excalistack/shared";
import { countLiveElements } from "@excalistack/shared";
import { nanoid } from "nanoid";
import type BetterSqlite3 from "better-sqlite3";
import { DEFAULT_FOLDER_NAME } from "./db.js";

/**
 * Persistence interface for drawings and folders. Routes depend on this
 * abstraction rather than SQLite directly, keeping the door open for
 * alternative backends and API surfaces (e.g. a future MCP server).
 */
export interface DrawingStore {
  /**
   * Identifier of the default folder that receives new drawings.
   */
  draftsFolderId(): string;

  /**
   * Lists all folders with their drawing counts, oldest first (the
   * seeded Drafts folder therefore appears first).
   *
   * @returns Folder metadata including drawing counts.
   */
  listFolders(): FolderSummary[];

  /**
   * Creates a folder. Callers are responsible for rejecting duplicate
   * names before calling this.
   *
   * @param name - Folder display name.
   * @returns The freshly created folder.
   */
  createFolder(name: string): FolderSummary;

  /**
   * Renames a folder without touching its contents.
   *
   * @param id - Folder identifier.
   * @param name - New display name.
   * @returns The updated folder, or `null` when no such folder exists.
   */
  renameFolder(id: string, name: string): FolderSummary | null;

  /**
   * Deletes a folder and moves its drawings to the Drafts folder.
   * Deleting the Drafts folder itself is rejected with an error.
   *
   * @param id - Folder identifier.
   * @returns `true` when a folder was deleted, `false` when unknown.
   * @throws Error when attempting to delete the Drafts folder.
   */
  deleteFolder(id: string): boolean;

  /**
   * Lists drawings, most recently updated first.
   *
   * @param folderId - When given, only drawings inside that folder.
   * @returns Drawing metadata without scene payloads.
   */
  list(folderId?: string): DrawingSummary[];

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
   * @param input - Initial name, folder, scene, files, and thumbnail.
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
   * Moves a drawing into another folder without bumping its
   * last-modified timestamp.
   *
   * @param id - Drawing identifier.
   * @param folderId - Target folder identifier.
   * @returns The updated summary, or `null` when drawing or folder is
   * unknown.
   */
  move(id: string, folderId: string): DrawingSummary | null;

  /**
   * Permanently removes a drawing.
   *
   * @param id - Drawing identifier.
   * @returns `true` when a row was deleted, `false` otherwise.
   */
  delete(id: string): boolean;
}

/** Internal drawing row shape as stored in the `drawings` table. */
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
  folder_id: string;
}

/** Internal folder row shape as stored in the `folders` table. */
interface FolderRow {
  id: string;
  name: string;
  created_at: number;
  drawing_count?: number;
}

/**
 * SQLite-backed {@link DrawingStore} used in production and tests
 * (via an in-memory database).
 */
export class SqliteDrawingStore implements DrawingStore {
  readonly #db: BetterSqlite3.Database;
  readonly #draftsId: string;
  readonly #insertDrawing: BetterSqlite3.Statement;
  readonly #selectAll: BetterSqlite3.Statement;
  readonly #selectByFolder: BetterSqlite3.Statement;
  readonly #selectDrawingById: BetterSqlite3.Statement;
  readonly #updateContent: BetterSqlite3.Statement;
  readonly #renameDrawing: BetterSqlite3.Statement;
  readonly #moveDrawing: BetterSqlite3.Statement;
  readonly #deleteDrawing: BetterSqlite3.Statement;
  readonly #selectFolders: BetterSqlite3.Statement;
  readonly #selectFolderById: BetterSqlite3.Statement;
  readonly #insertFolder: BetterSqlite3.Statement;
  readonly #renameFolderStmt: BetterSqlite3.Statement;
  readonly #reassignDrawings: BetterSqlite3.Statement;
  readonly #deleteFolderStmt: BetterSqlite3.Statement;

  /**
   * @param db - An open database connection whose schema has been migrated.
   */
  constructor(db: BetterSqlite3.Database) {
    this.#db = db;
    const drafts = db
      .prepare("SELECT id FROM folders WHERE name = ? LIMIT 1")
      .get(DEFAULT_FOLDER_NAME) as { id: string } | undefined;
    if (!drafts) {
      throw new Error(
        `Default '${DEFAULT_FOLDER_NAME}' folder missing — run migrations first`,
      );
    }
    this.#draftsId = drafts.id;

    this.#insertDrawing = db.prepare(
      `INSERT INTO drawings (id, name, elements, app_state, files, thumbnail, element_count, created_at, updated_at, folder_id)
       VALUES (@id, @name, @elements, @app_state, @files, @thumbnail, @element_count, @created_at, @updated_at, @folder_id)`,
    );
    this.#selectAll = db.prepare(
      "SELECT * FROM drawings ORDER BY updated_at DESC",
    );
    this.#selectByFolder = db.prepare(
      "SELECT * FROM drawings WHERE folder_id = ? ORDER BY updated_at DESC",
    );
    this.#selectDrawingById = db.prepare("SELECT * FROM drawings WHERE id = ?");
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
    this.#renameDrawing = db.prepare(
      "UPDATE drawings SET name = ?, updated_at = ? WHERE id = ?",
    );
    this.#moveDrawing = db.prepare(
      "UPDATE drawings SET folder_id = ? WHERE id = ?",
    );
    this.#deleteDrawing = db.prepare("DELETE FROM drawings WHERE id = ?");
    this.#selectFolders = db.prepare(
      `SELECT f.id, f.name, f.created_at, COUNT(d.id) AS drawing_count
       FROM folders f
       LEFT JOIN drawings d ON d.folder_id = f.id
       GROUP BY f.id
       ORDER BY f.created_at ASC, f.rowid ASC`,
    );
    this.#selectFolderById = db.prepare("SELECT * FROM folders WHERE id = ?");
    this.#insertFolder = db.prepare(
      "INSERT INTO folders (id, name, created_at) VALUES (?, ?, ?)",
    );
    this.#renameFolderStmt = db.prepare(
      "UPDATE folders SET name = ? WHERE id = ?",
    );
    this.#reassignDrawings = db.prepare(
      "UPDATE drawings SET folder_id = ? WHERE folder_id = ?",
    );
    this.#deleteFolderStmt = db.prepare("DELETE FROM folders WHERE id = ?");
  }

  /** @inheritDoc */
  draftsFolderId(): string {
    return this.#draftsId;
  }

  /** @inheritDoc */
  listFolders(): FolderSummary[] {
    return (this.#selectFolders.all() as FolderRow[]).map((row) => ({
      id: row.id,
      name: row.name,
      drawingCount: row.drawing_count ?? 0,
      createdAt: row.created_at,
    }));
  }

  /** @inheritDoc */
  createFolder(name: string): FolderSummary {
    const folder: FolderRow = {
      id: nanoid(),
      name,
      created_at: Date.now(),
    };
    this.#insertFolder.run(folder.id, folder.name, folder.created_at);
    return {
      id: folder.id,
      name: folder.name,
      drawingCount: 0,
      createdAt: folder.created_at,
    };
  }

  /** @inheritDoc */
  renameFolder(id: string, name: string): FolderSummary | null {
    const result = this.#renameFolderStmt.run(name, id);
    if (result.changes === 0) {
      return null;
    }
    return this.#toFolderSummary(this.#selectFolderById.get(id) as FolderRow);
  }

  /** @inheritDoc */
  deleteFolder(id: string): boolean {
    if (id === this.#draftsId) {
      throw new Error("The Drafts folder cannot be deleted");
    }
    const result = this.#deleteFolderStmt.run(id);
    if (result.changes === 0) {
      return false;
    }
    this.#reassignDrawings.run(this.#draftsId, id);
    return true;
  }

  /** @inheritDoc */
  list(folderId?: string): DrawingSummary[] {
    const rows = (
      folderId
        ? (this.#selectByFolder.all(folderId) as DrawingRow[])
        : (this.#selectAll.all() as DrawingRow[])
    ).map((row) => this.#toSummary(row));
    return rows;
  }

  /** @inheritDoc */
  get(id: string): StoredDrawing | null {
    const row = this.#selectDrawingById.get(id) as DrawingRow | undefined;
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
      folder_id: input.folderId ?? this.#draftsId,
    };
    this.#insertDrawing.run(row);
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
      folder_id: existing.folderId,
    };
    this.#updateContent.run(row);
    return this.#toStored({ ...row });
  }

  /** @inheritDoc */
  rename(id: string, name: string): DrawingSummary | null {
    const result = this.#renameDrawing.run(name, Date.now(), id);
    if (result.changes === 0) {
      return null;
    }
    return this.#toSummary(this.#selectDrawingById.get(id) as DrawingRow);
  }

  /** @inheritDoc */
  move(id: string, folderId: string): DrawingSummary | null {
    const folderExists = this.#selectFolderById.get(folderId) !== undefined;
    if (!folderExists) {
      return null;
    }
    const result = this.#moveDrawing.run(folderId, id);
    if (result.changes === 0) {
      return null;
    }
    return this.#toSummary(this.#selectDrawingById.get(id) as DrawingRow);
  }

  /** @inheritDoc */
  delete(id: string): boolean {
    return this.#deleteDrawing.run(id).changes > 0;
  }

  /**
   * Maps a raw folder row to its public summary shape.
   *
   * @param row - Row as read from SQLite (may carry a joined count).
   * @returns Public folder metadata.
   */
  #toFolderSummary(row: FolderRow): FolderSummary {
    return {
      id: row.id,
      name: row.name,
      drawingCount: row.drawing_count ?? 0,
      createdAt: row.created_at,
    };
  }

  /**
   * Maps a raw drawing row to its public summary shape.
   *
   * @param row - Row as read from SQLite.
   * @returns Public drawing metadata.
   */
  #toSummary(row: DrawingRow): DrawingSummary {
    return {
      id: row.id,
      name: row.name,
      folderId: row.folder_id,
      thumbnail: row.thumbnail,
      elementCount: row.element_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Maps a raw drawing row to the full stored-drawing shape, parsing all
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
