# CLI Usage

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
sadrazam . --include unused-files,unused-exports
```

Measure scan performance with cache enabled:

```bash
sadrazam . --cache --performance
```

Show debug details, including parser backend coverage:

```bash
sadrazam . --debug
```

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

## Allowlist Flags

```bash
sadrazam . --ignore-packages react
sadrazam . --allow-unused-dev-dependencies typescript
sadrazam . --allow-missing-packages eslint
```

## Findings

Sadrazam currently reports these main finding groups:

- `missing`
- `unused-dependencies`
- `unused-devDependencies`
- `misplaced-devDependencies`
- `unused-files`
- `unused-exports`

Use `--include` and `--exclude` to focus the output on the findings you care about.

Use `--explain <type>` with one supported finding type to include deterministic explanation details in text, JSON, and TOON output.
