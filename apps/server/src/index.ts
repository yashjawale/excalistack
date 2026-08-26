import { loadConfig } from "./env.js";
import { openDatabase } from "./db.js";
import { SqliteDrawingStore } from "./store.js";
import { buildApp } from "./app.js";
import { mountMcp } from "./mcp/index.js";

/**
 * Process entry point: resolves configuration, opens storage, builds the
 * HTTP application and starts listening. Terminating signals trigger a
 * graceful shutdown of server and database handles.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const db = openDatabase(config.dataDir);
  const store = new SqliteDrawingStore(db);
  const app = await buildApp({
    store,
    webDistDir: config.webDistDir,
    logger: true,
  });

  if (config.mcpEnabled) {
    await mountMcp(app, { drawingStore: store, db });
    app.log.info(`MCP endpoint mounted at http://${config.host}:${config.port}/mcp`);
  }

  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    await app.close();
    db.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  await app.listen({ host: config.host, port: config.port });
}

main().catch((error: unknown) => {
  console.error("Fatal startup error:", error);
  process.exit(1);
});
