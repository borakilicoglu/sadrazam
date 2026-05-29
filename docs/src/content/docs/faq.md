---
title: FAQ
---

# FAQ

## Does Sadrazam require AI?

No. AI is optional. The dependency scanner works without a token.

## Does it support monorepos?

Yes. Sadrazam discovers workspaces and can filter them with `--workspace`.

## Can it explain why a package is considered used?

Yes. Use `--trace <package>`.

## Can it explain why a finding was reported?

Yes. Use `--explain <type>` with one supported finding type, such as `--explain unused-files`.

## Where should I put config?

Use either `sadrazam.json` or `package.json#sadrazam`.

## Can I use it in CI?

Yes. The exit codes are stable and the JSON and TOON reporters are intended for automation.

## Can it apply fixes automatically?

Yes, for conservative `package.json` cleanup. `--fix` removes deterministic unused package declarations and can add missing package declarations to `devDependencies` with a `"*"` placeholder version. Use `--fix --format` to also normalize the modified file.

## Can it find unused files and exports?

Yes. Sadrazam can report unreachable source files and unused exports in reachable local modules.

## Can I focus only on file-level findings?

Yes. Use `--include unused-files,unused-exports,duplicate-exports`.

## Can I ignore generated or intentionally public exports?

Yes. Use `preprocessors.exportPatterns` for config-level filtering or JSDoc tags such as `@sadrazam-ignore` through `jsdocTags.ignoreExports`.

## What does catalog support do?

Catalogs let you name reusable groups of packages and entry files, then reference them from rules and inputs with `$packages:<name>` and `$entryFiles:<name>`.
