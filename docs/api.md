# REST API

The Fastify server exposes the REST API under `/api`. Unless noted, request and response bodies are JSON. Invalid input returns `400`; unknown resources return `404`.

## Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Liveness check (`{ "ok": true }`). |
| `GET` | `/api/mcp/status` | Optional MCP status and request activity; available only when MCP is enabled. |
| `GET` | `/api/drawings` | List summaries, most recently updated first. |
| `POST` | `/api/drawings` | Create a drawing or import a native `.excalidraw` document. |
| `GET` | `/api/drawings/:id` | Fetch full drawing, including scene and embedded files. |
| `PUT` | `/api/drawings/:id` | Replace scene, files, and/or thumbnail. Requires an optimistic-concurrency header. |
| `PATCH` | `/api/drawings/:id` | Rename and/or move a drawing. |
| `DELETE` | `/api/drawings/:id` | Permanently delete a drawing. |
| `GET` | `/api/drawings/:id/export` | Download as a native `.excalidraw` document. |
| `GET` | `/api/folders` | List folders with drawing counts. |
| `POST` | `/api/folders` | Create a folder, optionally nested. |
| `PATCH` | `/api/folders/:id` | Rename and/or move a folder. |
| `DELETE` | `/api/folders/:id` | Delete a folder subtree; its drawings move to Drafts. |

## Drawings

### List and search

```http
GET /api/drawings?folderId=<folder-id>
GET /api/drawings?q=<term>
```

`folderId` scopes results to one folder. `q` performs a global, case-insensitive search across drawing names and scene text, and takes precedence over `folderId`.

### Create or import

Create a drawing using the API-native form:

```json
{
  "name": "Architecture sketch",
  "folderId": "optional-folder-id",
  "scene": { "elements": [], "appState": {} },
  "files": {}
}
```

`name`, `scene`, `files`, and `thumbnail` are optional; new drawings default to the Drafts folder. Alternatively, send a native Excalidraw document directly:

```shell
curl -X POST http://localhost:3000/api/drawings \
  -H 'content-type: application/json' \
  --data-binary @my-drawing.excalidraw
```

The document must have `type: "excalidraw"`. To choose a folder for this import, pass `?folderId=<folder-id>`.

### Update with concurrency protection

`PUT /api/drawings/:id` replaces whichever of `scene`, `files`, or `thumbnail` are provided. Include `If-Unmodified-Since` with the drawing's `updatedAt` value from the last read:

```shell
UPDATED_AT=1730000000000 # replace with updatedAt from the latest GET response
curl -X PUT http://localhost:3000/api/drawings/<id> \
  -H 'content-type: application/json' \
  -H "If-Unmodified-Since: ${UPDATED_AT}" \
  -d '{"scene":{"elements":[],"appState":{}},"files":{}}'
```

The server returns `428` if the header is missing and `409` if the drawing changed since it was read. Fetch the latest drawing before retrying; do not blindly overwrite a concurrent edit.

`PATCH /api/drawings/:id` accepts `{ "name": "New name" }`, `{ "folderId": "folder-id" }`, or both.

### Export

```shell
curl -OJ http://localhost:3000/api/drawings/<id>/export
```

The response is a downloadable native `.excalidraw` JSON document.

## Folders

`POST /api/folders` accepts `{ "name": "Projects", "parentId": "optional-parent-id" }`. Omit `parentId` or set it to `null` to create a root folder. `PATCH /api/folders/:id` accepts `name` and/or `parentId`; use `parentId: null` to move a folder to the root.

Folder names must be unique among siblings, ignoring case. Drafts cannot be moved or deleted, and a folder cannot be moved into its own subtree. Deleting a folder deletes its descendants and moves their drawings to Drafts.

## Further reading

- [MCP tools and client setup](mcp.md)
- [Architecture and persistence](architecture.md)
- [Image configuration and backup](../README.md)
