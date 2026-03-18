# Feature Matrix

Sadrazam covers a broad dependency and code-hygiene surface. The table below shows what is available today and where the current implementation is intentionally narrow.

| Capability | Status | Notes |
| --- | --- | --- |
| Auto-fix | Yes | `--fix` safely removes deterministic unused package declarations from `package.json`. |
| Cache | Yes | `--cache` stores scan results and reuses them when inputs are unchanged. |
| Catalog | Yes | `catalog.packages` and `catalog.entryFiles` support reusable config references and unused catalog hints. |
| CommonJS | Yes | `require`, `require.resolve`, and hybrid import patterns are supported. |
| Compilers | Partial | `.astro`, `.mdx`, `.svelte`, and `.vue` files are scanned, but framework-aware deep conventions are still limited. |
| Configuration hints | Yes | Sadrazam reports stale allowlists, ignored entries, and unused catalog entries. |
| Debug | Yes | `--debug` exposes resolved config and rule state. |
| Filters | Yes | `--include` and `--exclude` focus on specific finding groups. |
| Format | Yes | `--format` works with `--fix` to normalize modified `package.json` files. |
| JSDoc tags | Yes | Explicit tags such as `@sadrazam-ignore` can suppress unused export findings. |
| Memory usage | Yes | `--memory` adds peak heap and RSS insight to reports. |
| Monorepos | Yes | Workspaces are first-class and can be filtered with `--workspace`. |
| Performance | Yes | `--performance` reports workspace and total timing. |
| Plugins | Partial | Built-in plugin analysis exists, but this is not yet a large external plugin ecosystem. |
| Plugins: inputs | Yes | Config inputs can add entry files and package names to the scan. |
| Plugins: CLI arguments | Partial | Several common tools are parsed, but coverage is still curated rather than exhaustive. |
| Preprocessors | Yes | Package, file, and export findings can be suppressed after analysis. |
| Production mode | Yes | `--production` limits the scan to production code paths. |
| Reporters | Partial | Strong `text` and `json` reporters exist; many specialized formats are not yet built in. |
| Rules | Yes | Ignore and allowlist rules are available from config and CLI. |
| Script parser | Yes | `package.json` scripts contribute entries and package usage. |
| Source mapping | Yes | Dist files can map back to source files through sourcemaps and heuristics. |
| Strict mode | Yes | `--strict` flags production use of `devDependencies`. |
| Trace | Yes | Package trace and export trace are both supported. |
| Watch mode | Yes | `--watch` reruns scans when files change. |
| Workspace | Yes | `--workspace` filters a monorepo scan to selected workspaces. |

## Extra capabilities

Sadrazam also includes several capabilities that are not captured well by the original checklist:

- unused file detection
- unused export detection
- package and export trace output
- AI-powered summaries for OpenAI, Anthropic, and Gemini
- safe `package.json` cleanup with optional formatting
