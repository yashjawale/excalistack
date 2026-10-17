# `@excalistack/shared`

Shared TypeScript domain types, Zod schemas, and conversion helpers for the Excalistack web app, server, and API consumers. Drawing data follows the native Excalidraw document format so imported and exported scenes can round-trip.

## Contents

- Drawing, folder, scene, file, and summary types
- Zod schemas for API inputs and Excalidraw documents
- Helpers for export-state filtering and Excalidraw document conversion

The package entry point is `src/index.ts`; it re-exports the public API from `src/drawing.ts`. Consumers should import from `@excalistack/shared`.

## Development

From the repository root:

```shell
pnpm --filter @excalistack/shared typecheck
pnpm --filter @excalistack/shared build
```

The build emits JavaScript and declaration files to `dist/`, which workspace consumers use.
