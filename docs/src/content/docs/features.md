---
title: Features
---

# Overview

Sadrazam covers a broad dependency and code-hygiene surface. This page summarizes the current feature set in the same practical way users evaluate CLI tools: what exists and how it is used.

| Name | Description or example |
| --- | --- |
| Auto-fix | Use `--fix` to remove deterministic unused package declarations and add missing package declarations with a reviewable `"*"` placeholder version. |
| Cache | Use `--cache` to speed up consecutive runs when inputs are unchanged. |
| Catalog | Reuse config entries with `catalog.packages` and `catalog.entryFiles`, and get hints for unused catalog entries. |
| CommonJS | `require`, `require.resolve`, and hybrid import patterns are supported. |
| Compilers | Support for `.astro`, `.mdx`, `.svelte`, and `.vue` source scanning, with room for deeper framework-aware analysis. |
| Configuration hints | Display hints for stale allowlists, ignored entries, and unused catalog references. |
| Debug | Use `--debug` for troubleshooting resolved config and rule state. |
| Filters | Use `--include` and `--exclude` to focus on specific finding groups. |
| Format | Use `--format` with `--fix` to normalize modified `package.json` files. |
| Init | Use `sadrazam init` to create a `sadrazam.json` config interactively or from piped answers. |
| JSDoc tags | Tag exports with `@sadrazam-ignore` or `@sadrazam-keep` to suppress unused export findings. |
| Memory usage | Use `--memory` for peak heap and RSS insight. |
| Monorepos | Workspaces are first-class and can be filtered with `--workspace`. |
| Noise control | Use `--max-show-issues <count>` to limit displayed items while preserving full scan counts and exit behavior. |
| OXC parser and resolver | JavaScript and TypeScript sources use OXC-backed parsing and local resolution, with fallback for unsupported source forms. |
| Performance | Use `--performance` for workspace and total timing insights. |
| Plugins | Built-in plugin analysis covers Astro, Cypress, ESLint, Jest, Next, Playwright, Prettier, Rollup, Storybook, SvelteKit, Tailwind, TypeScript, Vite, Vitest, and webpack. |
| Plugins: inputs | Add entry files and package usage through config inputs. |
| Plugins: CLI arguments | Parse common tool arguments such as `--config`, `-c`, `--plugin`, and `--parser` to enrich analysis. |
| Plugins: overrides | Force-enable, disable, or override plugin config and entry files with `plugins.<name>`. |
| Preprocessors | Preprocess findings before reporting them through package, file, and export patterns. |
| Production mode | Use `--production` to lint only production code paths. |
| Reporters | Use built-in `text`, `json`, `toon`, `markdown`, and `sarif` reporters for human and machine-readable output. |
| Rules | Exclude or focus on specific issue types with ignore and allowlist rules. |
| Script parser | Shell scripts and `package.json` scripts contribute entry paths and package dependencies. |
| Source mapping | Map `dist` files back to `src` files through sourcemaps and heuristics. |
| Strict mode | Use `--strict` to flag production usage of `devDependencies`. |
| Trace | Trace packages and exports to find where they are used. |
| Explain | Use `--explain <type>` to add deterministic explanation details for one finding type. |
| TypeScript paths | Resolve `compilerOptions.paths` aliases so local aliased imports are not reported as missing packages. |
| Watch mode | Use `--watch` for live updates of unused files, exports, and dependency findings. |
| Workspace | Use `--workspace` to filter workspaces in a monorepo. |

## Extra capabilities

Sadrazam also includes capabilities that are not captured cleanly by the original checklist format:

- unused file detection
- unused export detection
- missing package declarations
- unresolved local import detection
- OXC-backed import/export parsing and local package import resolution
- package and export trace output
- registry-based plugin discovery for common frontend and test tools
- finding explanations with `--explain`
- AI-powered summaries for OpenAI, Anthropic, and Gemini
- safe `package.json` cleanup with optional formatting

## Built-in Plugin Matrix

| Plugin | Activation | Config files and entry signals |
| --- | --- | --- |
| Astro | `astro` package or script | `astro.config.*`, `src/pages/**/*.astro`, `src/content/**/*.{md,mdx}` |
| Cypress | `cypress` package or script | `cypress.config.*`, `cypress/**` |
| ESLint | `eslint` package or script | `.eslintrc*`, `eslint.config.*`, `--parser`, `--plugin`, `extends`, `plugins` |
| Jest | `jest` package or script | `jest.config.*`, `package.json`, `--config`, `-c` |
| Next | `next` package or script | `next.config.*`, `pages/**`, `app/**`, `src/pages/**`, `src/app/**` |
| Playwright | `@playwright/test` or `playwright` package/script | `playwright.config.*`, `tests/**`, `e2e/**` |
| Prettier | `prettier` package or script | `.prettierrc*`, `prettier.config.*`, `package.json#prettier`, `--plugin`, `--config` |
| Rollup | `rollup` package or script | `rollup.config.*`, `--config`, `-c` |
| Storybook | `storybook` package or script | `.storybook/main.*`, `.storybook/preview.*`, stories globs |
| SvelteKit | `@sveltejs/kit` package or `svelte-kit` script | `svelte.config.*`, `vite.config.*`, `src/routes/**`, `src/hooks.*` |
| Tailwind | `tailwindcss` package or script | `tailwind.config.*`, `postcss.config.*`, `-c` |
| TypeScript | `typescript` package or `tsc` script | `tsconfig*.json`, `extends`, `references`, `compilerOptions.plugins` |
| Vite | `vite` package or script | `vite.config.*`, `--config`, `-c` |
| Vitest | `vitest` package or script | `vitest.config.*`, `--config`, `-c` |
| webpack | `webpack` package or script | `webpack.config.*`, `--config`, `-c` |
