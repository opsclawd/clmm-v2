# Setup And Worktrees

## Prerequisites

- Node.js 20+
- pnpm 9+

## First-Time Bootstrap

From the repo root:

```bash
pnpm bootstrap
```

This command is the canonical setup path for both humans and coding agents. It installs dependencies with the lockfile and builds workspace outputs.

## Fresh Worktrees

New worktrees frequently start without installed dependencies or generated `dist/` outputs. If commands fail in a fresh worktree, do this first:

```bash
pnpm bootstrap
```

If you want to run the steps manually:

```bash
pnpm install --frozen-lockfile
pnpm build
```

Use the manual path only when you intentionally want to separate install from build.

## Daily Commands

```bash
pnpm dev
pnpm dev:api
pnpm dev:worker
pnpm typecheck
pnpm lint
pnpm boundaries
pnpm test
```

## Verification Before Completion

Run the narrowest checks that cover your change. For broad or cross-package changes, run the full repo checks:

```bash
pnpm build
pnpm typecheck
pnpm lint
pnpm boundaries
pnpm test
```

## Notes For Agents

- Do not assume a worktree is bootstrapped.
- Missing `node_modules`, missing `dist/`, or unresolved workspace imports are a signal to run `pnpm bootstrap`.
- Prefer the single bootstrap command over ad hoc recovery steps so sessions behave consistently.
