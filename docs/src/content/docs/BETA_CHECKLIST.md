---
title: Beta Checklist
---

# Beta Checklist

## Alpha to Beta

- CLI flag surface is stable enough to avoid near-term breaking changes.
- `text` and `json` reporters are stable enough for repeated use.
- Config behavior is settled for both `sadrazam.json` and `package.json#sadrazam`.
- False positives and false negatives are acceptable across multiple real projects.
- Workspace and monorepo scanning is validated outside fixtures.
- AI mode degrades gracefully and never breaks the base scan.
- Base non-AI mode remains the primary reliable workflow.
- Docs cover getting started, usage, config, AI mode, and CI clearly.
- GitHub Pages docs deployment is consistently green.
- npm publishing is repeatable without manual recovery work.
- README and docs site do not contradict each other.
- Smoke coverage includes realistic package layouts.
- `--help` output is close to final user-facing form.
- Exit codes are documented and treated as stable.
- Known limitations are written down and kept current.
- Package metadata, homepage, repository, and docs links stay aligned.

## Beta to Stable

- No major false positive patterns remain unresolved.
- Common JavaScript and TypeScript project layouts are well covered.
- Reporter output and config format can be treated as stable contracts.
- User-facing docs are strong enough for self-serve adoption.
- Initial feedback from real usage has been incorporated.
- Release flow no longer depends on ad hoc cleanup.
- No near-term naming or package identity changes are expected.
