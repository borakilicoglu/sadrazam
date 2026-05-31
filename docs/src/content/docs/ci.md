---
title: CI and Releases
---

## Exit Codes

Sadrazam uses these exit codes:

- `0`: no findings
- `1`: runtime or configuration error
- `2`: findings reported

## CI Example

```bash
sadrazam . --reporter json
# or
sadrazam . --reporter toon
```

Because findings return `2`, CI can fail fast without custom parsing.

## Publish Flow

This repository publishes from GitHub Actions on `v*` tags.

Release tags map to npm dist-tags like this:

- `vX.Y.Z-alpha.N` -> `alpha`
- `vX.Y.Z-beta.N` -> `beta`
- `vX.Y.Z` -> `latest`

## Docs Deployment

The docs site is built with Starlight and deployed through GitHub Pages from the `main` branch workflow.
