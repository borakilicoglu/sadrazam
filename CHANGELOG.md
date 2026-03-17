# CHANGELOG

## Unreleased

### Added
- Repository contribution and release rules in `AGENTS.md`

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
