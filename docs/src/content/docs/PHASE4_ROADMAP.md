---
title: Phase 4 Roadmap
---

# Phase 4 Roadmap

## Goals
- Learn from real-world usage before adding broad new surface area.
- Stabilize machine-readable output and remediation workflows.
- Continue validating framework and plugin awareness against real projects.

## Priority Areas
- Gather real project feedback and classify false positives by root cause.
- Harden the JSON/report contract for CI and downstream tooling.
- Expand framework-aware analysis beyond file scanning where new signals are strong.
- Improve AI remediation summaries with clearer next actions and prioritization.
- Widen auto-fix carefully, starting only from deterministic and reversible changes.

## Likely Work Items
- Add richer JSON schema docs and CI examples.
- Validate the built-in frontend and test plugin registry against more real repositories.
- Improve framework entry discovery for route and component conventions not covered by the current registry.
- Add optional remediation suggestions grouped by severity or confidence.
- Explore safe fixes for stale config and catalog cleanup.

## Guardrails
- Prefer correctness over breadth.
- Keep AI optional and non-blocking.
- Avoid destructive fixes unless they are deterministic and easy to review.
