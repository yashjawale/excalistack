# MCP server

Excalistack optionally exposes its library and Excalidraw's interactive diagram tools over the Model Context Protocol (MCP). The server is disabled by default.

## Enable and connect

Enable MCP when starting the server:

```shell
MCP_ENABLED=true pnpm dev:server
```

For Docker Compose, set `MCP_ENABLED=true` in the server environment and restart the service. The endpoint is `http://localhost:3000/mcp` by default. Configure a Streamable HTTP/remote MCP connection in the client; examples for Claude Code, Claude Desktop, Cursor, Codex, and OpenCode are in the root README's [Connect a client](../README.md#connect-a-client) section.

The endpoint uses stateless Streamable HTTP and does not require session affinity. `/api/mcp/status` reports whether MCP is enabled and basic request activity.

## Tools

### Excalidraw tools

These are vendored from the official Excalidraw MCP server:

| Tool | Purpose |
| --- | --- |
| `read_me` | Element format reference and diagramming guidance. Call before drawing. |
| `create_view` | Render an interactive diagram in the MCP client; returns a checkpoint ID. |
| `export_to_excalidraw` | Upload the current scene to Excalidraw for a shareable link. |
| `save_checkpoint`, `read_checkpoint` | Persist and retrieve the scene state associated with an interactive view. |

### Excalistack library tools

| Tool | Purpose |
| --- | --- |
| `list_drawings`, `search_drawings` | Browse summaries or search names and scene text. |
| `get_drawing` | Fetch a complete native Excalidraw document. |
| `save_drawing` | Create a drawing or replace an existing drawing's content. |
| `delete_drawing` | Permanently delete a drawing. |
| `list_folders`, `create_folder`, `update_folder`, `delete_folder` | Browse and manage the nested folder tree. |
| `save_to_excalistack` | Widget-only tool that saves the current widget scene into the library. |

To show a saved drawing in chat, use `get_drawing`, then pass its document elements to `create_view`. To save a diagram created in a view, read its latest checkpoint first—especially if the user edited it in fullscreen—then call `save_drawing` with the full elements array. `elements` is a JSON array string for that tool.

## Persistence and limits

MCP library tools use the same `DrawingStore` and SQLite database as the REST API and web app. Checkpoints also persist in SQLite across server restarts. The checkpoint store accepts up to 5 MB per checkpoint and prunes the oldest entries when more than 100 are retained.

## Security

The MCP endpoint currently has **no authentication**. Do not expose it directly to an untrusted network. Keep it on localhost or protect it with a trusted reverse proxy, VPN, or tailnet and suitable access controls. The `MCP_ENABLED` setting controls whether the endpoint is mounted; it is not an access-control mechanism.

For the widget asset's provenance, update process, and external resource requirements, see [MCP widget](mcp-widget.md).
