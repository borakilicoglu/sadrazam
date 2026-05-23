import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * A resolved alias entry: the prefix to match and the absolute base path(s) it maps to.
 */
export interface AliasEntry {
  /** The prefix as written in imports, e.g. "@/" or "~/" or "src/" */
  prefix: string;
  /** Absolute directory paths the prefix maps to, in priority order */
  targets: string[];
}

interface TsConfigShape {
  extends?: string;
  compilerOptions?: {
    baseUrl?: string;
    paths?: Record<string, string[]>;
  };
}

/**
 * Reads tsconfig.json (and follows a single level of `extends`) from the given
 * package directory and returns the resolved path alias entries.
 *
 * Returns an empty array when no tsconfig is found or no paths are configured.
 */
export async function loadAliasEntries(packageDir: string): Promise<AliasEntry[]> {
  const tsconfig = await readTsConfig(packageDir);

  if (!tsconfig) {
    return [];
  }

  const baseUrl = resolveBaseUrl(packageDir, tsconfig);
  const paths = tsconfig.compilerOptions?.paths;

  if (!paths || typeof paths !== "object") {
    return [];
  }

  const entries: AliasEntry[] = [];

  for (const [pattern, rawTargets] of Object.entries(paths)) {
    if (!Array.isArray(rawTargets) || rawTargets.length === 0) {
      continue;
    }

    // "foo/*" -> "foo/",  "@/*" -> "@/",  "foo" -> "foo"
    const prefix = pattern.endsWith("/*")
      ? pattern.slice(0, -1)
      : pattern.endsWith("*")
        ? pattern.slice(0, -1)
        : pattern;

    const targets = rawTargets
      .map((target) => {
        const cleanTarget = target.endsWith("/*")
          ? target.slice(0, -2)
          : target.endsWith("*")
            ? target.slice(0, -1)
            : target;

        return path.resolve(baseUrl, cleanTarget);
      })
      .filter(Boolean);

    if (targets.length > 0) {
      entries.push({ prefix, targets });
    }
  }

  return entries;
}

/**
 * Given a specifier and the alias entries for the project, returns the resolved
 * absolute path if the specifier matches an alias — or null if it doesn't.
 *
 * Example:
 *   specifier = "@/components/Button"
 *   alias     = { prefix: "@/", targets: ["/project/src"] }
 *   returns     "/project/src/components/Button"
 */
export function resolveAlias(specifier: string, aliases: AliasEntry[]): string | null {
  return resolveAliasCandidates(specifier, aliases)[0] ?? null;
}

export function resolveAliasCandidates(specifier: string, aliases: AliasEntry[]): string[] {
  for (const alias of aliases) {
    if (!specifier.startsWith(alias.prefix)) {
      continue;
    }

    const rest = specifier.slice(alias.prefix.length);

    return alias.targets.map((target) => path.join(target, rest));
  }

  return [];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function readTsConfig(packageDir: string): Promise<TsConfigShape | null> {
  const candidates = ["tsconfig.json", "tsconfig.base.json"];

  for (const filename of candidates) {
    const configPath = path.join(packageDir, filename);

    try {
      const raw = await readFile(configPath, "utf8");
      const parsed = JSON.parse(stripJsonComments(raw)) as TsConfigShape;

      // Follow one level of `extends` to pick up shared base configs
      if (parsed.extends && !parsed.compilerOptions?.paths) {
        const extendedPath = path.resolve(packageDir, parsed.extends);
        const extended = await readTsConfigFile(extendedPath);

        if (extended) {
          return mergeConfigs(extended, parsed);
        }
      }

      return parsed;
    } catch {
      // file not found or invalid JSON — try next candidate
    }
  }

  return null;
}

async function readTsConfigFile(configPath: string): Promise<TsConfigShape | null> {
  const candidates = configPath.endsWith(".json")
    ? [configPath]
    : [`${configPath}.json`, configPath];

  for (const candidate of candidates) {
    try {
      const raw = await readFile(candidate, "utf8");
      return JSON.parse(stripJsonComments(raw)) as TsConfigShape;
    } catch {
      // continue
    }
  }

  return null;
}

function mergeConfigs(base: TsConfigShape, override: TsConfigShape): TsConfigShape {
  const merged: TsConfigShape = {
    compilerOptions: {
      ...base.compilerOptions,
      ...override.compilerOptions,
    },
  };

  // Prefer override paths, fall back to base paths
  const paths = override.compilerOptions?.paths ?? base.compilerOptions?.paths;
  if (paths && merged.compilerOptions) {
    merged.compilerOptions.paths = paths;
  }

  return merged;
}

function resolveBaseUrl(packageDir: string, tsconfig: TsConfigShape): string {
  const baseUrl = tsconfig.compilerOptions?.baseUrl;
  return baseUrl ? path.resolve(packageDir, baseUrl) : packageDir;
}

/**
 * Minimal JSON comment stripper — handles // and block comments
 * so tsconfig.json files with comments can be parsed with JSON.parse.
 */
function stripJsonComments(source: string): string {
  return source
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}
