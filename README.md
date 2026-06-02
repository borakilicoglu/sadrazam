<p align="center">
  <img src="https://raw.githubusercontent.com/borakilicoglu/sadrazam/main/assets/logo.svg?v=2" alt="Sadrazam logo" width="160" />
</p>

<p align="center">
  <b>Find and remove unused dependencies in seconds — with AI-powered explanations.</b>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/sadrazam"><img src="https://img.shields.io/npm/v/sadrazam" /></a>
  <a href="https://github.com/borakilicoglu/sadrazam/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/sadrazam" /></a>
  <a href="https://www.npmjs.com/package/sadrazam"><img src="https://img.shields.io/npm/dt/sadrazam" /></a>
</p>

---

## ⚡ What is Sadrazam?

Sadrazam is a CLI tool that scans your project and tells you:

- which dependencies are **unused**
- which ones are **misplaced or risky**
- what you can safely **remove or fix**

👉 And if you enable AI:  
it explains **why**, **what to do next**, and supports **agent-friendly TOON output** for automation and LLM workflows.

---

## 🚀 Quick Start

```bash
npx sadrazam .
```

That’s it.

---

## 🧠 Example Output

```
❌ Unused dependency: lodash
💡 Suggested: remove

⚠️ Misplaced dependency: typescript
💡 Suggested: move to devDependencies
```

With AI:

```
🧠 lodash is not imported anywhere in your codebase.
Removing it will reduce bundle size and install time.
```

---

## 🎯 Why Sadrazam?

JavaScript projects accumulate dependencies over time.

- unused packages slow installs
- wrong dependencies increase risk
- messy `package.json` hurts maintainability

Sadrazam answers one question:

👉 **What can I safely remove from this project?**

---

## 🔥 What Makes It Different?

Unlike traditional tools:

- detects unused dependencies AND unused files/exports
- understands package workspaces, Lerna, Rush, and modern frameworks
- reads common tool configs such as Babel, PostCSS, Commitlint, lint-staged, and Husky hooks
- reads GitHub Actions, GitLab CI, CircleCI, Azure Pipelines, and Bitbucket Pipelines workflows so CI-only tools are treated as used
- reads Dockerfile and Docker Compose commands so container-only tools are treated as used
- optional AI layer for real explanations (not raw output)
- safe auto-fix for `package.json`

---

## ⚡ Common Use Cases

- clean up old projects
- audit dependency bloat
- prepare for production
- CI dependency checks
- monorepo hygiene

---

## 🛠️ Usage

Basic scan:

```bash
npx sadrazam .
```

Create a config file:

```bash
npx sadrazam init
```

JSON output:

```bash
npx sadrazam . --reporter json
```

TOON output:

```bash
npx sadrazam . --reporter toon
```

Auto-fix:

```bash
npx sadrazam . --fix --format
```

`--fix` removes deterministic unused package declarations and can add missing packages to `devDependencies` with a `"*"` placeholder version.

Trace why something is used:

```bash
npx sadrazam . --trace typescript
```

Plugin overrides live in `sadrazam.json` when automatic tool discovery needs help:

```json
{
  "plugins": {
    "vite": true,
    "jest": false,
    "playwright": {
      "config": "config/playwright.config.ts",
      "entry": "integration/**/*.spec.ts"
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
    }
  }
}
```

Explain findings of one type:

```bash
npx sadrazam . --explain unused-files
```

Focus on export hygiene:

```bash
npx sadrazam . --include unused-exports,duplicate-exports,namespace-members
```

Limit displayed items per finding without changing the scan result or exit code:

```bash
npx sadrazam . --max-show-issues 10
```

---

## 🧠 AI Mode (Optional)

Enable AI to get explanations and recommendations:

```bash
AI_PROVIDER=openai AI_TOKEN=your_token npx sadrazam . --ai
```

AI will:

- explain why a dependency is unused
- suggest what action to take
- summarize cleanup steps

---

## ⚙️ Features

- unused dependency detection
- unresolved local import detection
- unused file + export detection
- TypeScript namespace member detection
- monorepo & workspace support
- TypeScript path alias support
- OXC-backed parser and local resolver
- script-aware scanning
- CommonJS + modern import support
- safe auto-fix
- text, JSON, TOON, markdown, and SARIF output
- AI-powered insights

👉 Full feature list: https://borakilicoglu.github.io/sadrazam/features

---

## 📦 Install

```bash
npm install -g sadrazam
```

or:

```bash
npx sadrazam .
```

---

## 🧪 When to Use It

Run Sadrazam when:

- your project feels bloated
- you're unsure which deps are safe to remove
- you're preparing for deployment
- you're reviewing a codebase

---

## 💡 Philosophy

Sadrazam is built around a simple idea:

> **Keep your dependency tree clean, understandable, and safe.**

AI is optional — the core tool works without it.

---

## ❤️ Support

If this tool saves you time:

⭐ Star the repo  
☕ Support via GitHub Sponsors

https://github.com/sponsors/borakilicoglu

---

## 🔗 Links

- GitHub: https://github.com/borakilicoglu/sadrazam
- npm: https://www.npmjs.com/package/sadrazam
- Docs: https://borakilicoglu.github.io/sadrazam/features
