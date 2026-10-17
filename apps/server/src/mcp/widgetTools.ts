import { z } from "zod";
import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ExcalidrawDocumentSchema, pickExportAppState } from "@excalistack/shared";
import type { DrawingStore } from "../store.js";

export function registerWidgetTools(server: McpServer, store: DrawingStore): void {

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
