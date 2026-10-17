import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DrawingStore } from "../store.js";
import { registerDrawingTools } from "./drawingTools.js";
import { registerFolderTools } from "./folderTools.js";
import { registerWidgetTools } from "./widgetTools.js";

/** Registers Excalistack's drawing, folder, and widget-specific tools. */
export function registerExcalistackTools(server: McpServer, store: DrawingStore): void {
  registerDrawingTools(server, store);
  registerFolderTools(server, store);
  registerWidgetTools(server, store);
}
