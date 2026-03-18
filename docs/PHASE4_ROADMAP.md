# Phase 4 Roadmap

## Goals
- Learn from real-world usage before adding broad new surface area.
- Stabilize machine-readable output and remediation workflows.
- Deepen framework and plugin awareness where it materially reduces false positives.

## Priority Areas
- Gather real project feedback and classify false positives by root cause.
- Harden the JSON/report contract for CI and downstream tooling.
- Expand framework-aware analysis beyond file scanning where the signal is strong.
- Improve AI remediation summaries with clearer next actions and prioritization.
- Widen auto-fix carefully, starting only from deterministic and reversible changes.

## Likely Work Items
- Add richer JSON schema docs and CI examples.
- Add more built-in plugin coverage for common frontend and test tools.
- Improve framework entry discovery for route and component conventions.
- Add optional remediation suggestions grouped by severity or confidence.
- Explore safe fixes for stale config and catalog cleanup.

## Guardrails
- Prefer correctness over breadth.
- Keep AI optional and non-blocking.
- Avoid destructive fixes unless they are deterministic and easy to review.
