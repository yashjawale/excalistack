# Excalistack Server

Fastify API and production SPA host for Excalistack. It persists drawings and nested folders in SQLite, serves the built web app when configured, and can optionally expose an MCP endpoint.

## Development

From the repository root:

```shell
pnpm install
pnpm --filter @excalistack/shared build
pnpm dev:server
```

The API listens on `http://localhost:3000` by default. Run `pnpm dev:web` separately to use the Vite app during development.

## API and configuration

- `GET /api/health` — health check
- `/api/drawings` — create, list, search, update, move, export, and delete drawings
- `/api/folders` — create, list, rename, move, and delete folders
- `/mcp` — optional MCP endpoint, enabled with `MCP_ENABLED=true`

Configuration variables (`PORT`, `HOST`, `DATA_DIR`, `WEB_DIST_DIR`, and `MCP_ENABLED`) and deployment instructions are documented in the repository [README](../../README.md).

## Scripts

Run from the repository root with `pnpm --filter @excalistack/server <script>`:

- `dev` — run the API in watch mode
- `build` — compile the server to `dist/`
- `start` — start the compiled server
- `typecheck` — run TypeScript without emitting files
- `test` — run the Vitest suite
