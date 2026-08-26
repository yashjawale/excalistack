/**
 * Core domain model and validation schemas shared between the
 * excalistack server, web app, and any future API consumers.
 *
 * The persisted drawing format mirrors the native Excalidraw file
 * format (https://excalidraw.com) so scenes round-trip losslessly.
 */
import { z } from "zod";

/** Source string written into exported `.excalidraw` documents. */
export const EXCALISTACK_SOURCE = "https://github.com/yash/excalistack" as const;

/**
 * Subset of Excalidraw `AppState` keys that are meaningful outside a
 * live editor session (view settings + export settings). Everything
 * else is transient UI state and is stripped before persistence.
 */
export const EXPORT_APP_STATE_KEYS = [
  "viewBackgroundColor",
  "gridSize",
  "exportBackground",
  "exportEmbedScene",
  "exportWithDarkMode",
  "exportPadding",
] as const;

/** A single Excalidraw scene element. Shape depends on `type`. */
export type ExcalidrawElement = { id: string; type: string } & Record<string, unknown>;

/**
 * A binary asset (typically an embedded image) referenced by scene
 * elements via its `fileId`. Stored as a base64 data URL.
 */
export interface BinaryFile {
  /** MIME type of the asset, e.g. `image/png`. */
  mimeType: string;
  /** Identifier matching the referencing element's `fileId`. */
  id?: string;
  /** Base64 data URL containing the asset bytes. */
  dataURL: string;
  /** Epoch milliseconds when the file was added. */
  created?: number;
}

/** Elements plus persisted view/export state of one drawing. */
export interface DrawingScene {
  /** Scene elements in draw order (array order = z-order). */
  elements: ExcalidrawElement[];
  /** Whitelisted {@link EXPORT_APP_STATE_KEYS} view/export state. */
  appState: Record<string, unknown>;
}

/** Files embedded in a drawing, keyed by file id. */
export type BinaryFilesMap = Record<string, BinaryFile>;

/**
 * Validates a single Excalidraw element. Only `id` and `type` are
 * enforced — all remaining properties pass through untouched so the
 * schema stays forward-compatible with new Excalidraw versions.
 */
export const ExcalidrawElementSchema: z.ZodType<ExcalidrawElement> = z.looseObject({
  id: z.string().min(1),
  type: z.string().min(1),
});

/** Validates an embedded binary asset. */
export const BinaryFileSchema: z.ZodType<BinaryFile> = z.looseObject({
  mimeType: z.string(),
  id: z.string().optional(),
  dataURL: z.string(),
  created: z.number().optional(),
});

/** Validates the persistable part of a scene. */
export const DrawingSceneSchema: z.ZodType<DrawingScene> = z.object({
  elements: z.array(ExcalidrawElementSchema),
  appState: z.record(z.string(), z.unknown()).default({}),
});

/**
 * Validates a complete `.excalidraw` document as produced by
 * excalidraw.com's "Save to disk". Used on import.
 */
export const ExcalidrawDocumentSchema = z.object({
  type: z.literal("excalidraw"),
  version: z.number().optional(),
  source: z.string().optional(),
  elements: z.array(ExcalidrawElementSchema),
  appState: z.record(z.string(), z.unknown()).default({}),
  files: z.record(z.string(), BinaryFileSchema).default({}),
});

/** A complete `.excalidraw` document shape (post-validation). */
export type ExcalidrawDocument = {
  /** Format discriminator; always `"excalidraw"`. */
  type: "excalidraw";
  /** Schema version written by the producing application. */
  version?: number;
  /** Origin application of the document. */
  source?: string;
  /** Scene elements. */
  elements: ExcalidrawElement[];
  /** Editor state associated with the document. */
  appState: Record<string, unknown>;
  /** Embedded binary assets keyed by id. */
  files: BinaryFilesMap;
};

/** Metadata about a stored folder. */
export interface FolderSummary {
  /** Unique opaque identifier. */
  id: string;
  /** Folder display name. */
  name: string;
  /** Identifier of the parent folder, or `null` for root-level folders. */
  parentId: string | null;
  /** Number of drawings directly inside this folder. */
  drawingCount: number;
  /** Epoch milliseconds of creation. */
  createdAt: number;
}

/** Body for `POST /api/folders`. */
export interface CreateFolderInput {
  /** Folder display name. */
  name: string;
  /** Parent folder; omitted or `null` creates a root-level folder. */
  parentId?: string | null;
}

/**
 * Body for `PATCH /api/folders/:id` (rename and/or re-parent).
 * `parentId: null` moves the folder to the root level.
 */
export interface RenameFolderInput {
  /** New folder display name. */
  name?: string;
  /** New parent folder, or `null` for root. */
  parentId?: string | null;
}

