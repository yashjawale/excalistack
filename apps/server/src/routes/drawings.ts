import type { FastifyInstance } from "fastify";
import {
  CreateDrawingInputSchema,
  ExcalidrawDocumentSchema,
  RenameDrawingInputSchema,
  UpdateDrawingInputSchema,
  pickExportAppState,
  toExcalidrawDocument,
} from "@excalistack/shared";
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
export async function registerDrawingRoutes(app: FastifyInstance, store: DrawingStore): Promise<void> {
  /**
   * Lists stored drawings, most recently updated first.
   */
  app.get("/api/drawings", async () => {
    return { drawings: store.list() };
  });

  /**
   * Creates a new drawing, optionally seeded with an imported scene.
   *
   * Accepts two body shapes:
   * - `{ name?, scene?, files?, thumbnail? }` (API-native form)
   * - a raw `.excalidraw` document (`type: "excalidraw"`), exactly as
   *   saved by excalidraw.com — enabling scriptable imports such as
   *   `curl --data-binary @drawing.excalidraw`
   */
  app.post("/api/drawings", async (request, reply) => {
    const body: unknown = request.body ?? {};
    if (
      typeof body === "object" &&
      body !== null &&
      (body as { type?: unknown }).type === "excalidraw"
    ) {
      const document = ExcalidrawDocumentSchema.parse(body);
      return reply.code(201).send(
        store.create({
          scene: {
            elements: document.elements,
            appState: pickExportAppState(document.appState),
          },
          files: document.files,
        }),
      );
    }
    const input = CreateDrawingInputSchema.parse(body);
    const drawing = store.create(input);
    return reply.code(201).send(drawing);
  });

  /**
   * Replaces scene/files/thumbnail of a drawing (autosave target).
   */
  app.put("/api/drawings/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = UpdateDrawingInputSchema.parse(request.body ?? {});
    const drawing = store.update(id, input);
    if (!drawing) {
      return reply.code(404).send({ message: `Drawing "${id}" not found` });
    }
    return drawing;
  });

  /**
   * Renames a drawing without touching its content.
   */
  app.patch("/api/drawings/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = RenameDrawingInputSchema.parse(request.body);
    const summary = store.rename(id, input.name);
    if (!summary) {
      return reply.code(404).send({ message: `Drawing "${id}" not found` });
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
