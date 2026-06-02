---
title: Findings
---

Sadrazam reports a small set of finding types so the output stays predictable in local runs and CI.

## Dependency findings

- `missing`: package is used but not declared in `package.json`
- `unused-dependencies`: declared dependency is not used
- `unused-devDependencies`: declared devDependency is not used
- `misplaced-devDependencies`: devDependency is used by production files in `--strict` mode

## Code hygiene findings

- `unresolved-imports`: local-style import specifier cannot be resolved to a scanned source file
- `unused-files`: source file is not reachable from package entries, script entries, or fallback entry discovery
- `unused-exports`: reachable local module exports a symbol that is never imported by another reachable local module
- `duplicate-exports`: reachable local module exports aliases for the same local symbol
- `namespace-members`: reachable local module exports a TypeScript namespace member that is never referenced by another reachable local module

## Common filters

Focus on code hygiene only:

```bash
sadrazam . --include unused-files,unused-exports,duplicate-exports,namespace-members
```

Exclude noisy dependency findings:

```bash
sadrazam . --exclude unused-devDependencies
```

Get machine-readable output:

```bash
sadrazam . --reporter json
```

Explain one finding type:

```bash
sadrazam . --explain unused-files
```

## Notes

- `unused-files` intentionally ignores common test and config file patterns to reduce false positives.
- `unresolved-imports` is limited to relative imports, absolute path imports, `package.json#imports` specifiers, and configured local aliases. Bare external packages stay under `missing` when they are not declared.
- `unused-exports` is conservative in ambiguous cases and currently targets local module relationships.
- `duplicate-exports` targets alias-style duplicates such as `export const alias = original` or `export default original` when `original` is also exported from the same reachable file. Tag intentional aliases with `@alias`.
- `namespace-members` is conservative: if a namespace object is used without explicit member access, its members are treated as used.
- `unused-exports` can ignore explicitly tagged exports via `jsdocTags.ignoreExports` and tags such as `@sadrazam-ignore`.
- `preprocessors` can suppress package, file, or export findings after analysis when you need deterministic exceptions.
- `--explain <type>` accepts one supported finding type and includes explanation details in text, JSON, and TOON output.
