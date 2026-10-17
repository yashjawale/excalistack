import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { CreateFolderInputSchema, RenameFolderInputSchema } from "@excalistack/shared";
import type { DrawingStore } from "../store.js";

export function registerFolderTools(server: McpServer, store: DrawingStore): void {

  server.registerTool(
    "list_folders",
    {
      description: "Lists all folders with their drawing counts, oldest first (Drafts first).",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async (): Promise<CallToolResult> => {
      const folders = store.listFolders();
      return {
        content: [{ type: "text", text: JSON.stringify(folders, null, 2) }],
        structuredContent: { folders },
      };
    },
  );

  server.registerTool(
    "create_folder",
    {
      description: "Creates a folder, optionally nested under a parent folder. Folder names must be unique among siblings.",
      inputSchema: {
        name: z.string().trim().min(1).max(100).describe("Folder name"),
        parentId: z.string().nullable().optional().describe("Parent folder id; omit or use null for a root folder"),
      },
    },
    async ({ name, parentId }): Promise<CallToolResult> => {
      const parsed = CreateFolderInputSchema.safeParse({ name, parentId });
      if (!parsed.success) {
        return { content: [{ type: "text", text: `Invalid input: ${parsed.error.issues[0]?.message}` }], isError: true };
      }
      const input = parsed.data;
      const folders = store.listFolders();
      if (input.parentId && !folders.some((folder) => folder.id === input.parentId)) {
        return { content: [{ type: "text", text: `Folder "${input.parentId}" not found` }], isError: true };
      }
      if (folders.some((folder) => folder.parentId === (input.parentId ?? null) && folder.name.toLowerCase() === input.name.toLowerCase())) {
        return { content: [{ type: "text", text: `Folder "${input.name}" already exists there` }], isError: true };
      }
      const folder = store.createFolder(input.name, input.parentId ?? undefined);
      return {
        content: [{ type: "text", text: `Created folder "${folder.name}" (${folder.id})` }],
        structuredContent: { folder },
      };
    },
  );

  server.registerTool(
    "update_folder",
    {
      description: "Renames and/or moves a folder. Use parentId null to move it to the root. Drafts cannot be moved; a folder cannot be moved into its own subtree.",
      inputSchema: {
        id: z.string().describe("Folder identifier"),
        name: z.string().trim().min(1).max(100).optional().describe("New folder name"),
        parentId: z.string().nullable().optional().describe("New parent folder id; null moves to root"),
      },
    },
    async ({ id, name, parentId }): Promise<CallToolResult> => {
      const parsed = RenameFolderInputSchema.safeParse({ name, parentId });
      if (!parsed.success) {
        return { content: [{ type: "text", text: `Invalid input: ${parsed.error.issues[0]?.message}` }], isError: true };
      }
      name = parsed.data.name;
      parentId = parsed.data.parentId;
      const folders = store.listFolders();
      const existing = folders.find((folder) => folder.id === id);
      if (!existing) {
        return { content: [{ type: "text", text: `Folder "${id}" not found` }], isError: true };
      }
      const moving = parentId !== undefined;
      const targetParentId = moving ? parentId : existing.parentId;
      if (moving && id === store.draftsFolderId()) {
        return { content: [{ type: "text", text: "The Drafts folder cannot be moved" }], isError: true };
      }
      if (parentId && !folders.some((folder) => folder.id === parentId)) {
        return { content: [{ type: "text", text: `Folder "${parentId}" not found` }], isError: true };
      }
      if (parentId && isFolderDescendant(folders, id, parentId)) {
        return { content: [{ type: "text", text: "Cannot move a folder into its own subtree" }], isError: true };
      }
      if (name && folders.some((folder) =>
        folder.id !== id && folder.parentId === targetParentId && folder.name.toLowerCase() === name.toLowerCase()
      )) {
        return { content: [{ type: "text", text: `Folder "${name}" already exists there` }], isError: true };
      }
      let folder = existing;
      if (name) folder = store.renameFolder(id, name)!;
      if (moving) folder = store.moveFolder(id, targetParentId ?? null)!;
      return {
        content: [{ type: "text", text: `Updated folder "${folder.name}" (${folder.id})` }],
        structuredContent: { folder },
      };
    },
  );

  server.registerTool(
    "delete_folder",
    {
      description: "Deletes a folder and its entire subfolder tree, moving all drawings in that tree to Drafts. The Drafts folder cannot be deleted.",
      inputSchema: { id: z.string().describe("Folder identifier") },
    },
    async ({ id }): Promise<CallToolResult> => {
      if (id === store.draftsFolderId()) {
        return { content: [{ type: "text", text: "The Drafts folder cannot be deleted" }], isError: true };
      }
      if (!store.deleteFolder(id)) {
        return { content: [{ type: "text", text: `Folder "${id}" not found` }], isError: true };
      }
      return { content: [{ type: "text", text: `Deleted folder ${id} and its subfolders; drawings were moved to Drafts` }] };
    },
  );

}



/** Checks whether candidateId is nested below rootId in a flat folder list. */
function isFolderDescendant(
  folders: ReturnType<DrawingStore["listFolders"]>,
  rootId: string,
  candidateId: string,
): boolean {
  const byParent = new Map<string, string[]>();
  for (const folder of folders) {
    if (folder.parentId) byParent.set(folder.parentId, [...(byParent.get(folder.parentId) ?? []), folder.id]);
  }
  const pending = [...(byParent.get(rootId) ?? [])];
  for (let index = 0; index < pending.length; index += 1) {
    const id = pending[index]!;
    if (id === candidateId) return true;
    pending.push(...(byParent.get(id) ?? []));
  }
  return false;
}
