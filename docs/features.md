# Overview

Sadrazam covers a broad dependency and code-hygiene surface. This page summarizes the current feature set in the same practical way users evaluate CLI tools: what exists and how it is used.

| Name | Description or example |
| --- | --- |
| Auto-fix | Use `--fix` to safely remove deterministic unused package declarations from `package.json`. |
| Cache | Use `--cache` to speed up consecutive runs when inputs are unchanged. |
| Catalog | Reuse config entries with `catalog.packages` and `catalog.entryFiles`, and get hints for unused catalog entries. |
| CommonJS | `require`, `require.resolve`, and hybrid import patterns are supported. |
| Compilers | Support for `.astro`, `.mdx`, `.svelte`, and `.vue` source scanning, with room for deeper framework-aware analysis. |
| Configuration hints | Display hints for stale allowlists, ignored entries, and unused catalog references. |
| Debug | Use `--debug` for troubleshooting resolved config and rule state. |
| Filters | Use `--include` and `--exclude` to focus on specific finding groups. |
| Format | Use `--format` with `--fix` to normalize modified `package.json` files. |
| JSDoc tags | Tag exports with `@sadrazam-ignore` or `@sadrazam-keep` to suppress unused export findings. |
| Memory usage | Use `--memory` for peak heap and RSS insight. |
| Monorepos | Workspaces are first-class and can be filtered with `--workspace`. |
| Performance | Use `--performance` for workspace and total timing insights. |
| Plugins | Built-in plugin analysis exists for common tools, even though this is not a large external plugin ecosystem yet. |
| Plugins: inputs | Add entry files and package usage through config inputs. |
| Plugins: CLI arguments | Parse common tool arguments such as `--config`, `--plugin`, and `--parser` to enrich analysis. |
| Preprocessors | Preprocess findings before reporting them through package, file, and export patterns. |
| Production mode | Use `--production` to lint only production code paths. |
| Reporters | Use built-in `text` and `json` reporters for human and machine-readable output. |
| Rules | Exclude or focus on specific issue types with ignore and allowlist rules. |
| Script parser | Shell scripts and `package.json` scripts contribute entry paths and package dependencies. |
| Source mapping | Map `dist` files back to `src` files through sourcemaps and heuristics. |
| Strict mode | Use `--strict` to flag production usage of `devDependencies`. |
| Trace | Trace packages and exports to find where they are used. |
| Watch mode | Use `--watch` for live updates of unused files, exports, and dependency findings. |
| Workspace | Use `--workspace` to filter workspaces in a monorepo. |

## Extra capabilities

Sadrazam also includes capabilities that are not captured cleanly by the original checklist format:

- unused file detection
- unused export detection
- missing package declarations
- package and export trace output
- AI-powered summaries for OpenAI, Anthropic, and Gemini
- safe `package.json` cleanup with optional formatting
