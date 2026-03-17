# CHANGELOG

## Unreleased

### Added
- Repository contribution and release rules in `AGENTS.md`

## v0.1.0-alpha.4

### Changed
- Switched the npm package name from `kantar` to `mizan` for publish testing

## v0.1.0-alpha.3

### Changed
- Switched the npm package name from `sarraf` to `kantar` for publish testing

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
- Config loading from `sarraf.json` and `package.json#sarraf`
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
