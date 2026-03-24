<p align="center">
  <img src="https://raw.githubusercontent.com/borakilicoglu/sadrazam/main/assets/logo.svg?v=2" alt="Sadrazam logo" width="200" />
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/sadrazam"><img src="https://img.shields.io/npm/v/sadrazam" alt="npm version" /></a>
  <a href="https://github.com/borakilicoglu/sadrazam/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/sadrazam" alt="license" /></a>
  <a href="https://www.npmjs.com/package/sadrazam"><img src="https://img.shields.io/npm/dt/sadrazam" alt="npm total downloads" /></a>
  <a href="https://packagephobia.com/result?p=sadrazam"><img src="https://packagephobia.com/badge?p=sadrazam" alt="install size" /></a>
</p>

<p>Sadrazam is a dependency analysis CLI for JavaScript and TypeScript projects with optional AI-powered insights.</p>

- Website: https://borakilicoglu.github.io/sadrazam/
- GitHub repo: https://github.com/borakilicoglu/sadrazam
- Official npm package: https://www.npmjs.com/package/sadrazam
- Docs: https://borakilicoglu.github.io/sadrazam/features
- Contributing: https://github.com/borakilicoglu/sadrazam/blob/main/CONTRIBUTING.md
- Releases: https://github.com/borakilicoglu/sadrazam/releases

## Overview

Sadrazam scans your project to find unused packages, flag dependency hygiene issues, and, when you provide an AI token, explain findings and suggest cleanup actions directly in the CLI.

See the full feature matrix: https://borakilicoglu.github.io/sadrazam/features

- unused `dependencies` and `devDependencies`
- missing package declarations
- unused source file detection
- unused export detection for reachable local modules
- package and export trace output
- script-aware dependency detection
- workspace and monorepo-aware scanning
- CommonJS and hybrid import support
- text and JSON reporters
- source mapping from build output back to source files
- cache, performance, memory, and watch modes
- production and strict scan modes
- config file support via `sadrazam.json` or `package.json#sadrazam`
- ignore, allowlist, catalog, and preprocessor controls
- plugin-aware script analysis and config inputs
- safe `--fix` and `--fix --format` support for `package.json`
- JSDoc export ignore tags
- AI summaries via `openai`, `anthropic`, or `gemini`

## Why Sadrazam?

JavaScript projects accumulate packages over time. Some stop being used. Some belong in `devDependencies` but end up in `dependencies`. Some become outdated, deprecated, or risky.

Sadrazam exists to answer a simple question:

Which packages in this project are actually needed, and which ones are adding weight or risk?

Sadrazam's direction is:

- cover the core dependency analysis workflow teams expect from a modern dependency scanner
- add an optional AI layer for interpretation, prioritization, and remediation suggestions
- keep the base scanner useful even when no token is provided

## What Sadrazam Does

Sadrazam analyzes a project by reading its manifest and source files, then comparing declared dependencies with actual usage.

Without AI:

- scans the project graph
- resolves imported packages and local source relationships
- reports unused or suspicious dependencies
- reports unreachable source files
- reports unused exports in reachable local modules

With AI token provided:

- explains why a dependency looks unused or risky
- suggests whether it should be removed, moved, or reviewed
- helps turn raw analysis into actionable cleanup decisions

Current focus:

- read `package.json`
- scan `js`, `ts`, `jsx`, `tsx`, `mjs`, `cjs`, `mts`, `cts`, `svelte`, `vue`, `mdx`, and `astro` files
- extract package usage from `import`, `export ... from`, `import = require`, `require`, and `require.resolve`
- include package usage referenced from `package.json` scripts
- trace local source reachability from package and script entry points
- report unused dependencies, unused files, unused exports, and suspicious declarations

## Feature Overview

