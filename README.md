# Excalistack

Self-hosted [Excalidraw](https://excalidraw.com) manager. Unlike excalidraw.com — which keeps
your drawings in browser storage — Excalistack stores every drawing **on your server**, gives
you a dashboard of all of them, and round-trips native `.excalidraw` files.

## Features

- 💾 **Server-side persistence** — drawings live in SQLite on your server, not in a browser
- 🗂️ **Multiple drawings** with a thumbnail dashboard, rename, and delete
- 📁 **Nested folders** — organize drawings in a folder tree; drag drawings onto sidebar
  folders to move them, drop `.excalidraw` files onto the grid to import them
- 🔍 **Search** — global, case-insensitive match over drawing names and the text inside them
- 📥📤 **Import/export** — open `.excalidraw` files, download as `.excalidraw`, PNG, or SVG
- 🖱️ **Drag-and-drop import** onto the editor canvas
- 🌗 **Light/dark/auto themes** — optional auto mode follows the OS preference live
- 🪶 **Single lightweight image** — one container, one port, no external database
- 🤖 **MCP server** (opt-in) — official excalidraw MCP Apps (interactive preview in chat) plus library CRUD, at `/mcp`
- 🔌 **REST API** for scripted access (`/api/drawings`)
- 🛜 **Fully self-contained** — UI and editor fonts are served locally, no CDN

## Quick start

```shell
docker compose up -d
```

Then open <http://localhost:3000>.

Or without compose:

```shell
docker run -d \
  -p 3000:3000 \
  -v excalistack_data:/app/data \
  --name excalistack \
  excalistack:latest
```

## Development

Requires Node.js ≥ 22 and pnpm (via corepack).

```shell
pnpm install
pnpm build          # build shared → server → web
pnpm test           # vitest suite (server)
pnpm typecheck      # tsc --noEmit across the workspace

pnpm dev:server     # API on :3000 (serves the built SPA if present)
pnpm dev:web        # Vite dev server on :5173, proxies /api to :3000
```

Build once before starting the server: it imports the shared package from its
generated `dist` output. To run locally with MCP enabled:

```shell
pnpm build
MCP_ENABLED=true pnpm dev:server
```

The MCP endpoint is then available at <http://localhost:3000/mcp>. Override
`PORT` or `DATA_DIR` as needed, for example:

```shell
MCP_ENABLED=true PORT=3001 DATA_DIR=./data-mcp pnpm dev:server
```

## Configuration

Environment variables (all optional):

| Variable       | Default           | Description                          |
| -------------- | ----------------- | ------------------------------------ |
| `PORT`         | `3000`            | HTTP listen port                     |
| `HOST`         | `0.0.0.0`         | HTTP bind address                    |
| `DATA_DIR`     | `/app/data`       | Directory holding the SQLite file    |
| `WEB_DIST_DIR` | `../web/dist`     | Built SPA directory served at `/`    |
| `MCP_ENABLED`  | `false`           | When `true`, mounts the MCP endpoint at `/mcp` |

## Backup & restore

Everything lives in a single SQLite file:

```shell
# backup
docker cp excalistack:/app/data/excalistack.db ./backup/

# restore
docker cp ./backup/excalistack.db excalistack:/app/data/
```

## Import / export

- **Import** — dashboard *Import* button, drag-and-drop onto the editor, or scripted:
  ```shell
  curl -X POST http://localhost:3000/api/drawings \
    -H 'content-type: application/json' \
    --data-binary @my-drawing.excalidraw
  ```
- **Export** — the editor's built-in menu (`.excalidraw`, PNG, SVG), the card
  download action, or:
  ```shell
  curl -OJ http://localhost:3000/api/drawings/<id>/export
  ```

## REST API

| Method   | Path                        | Description                                  |
| -------- | --------------------------- | -------------------------------------------- |
| `GET`    | `/api/health`               | Liveness probe                               |
| `GET`    | `/api/drawings`             | List drawings; `?folderId=` scopes to folder, `?q=` searches names + scene text globally |
| `POST`   | `/api/drawings`             | Create; body = API form or raw `.excalidraw` |
| `GET`    | `/api/drawings/:id`         | Full drawing incl. scene and files           |
| `PUT`    | `/api/drawings/:id`         | Replace scene/files/thumbnail; requires `If-Unmodified-Since: <updatedAt>` to prevent stale autosaves |
| `PATCH`  | `/api/drawings/:id`         | Rename and/or move (`{name?, folderId?}`)    |
| `DELETE` | `/api/drawings/:id`         | Delete permanently                           |
| `GET`    | `/api/drawings/:id/export`  | Download as `.excalidraw`                    |
| `GET`    | `/api/folders`              | List folders with drawing counts             |
| `POST`   | `/api/folders`              | Create folder                                |
| `PATCH`  | `/api/folders/:id`          | Rename folder                                |
| `DELETE` | `/api/folders/:id`          | Delete folder (contents move to Drafts)      |

## MCP server

Opt-in via `MCP_ENABLED=true`. The image embeds the official
[`@mcp-demos/excalidraw-server`](https://github.com/excalidraw/excalidraw-mcp)
(MIT) for interactive **MCP Apps** previews, plus excalistack's library tools
— all on one endpoint, sharing the same SQLite database.

```shell
MCP_ENABLED=true docker compose up -d
# or
docker run -e MCP_ENABLED=true -p 3000:3000 -v excalistack_data:/app/data excalistack:latest
```

- Endpoint: `http://localhost:3000/mcp` — Streamable HTTP (stateless), no auth.
- Checkpoints (ephemeral working state) are stored in SQLite and survive restarts, unlike the upstream memory/tmp stores.

### Tools

| Tool | Kind | Notes |
|---|---|---|
| `read_me` | official | Element format cheat sheet — call once before `create_view` |
| `create_view` | official (App) | Streams an Excalidraw diagram into the chat (animated, camera-panned, fullscreen-editable); returns `checkpointId` |
| `export_to_excalidraw` | official (app-only) | Uploads current scene to `excalidraw.com` for a shareable link |
| `list_drawings` | excalistack | Summaries, optional `folderId` + `limit` |
| `search_drawings` | excalistack | Global name + scene-content search |
| `get_drawing` | excalistack | Full `.excalidraw` document JSON |
| `save_drawing` | excalistack | Create/update — `elements` is a JSON array string; to persist a `create_view`, `read_checkpoint` first if the user edited in fullscreen |
| `delete_drawing` | excalistack | Permanent delete |
| `list_folders` | excalistack | With drawing counts |

`save_to_excalistack` is also registered as an app-only widget tool mirroring `export_to_excalidraw` but writing into the library.

**Stored drawings preview in chat:** `get_drawing` → `create_view(elements)`. Example prompt: *"find my postgres failover diagram, show it, then save a copy to the Architecture folder"*.

### Client configuration

```jsonc
// Claude Code (streamable HTTP, recommended)
claude mcp add --transport http excalistack http://localhost:3000/mcp

// Claude Desktop — Settings → Connectors → Add custom connector
// Type: Remote • URL: http://localhost:3000/mcp

// Cursor — .cursor/mcp.json
{ "mcpServers": { "excalistack": { "url": "http://localhost:3000/mcp" } } }

// Codex CLI — add from the command line
codex mcp add excalistack --url http://localhost:3000/mcp

// OpenCode — add from the command line
opencode mcp add excalistack --url http://localhost:3000/mcp
```

For Codex, you can alternatively add this to `~/.codex/config.toml`:

```toml
[mcp_servers.excalistack]
url = "http://localhost:3000/mcp"
```

OpenCode can also be configured manually in `opencode.json`:

```jsonc
{
  "mcp": {
    "servers": {
      "excalistack": {
        "type": "remote",
        "url": "http://localhost:3000/mcp",
        "oauth": false
      }
    }
  }
}
```

Requires `MCP_ENABLED=true` on the server; use a reverse proxy or tailnet when exposing beyond localhost.

## Architecture

```
apps/web         Vite + React SPA — dashboard + embedded @excalidraw/excalidraw editor
apps/server      Fastify REST API, SQLite (better-sqlite3), static SPA hosting
                 └─ mcp/  official excalidraw MCP Apps + excalistack library tools (opt-in at /mcp)
packages/shared  zod schemas + domain types shared by both apps
vendor/excalidraw-mcp  widget build artifact (mcp-app.html) vendored from the official repo (MIT)
```

The server routes are thin wrappers over the `DrawingStore` interface
(`apps/server/src/store.ts`); swapping or adding backends (and future API surfaces such as an
MCP server) only requires another implementation of that interface.

## License

MIT
