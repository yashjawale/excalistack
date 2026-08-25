# Excalistack

Self-hosted [Excalidraw](https://excalidraw.com) manager. Unlike excalidraw.com — which keeps
your drawings in browser storage — Excalistack stores every drawing **on your server**, gives
you a dashboard of all of them, and round-trips native `.excalidraw` files.

## Features

- 💾 **Server-side persistence** — drawings live in SQLite on your server, not in a browser
- 🗂️ **Multiple drawings** with a thumbnail dashboard, rename, and delete
- 📥📤 **Import/export** — open `.excalidraw` files, download as `.excalidraw`, PNG, or SVG
- 🖱️ **Drag-and-drop import** onto the editor canvas
- 🪶 **Single lightweight image** — one container, one port, no external database
- 🔌 **REST API** for scripted access (`/api/drawings`)
- 🛜 **Fully self-contained** — UI and editor fonts are served locally, no CDN
- 🧩 **MCP-server-ready** — storage sits behind a clean `DrawingStore` interface

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

## Configuration

Environment variables (all optional):

| Variable       | Default           | Description                          |
| -------------- | ----------------- | ------------------------------------ |
| `PORT`         | `3000`            | HTTP listen port                     |
| `HOST`         | `0.0.0.0`         | HTTP bind address                    |
| `DATA_DIR`     | `/app/data`       | Directory holding the SQLite file    |
| `WEB_DIST_DIR` | `../web/dist`     | Built SPA directory served at `/`    |

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

| Method   | Path                        | Description                              |
| -------- | --------------------------- | ---------------------------------------- |
| `GET`    | `/api/health`               | Liveness probe                           |
| `GET`    | `/api/drawings`             | List drawings (summaries + thumbnails)   |
| `POST`   | `/api/drawings`             | Create; body = API form or raw `.excalidraw` |
| `GET`    | `/api/drawings/:id`         | Full drawing incl. scene and files       |
| `PUT`    | `/api/drawings/:id`         | Replace scene/files/thumbnail (autosave) |
| `PATCH`  | `/api/drawings/:id`         | Rename                                   |
| `DELETE` | `/api/drawings/:id`         | Delete permanently                       |
| `GET`    | `/api/drawings/:id/export`  | Download as `.excalidraw`                |

## Architecture

```
apps/web      Vite + React SPA — dashboard + embedded @excalidraw/excalidraw editor
apps/server   Fastify REST API, SQLite (better-sqlite3), static SPA hosting
packages/shared  zod schemas + domain types shared by both apps
```

The server routes are thin wrappers over the `DrawingStore` interface
(`apps/server/src/store.ts`); swapping or adding backends (and future API surfaces such as an
MCP server) only requires another implementation of that interface.

## License

MIT