| Name                   | Description or example                                                                                           |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Auto-fix               | Use `--fix` to safely remove deterministic unused package declarations from `package.json`.                      |
| Cache                  | Use `--cache` to speed up consecutive runs when inputs are unchanged.                                            |
| Catalog                | Reuse config entries with `catalog.packages` and `catalog.entryFiles`, and get hints for unused catalog entries. |
| CommonJS               | `require`, `require.resolve`, and hybrid import patterns are supported.                                          |
| Compilers              | Support for `.astro`, `.mdx`, `.svelte`, and `.vue` source scanning.                                             |
| Configuration hints    | Display hints for stale allowlists, ignored entries, and unused catalog references.                              |
| Debug                  | Use `--debug` for troubleshooting resolved config and rule state.                                                |
| Filters                | Use `--include` and `--exclude` to focus on specific finding groups.                                             |
| Format                 | Use `--format` with `--fix` to normalize modified `package.json` files.                                          |
| JSDoc tags             | Tag exports with `@sadrazam-ignore` or `@sadrazam-keep` to suppress unused export findings.                      |
| Memory usage           | Use `--memory` for peak heap and RSS insight.                                                                    |
| Monorepos              | Workspaces are first-class and can be filtered with `--workspace`.                                               |
| Performance            | Use `--performance` for workspace and total timing insights.                                                     |
| Plugins                | Built-in plugin analysis exists for common tools.                                                                |
| Plugins: inputs        | Add entry files and package usage through config inputs.                                                         |
| Plugins: CLI arguments | Parse common tool arguments such as `--config`, `--plugin`, and `--parser`.                                      |
| Preprocessors          | Preprocess findings before reporting them through package, file, and export patterns.                            |
| Production mode        | Use `--production` to lint only production code paths.                                                           |
| Reporters              | Use built-in `text` and `json` reporters for human and machine-readable output.                                  |
| Rules                  | Exclude or focus on specific issue types with ignore and allowlist rules.                                        |
| Script parser          | `package.json` scripts contribute entry paths and package dependencies.                                          |
| Source mapping         | Map `dist` files back to `src` files through sourcemaps and heuristics.                                          |
| Strict mode            | Use `--strict` to flag production usage of `devDependencies`.                                                    |
| Trace                  | Trace packages and exports to find where they are used.                                                          |
| Watch mode             | Use `--watch` for live updates of unused files, exports, and dependency findings.                                |
| Workspace              | Use `--workspace` to filter workspaces in a monorepo.                                                            |

See the full feature matrix: https://borakilicoglu.github.io/sadrazam/features

## Install

Local development:

```bash
npm install
```

When published as an npm package:

```bash
npm install -g sadrazam
```

or run it without a global install:

```bash
npx sadrazam .
```

## Quick Start

```bash
npx sadrazam .
npx sadrazam . --reporter json
npx sadrazam . --trace typescript
npx sadrazam . --trace-export src/lib.ts:usedHelper
npx sadrazam . --include unused-files,unused-exports
npx sadrazam . --cache --performance
npx sadrazam . --fix --format
AI_PROVIDER=openai AI_TOKEN=your_token npx sadrazam . --ai
```

## Usage

Common scenarios:

- scan a single package
- scan one workspace inside a monorepo
- export findings as JSON
- trace why a package is treated as used
- trace why an export is treated as used
- apply safe cleanup fixes to `package.json`
- run in production or strict mode
- enrich the report with AI summaries

Scan the current project:

```bash
npx sadrazam .
```

Scan a specific directory:

```bash
npx sadrazam ./packages/web
```

Scan a single workspace in a monorepo:

```bash
npx sadrazam . --workspace packages/web
```

Get JSON output:

```bash
npx sadrazam . --reporter json
```

Focus on code hygiene findings:

```bash
npx sadrazam . --include unused-files,unused-exports
```

Measure scan performance with cache enabled:

```bash
npx sadrazam . --cache --performance
```

Trace why a package is considered used:

```bash
npx sadrazam . --trace typescript
```

Trace why an export is considered used:

```bash
npx sadrazam . --trace-export src/lib.ts:usedHelper
```

Apply safe fixes and normalize modified `package.json` files:

```bash
npx sadrazam . --fix --format
```

Production-only scan:

```bash
npx sadrazam . --production
```

Strict mode:

```bash
npx sadrazam . --strict
```

Ignore or allow specific findings from the CLI:

```bash
npx sadrazam . --ignore-packages react
npx sadrazam . --allow-unused-dev-dependencies typescript
```

For local development in this repository:

```bash
npm run dev
npm run build
npm run typecheck
node dist/index.js .
```

Useful local examples:

