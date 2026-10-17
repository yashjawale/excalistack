import type { FastifyInstance } from "fastify";
import {
  CreateDrawingInputSchema,
  ExcalidrawDocumentSchema,
  RenameDrawingInputSchema,
  UpdateDrawingInputSchema,
  pickExportAppState,
  toExcalidrawDocument,
} from "@excalistack/shared";
import type { DrawingSummary } from "@excalistack/shared";
import type { DrawingStore } from "../store.js";

/**
 * Registers all `/api/drawings` REST endpoints on the application.
 *
 * Every route delegates persistence to the supplied {@link DrawingStore};
 * malformed bodies are rejected with HTTP 400 by the central error handler.
 *
 * @param app - Fastify instance under construction.
 * @param store - Drawing persistence backend.
 */
export async function registerDrawingRoutes(
  app: FastifyInstance,
  store: DrawingStore,
): Promise<void> {
  /**
   * Lists stored drawings, most recently updated first.
   *
   * Supports an optional `folderId` query parameter to scope the listing
   * to a single folder, and an optional `q` parameter for a global
   * case-insensitive search over drawing names and scene text content
   * (`q` takes precedence over `folderId`).
   */
  app.get("/api/drawings", async (request) => {
    const { folderId, q } = request.query as { folderId?: string; q?: string };
    const term = q?.trim();
    if (term) {
      return { drawings: store.list(undefined, term), query: term };
    }
    return { drawings: store.list(folderId || undefined) };
  });

  /**
   * Creates a new drawing, optionally seeded with an imported scene.
   *
   * Accepts two body shapes:
   * - `{ name?, folderId?, scene?, files?, thumbnail? }` (API-native form)
   * - a raw `.excalidraw` document (`type: "excalidraw"`), exactly as
   *   saved by excalidraw.com — enabling scriptable imports such as
   *   `curl --data-binary @drawing.excalidraw`
   *
   * Raw documents land in the Drafts folder (or `folderId` query param).
   */
  app.post("/api/drawings", async (request, reply) => {
    const { folderId } = request.query as { folderId?: string };
    const body: unknown = request.body ?? {};
    if (
      typeof body === "object" &&
      body !== null &&
      (body as { type?: unknown }).type === "excalidraw"
    ) {
      const document = ExcalidrawDocumentSchema.parse(body);
      return reply.code(201).send(
        store.create({
          folderId: folderId || undefined,
          scene: {
            elements: document.elements,
            appState: pickExportAppState(document.appState),
          },
          files: document.files,
        }),
      );
    }
    const input = CreateDrawingInputSchema.parse(body);
    if (input.folderId && !folderExists(store, input.folderId)) {
      return reply.code(400).send({ message: `Folder "${input.folderId}" not found` });
    }
    const drawing = store.create(input);
    return reply.code(201).send(drawing);
  });

  /**
   * Replaces scene/files/thumbnail of a drawing (autosave target).
   */
  app.put("/api/drawings/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = UpdateDrawingInputSchema.parse(request.body ?? {});
    const existing = store.get(id);
    if (!existing) {
      return reply.code(404).send({ message: `Drawing "${id}" not found` });
    }
    const expectedUpdatedAtHeader = request.headers["if-unmodified-since"];
    const expectedUpdatedAt =
      typeof expectedUpdatedAtHeader === "string" ? Number(expectedUpdatedAtHeader) : undefined;
    if (expectedUpdatedAt === undefined) {
      return reply
        .code(428)
        .send({ message: "Missing If-Unmodified-Since drawing version; reload before saving" });
    }
    if (!Number.isFinite(expectedUpdatedAt)) {
      return reply.code(400).send({ message: "Invalid If-Unmodified-Since drawing version" });
    }
    if (existing.updatedAt !== expectedUpdatedAt) {
      return reply.code(409).send({ message: "Drawing changed since it was loaded" });
    }
    const drawing = store.update(id, input);
    if (!drawing) {
      return reply.code(404).send({ message: `Drawing "${id}" not found` });
    }
    return drawing;
  });

  /**
   * Renames and/or moves a drawing without touching its content.
   */
  app.patch("/api/drawings/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = RenameDrawingInputSchema.parse(request.body);
    if (input.folderId && !folderExists(store, input.folderId)) {
      return reply.code(400).send({ message: `Folder "${input.folderId}" not found` });
    }
    if (!store.get(id)) {
      return reply.code(404).send({ message: `Drawing "${id}" not found` });
    }
    let summary: DrawingSummary = store.get(id)!;
    if (input.name && input.name !== summary.name) {
      const renamed = store.rename(id, input.name);
      if (!renamed) {
        return reply.code(404).send({ message: `Drawing "${id}" not found` });
      }
      summary = renamed;
    }
    if (input.folderId) {
      const moved = store.move(id, input.folderId);
      if (!moved) {
        return reply.code(404).send({ message: `Drawing "${id}" not found` });
      }
      summary = moved;
    }
    return summary;
  });

  /**
   * Permanently deletes a drawing.
   */
  app.delete("/api/drawings/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!store.delete(id)) {
      return reply.code(404).send({ message: `Drawing "${id}" not found` });
    }
    return reply.code(204).send();
  });

  /**
   * Fetches one drawing including full scene payload.
   */
  app.get("/api/drawings/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const drawing = store.get(id);
    if (!drawing) {
      return reply.code(404).send({ message: `Drawing "${id}" not found` });
    }
    return drawing;
  });

  /**
   * Downloads a drawing as a native `.excalidraw` file that
   * excalidraw.com can open directly.
   */
  app.get("/api/drawings/:id/export", async (request, reply) => {
    const { id } = request.params as { id: string };
    const drawing = store.get(id);
    if (!drawing) {
      return reply.code(404).send({ message: `Drawing "${id}" not found` });
    }
    const document = toExcalidrawDocument(drawing);
    return reply
      .header("content-type", "application/json; charset=utf-8")
      .header("content-disposition", `attachment; filename="${exportFileName(drawing.name)}"`)
      .send(JSON.stringify(document));
  });
}

/**
 * Derives a safe download file name from a drawing's display name by
 * stripping characters that are problematic in HTTP headers or on disk.
 *
 * @param name - Raw display name.
 * @returns Sanitized name with an `.excalidraw` extension.
 */
function exportFileName(name: string): string {
  const slug =
    name
      .normalize("NFKD")
      .replace(/[^\w\s.-]/g, "")
      .trim()
      .replace(/\s+/g, "-") || "drawing";
  return `${slug}.excalidraw`;
}

/**
 * Checks whether a folder with the given identifier exists.
 *
 * @param store - Persistence backend.
 * @param folderId - Folder identifier to verify.
 * @returns `true` when the folder exists.
 */
function folderExists(store: DrawingStore, folderId: string): boolean {
  return store.listFolders().some((folder) => folder.id === folderId);
}
