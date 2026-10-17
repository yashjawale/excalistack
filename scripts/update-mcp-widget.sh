#!/usr/bin/env bash
set -euo pipefail

# Update these together when intentionally adopting a newer upstream release.
readonly VERSION="v0.3.2"
readonly ASSET_NAME="excalidraw-mcp-app.mcpb"
readonly ASSET_SHA256="2b494012b5fee5937f9f7b86f04a76cc4a91ec843ee3339b93e4e15e415274ff"
readonly DOWNLOAD_URL="https://github.com/excalidraw/excalidraw-mcp/releases/download/${VERSION}/${ASSET_NAME}"

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly VENDOR_DIR="${ROOT_DIR}/apps/server/src/mcp/vendor"
readonly TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TEMP_DIR}"' EXIT

archive="${TEMP_DIR}/${ASSET_NAME}"
widget="${TEMP_DIR}/mcp-app.html"

curl --fail --location --silent --show-error --retry 3 "${DOWNLOAD_URL}" --output "${archive}"

if command -v sha256sum >/dev/null 2>&1; then
  actual_sha256="$(sha256sum "${archive}" | cut -d ' ' -f 1)"
else
  actual_sha256="$(shasum -a 256 "${archive}" | cut -d ' ' -f 1)"
fi

if [[ "${actual_sha256}" != "${ASSET_SHA256}" ]]; then
  echo "Checksum mismatch for ${ASSET_NAME}: expected ${ASSET_SHA256}, got ${actual_sha256}" >&2
  exit 1
fi

unzip -p "${archive}" dist/mcp-app.html > "${widget}"
if [[ ! -s "${widget}" ]] || ! grep -qi '<!doctype html' "${widget}"; then
  echo "The pinned bundle did not contain a valid dist/mcp-app.html" >&2
  exit 1
fi

if command -v sha256sum >/dev/null 2>&1; then
  widget_sha256="$(sha256sum "${widget}" | cut -d ' ' -f 1)"
else
  widget_sha256="$(shasum -a 256 "${widget}" | cut -d ' ' -f 1)"
fi

install -m 0644 "${widget}" "${VENDOR_DIR}/mcp-app.html"
cat > "${VENDOR_DIR}/mcp-app-provenance.json" <<EOF
{
  "upstream": "https://github.com/excalidraw/excalidraw-mcp",
  "license": "MIT",
  "release": "${VERSION}",
  "asset": "${ASSET_NAME}",
  "assetSha256": "${ASSET_SHA256}",
  "widgetPath": "dist/mcp-app.html",
  "widgetSha256": "${widget_sha256}"
}
EOF

echo "Updated vendored widget from Excalidraw MCP ${VERSION} (SHA-256 ${widget_sha256})."
