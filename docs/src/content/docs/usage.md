---
title: CLI Usage
---

## Common Commands

Scan the current directory:

```bash
sadrazam .
```

Scan a specific package or app:

```bash
sadrazam ./packages/web
```

Create `sadrazam.json` interactively:

```bash
sadrazam init
```

Limit the scan to one workspace:

```bash
sadrazam . --workspace packages/web
```

Emit JSON:

```bash
sadrazam . --reporter json
```

Emit TOON:

```bash
sadrazam . --reporter toon
```

Focus on file and export hygiene:

```bash
sadrazam . --include unused-files,unused-exports,duplicate-exports
```

Measure scan performance with cache enabled:

```bash
sadrazam . --cache --performance
```

Show debug details, including parser backend coverage:

```bash
sadrazam . --debug
```

Debug output also includes plugin contribution details so you can see which plugin added package and file signals.

Trace where a package is used:

```bash
sadrazam . --trace commander
```

Trace where an export is used:

```bash
sadrazam . --trace-export src/lib.ts:usedHelper
```

Explain findings of one type:

```bash
sadrazam . --explain unused-files
```

Limit displayed items per finding while keeping full scan counts and exit behavior:

```bash
sadrazam . --max-show-issues 10
```

Apply safe `package.json` cleanup and formatting:

```bash
sadrazam . --fix --format
```

## Scan Modes

Production-only scan:

```bash
sadrazam . --production
```

Strict mode flags `devDependencies` used by production files:

```bash
sadrazam . --strict
```

## Finding Filters

Include only selected finding types:

```bash
sadrazam . --include missing,unused-dependencies
```

Exclude noisy finding types:

```bash
sadrazam . --exclude unused-devDependencies
```

## Auto-fix And Format

Use `--fix` to apply conservative `package.json` edits:

```bash
sadrazam . --fix
```

`--fix` removes deterministic unused `dependencies` and `devDependencies`. It can also add missing package declarations to `devDependencies` with a `"*"` placeholder version; run your package manager afterward to resolve the exact version.

Use `--fix --format` to also normalize the modified `package.json` file:

```bash
sadrazam . --fix --format
```

## Plugin Overrides

Sadrazam enables built-in plugins from package declarations, scripts, and known config files. Use `plugins` in config to force-enable a plugin, disable one, or add custom config and entry files:

```json
{
  "plugins": {
    "vite": true,
    "jest": false,
    "playwright": {
      "config": "config/playwright.config.ts",
      "entry": "integration/**/*.spec.ts"
    },
    "github-actions": {
      "config": ".github/workflows/*.yml"
    },
    "gitlab-ci": {
      "config": ".gitlab-ci.yml"
    },
    "circleci": {
      "config": ".circleci/config.yml"
    },
    "azure-pipelines": {
      "config": "azure-pipelines.yml"
    },
    "bitbucket-pipelines": {
      "config": "bitbucket-pipelines.yml"
    },
    "nx": {
      "config": "nx.json"
    },
    "turbo": {
      "config": "turbo.json"
    },
    "babel": {
      "config": ["babel.config.json", ".babelrc"]
    },
    "lint-staged": {
      "config": ".lintstagedrc.json"
    }
  }
}
```

The GitHub Actions plugin reads workflow and local action YAML files, parses `run` commands, respects step-level `working-directory`, and treats local node action scripts as entry files.
The GitLab CI, CircleCI, Azure Pipelines, and Bitbucket Pipelines plugins read CI YAML command blocks and resolve direct tool calls plus package scripts such as `npm run lint`.
The pnpm workspace, Turbo, Nx, Lerna, and Rush plugins add monorepo config files as entry signals; Nx also treats `plugins` entries as package usage.
The Babel, PostCSS, Commitlint, lint-staged, and Husky plugins read common config references and hook command blocks so config-only packages are counted as used.

## Allowlist Flags

```bash
sadrazam . --ignore-packages react
sadrazam . --allow-unused-dev-dependencies typescript
sadrazam . --allow-missing-packages eslint
```

## Findings

Sadrazam currently reports these main finding groups:

- `missing`
- `unresolved-imports`
- `unused-dependencies`
- `unused-devDependencies`
- `misplaced-devDependencies`
- `unused-files`
- `unused-exports`
- `duplicate-exports`

Use `--include` and `--exclude` to focus the output on the findings you care about.

Use `--explain <type>` with one supported finding type to include deterministic explanation details in text, JSON, and TOON output.

Use `--max-show-issues <count>` to limit displayed items per finding in text, markdown, JSON, and TOON reports. JSON and TOON include `totalItems` and `omittedItems` when a finding is truncated. SARIF remains untruncated for code scanning integrations.