```bash
node dist/index.js . --debug
node dist/index.js . --exclude unused-devDependencies
node dist/index.js . --reporter json --trace commander
node dist/index.js . --ignore-packages react --allow-unused-dev-dependencies typescript
```

## Config

Sadrazam can load config from either:

- `sadrazam.json`
- `package.json` under the `sadrazam` key

Example `sadrazam.json`:

```json
{
  "reporter": "json",
  "production": false,
  "strict": false,
  "exclude": ["missing"],
  "ignorePackages": ["$packages:ignored"],
  "allowUnusedDependencies": [],
  "allowUnusedDevDependencies": ["typescript"],
  "allowMissingPackages": [],
  "allowMisplacedDevDependencies": [],
  "catalog": {
    "packages": {
      "ignored": ["react"]
    },
    "entryFiles": {
      "bootstrap": ["scripts/bootstrap.ts"]
    }
  },
  "inputs": {
    "entryFiles": ["$entryFiles:bootstrap"]
  },
  "jsdocTags": {
    "ignoreExports": ["sadrazam-ignore", "sadrazam-keep"]
  },
  "workspace": ["packages/web"],
  "ai": {
    "provider": "openai",
    "model": "gpt-4.1"
  }
}
```

CLI flags take precedence over config values.

## Exit Codes

Sadrazam uses these exit codes:

- `0`: scan completed and no findings were reported
- `1`: execution error, invalid configuration, or unrecoverable runtime failure
- `2`: scan completed and findings were reported

## Ignore And Allowlist

Use these when a finding is intentionally acceptable:

- `ignorePackages`
- `allowUnusedDependencies`
- `allowUnusedDevDependencies`
- `allowMissingPackages`
- `allowMisplacedDevDependencies`
- `catalog.packages`
- `catalog.entryFiles`
- `preprocessors.packagePatterns`
- `preprocessors.filePatterns`
- `preprocessors.exportPatterns`
- `jsdocTags.ignoreExports`

## AI Mode

Sadrazam works in two modes:

- standard analysis mode with no token required
- AI-assisted mode when the user provides an API token

The base CLI remains useful without AI. AI is an upgrade layer, not a requirement.

Environment variables:

```bash
AI_PROVIDER=openai
AI_TOKEN=your_token
AI_MODEL=gpt-4.1
```

Current provider values:

- `openai`
- `anthropic`
- `gemini`

Examples:

```bash
AI_PROVIDER=openai AI_TOKEN=your_token npx sadrazam . --ai
AI_PROVIDER=anthropic AI_TOKEN=your_token npx sadrazam . --ai
AI_PROVIDER=gemini AI_TOKEN=your_token npx sadrazam . --ai
```

CLI overrides:

```bash
npx sadrazam . --ai --provider openai --model gpt-4.1
```

What AI currently does:

- summarizes findings
- prioritizes the most important cleanup actions
- turns raw scan output into a short remediation note

What AI does not yet do:

- automatic fixes
- package reputation or security scoring
- multi-step remediation planning
- guaranteed deterministic recommendations across providers

## Testing

Local verification includes fixture-based tests for:

- config loading
- ignore and allowlist behavior
- AI response parsing
- AI auth error handling

Run:

```bash
npm test
```

Smoke scenarios:

```bash
npm run smoke
```

This runs repeatable checks for:

- single-package config-driven repo
- CommonJS repo
- monorepo with multiple workspaces
- compiler-style source files
- file and export hygiene scenarios
- config features such as catalog, preprocessors, and JSDoc export tags

## Known Limitations

- AI summaries depend on third-party provider behavior and network availability
- source mapping uses source maps first and path heuristics second
- misplaced dependency detection is intentionally conservative
- dependency analysis is strongest for standard JS/TS project layouts
- `--fix` is intentionally narrow and currently targets deterministic `package.json` cleanup

## Product Vision

Sadrazam aims to become a practical dependency audit tool for everyday JavaScript teams.

Not a full software composition analysis platform.
Not a vulnerability database replacement.

The goal is simpler and more useful in daily work:

- show what is unused
- reveal what looks suspicious
- explain findings in plain language when AI is enabled
- make dependency decisions easier during development and in CI

## One-Line Pitch

Sadrazam is a CLI that finds unnecessary and risky npm packages, then goes further with optional AI-powered explanations and cleanup guidance.
