import { access } from "node:fs/promises";
import path from "node:path";

const COMMAND_SPLIT_RE = /\s*(?:&&|\|\||;)\s*/;
const TOKEN_RE = /"[^"]*"|'[^']*'|`[^`]*`|[^\s]+/g;
const BUILTIN_SCRIPT_COMMANDS = new Set([
  "node",
  "npm",
  "pnpm",
  "yarn",
  "bun",
  "npx",
  "pnpx",
  "sh",
  "bash",
]);
const COMMAND_PACKAGE_ALIASES: Record<string, string> = {
  biome: "@biomejs/biome",
  attw: "@arethetypeswrong/cli",
  changeset: "@changesets/cli",
  markdownlint: "markdownlint-cli",
  tsc: "typescript",
  // test runners
  jest: "jest",
  playwright: "@playwright/test",
  vitest: "vitest",
  mocha: "mocha",
  // linters / formatters
  eslint: "eslint",
  prettier: "prettier",
  standard: "standard",
  // build tools
  vite: "vite",
  "svelte-kit": "@sveltejs/kit",
  webpack: "webpack",
  rollup: "rollup",
  esbuild: "esbuild",
  tsup: "tsup",
  tsdown: "tsdown",
  // utilities
  rimraf: "rimraf",
  "cross-env": "cross-env",
  concurrently: "concurrently",
  "wait-on": "wait-on",
  dotenv: "dotenv-cli",
  // git hooks
  husky: "husky",
  "lint-staged": "lint-staged",
  // release / versioning
  "semantic-release": "semantic-release",
  "release-it": "release-it",
  bumpp: "bumpp",
};

export interface ParsedScripts {
  commandPackages: string[];
  fileEntries: string[];
  commandUsage: Record<string, string[]>;
}

export async function parsePackageScripts(
  packageDir: string,
  scripts: Record<string, string>,
): Promise<ParsedScripts> {
  const commandPackages = new Set<string>();
  const fileEntries = new Set<string>();
  const commandUsage = new Map<string, Set<string>>();

  for (const [scriptName, script] of Object.entries(scripts)) {
    const segments = script.split(COMMAND_SPLIT_RE);

    for (const segment of segments) {
      const tokens = tokenize(segment);

      if (tokens.length === 0) {
        continue;
      }

      const commandPackage = resolveCommandPackage(tokens);

      if (commandPackage) {
        commandPackages.add(commandPackage);
        addUsage(commandUsage, commandPackage, `script:${scriptName}`);
      }

      for (const token of tokens) {
        const cleaned = stripQuotes(token);

        if (looksLikeFileReference(cleaned)) {
          const absolutePath = path.resolve(packageDir, cleaned);

          if (await fileExists(absolutePath)) {
            fileEntries.add(absolutePath);
          }
        }
      }
    }
  }

  return {
    commandPackages: [...commandPackages].sort(),
    fileEntries: [...fileEntries].sort(),
    commandUsage: mapUsage(commandUsage),
  };
}

function tokenize(command: string): string[] {
  return command.match(TOKEN_RE)?.map((token) => token.trim()).filter(Boolean) ?? [];
}

function resolveCommandPackage(tokens: string[]): string | null {
  const [first, second] = tokens;

  if (!first) {
    return null;
  }

  const command = stripQuotes(first);

  if (command === "npx" || command === "pnpx") {
    return second ? normalizeCommandName(stripQuotes(second)) : null;
  }

  if (BUILTIN_SCRIPT_COMMANDS.has(command)) {
    return null;
  }

  return normalizeCommandName(command);
}

function normalizeCommandName(command: string): string {
  const aliasedPackage = COMMAND_PACKAGE_ALIASES[command];

  if (aliasedPackage) {
    return aliasedPackage;
  }

  if (command.startsWith("@")) {
    const [scope, name] = command.split("/");
    return scope && name ? `${scope}/${name}` : command;
  }

  return command;
}

function looksLikeFileReference(token: string): boolean {
  if (token.startsWith("-")) {
    return false;
  }

  return (
    token.startsWith("./") ||
    token.startsWith("../") ||
    token.endsWith(".js") ||
    token.endsWith(".cjs") ||
    token.endsWith(".mjs") ||
    token.endsWith(".ts") ||
    token.endsWith(".cts") ||
    token.endsWith(".mts") ||
    token.endsWith(".jsx") ||
    token.endsWith(".tsx")
  );
}

function stripQuotes(value: string): string {
  return value.replace(/^['"`]|['"`]$/g, "");
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function addUsage(usageMap: Map<string, Set<string>>, packageName: string, source: string): void {
  const entries = usageMap.get(packageName) ?? new Set<string>();
  entries.add(source);
  usageMap.set(packageName, entries);
}

function mapUsage(usageMap: Map<string, Set<string>>): Record<string, string[]> {
  return Object.fromEntries(
    [...usageMap.entries()]
      .map(([packageName, entries]) => [packageName, [...entries].sort()] as const)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}
