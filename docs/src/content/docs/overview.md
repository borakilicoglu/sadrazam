---
title: Overview
description: Dependency analysis CLI for JavaScript and TypeScript projects.
---

# Sadrazam

Sadrazam scans JavaScript and TypeScript projects for dependency and code-hygiene issues with a low-noise, deterministic output contract.

It finds unused packages, missing package declarations, unresolved local imports, unused source files, unused reachable exports, and duplicate export aliases. AI summaries are optional and sit on top of the real scan findings.

## Quick Start

```bash
npx sadrazam .
npx sadrazam . --reporter json
npx sadrazam . --reporter toon
npx sadrazam . --trace typescript
npx sadrazam . --explain unused-files
AI_PROVIDER=openai AI_TOKEN=your_token npx sadrazam . --ai
```

## What You Get

- unused `dependencies` and `devDependencies`
- missing package declarations
- unresolved local imports
- unused source files
- unused reachable exports
- duplicate export aliases
- workspace and monorepo-aware scanning
- package usage tracing with `--trace`
- finding explanations with `--explain`
- config-based allowlists, catalogs, and preprocessors
- cache, performance, memory, and watch modes
- production-only and strict scan modes
- safe `--fix` and `--fix --format` cleanup
- TypeScript path alias resolution
- optional AI summaries on top of scan findings

## Why It Exists

JavaScript projects collect dependencies over time. Some stop being used. Some stay in the wrong dependency bucket. Some stay around simply because nobody has enough visibility to remove them with confidence.

Sadrazam is built to make that visible quickly, with output that is useful both in local development and in CI.

## Common Flows

### Scan the current project

```bash
sadrazam .
```

### Inspect one workspace

```bash
sadrazam . --workspace packages/web
```

### Export machine-readable output

```bash
sadrazam . --reporter json
sadrazam . --reporter toon
```

### Add AI summaries

```bash
AI_PROVIDER=openai AI_TOKEN=your_token sadrazam . --ai
```

## Continue Reading

- [Getting Started](./getting-started/)
- [CLI Usage](./usage/)
- [Config](./config/)
- [Features](./features/)
- [Findings](./findings/)
- [AI Mode](./ai-mode/)
- [CI and Releases](./ci/)
