---
layout: home

title: Sadrazam

titleTemplate: Dependency Analysis CLI

hero:
  name: Sadrazam
  text: Dependency analysis CLI for JavaScript and TypeScript projects
  tagline: Find unused packages, unused files, and unused exports, then layer optional AI summaries on top of real dependency findings.
  image:
    src: /logo.svg
    alt: Sadrazam logo
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started
    - theme: alt
      text: CLI Usage
      link: /usage
    - theme: alt
      text: GitHub
      link: https://github.com/borakilicoglu/sadrazam

features:
  - title: Real code and dependency hygiene checks
    details: Scan source files, scripts, and package manifests to find unused dependencies, missing declarations, unused files, unused exports, and suspicious dependency placement.
  - title: Built for real repos
    details: Workspace-aware scanning, CommonJS support, source mapping, strict mode, and script parsing are already built in.
  - title: AI when you want it
    details: Keep the scanner useful without AI, then add provider-backed summaries through OpenAI, Anthropic, or Gemini when you need prioritization.
---

## Quick Start

```bash
npx sadrazam .
npx sadrazam . --reporter json
npx sadrazam . --trace typescript
AI_PROVIDER=openai AI_TOKEN=your_token npx sadrazam . --ai
```

## What You Get

- unused `dependencies` and `devDependencies`
- missing package declarations
- unused source files
- unused reachable exports
- workspace and monorepo-aware scanning
- package usage tracing with `--trace`
- config-based allowlists, catalogs, and preprocessors
- cache, performance, memory, and watch modes
- production-only and strict scan modes
- safe `--fix` and `--fix --format` cleanup
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
```

### Add AI summaries

```bash
AI_PROVIDER=openai AI_TOKEN=your_token sadrazam . --ai
```

## Continue Reading

- [Getting Started](/getting-started)
- [CLI Usage](/usage)
- [Config](/config)
- [Features](/features)
- [Findings](/findings)
- [AI Mode](/ai-mode)
- [CI and Releases](/ci)
