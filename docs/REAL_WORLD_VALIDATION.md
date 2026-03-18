# Real World Validation

## Repositories Checked

- `cli-ts-commander-starter` as a simple TypeScript app
- `pnpm-monorepo-template` as a real pnpm workspace monorepo
- `nodejs/examples` as a CommonJS and nested-package-heavy repository

## Fixes Validated

- Node built-in modules are no longer reported as external packages.
- Known script binaries now map to package names for:
  - `attw` -> `@arethetypeswrong/cli`
  - `biome` -> `@biomejs/biome`
  - `changeset` -> `@changesets/cli`
  - `markdownlint` -> `markdownlint-cli`
  - `tsc` -> `typescript`
- `pnpm-workspace.yaml` is now used for workspace discovery.
- Workspace packages can rely on root-level monorepo tool dependencies without being flagged as missing.
- Nested package directories are excluded from root-level scans in non-workspace repositories.

## Remaining Gaps

- `@types/node` is now treated as used when TypeScript files import Node built-ins, but broader ambient-type detection may still need future refinement.
- Example-collection repositories that intentionally keep real code only in nested packages may still need explicit workspace or config guidance, because the root package may have very few source files of its own.

## Beta Readiness Impact

This validation round removed the largest blockers from the first real-world repo pass:

- workspace discovery
- local workspace dependency handling
- built-in module filtering
- script binary alias handling

The main remaining beta-level follow-up is broader ambient type awareness beyond direct Node built-in import signals.
