# Vendored Excalidraw MCP widget

`mcp-app.html` is the prebuilt interactive widget served by Excalistack's MCP endpoint. It is checked in so production does not need to download or build the widget at runtime.

To intentionally update it, run `scripts/update-mcp-widget.sh` from any directory. The script downloads the pinned Excalidraw MCP `.mcpb` release, verifies its SHA-256 before extracting `dist/mcp-app.html`, and writes the release and extracted-file hashes to `mcp-app-provenance.json`.

The script pins the release version and bundle checksum at its top. Review the upstream release and its widget changes before changing either pin. Upstream project: <https://github.com/excalidraw/excalidraw-mcp> (MIT).
