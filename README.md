# sarraf

Sarraf is a dependency analysis CLI for JavaScript projects, inspired by the problems tools like Knip solve, with optional AI-powered insights on top.

Sarraf scans your dependencies like a jeweler inspects gold. It finds unused packages, flags dependency hygiene issues, and, when you provide an AI token, can explain findings and suggest cleanup actions directly in the CLI.

Turkce:
Sarraf, JavaScript/TypeScript projelerinde Knip benzeri bagimlilik analizi yapan ve istenirse AI destekli yorumlar uretebilen bir komut satiri aracidir.

## Why Sarraf?

JavaScript projects accumulate packages over time. Some stop being used. Some belong in `devDependencies` but end up in `dependencies`. Some become outdated, deprecated, or risky.

Sarraf exists to answer a simple question:

Which packages in this project are actually needed, and which ones are adding weight or risk?

Sarraf's direction is:

- cover the core dependency analysis workflow that developers expect from tools like Knip
- add an optional AI layer for interpretation, prioritization, and remediation suggestions
- keep the base scanner useful even when no token is provided

## What Sarraf Does

Sarraf analyzes a project by reading its manifest and source files, then comparing declared dependencies with actual usage.

Without AI:

- scans the project
- resolves imported packages
- reports unused or suspicious dependencies

With AI token provided:

- explains why a dependency looks unused or risky
- suggests whether it should be removed, moved, or reviewed
- helps turn raw analysis into actionable cleanup decisions

Current focus:

- read `package.json`
- scan `js`, `ts`, `jsx`, `tsx`, `mjs`, `cjs`, `mts`, `cts` files
- extract imported packages from `import`, dynamic `import()`, and `require()`
- report declared packages that do not appear to be used

## MVP Scope

The first version is intentionally narrow.

Included in v1:

- package manifest analysis
- source scan for dependency usage
- unused `dependencies` detection
- unused `devDependencies` detection
- optional AI explanations in the CLI when a valid token is configured

Planned after MVP:

- wrong dependency placement detection
- deprecated package checks
- basic dependency risk score
- JSON output
- CI-friendly output and exit codes
- richer AI remediation suggestions

## Install

Local development:

```bash
npm install
```

When published as an npm package:

```bash
npm install -g sarraf
```

or run it without a global install:

```bash
npx sarraf .
```

## Usage

Scan the current project:

```bash
npx sarraf .
```

Scan a specific directory:

```bash
npx sarraf ./packages/web
```

For local development in this repository:

```bash
npm run dev
npm run build
npm run typecheck
node dist/index.js .
```

## AI Mode

Sarraf should work in two modes:

- standard analysis mode with no token required
- AI-assisted mode when the user provides an API token

The base CLI must remain useful without AI. AI is an upgrade layer, not a requirement.

Example direction:

```bash
SARAF_AI_TOKEN=your_token npx sarraf .
```

## Product Vision

Sarraf aims to become a practical dependency audit tool for everyday JavaScript teams.

Not a full software composition analysis platform.
Not a vulnerability database replacement.

The goal is simpler and more useful in daily work:

- show what is unused
- reveal what looks suspicious
- explain findings in plain language when AI is enabled
- make dependency decisions easier during development and in CI

## One-Line Pitch

Sarraf is a CLI that finds unnecessary npm packages like Knip, then goes further with optional AI-powered explanations and cleanup guidance.
