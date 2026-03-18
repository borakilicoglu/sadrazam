import { access } from "node:fs/promises";
import path from "node:path";

const COMMAND_SPLIT_RE = /\s*(?:&&|\|\||;)\s*/;
const TOKEN_RE = /"[^"]*"|'[^']*'|`[^`]*`|[^\s]+/g;

export interface PluginAnalysis {
  activePlugins: string[];
  commandPackages: string[];
  fileEntries: string[];
  commandUsage: Record<string, string[]>;
}

interface PluginContribution {
  packages?: string[];
  fileEntries?: string[];
  packageUsage?: Record<string, string[]>;
}

interface PluginContext {
  packageDir: string;
  scripts: Record<string, string>;
}

export interface PluginInputsConfig {
  entryFiles?: string[];
  packageNames?: string[];
}

interface ScriptPlugin {
  name: string;
  supports(command: string): boolean;
  resolve(tokens: string[], packageDir: string): Promise<PluginContribution | null>;
}


function createConfigEntryPlugin(name: string, commands: string[], flags: string[]): ScriptPlugin {
  return {
    name,
    supports(command) {
      return commands.includes(command);
    },
    async resolve(tokens, packageDir) {
      const fileEntries = new Set<string>();

      for (let index = 0; index < tokens.length; index += 1) {
        const token = stripQuotes(tokens[index] ?? "");
        const next = stripQuotes(tokens[index + 1] ?? "");

        if (!flags.includes(token) || !next) {
          continue;
        }

        const configPath = path.resolve(packageDir, next);

        if (await fileExists(configPath)) {
          fileEntries.add(configPath);
        }

        index += 1;
      }

      return fileEntries.size > 0
        ? {
            fileEntries: [...fileEntries],
          }
        : null;
    },
  };
}

const PLUGINS: ScriptPlugin[] = [
  createConfigEntryPlugin("vite", ["vite"], ["--config"]),
  createConfigEntryPlugin("vitest", ["vitest"], ["--config"]),
  createConfigEntryPlugin("jest", ["jest"], ["--config"]),
  {
    name: "prettier",
    supports(command) {
      return command === "prettier";
    },
    async resolve(tokens, packageDir) {
      const packages = new Set<string>();
      const fileEntries = new Set<string>();

      for (let index = 0; index < tokens.length; index += 1) {
        const token = stripQuotes(tokens[index] ?? "");
        const next = stripQuotes(tokens[index + 1] ?? "");

        if (token === "--plugin" && next) {
          packages.add(next);
          index += 1;
          continue;
        }

        if (token === "--config" && next) {
          const configPath = path.resolve(packageDir, next);

          if (await fileExists(configPath)) {
            fileEntries.add(configPath);
          }

          index += 1;
        }
      }

      if (packages.size === 0 && fileEntries.size === 0) {
        return null;
      }

      return {
        packages: [...packages],
        fileEntries: [...fileEntries],
      };
    },
  },
  {
    name: "eslint",
    supports(command) {
      return command === "eslint";
    },
    async resolve(tokens) {
      const packages = new Set<string>();

      for (let index = 0; index < tokens.length; index += 1) {
        const token = stripQuotes(tokens[index] ?? "");
        const next = stripQuotes(tokens[index + 1] ?? "");

        if (token === "--parser" && next) {
          packages.add(next);
          index += 1;
          continue;
        }

        if (token === "--plugin" && next) {
          packages.add(normalizeEslintPlugin(next));
          index += 1;
        }
      }

      return packages.size > 0
        ? {
            packages: [...packages],
          }
        : null;
    },
  },
];

export async function analyzePlugins(context: PluginContext): Promise<PluginAnalysis> {
  const activePlugins = new Set<string>();
  const commandPackages = new Set<string>();
  const fileEntries = new Set<string>();
  const commandUsage = new Map<string, Set<string>>();

  for (const [scriptName, script] of Object.entries(context.scripts)) {
    const segments = script.split(COMMAND_SPLIT_RE);

    for (const segment of segments) {
      const tokens = tokenize(segment);

      if (tokens.length === 0) {
        continue;
      }

      const command = resolveCommandName(tokens);

      if (!command) {
        continue;
      }

      for (const plugin of PLUGINS) {
        if (!plugin.supports(command)) {
          continue;
        }

        const contribution = await plugin.resolve(tokens, context.packageDir);

        if (!contribution) {
          continue;
        }

        activePlugins.add(plugin.name);

        for (const packageName of contribution.packages ?? []) {
          commandPackages.add(packageName);
          addUsage(commandUsage, packageName, `script:${scriptName}`);
        }

        for (const filePath of contribution.fileEntries ?? []) {
          fileEntries.add(filePath);
        }

        for (const [packageName, sources] of Object.entries(contribution.packageUsage ?? {})) {
          commandPackages.add(packageName);

          for (const source of sources) {
            addUsage(commandUsage, packageName, source);
          }
        }
      }
    }
  }

  return {
    activePlugins: [...activePlugins].sort(),
    commandPackages: [...commandPackages].sort(),
    fileEntries: [...fileEntries].sort(),
    commandUsage: Object.fromEntries(
      [...commandUsage.entries()]
        .map(([packageName, sources]) => [packageName, [...sources].sort()] as const)
        .sort(([left], [right]) => left.localeCompare(right)),
    ),
  };
}

function tokenize(command: string): string[] {
  return command.match(TOKEN_RE)?.map((token) => token.trim()).filter(Boolean) ?? [];
}

function resolveCommandName(tokens: string[]): string | null {
  const [first, second] = tokens;
  const command = stripQuotes(first ?? "");

  if (!command) {
    return null;
  }

  if (command === "npx" || command === "pnpx") {
    return stripQuotes(second ?? "") || null;
  }

  return command;
}

function normalizeEslintPlugin(value: string): string {
  if (value.startsWith("@")) {
    if (value.includes("/eslint-plugin")) {
      return value;
    }

    const [scope, name] = value.split("/");
    return name ? `${scope}/eslint-plugin${name ? `-${name}` : ""}` : value;
  }

  return value.startsWith("eslint-plugin-") ? value : `eslint-plugin-${value}`;
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

export async function analyzePluginInputs(
  packageDir: string,
  inputs: PluginInputsConfig | undefined,
): Promise<PluginAnalysis> {
  const entryFiles = new Set<string>();
  const commandPackages = new Set<string>();
  const commandUsage = new Map<string, Set<string>>();

  for (const entryFile of inputs?.entryFiles ?? []) {
    const absolutePath = path.resolve(packageDir, entryFile);

    if (await fileExists(absolutePath)) {
      entryFiles.add(absolutePath);
    }
  }

  for (const packageName of inputs?.packageNames ?? []) {
    commandPackages.add(packageName);
    addUsage(commandUsage, packageName, "input:config");
  }

  const activePlugins = entryFiles.size > 0 || commandPackages.size > 0 ? ["inputs"] : [];

  return {
    activePlugins,
    commandPackages: [...commandPackages].sort(),
    fileEntries: [...entryFiles].sort(),
    commandUsage: Object.fromEntries(
      [...commandUsage.entries()]
        .map(([packageName, sources]) => [packageName, [...sources].sort()] as const)
        .sort(([left], [right]) => left.localeCompare(right)),
    ),
  };
}
