import path from "node:path";
import { existsSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { FastifyInstance } from "fastify";
import type BetterSqlite3 from "better-sqlite3";
import { registerTools } from "./vendor/excalidraw-server.js";
import { SqliteCheckpointStore } from "./checkpointStore.js";
import { registerExcalistackTools } from "./tools.js";
import type { DrawingStore } from "../store.js";

/** Options for {@link mountMcp}. */
export interface MountMcpOptions {
  /** Drawing persistence backend shared with the REST API. */
  drawingStore: DrawingStore;
  /** SQLite connection backing the checkpoint store. */
  db: BetterSqlite3.Database;
}

/**
 * Resolves the directory containing the vendored `mcp-app.html` widget.
 * Supports both `tsx` (source) and `node dist/` layouts, and the
 * production `/app/dist` layout produced by `pnpm deploy`.
 *
 * @returns Absolute path of the widget directory, or `null` when not found.
 */
function resolveVendorDistDir(): string | null {
  const candidates = [
    path.join(import.meta.dirname, "vendor"),
    path.join(import.meta.dirname, "../src/mcp/vendor"),
    path.join(process.cwd(), "src/mcp/vendor"),
    path.join(process.cwd(), "apps/server/src/mcp/vendor"),
  ];
  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, "mcp-app.html"))) {
      return candidate;
    }
  }
  return null;
}

/**
 * Mounts the MCP endpoint at `/mcp` on the Fastify app. Each HTTP
 * request gets a fresh stateless server+transport pair, matching the
 * official deployment (`sessionIdGenerator: undefined`). The endpoint
 * combines the official excalidraw tools (interactive preview via the
 * MCP Apps widget) with excalistack library CRUD backed by SQLite.
 *
 * @param app - Fastify instance.
 * @param options - Stores backing the MCP tools.
 */
export async function mountMcp(app: FastifyInstance, options: MountMcpOptions): Promise<void> {
  const distDir = resolveVendorDistDir();
  if (!distDir) {
    app.log.warn("MCP widget not found — /mcp will return 500 until built");
  }

  app.route({
    method: ["GET", "POST", "DELETE"],
    url: "/mcp",
    // Disable Fastify's automatic JSON serialization for this route — the
    // transport writes directly to the raw Node response.
    handler: async (request, reply) => {
      reply.hijack();

      const req = request.raw;
      const res = reply.raw;

      const server = new McpServer({ name: "Excalistack", version: "0.1.0" });
      const checkpointStore = new SqliteCheckpointStore(options.db);

      if (distDir) {
        await registerTools(server, distDir, checkpointStore);
      }
      registerExcalistackTools(server, options.drawingStore);

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });

      // Ensure transport/server are closed when the HTTP connection ends.
      res.on("close", () => {
        void transport.close();
        void server.close();
      });

      try {
        await server.connect(transport);
        // Fastify has already parsed JSON bodies; pass it through so the
        // transport doesn't re-parse the raw stream.
        const parsedBody = (request.body as unknown) ?? undefined;
        await transport.handleRequest(req, res, parsedBody);
      } catch (error) {
        app.log.error(error, "MCP request failed");
        if (!res.headersSent) {
          res.writeHead(500, { "content-type": "application/json" });
          res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32603, message: String(error) } }));
        }
      }
    },
  });
}
