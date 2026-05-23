# Findings

Sadrazam reports a small set of finding types so the output stays predictable in local runs and CI.

## Dependency findings

- `missing`: package is used but not declared in `package.json`
- `unused-dependencies`: declared dependency is not used
- `unused-devDependencies`: declared devDependency is not used
- `misplaced-devDependencies`: devDependency is used by production files in `--strict` mode

## Code hygiene findings

- `unused-files`: source file is not reachable from package entries, script entries, or fallback entry discovery
- `unused-exports`: reachable local module exports a symbol that is never imported by another reachable local module

## Common filters

Focus on code hygiene only:

```bash
sadrazam . --include unused-files,unused-exports
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
- `unused-exports` is conservative in ambiguous cases and currently targets local module relationships.
- `unused-exports` can ignore explicitly tagged exports via `jsdocTags.ignoreExports` and tags such as `@sadrazam-ignore`.
- `preprocessors` can suppress package, file, or export findings after analysis when you need deterministic exceptions.
- `--explain <type>` accepts one supported finding type and includes explanation details in text, JSON, and TOON output.
