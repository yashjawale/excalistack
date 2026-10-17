# Repository guidance

## Project layout

- `apps/web` is the React/Vite dashboard and Excalidraw editor.
- `apps/server` is the Fastify API, SQLite persistence, static SPA host, and optional MCP server.
- `packages/shared` contains shared domain types, validation schemas, and document helpers.
- `docs/` contains architecture, REST API, MCP, and MCP-widget documentation. The root `README.md` is intentionally concise and user-facing.

Use the existing workspace structure and conventions. Install dependencies with pnpm; the repository requires Node.js 22 or newer.

## Local development

From the repository root, install dependencies and start the server and web app in separate terminals:

```shell
pnpm install
pnpm dev:server
pnpm dev:web
```

- Web app: <http://localhost:5173> (Vite; proxies `/api` to the server).
- Server API: <http://localhost:3000>; health check: `/api/health`.
- Optional MCP endpoint: `http://localhost:3000/mcp` when `MCP_ENABLED=true`.

Use the Vite URL to access the app during development. `pnpm dev:server` builds the shared package before starting the API.

## Keep solutions simple

Prefer the simplest change that fully solves the request. Avoid unnecessary abstractions, dependencies, configuration options, or speculative generality. Follow existing patterns unless there is a clear reason to change them.

## Keep documentation in sync

When a change affects behavior, configuration, API contracts, setup, deployment, backups, imports/exports, MCP tools, or developer workflows, update the relevant Markdown documentation in the same change.

- Update the root README for user-facing quick start, image configuration, backup/restore, import/export, or brief MCP setup changes. Keep it concise; put detailed references in `docs/`.
- Update `docs/api.md`, `docs/mcp.md`, `docs/mcp-widget.md`, or `docs/architecture.md` when the corresponding API, MCP behavior, widget workflow, or system design changes.
- Update a package README when package-specific development steps or scripts change.
- Update `docs/README.md` when adding, removing, or renaming a documentation page.
- Prefer one authoritative detailed description and link to it rather than allowing duplicate instructions to drift.
- Verify local Markdown links and anchors when editing documentation.

## MCP widget vendor asset

`apps/server/src/mcp/vendor/mcp-app.html` is a generated upstream widget artifact. Do not edit it by hand. To update it, review the upstream release, update the pinned version and SHA-256 together in `scripts/update-mcp-widget.sh`, then run that script. It verifies the release bundle and refreshes `mcp-app-provenance.json`. Review the HTML and provenance diffs and update `docs/mcp-widget.md` if the process or requirements change.

## Checks

Run the relevant workspace checks after code changes:

```shell
pnpm typecheck
pnpm test
pnpm --filter @excalistack/web build
```

`pnpm test` runs both server and web test suites. For documentation-only changes, at minimum verify Markdown links and run `git diff --check`.
