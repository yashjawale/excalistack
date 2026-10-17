# Excalistack Web

The React single-page application for Excalistack. It provides the drawing library dashboard and an embedded Excalidraw editor, with folder organization, search, import/export, themes, and autosaving to the server API.

## Development

From the repository root, install dependencies and build the shared package first:

```shell
pnpm install
pnpm --filter @excalistack/shared build
pnpm dev:server
```

In another terminal, start Vite:

```shell
pnpm dev:web
```

Open the Vite URL (usually <http://localhost:5173>). Vite proxies `/api` requests to the server at `http://localhost:3000`.

## Scripts

Run from the repository root with `pnpm --filter @excalistack/web <script>`:

- `dev` — start the Vite development server
- `build` — create the production bundle in `dist/`
- `test` — run dashboard and editor lifecycle tests
- `typecheck` — run TypeScript without emitting files

The server can host the production bundle when built; see the repository [README](../../README.md) for full deployment and configuration instructions.
