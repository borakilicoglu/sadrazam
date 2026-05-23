# Getting Started

## Install

```bash
npm install -g sadrazam
```

Or run it directly with `npx`:

```bash
npx sadrazam .
```

## First Scan

Run Sadrazam in the current project:

```bash
sadrazam .
```

Useful first commands:

```bash
sadrazam init
sadrazam . --reporter json
sadrazam . --reporter toon
sadrazam . --trace typescript
sadrazam . --explain unused-files
sadrazam . --production --strict
```

## What To Expect

Sadrazam exits with:

- `0` when no findings are reported
- `1` when execution fails
- `2` when findings are reported

That makes it safe to use in CI without custom wrappers.
