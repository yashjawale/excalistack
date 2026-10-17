import type { FastifyInstance } from "fastify";
import { CreateFolderInputSchema, RenameFolderInputSchema } from "@excalistack/shared";
import type { FolderSummary } from "@excalistack/shared";
import type { DrawingStore } from "../store.js";

/**
 * Registers all `/api/folders` REST endpoints on the application.
 *
 * Folder names must be unique among **siblings** (case-insensitive);
 * violations answer 409. The seeded Drafts folder is pinned to the root,
 * cannot be deleted (409) and cannot be moved (409). Re-parenting a
 * folder into its own subtree is rejected with 409.
 *
 * @param app - Fastify instance under construction.
 * @param store - Drawing persistence backend.
 */
export async function registerFolderRoutes(
  app: FastifyInstance,
  store: DrawingStore,
): Promise<void> {
  /**
   * Lists all folders (flat, with `parentId`), oldest first.
   */
  app.get("/api/folders", async () => {
    return { folders: store.listFolders() };
  });

  /**
   * Creates a folder, optionally nested under a parent.
   */
  app.post("/api/folders", async (request, reply) => {
    const input = CreateFolderInputSchema.parse(request.body);
    if (input.parentId && !folderExists(store, input.parentId)) {
      return reply.code(400).send({ message: `Folder "${input.parentId}" not found` });
    }
    if (isDuplicateSiblingName(store, input.name, input.parentId ?? null)) {
      return reply.code(409).send({ message: `Folder "${input.name}" already exists there` });
    }
    return reply.code(201).send(store.createFolder(input.name, input.parentId ?? undefined));
  });

  /**
   * Renames and/or re-parents a folder. `parentId: null` moves it to the
   * root level.
   */
  app.patch("/api/folders/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = RenameFolderInputSchema.parse(request.body);

    const folders = store.listFolders();
    const existing = folders.find((folder) => folder.id === id);
    if (!existing) {
      return reply.code(404).send({ message: `Folder "${id}" not found` });
    }

    const moving = input.parentId !== undefined;
    const targetParentId = moving ? (input.parentId ?? null) : existing.parentId;

    if (moving) {
      if (id === store.draftsFolderId()) {
        return reply.code(409).send({ message: "The Drafts folder cannot be moved" });
      }
      if (input.parentId) {
        if (!folders.some((folder) => folder.id === input.parentId)) {
          return reply.code(400).send({ message: `Folder "${input.parentId}" not found` });
        }
        if (collectDescendantIds(folders, id).has(input.parentId)) {
          return reply.code(409).send({ message: "Cannot move a folder into its own subtree" });
        }
      }
    }

    if (input.name && isDuplicateSiblingName(store, input.name, targetParentId, id)) {
      return reply.code(409).send({ message: `Folder "${input.name}" already exists there` });
    }

    let folder = existing;
    if (input.name) {
      const renamed = store.renameFolder(id, input.name);
      if (!renamed) {
        return reply.code(404).send({ message: `Folder "${id}" not found` });
      }
      folder = renamed;
    }
    if (moving) {
      const moved = store.moveFolder(id, targetParentId);
      if (!moved) {
        return reply.code(404).send({ message: `Folder "${id}" not found` });
      }
      folder = moved;
    }
    return folder;
  });

  /**
   * Deletes a folder, its whole subfolder tree, and moves all their
   * drawings to the Drafts folder.
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
 * Checks whether a folder with the given identifier exists.
 *
 * @param store - Persistence backend.
 * @param folderId - Folder identifier to verify.
 * @returns `true` when the folder exists.
 */
function folderExists(store: DrawingStore, folderId: string): boolean {
  return store.listFolders().some((folder) => folder.id === folderId);
}

/**
 * Checks whether a sibling folder (same parent, case-insensitive)
 * already uses the given name.
 *
 * @param store - Persistence backend.
 * @param name - Candidate folder name.
 * @param parentId - Parent under which the name would live (`null` = root).
 * @param excludeId - Folder id to exclude from the check (rename case).
 * @returns `true` when the name is already taken by a sibling.
 */
function isDuplicateSiblingName(
  store: DrawingStore,
  name: string,
  parentId: string | null,
  excludeId?: string,
): boolean {
  const lowered = name.toLowerCase();
  return store
    .listFolders()
    .some(
      (folder) =>
        folder.id !== excludeId &&
        folder.parentId === parentId &&
        folder.name.toLowerCase() === lowered,
    );
}

/**
 * Collects the ids of all folders in the subtree rooted at the given
 * folder (excluding the root itself), walking the flat folder list.
 *
 * @param folders - Flat folder list.
 * @param rootId - Subtree root whose descendants to collect.
 * @returns Set of descendant folder ids.
 */
function collectDescendantIds(folders: FolderSummary[], rootId: string): Set<string> {
  const childrenByParent = new Map<string, string[]>();
  for (const folder of folders) {
    if (folder.parentId) {
      const siblings = childrenByParent.get(folder.parentId) ?? [];
      siblings.push(folder.id);
      childrenByParent.set(folder.parentId, siblings);
    }
  }

  const descendants = new Set<string>();
  const queue = childrenByParent.get(rootId) ?? [];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]!;
    if (!descendants.has(current)) {
      descendants.add(current);
      queue.push(...(childrenByParent.get(current) ?? []));
    }
  }
  return descendants;
}
