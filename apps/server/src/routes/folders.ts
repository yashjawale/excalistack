import type { FastifyInstance } from "fastify";
import {
  CreateFolderInputSchema,
  RenameFolderInputSchema,
} from "@excalistack/shared";
import type { DrawingStore } from "../store.js";

/**
 * Registers all `/api/folders` REST endpoints on the application.
 *
 * Folder names must be unique (case-insensitive); violations answer 409.
 * The seeded Drafts folder cannot be deleted — attempts answer 409.
 *
 * @param app - Fastify instance under construction.
 * @param store - Drawing persistence backend.
 */
export async function registerFolderRoutes(app: FastifyInstance, store: DrawingStore): Promise<void> {
  /**
   * Lists all folders with their drawing counts, oldest first.
   */
  app.get("/api/folders", async () => {
    return { folders: store.listFolders() };
  });

  /**
   * Creates a folder.
   */
  app.post("/api/folders", async (request, reply) => {
    const input = CreateFolderInputSchema.parse(request.body);
    if (isDuplicateFolderName(store, input.name)) {
      return reply.code(409).send({ message: `Folder "${input.name}" already exists` });
    }
    return reply.code(201).send(store.createFolder(input.name));
  });

  /**
   * Renames a folder.
   */
  app.patch("/api/folders/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = RenameFolderInputSchema.parse(request.body);
    const existing = store.listFolders().find((folder) => folder.id === id);
    if (!existing) {
      return reply.code(404).send({ message: `Folder "${id}" not found` });
    }
    if (
      input.name.toLowerCase() !== existing.name.toLowerCase() &&
      isDuplicateFolderName(store, input.name)
    ) {
      return reply.code(409).send({ message: `Folder "${input.name}" already exists` });
    }
    const folder = store.renameFolder(id, input.name);
    if (!folder) {
      return reply.code(404).send({ message: `Folder "${id}" not found` });
    }
    return folder;
  });

  /**
   * Deletes a folder; its drawings move to the Drafts folder.
   */
  app.delete("/api/folders/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    if (id === store.draftsFolderId()) {
      return reply.code(409).send({ message: "The Drafts folder cannot be deleted" });
    }
    if (!store.deleteFolder(id)) {
      return reply.code(404).send({ message: `Folder "${id}" not found` });
    }
    return reply.code(204).send();
  });
}

/**
 * Checks whether another folder already uses the given name,
 * case-insensitively.
 *
 * @param store - Persistence backend.
 * @param name - Candidate folder name.
 * @returns `true` when the name is already taken.
 */
function isDuplicateFolderName(store: DrawingStore, name: string): boolean {
  const lowered = name.toLowerCase();
  return store
    .listFolders()
    .some((folder) => folder.name.toLowerCase() === lowered);
}
