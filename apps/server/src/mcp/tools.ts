import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  CreateDrawingInputSchema,
  ExcalidrawDocumentSchema,
  pickExportAppState,
  toExcalidrawDocument,
} from "@excalistack/shared";
import type { DrawingStore } from "../store.js";

/** Default cap for list/search results returned to the model. */
const DEFAULT_LIMIT = 50;

/** Hard cap to prevent excessive tool output. */
const MAX_LIMIT = 200;

/**
 * Registers excalistack library tools on an MCP server that already has
 * the official excalidraw tools (read_me, create_view, etc.) mounted.
 * Together they give a chat client both interactive rendering
 * (via the official widget) and persistent library CRUD backed by
 * SQLite — the two planes the official server keeps separate.
 *
 * Previewing a stored drawing is a two-step flow the tool descriptions
 * guide the model through: `get_drawing` → `create_view(elements)`.
 *
 * @param server - MCP server instance to register tools on.
 * @param store - Drawing persistence backend.
 */
export function registerExcalistackTools(server: McpServer, store: DrawingStore): void {
  server.registerTool(
    "list_drawings",
    {
      description:
        "Lists stored drawings (summaries without scene content), most recently updated first. Use get_drawing to fetch the full scene, then create_view to render it in chat.",
      inputSchema: {
        folderId: z.string().optional().describe("Folder to scope the listing to"),
        limit: z.number().int().min(1).max(MAX_LIMIT).optional().describe(`Maximum drawings to return (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT})`),
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
        limit: z.number().int().min(1).max(MAX_LIMIT).optional().describe(`Maximum results (default ${DEFAULT_LIMIT})`),
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
        structuredContent: { id: drawing.id, name: drawing.name, folderId: drawing.folderId, document },
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
        id: z.string().optional().describe("Existing drawing id to update; omit to create a new drawing"),
        name: z.string().trim().min(1).max(200).optional().describe("Display name (required when creating)"),
        elements: z.string().describe("JSON array string of Excalidraw elements. Call read_me for format reference. Must be valid JSON."),
        folderId: z.string().optional().describe("Folder to place the drawing in; defaults to Drafts when creating"),
        appState: z.record(z.string(), z.unknown()).optional().describe("Persisted view/export state subset"),
        files: z.record(z.string(), z.unknown()).optional().describe("Embedded binary assets keyed by id"),
      },
    },
    async ({ id, name, elements, folderId, appState, files }): Promise<CallToolResult> => {
      let parsed: unknown[];
      try {
        parsed = JSON.parse(elements);
      } catch (error) {
        return { content: [{ type: "text", text: `Invalid JSON in elements: ${(error as Error).message}` }], isError: true };
      }
      if (!Array.isArray(parsed)) {
        return { content: [{ type: "text", text: "elements must be a JSON array" }], isError: true };
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
        return { content: [{ type: "text", text: `Invalid input: ${createInput.error.issues[0]?.message}` }], isError: true };
      }

      if (id) {
        const existing = store.get(id);
        if (!existing) {
          return { content: [{ type: "text", text: `Drawing "${id}" not found` }], isError: true };
        }
        if (folderId && !store.listFolders().some((f) => f.id === folderId)) {
          return { content: [{ type: "text", text: `Folder "${folderId}" not found` }], isError: true };
        }
        // Replace content via update, rename if name differs, move if folderId differs.
        const updated = store.update(id, { scene, files: createInput.data.files as never, thumbnail: null });
        let summary: unknown = updated;
        if (name && name !== existing.name) {
          summary = store.rename(id, name);
        }
        if (folderId && folderId !== existing.folderId) {
          summary = store.move(id, folderId);
        }
        const final = store.get(id)!;
        return {
          content: [{ type: "text", text: `Saved drawing "${final.name}" (${final.id}) in folder ${final.folderId}` }],
          structuredContent: { id: final.id, name: final.name, folderId: final.folderId },
        };
      }

      if (!name) {
        return { content: [{ type: "text", text: "name is required when creating a new drawing" }], isError: true };
      }
      if (folderId && !store.listFolders().some((f) => f.id === folderId)) {
        return { content: [{ type: "text", text: `Folder "${folderId}" not found` }], isError: true };
      }
      const created = store.create(createInput.data);
      return {
        content: [{ type: "text", text: `Created drawing "${created.name}" (${created.id}) in folder ${created.folderId}` }],
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

  // App-only tool: widget contexts (fullscreen edits) can call this to
  // persist the current scene directly into the library, mirroring the
  // upstream export_to_excalidraw pattern but writing to our store.
  registerAppTool(
    server,
    "save_to_excalistack",
    {
      description: "Saves the current scene into the excalistack library (Drafts by default). Called from the widget; models should use save_drawing instead.",
      inputSchema: {
        json: z.string().describe("Serialized .excalidraw document JSON or elements array string"),
        name: z.string().optional().describe("Display name for the saved drawing"),
        folderId: z.string().optional().describe("Target folder"),
      },
      _meta: { ui: { visibility: ["app"] } },
    },
    async ({ json, name, folderId }): Promise<CallToolResult> => {
      try {
        let elements: unknown[] = [];
        let appState: Record<string, unknown> = {};
        let files: Record<string, unknown> = {};
        const parsed = JSON.parse(json);
        if (Array.isArray(parsed)) {
          elements = parsed as unknown[];
        } else if (parsed?.type === "excalidraw" && Array.isArray(parsed.elements)) {
          const doc = ExcalidrawDocumentSchema.parse(parsed);
          elements = doc.elements as unknown[];
          appState = pickExportAppState(doc.appState as Record<string, unknown>);
          files = doc.files as Record<string, unknown>;
        } else if (parsed?.elements && Array.isArray(parsed.elements)) {
          elements = parsed.elements as unknown[];
          if (parsed.appState) appState = pickExportAppState(parsed.appState as Record<string, unknown>);
          if (parsed.files) files = parsed.files as Record<string, unknown>;
        } else {
          elements = Array.isArray(parsed) ? parsed : [];
        }
        const created = store.create({
          name: name?.trim() || "From chat",
          folderId,
          scene: { elements: elements as never, appState },
          files: files as never,
        });
        return {
          content: [{ type: "text", text: `Saved as "${created.name}" (${created.id}) — open at /d/${created.id}` }],
          structuredContent: { id: created.id, name: created.name, folderId: created.folderId },
        };
      } catch (error) {
        return { content: [{ type: "text", text: `Save failed: ${(error as Error).message}` }], isError: true };
      }
    },
  );
}
