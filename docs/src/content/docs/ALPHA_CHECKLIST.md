---
title: Alpha Checklist
---

# Alpha Checklist

Target release: `v0.1.0-alpha.1`

## Product readiness

- CLI help is readable and examples are present
- README documents config, reporters, tracing, strict mode, and AI usage
- config loading works from `sadrazam.json` and `package.json#sadrazam`
- ignore and allowlist rules work as expected
- JSON reporter is stable enough for automation

## Verification

- `npm run typecheck`
- `npm test`
- `npm run smoke`

## Smoke scenarios

- single-package project with config overrides
- CommonJS project
- monorepo with multiple workspaces

## Before tagging

- confirm no unexpected local changes
- run smoke checks one more time
- review README examples against actual CLI behavior
