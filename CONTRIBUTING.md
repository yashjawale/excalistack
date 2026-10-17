# Contributing

Thanks for your interest in contributing to Excalistack. Bug reports, documentation improvements, and code changes are welcome. Feel free to open an issue with questions, ideas, or problems you encounter; you don't need to have a complete solution before asking.

## Development setup

Requirements: Node.js 22 or newer and pnpm (via Corepack).

```shell
pnpm install
pnpm dev:server
pnpm dev:web
```

Use <http://localhost:5173> for the web app; it proxies API requests to the server on port `3000`. See [AGENTS.md](AGENTS.md) for project structure, development details, and repository guidance.

## Before submitting changes

- Keep changes focused and follow existing patterns; prefer the simplest solution that addresses the issue.
- Add or update tests when behavior changes.
- Update relevant Markdown documentation alongside changes to behavior, APIs, configuration, or workflows.
- Run checks relevant to your changes. The main workspace checks are:

  ```shell
  pnpm typecheck
  pnpm test
  pnpm --filter @excalistack/web build
  ```

- Describe the motivation and behavior change in your pull request, and mention the checks you ran.

GitHub Actions reports separate `Static linting`, `Tests — web`, `Tests — server`, and `Build` checks on pull requests targeting `main` and on pushes to `main`. The static-linting check currently runs the workspace TypeScript typecheck; this repository does not configure a separate linter.

For security vulnerabilities, please follow [SECURITY.md](SECURITY.md) rather than opening a public issue.
