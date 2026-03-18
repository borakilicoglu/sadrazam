# CHANGELOG

## Unreleased

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
