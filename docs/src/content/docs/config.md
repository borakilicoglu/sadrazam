---
title: Config
---

# Config

Sadrazam loads config from either:

- `sadrazam.json`
- `package.json#sadrazam`

## Example

Create a config file interactively:

```bash
sadrazam init
```

```json
{
  "reporter": "json",
  "maxShowIssues": 10,
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
  "preprocessors": {
    "packagePatterns": ["@types/*"],
    "filePatterns": ["src/generated/*"],
    "exportPatterns": ["src/lib.ts: ignored*"]
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

CLI flags override config values.

## Supported Rule Keys

- `ignorePackages`
- `allowUnusedDependencies`
- `allowUnusedDevDependencies`
- `allowMissingPackages`
- `allowMisplacedDevDependencies`
- `maxShowIssues`
- `catalog.packages`
- `catalog.entryFiles`
- `inputs.entryFiles`
- `inputs.packageNames`
- `preprocessors.packagePatterns`
- `preprocessors.filePatterns`
- `preprocessors.exportPatterns`
- `jsdocTags.ignoreExports`

Catalog references can be used inside rule and input arrays with `$packages:<name>` and `$entryFiles:<name>`.
