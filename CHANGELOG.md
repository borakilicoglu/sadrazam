# CHANGELOG

## Unreleased

### Added
- `namespace-members` findings for unused TypeScript namespace export members in reachable local modules
- `--include`, `--exclude`, and `--explain` support for namespace member findings
- Node.js `>=20.19.0` package engine metadata
- `compact-json` reporter for editor and extension integrations
- VS Code extension scaffold with a manual workspace scan command
- VS Code extension `scanOnOpen`, `scanOnSave`, and output channel support

## v0.1.19

### Added
- Dockerfile and Docker Compose plugin scanning for package usage and entry files from container commands

## v0.1.18

### Added
- Built-in config package reference plugins for Babel, PostCSS, Commitlint, lint-staged, and Husky hooks

## v0.1.17

### Added
- Lerna and Rush workspace discovery for monorepos without `package.json#workspaces`
- Built-in monorepo tool plugins for pnpm workspace, Turbo, Nx, Lerna, and Rush config files
- Nx plugin package usage detection from `nx.json` plugin entries

## v0.1.16

### Added
- Azure Pipelines plugin scanning for `azure-pipelines.yml`, `azure-pipelines.yaml`, and `.azure-pipelines/*.{yml,yaml}` command blocks
- Bitbucket Pipelines plugin scanning for `bitbucket-pipelines.yml` and `bitbucket-pipelines.yaml` script command blocks

## v0.1.15

### Added
- GitLab CI plugin scanning for `.gitlab-ci.yml` and `.gitlab-ci.yaml` command blocks
- CircleCI plugin scanning for `.circleci/config.yml` and `.circleci/config.yaml` `run` steps
- Google Sans Flex font styling for the documentation site

## v0.1.14

### Added
- GitHub Actions plugin scanning for workflow and local action YAML files
- Workflow `run` command analysis with step-level `working-directory` support
- Local node action `runs.pre`, `runs.main`, and `runs.post` entry discovery

## v0.1.13

### Added
- `duplicate-exports` findings for reachable files that export alias-style duplicates of the same local symbol
- `--include`, `--exclude`, and `--explain` support for duplicate export findings
- `@alias` JSDoc suppression for intentional duplicate export aliases

## v0.1.12

### Added
- Registry-based built-in plugin analysis for common frontend and test tools, including Astro, Cypress, ESLint, Jest, Next, Playwright, Prettier, Rollup, Storybook, SvelteKit, Tailwind, TypeScript, Vite, Vitest, and webpack
- `plugins.<name>` config overrides to force-enable, disable, or customize plugin config and entry files
- Plugin contribution details in debug output and structured reports

### Changed
- Expanded script command package detection for Playwright and SvelteKit
- Bumped the scan cache version for the new plugin debug metadata

## v0.1.11

### Added
- `--max-show-issues <count>` to limit displayed finding items in text, markdown, JSON, and TOON output without changing scan results or exit behavior
- `unresolved-imports` findings for definitely unresolved local-style imports, including relative imports, absolute path imports, `package.json#imports`, and configured local aliases

### Changed
- JSON and TOON findings include `totalItems` and `omittedItems` metadata when `--max-show-issues` truncates displayed items
- Documentation site now uses Astro Starlight instead of VitePress

## v0.1.10

### Added
- OXC-backed source parsing for JavaScript and TypeScript import/export analysis, with regex fallback for sources OXC cannot parse
- OXC-backed local resolution for TypeScript source extension aliases and `package.json#imports` specifiers
- Parser backend counts in workspace summaries so JSON and TOON consumers can see OXC versus fallback coverage

### Fixed
- Ignore import, require, and export syntax that appears inside comments or string literals
- Treat package import specifiers resolved to local source files as local imports instead of missing packages

## v0.1.9

### Added
- `sadrazam init` for interactive `sadrazam.json` creation, including piped input support for automated setup
- `--explain <type>` output for supported finding types in text, JSON, and TOON reports
- TypeScript `compilerOptions.paths` alias resolution for local import reachability

### Changed
- `--fix` can now add missing package declarations to `devDependencies` with a `"*"` placeholder version, while continuing to remove deterministic unused package declarations
- Improved `pnpm-workspace.yaml` parsing for quoted workspace patterns, inline comments, and additional top-level keys
- Expanded script command package detection for common build, test, lint, release, and utility tools

## v0.1.8

### Added
- `toon` reporter for agent-friendly structured output

### Changed
- Updated CLI help, README, and docs examples to include TOON output support
- Expanded CLI coverage for the new TOON reporter

## v0.1.7

### Added
- GitHub Sponsors metadata through `.github/FUNDING.yml`
- A local `CONTRIBUTING.md` guide linked from the README resources section

### Changed
- Simplified the README hero and intro copy
- Reorganized README sections around overview, quick start, AI mode, and resources
- Polished CLI help text and examples without changing command behavior
- Reordered badges and added a license badge to the README header

## v0.1.6

### Added
- `markdown` reporter for human-readable markdown output
- `sarif` reporter for CI and code scanning integrations