/** Metadata about a stored drawing (no scene payload). */
export interface DrawingSummary {
  /** Unique opaque identifier. */
  id: string;
  /** Human-readable display name. */
  name: string;
  /** Identifier of the folder containing this drawing. */
  folderId: string;
  /** Small PNG preview as a data URL, or `null` for empty drawings. */
  thumbnail: string | null;
  /** Number of non-deleted elements in the scene. */
  elementCount: number;
  /** Epoch milliseconds of creation. */
  createdAt: number;
  /** Epoch milliseconds of last modification. */
  updatedAt: number;
}

/** A full stored drawing: summary metadata plus its scene and files. */
export interface StoredDrawing extends DrawingSummary {
  /** Persistable scene content. */
  scene: DrawingScene;
  /** Embedded binary assets keyed by id. */
  files: BinaryFilesMap;
}

/** Body for `POST /api/drawings` (create or import). */
export interface CreateDrawingInput {
  /** Display name; defaults to `"Untitled drawing"` server-side. */
  name?: string;
  /** Folder to place the drawing in; defaults to the Drafts folder. */
  folderId?: string;
  /** Initial scene content. Defaults to an empty scene. */
  scene?: DrawingScene;
  /** Embedded assets referenced by the initial scene. */
  files?: BinaryFilesMap;
  /** Initial PNG thumbnail data URL. */
  thumbnail?: string | null;
}

/** Body for `PUT /api/drawings/:id` (editor autosave). */
export interface UpdateDrawingInput {
  /** New scene content, replacing elements + app state. */
  scene?: DrawingScene;
  /** Replacement set of embedded assets. */
  files?: BinaryFilesMap;
  /** Replacement PNG thumbnail data URL (`null` clears it). */
  thumbnail?: string | null;
}

/** Body for `PATCH /api/drawings/:id` (rename and/or move). */
export interface RenameDrawingInput {
  /** New display name. */
  name?: string;
  /** Folder to move the drawing into. */
  folderId?: string;
}

/** Validates {@link CreateDrawingInput}. */
export const CreateDrawingInputSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  folderId: z.string().min(1).optional(),
  scene: DrawingSceneSchema.optional(),
  files: z.record(z.string(), BinaryFileSchema).optional(),
  thumbnail: z.string().nullable().optional(),
}) satisfies z.ZodType<CreateDrawingInput>;

/** Validates {@link UpdateDrawingInput}. */
export const UpdateDrawingInputSchema = z.object({
  scene: DrawingSceneSchema.optional(),
  files: z.record(z.string(), BinaryFileSchema).optional(),
  thumbnail: z.string().nullable().optional(),
}) satisfies z.ZodType<UpdateDrawingInput>;

/** Validates {@link RenameDrawingInput} (rename and/or move). */
export const RenameDrawingInputSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    folderId: z.string().min(1).optional(),
  })
  .refine((input) => input.name !== undefined || input.folderId !== undefined, {
    message: "Provide a name and/or folderId",
  }) satisfies z.ZodType<RenameDrawingInput>;

/** Validates {@link CreateFolderInput}. */
export const CreateFolderInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  parentId: z.string().min(1).nullable().optional(),
}) satisfies z.ZodType<CreateFolderInput>;

/** Validates {@link RenameFolderInput} (rename and/or re-parent). */
export const RenameFolderInputSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    parentId: z.string().min(1).nullable().optional(),
  })
  .refine((input) => input.name !== undefined || input.parentId !== undefined, {
    message: "Provide a name and/or parentId",
  }) satisfies z.ZodType<RenameFolderInput>;

/**
 * Counts elements that are not marked deleted, which is what should be
 * surfaced on dashboards and listings.
 *
 * @param elements - Scene elements to inspect.
 * @returns Number of live (non-deleted) elements.
 */
export function countLiveElements(elements: readonly ExcalidrawElement[]): number {
  return elements.filter((element) => !element["isDeleted"]).length;
}

/**
 * Reduces a full live-editor `AppState` down to the keys worth persisting
 * ({@link EXPORT_APP_STATE_KEYS}).
 *
 * @param appState - Full editor state as emitted by Excalidraw's `onChange`.
 * @returns A compact object containing only persistable keys.
 */
export function pickExportAppState(
  appState: Record<string, unknown>,
): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  for (const key of EXPORT_APP_STATE_KEYS) {
    if (appState[key] !== undefined) {
      picked[key] = appState[key];
    }
  }
  return picked;
}

/**
 * Assembles stored drawing parts into a native `.excalidraw` document
 * that excalidraw.com can open directly ("Open" / drag-and-drop).
 *
 * @param drawing - The stored drawing to serialize.
 * @returns A plain object safe to `JSON.stringify` into a file.
 */
export function toExcalidrawDocument(drawing: StoredDrawing): ExcalidrawDocument {
  return {
    type: "excalidraw",
    version: 2,
    source: EXCALISTACK_SOURCE,
    elements: drawing.scene.elements,
    appState: drawing.scene.appState,
    files: drawing.files,
  };
}
