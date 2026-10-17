import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  CreateDrawingInputSchema,
  ExcalidrawDocumentSchema,
  RenameDrawingInputSchema,
  UpdateDrawingInputSchema,
  pickExportAppState,
  toExcalidrawDocument,
} from "@excalistack/shared";
import type { DrawingStore } from "../store.js";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export function registerDrawingTools(server: McpServer, store: DrawingStore): void {
  server.registerTool(
    "list_drawings",
    {
      description:
        "Lists stored drawings (summaries without scene content), most recently updated first. Use get_drawing to fetch the full scene, then create_view to render it in chat.",
      inputSchema: {
        folderId: z.string().optional().describe("Folder to scope the listing to"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(MAX_LIMIT)
          .optional()
          .describe(`Maximum drawings to return (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT})`),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ folderId, limit }): Promise<CallToolResult> => {
      const drawings = store.list(folderId)?.slice(0, limit ?? DEFAULT_LIMIT);
      return {
        content: [{ type: "text", text: JSON.stringify(drawings, null, 2) }],
        structuredContent: { drawings },
      };
    },
  );

  server.registerTool(
    "search_drawings",
    {
      description:
        "Searches stored drawings globally by name and scene text content (case-insensitive). Returns matching summaries; use get_drawing + create_view to preview.",
      inputSchema: {
        q: z.string().min(1).describe("Search term"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(MAX_LIMIT)
          .optional()
          .describe(`Maximum results (default ${DEFAULT_LIMIT})`),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ q, limit }): Promise<CallToolResult> => {
      const drawings = store.list(undefined, q).slice(0, limit ?? DEFAULT_LIMIT);
      return {
        content: [{ type: "text", text: JSON.stringify(drawings, null, 2) }],
        structuredContent: { drawings, query: q },
      };
    },
  );

  server.registerTool(
    "get_drawing",
    {
      description:
        "Fetches one stored drawing including its full scene and files as a native .excalidraw document JSON string. To preview it in chat, pass the elements array to create_view.",
      inputSchema: { id: z.string().describe("Drawing identifier") },
      annotations: { readOnlyHint: true },
    },
    async ({ id }): Promise<CallToolResult> => {
      const drawing = store.get(id);
      if (!drawing) {
        return { content: [{ type: "text", text: `Drawing "${id}" not found` }], isError: true };
      }
      const document = toExcalidrawDocument(drawing);
      const json = JSON.stringify(document);
      return {
        content: [{ type: "text", text: json }],
        structuredContent: {
          id: drawing.id,
          name: drawing.name,
          folderId: drawing.folderId,
          document,
        },
      };
    },
  );

  server.registerTool(
    "save_drawing",
    {
      description: `Creates or updates a stored drawing in the library.

- To create: provide name, elements (JSON array string), and optional folderId/appState/files. Omit id.
- To update an existing drawing: provide its id plus the full replacement elements array.
- To persist a diagram shown via create_view: first read the checkpoint (if the user edited fullscreen, read_widget_context or read_checkpoint reflects it), then save those elements via this tool.
Never send binary blobs; elements is always a JSON string.`,
      inputSchema: {
        id: z
          .string()
          .optional()
          .describe("Existing drawing id to update; omit to create a new drawing"),
        name: z
          .string()
          .trim()
          .min(1)
          .max(200)
          .optional()
          .describe("Display name (required when creating)"),
        elements: z
          .string()
          .describe(
            "JSON array string of Excalidraw elements. Call read_me for format reference. Must be valid JSON.",
          ),
        folderId: z
          .string()
          .optional()
          .describe("Folder to place the drawing in; defaults to Drafts when creating"),
        appState: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Persisted view/export state subset"),
        files: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Embedded binary assets keyed by id"),
      },
    },
    async ({ id, name, elements, folderId, appState, files }): Promise<CallToolResult> => {
      let parsed: unknown[];
      try {
        parsed = JSON.parse(elements);
      } catch (error) {
        return {
          content: [
            { type: "text", text: `Invalid JSON in elements: ${(error as Error).message}` },
          ],
          isError: true,
        };
      }
      if (!Array.isArray(parsed)) {
        return {
          content: [{ type: "text", text: "elements must be a JSON array" }],
          isError: true,
        };
      }

      // Validate elements are at least objects with id/type where applicable — reuse shared schemas loosely.
      const scene = {
        elements: parsed as never,
        appState: appState ? pickExportAppState(appState as Record<string, unknown>) : {},
      };
      const createInput = CreateDrawingInputSchema.safeParse({
        name: name ?? (id ? undefined : "Untitled drawing"),
        folderId,
        scene,
        files: (files as never) ?? {},
      });
      if (!createInput.success) {
        return {
          content: [
            { type: "text", text: `Invalid input: ${createInput.error.issues[0]?.message}` },
          ],
          isError: true,
        };
      }

      if (id) {
        const existing = store.get(id);
        if (!existing) {
          return { content: [{ type: "text", text: `Drawing "${id}" not found` }], isError: true };
        }
        if (folderId && !store.listFolders().some((f) => f.id === folderId)) {
          return {
            content: [{ type: "text", text: `Folder "${folderId}" not found` }],
            isError: true,
          };
        }
        // Replace content via update, rename if name differs, move if folderId differs.
        const updated = store.update(id, {
          scene,
          files: createInput.data.files as never,
          thumbnail: null,
        });
        let summary: unknown = updated;
        if (name && name !== existing.name) {
          summary = store.rename(id, name);
        }
        if (folderId && folderId !== existing.folderId) {
          summary = store.move(id, folderId);
        }
        const final = store.get(id)!;
        return {
          content: [
            {
              type: "text",
              text: `Saved drawing "${final.name}" (${final.id}) in folder ${final.folderId}`,
            },
          ],
          structuredContent: { id: final.id, name: final.name, folderId: final.folderId },
        };
      }

      if (!name) {
        return {
          content: [{ type: "text", text: "name is required when creating a new drawing" }],
          isError: true,
        };
      }
      if (folderId && !store.listFolders().some((f) => f.id === folderId)) {
        return {
          content: [{ type: "text", text: `Folder "${folderId}" not found` }],
          isError: true,
        };
      }
      const created = store.create(createInput.data);
      return {
        content: [
          {
            type: "text",
            text: `Created drawing "${created.name}" (${created.id}) in folder ${created.folderId}`,
          },
        ],
        structuredContent: { id: created.id, name: created.name, folderId: created.folderId },
      };
    },
  );

  server.registerTool(
    "delete_drawing",
    {
      description: "Permanently deletes a stored drawing.",
      inputSchema: { id: z.string().describe("Drawing identifier") },
    },
    async ({ id }): Promise<CallToolResult> => {
      if (!store.delete(id)) {
        return { content: [{ type: "text", text: `Drawing "${id}" not found` }], isError: true };
      }
      return { content: [{ type: "text", text: `Deleted drawing ${id}` }] };
    },
  );
}
