<img src="apps/web/public/logo.svg" alt="Excalistack" width="72" />

# Excalistack

[![Static checks](https://github.com/yashjawale/excalistack/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/yashjawale/excalistack/actions/workflows/ci.yml)
[![Tests](https://github.com/yashjawale/excalistack/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/yashjawale/excalistack/actions/workflows/tests.yml)
[![Latest release](https://img.shields.io/github/v/release/yashjawale/excalistack)](https://github.com/yashjawale/excalistack/releases/latest)
![Node.js 22+](https://img.shields.io/badge/Node.js-%E2%89%A522-339933?logo=node.js&logoColor=white)

Self-hosted Excalidraw library for storing, organizing, and editing multiple drawings on your server. It keeps drawings in SQLite and supports native `.excalidraw` import and export.

## Features

- Multiple drawings with previews, search, and nested folders
- Server-side persistence in a single SQLite database
- Native `.excalidraw` import/export, plus PNG and SVG export
- Excalidraw editor with light, dark, and system themes
- Optional MCP integration for AI-assisted diagrams and library access

> Excalistack is **not a replacement for [Excalidraw+](https://plus.excalidraw.com/)**. It focuses on providing a self-hosted way to work with multiple drawings. For collaboration and more, check out Excalidraw+. If you find Excalidraw useful, please consider [supporting the original project](https://github.com/sponsors/excalidraw).

## Quick start

With Docker Compose (builds the image from this checkout):

```shell
docker compose up -d
```

Open <http://localhost:3000>.

To run the prebuilt image from GHCR:

```shell
docker pull ghcr.io/yashjawale/excalistack:latest
```

Use this Compose file to run it:

```yaml
services:
  excalistack:
    image: ghcr.io/yashjawale/excalistack:latest
    ports:
      - "3000:3000"
    volumes:
      - excalistack_data:/app/data
    restart: unless-stopped

volumes:
  excalistack_data:
```

Save it as `compose.yml` and run `docker compose up -d`. Alternatively, start it with Docker:

```shell
docker run -d \
  --name excalistack \
  -p 3000:3000 \
  -v excalistack_data:/app/data \
  ghcr.io/yashjawale/excalistack:latest
```

## Image configuration

All settings are optional. The defaults below are for the container image.

| Environment variable | Default       | Description                                                      |
| -------------------- | ------------- | ---------------------------------------------------------------- |
| `PORT`               | `3000`        | HTTP port inside the container.                                  |
| `HOST`               | `0.0.0.0`     | Address the server binds to inside the container.                |
| `DATA_DIR`           | `/app/data`   | Directory for `excalistack.db`; mount a persistent volume here.  |
| `WEB_DIST_DIR`       | `/app/public` | Directory containing the built web app. Usually leave unchanged. |
| `MCP_ENABLED`        | `false`       | Set to `true` to enable the MCP endpoint at `/mcp`.              |

For Docker Compose, edit the `environment` section in `docker-compose.yml` and run `docker compose up -d` to apply changes. With `docker run`, pass settings using `-e`, for example `-e MCP_ENABLED=true`. If using a host bind mount for `/app/data`, ensure it is writable by the container user (UID 1000).

## Backup and restore

The database is stored at `/app/data/excalistack.db`. For a consistent file-level backup, stop the container first so SQLite can finish checkpointing its WAL:

```shell
docker compose stop
docker cp excalistack:/app/data/excalistack.db ./excalistack.db
docker compose start
```

To restore, stop the container, copy the saved database back to `/app/data/excalistack.db`, then start it again:

```shell
docker compose stop
docker cp ./excalistack.db excalistack:/app/data/excalistack.db
docker compose start
```

## Import and export

Import `.excalidraw` files with the dashboard's **Import** button or by dropping files onto the dashboard or editor. Export from the editor as `.excalidraw`, PNG, or SVG; the drawing card's download action exports a native `.excalidraw` file.

For scripted imports, export endpoints, and the complete REST API reference, see [API documentation](docs/api.md). For example:

```shell
curl -X POST http://localhost:3000/api/drawings \
  -H 'content-type: application/json' \
  --data-binary @my-drawing.excalidraw
```

## MCP

MCP is optional and disabled by default. To enable it with Docker Compose, set `MCP_ENABLED=true` in `docker-compose.yml` and run `docker compose up -d`. With Docker, pass `-e MCP_ENABLED=true` when starting the container. Connect your MCP client to `http://localhost:3000/mcp` using Streamable HTTP.

### Connect a client

**Claude Code:**

```shell
claude mcp add --transport http excalistack http://localhost:3000/mcp
```

**Claude Desktop:** In **Settings → Connectors → Add custom connector**, choose **Remote** and enter `http://localhost:3000/mcp`.

**Codex CLI:**

```shell
codex mcp add excalistack --url http://localhost:3000/mcp
```

**OpenCode:**

```shell
opencode mcp add excalistack --global --url http://localhost:3000/mcp
```

The endpoint currently has no authentication; keep it local or protect it before exposing it to a network. For available tools and more MCP details, see the [MCP guide](docs/mcp.md). The vendored widget and its update process are covered in [MCP widget documentation](docs/mcp-widget.md).

## More information

Browse the [documentation index](docs/README.md), including [architecture](docs/architecture.md) and [REST API](docs/api.md) references.
