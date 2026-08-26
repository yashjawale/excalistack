import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Runtime configuration resolved from environment variables.
 */
export interface AppConfig {
  /** Network interface the HTTP server binds to. */
  host: string;
  /** TCP port the HTTP server listens on. */
  port: number;
  /** Directory containing the SQLite database file. */
  dataDir: string;
  /**
   * Filesystem path of the built web SPA, served at `/`. When `null`
   * (directory absent) only the JSON API is served.
   */
  webDistDir: string | null;
  /** Whether the MCP endpoint at `/mcp` is mounted. */
  mcpEnabled: boolean;
}

/** Default TCP port used when `PORT` is unset or invalid. */
export const DEFAULT_PORT = 3000;

/**
 * Resolves runtime configuration from environment variables using
 * production-sane defaults:
 *
 * - `HOST` — bind address (default `0.0.0.0`)
 * - `PORT` — listen port (default `3000`)
 * - `DATA_DIR` — database directory (default `./data`)
 * - `WEB_DIST_DIR` — built SPA directory (default `../../web/dist` relative
 *   to this package)
 * - `MCP_ENABLED` — when `true`, mounts the MCP endpoint at `/mcp`
 *   (default `false`, opt-in)
 *
 * @param env - Environment variable source; defaults to `process.env`.
 * @returns The resolved application configuration.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const port = Number.parseInt(env["PORT"] ?? "", 10);
  const dataDir = env["DATA_DIR"] ?? path.resolve("data");
  const webDistDir =
    env["WEB_DIST_DIR"] ?? path.resolve(import.meta.dirname, "../../web/dist");

  return {
    host: env["HOST"] ?? "0.0.0.0",
    port: Number.isFinite(port) && port > 0 ? port : DEFAULT_PORT,
    dataDir,
    webDistDir: existsSync(webDistDir) ? webDistDir : null,
    mcpEnabled: env["MCP_ENABLED"] === "true",
  };
}
