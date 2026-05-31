---
title: Config
---

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
  "plugins": {
    "vite": true,
    "jest": false,
    "playwright": {
      "config": "config/playwright.config.ts",
      "entry": "integration/**/*.spec.ts"
    }
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
- `plugins.<name>`
- `plugins.<name>.config`
- `plugins.<name>.entry`
- `preprocessors.packagePatterns`
- `preprocessors.filePatterns`
- `preprocessors.exportPatterns`
- `jsdocTags.ignoreExports`

Catalog references can be used inside rule and input arrays with `$packages:<name>` and `$entryFiles:<name>`.

## Plugin Configuration

Sadrazam automatically enables built-in plugin analysis from package declarations, scripts, and known config files. Plugin config can force-enable a plugin, disable one, or override its config and entry files:

```json
{
  "plugins": {
    "vite": true,
    "jest": false,
    "playwright": {
      "config": "config/playwright.config.ts",
      "entry": ["integration/**/*.spec.ts"]
    },
    "github-actions": {
      "config": ".github/workflows/*.yml"
    },
    "gitlab-ci": {
      "config": ".gitlab-ci.yml"
    },
    "circleci": {
      "config": ".circleci/config.yml"
    }
  }
}
```

Supported built-in plugins currently cover Astro, CircleCI, Cypress, ESLint, GitHub Actions, GitLab CI, Jest, Next, Playwright, Prettier, Rollup, Storybook, SvelteKit, Tailwind, TypeScript, Vite, Vitest, and webpack.