### Changed
- Expanded CLI test coverage for the new reporter formats
- Refreshed README and docs feature overview pages

## v0.1.5

### Added
- `--format` support for package.json files modified by `--fix`

### Changed
- Normalize package.json key ordering and section sorting after safe auto-fixes
- Report formatted files in text and JSON auto-fix output

## v0.1.4

### Added
- Catalog support for named package and entry-file groups in Sadrazam config

### Changed
- Resolve catalog references in rules and plugin inputs
- Report unused catalog entries as configuration hints

## v0.1.3

### Added
- JSDoc export ignore tags for `unused-exports` findings
- Config support for `jsdocTags.ignoreExports`

### Changed
- Ignore explicitly tagged exports before reporting unused export findings

## v0.1.2

### Added
- Safe auto-fix support with `--fix` for unused `dependencies` and `devDependencies`

### Changed
- Re-run scans after auto-fix and report applied package.json removals in text and JSON reporters

## v0.1.1

### Added
- Export trace support with `--trace-export` for reachable local modules
- Memory reporting with `--memory` in text and JSON reporters
- Watch mode with `--watch` for live reruns on project changes

### Changed
- Watch mode now reuses scan caching internally and disables repeated AI summary calls
- Added CLI and smoke coverage for export trace, memory reporting, and watch behavior

## v0.1.0

### Added
- Stable release for dependency, file, and export hygiene analysis
- Unused file detection based on reachable local source graphs
- Unused export detection for reachable local modules
- Cache and performance reporting modes
- Framework source scanning for Svelte, Vue, MDX, and Astro

### Changed
- Improved monorepo and real-world scan behavior with lower false-positive noise
- Expanded docs, smoke coverage, and release workflows for stable usage

## v0.1.0-beta.6

### Added
- Unused export detection for reachable local modules

### Changed
- Added parser, CLI coverage, and smoke fixtures for export-level analysis

## v0.1.0-beta.5

### Added
- Unused file detection based on package entries, script entries, and local import reachability

### Changed
- Added fixture, CLI, and smoke coverage for unreachable source files

## v0.1.0-beta.4

### Added
- Source scanning for Svelte, Vue, MDX, and Astro files

### Changed
- Expanded fixture and smoke coverage for framework-style source files

## v0.1.0-beta.3

### Added
- Workspace scan result caching with `--cache` and config support

### Changed
- Added cache hit or miss visibility to text and JSON reporters

## v0.1.0-beta.2

### Added
- Configuration hints for stale allowlist entries in Sadrazam config
- Performance reporting with per-workspace and total timing output

### Changed
- Added `--performance` CLI flag and JSON reporter performance output

## v0.1.0-beta.1

### Changed
- Promoted Sadrazam to the first beta release after real-world validation across TypeScript, monorepo, and CommonJS projects
- Switched npm publishing to trusted publishing through GitHub Actions

### Fixed
- Filtered Node built-in modules from dependency findings
- Improved pnpm workspace discovery and local workspace package resolution
- Added script binary aliases for common tool commands
- Reduced false positives for `@types/node` in TypeScript projects that import Node built-ins

### Added
- Repository contribution and release rules in `AGENTS.md`

## v0.1.0-alpha.8

### Changed
- Republished Sadrazam metadata and README to refresh npm package page state

## v0.1.0-alpha.7

### Changed
- Renamed the CLI, config surface, docs, and package metadata from `sarraf` to `sadrazam`
- Updated repository metadata to the `borakilicoglu/sadrazam` GitHub repository

## v0.1.0-alpha.6

### Changed
- Switched the npm package name from `vezir` to `sadrazam` for publish testing

## v0.1.0-alpha.5

### Changed
- Switched the npm package name from `mizan` to `vezir` for publish testing

## v0.1.0-alpha.4

### Changed
- Switched the npm package name from `kantar` to `mizan` for publish testing

## v0.1.0-alpha.3

### Changed
- Switched the npm package name from earlier publish test names to `kantar`

## v0.1.0-alpha.2

### Added
- GitHub Actions workflows for docs validation and tagged npm publishing
- Vitest-based test runner setup
- MIT license file and package publish metadata cleanup

### Changed
- Limited published package contents to production artifacts and top-level docs
- Strengthened alpha release preparation flow for automated npm publishing

### Fixed
- Removed accidental token-like content from the publish workflow before release

## v0.1.0-alpha.1

### Added
- Workspace-aware scanning and workspace filtering
- Text and JSON reporters
- Script parser support for `package.json` scripts
- Dependency trace output
- Source mapping from build output back to source files
- Config loading from `sadrazam.json` and `package.json#sadrazam`
- Ignore and allowlist controls for findings
- AI-powered dependency summaries for OpenAI, Anthropic, and Gemini
- Fixture tests and smoke test scenarios

### Changed
- Improved CLI help output and quick-start documentation
- Hardened CommonJS and hybrid import parsing
- Added debug visibility for config source and active rule filters

### Fixed
- AI failures no longer break the main dependency scan report
- Script-based package usage now reduces false positives for unused tooling packages
