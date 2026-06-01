import { access, readFile } from "node:fs/promises";
import path from "node:path";

import fg from "fast-glob";
import { parse as parseYaml } from "yaml";

import type { PackageJsonShape } from "./packageReader.js";

const COMMAND_SPLIT_RE = /\s*(?:&&|\|\||;)\s*/;
const TOKEN_RE = /"[^"]*"|'[^']*'|`[^`]*`|[^\s]+/g;
const CONFIG_EXTENSIONS = "{js,cjs,mjs,ts,cts,mts,json,jsonc}";

export interface PluginAnalysis {
  activePlugins: string[];
  commandPackages: string[];
  fileEntries: string[];
  commandUsage: Record<string, string[]>;
  details: PluginDetail[];
}

export interface PluginDetail {
  name: string;
  activation: string[];
  packages: string[];
  fileEntries: string[];
}

interface PluginContribution {
  packages?: string[];
  fileEntries?: string[];
  packageUsage?: Record<string, string[]>;
}

interface PluginContext {
  packageDir: string;
  packagePath: string;
  packageJson: PackageJsonShape;
  scripts: Record<string, string>;
  dependencyNames: Set<string>;
  config?: PluginsConfig;
}

export type PluginsConfig = Record<string, boolean | PluginConfig>;

export interface PluginConfig {
  config?: string | string[];
  entry?: string | string[];
}

export interface PluginInputsConfig {
  entryFiles?: string[];
  packageNames?: string[];
}

interface PluginDefinition {
  name: string;
  commands: string[];
  packages: string[];
  configPatterns?: string[];
  entryPatterns?: string[];
  configFlags?: string[];
  packageFlags?: Array<{
    flag: string;
    normalize?: (value: string) => string;
  }>;
  analyzeConfig?: (filePath: string, context: PluginContext) => Promise<PluginContribution | null>;
  analyzePackageJson?: (context: PluginContext) => PluginContribution | null;
  isEnabled?: (context: PluginContext, override: boolean | PluginConfig | undefined) => Promise<boolean>;
}

const CONFIG_FLAG_ALIASES = ["--config", "-c"];

const PLUGINS: PluginDefinition[] = [
  createToolPlugin("vite", ["vite"], ["vite"], [`vite.config.${CONFIG_EXTENSIONS}`]),
  createToolPlugin("vitest", ["vitest"], ["vitest"], [`vitest.config.${CONFIG_EXTENSIONS}`]),
  createToolPlugin("jest", ["jest"], ["jest"], [
    `jest.config.${CONFIG_EXTENSIONS}`,
    "package.json",
  ]),
  createToolPlugin("playwright", ["playwright"], ["@playwright/test", "playwright"], [
    `playwright.config.${CONFIG_EXTENSIONS}`,
  ], ["tests/**", "e2e/**"]),
  createToolPlugin("cypress", ["cypress"], ["cypress"], [
    `cypress.config.${CONFIG_EXTENSIONS}`,
  ], ["cypress/**"]),
  createToolPlugin("storybook", ["storybook", "start-storybook", "build-storybook"], ["storybook", "@storybook/cli"], [
    ".storybook/main.{js,cjs,mjs,ts,cts,mts}",
    ".storybook/preview.{js,cjs,mjs,ts,cts,mts}",
  ], [".storybook/**", "src/**/*.stories.{js,jsx,ts,tsx,mdx}"]),
  createToolPlugin("next", ["next"], ["next"], [
    "next.config.{js,cjs,mjs,ts}",
  ], ["pages/**/*.{js,jsx,ts,tsx}", "app/**/*.{js,jsx,ts,tsx}", "src/pages/**/*.{js,jsx,ts,tsx}", "src/app/**/*.{js,jsx,ts,tsx}"]),
  createToolPlugin("astro", ["astro"], ["astro"], [
    "astro.config.{js,cjs,mjs,ts}",
  ], ["src/pages/**/*.astro", "src/content/**/*.{md,mdx}"]),
  createToolPlugin("sveltekit", ["svelte-kit"], ["@sveltejs/kit"], [
    "svelte.config.{js,cjs,mjs,ts}",
    "vite.config.{js,cjs,mjs,ts}",
  ], ["src/routes/**/*.{js,ts,svelte}", "src/hooks.{js,ts}"]),
  createToolPlugin("webpack", ["webpack", "webpack-cli"], ["webpack", "webpack-cli"], [
    `webpack.config.${CONFIG_EXTENSIONS}`,
  ]),
  createToolPlugin("rollup", ["rollup"], ["rollup"], [
    `rollup.config.${CONFIG_EXTENSIONS}`,
  ]),
  {
    ...createToolPlugin("eslint", ["eslint"], ["eslint"], [
      ".eslintrc",
      `.eslintrc.${CONFIG_EXTENSIONS}`,
      `eslint.config.${CONFIG_EXTENSIONS}`,
    ]),
    packageFlags: [
      { flag: "--parser" },
      { flag: "--plugin", normalize: normalizeEslintPlugin },
    ],
    analyzeConfig: analyzeEslintConfig,
  },
  {
    ...createToolPlugin("prettier", ["prettier"], ["prettier"], [
      `.prettierrc.${CONFIG_EXTENSIONS}`,
      "prettier.config.{js,cjs,mjs,ts,cts,mts}",
      ".prettierrc",
    ]),
    packageFlags: [{ flag: "--plugin" }],
    analyzePackageJson: analyzePrettierPackageJson,
  },
  {
    ...createToolPlugin("tailwind", ["tailwindcss"], ["tailwindcss"], [
      "tailwind.config.{js,cjs,mjs,ts}",
      "postcss.config.{js,cjs,mjs,ts}",
    ]),
  },
  {
    ...createToolPlugin("typescript", ["tsc", "tsserver"], ["typescript"], [
      "tsconfig.json",
      "tsconfig.*.json",
    ]),
    analyzeConfig: analyzeTsConfig,
  },
  {
    ...createToolPlugin("github-actions", [], [], [
      ".github/workflows/*.{yml,yaml}",
      ".github/**/action.{yml,yaml}",
    ]),
    isEnabled: async (context, override) => {
      if (override === true || isPluginConfigObject(override)) {
        return true;
      }

      return (await collectFilesFromPatterns(context.packageDir, [".github/workflows/*.{yml,yaml}"])).length > 0;
    },
    analyzeConfig: analyzeGitHubActionsConfig,
  },
  {
    ...createToolPlugin("gitlab-ci", [], [], [
      ".gitlab-ci.yml",
      ".gitlab-ci.yaml",
    ]),
    isEnabled: async (context, override) => {
      if (override === true || isPluginConfigObject(override)) {
        return true;
      }

      return (await collectFilesFromPatterns(context.packageDir, [".gitlab-ci.{yml,yaml}"])).length > 0;
    },
    analyzeConfig: analyzeGitLabCiConfig,
  },
  {
    ...createToolPlugin("circleci", [], [], [
      ".circleci/config.yml",
      ".circleci/config.yaml",
    ]),
    isEnabled: async (context, override) => {
      if (override === true || isPluginConfigObject(override)) {
        return true;
      }

      return (await collectFilesFromPatterns(context.packageDir, [".circleci/config.{yml,yaml}"])).length > 0;
    },
    analyzeConfig: analyzeCircleCiConfig,
  },
  {
    ...createToolPlugin("azure-pipelines", [], [], [
      "azure-pipelines.yml",
      "azure-pipelines.yaml",
      ".azure-pipelines/*.{yml,yaml}",
    ]),
    isEnabled: async (context, override) => {
      if (override === true || isPluginConfigObject(override)) {
        return true;
      }

      return (await collectFilesFromPatterns(context.packageDir, [
        "azure-pipelines.{yml,yaml}",
        ".azure-pipelines/*.{yml,yaml}",
      ])).length > 0;
    },
    analyzeConfig: analyzeAzurePipelinesConfig,
  },
  {
    ...createToolPlugin("bitbucket-pipelines", [], [], [
      "bitbucket-pipelines.yml",
      "bitbucket-pipelines.yaml",
    ]),
    isEnabled: async (context, override) => {
      if (override === true || isPluginConfigObject(override)) {
        return true;
      }

      return (await collectFilesFromPatterns(context.packageDir, ["bitbucket-pipelines.{yml,yaml}"])).length > 0;
    },
    analyzeConfig: analyzeBitbucketPipelinesConfig,
  },
];

export async function analyzePlugins(context: PluginContext): Promise<PluginAnalysis> {
  const activePlugins = new Set<string>();
  const commandPackages = new Set<string>();
  const fileEntries = new Set<string>();
  const commandUsage = new Map<string, Set<string>>();
  const details: PluginDetail[] = [];
  const scripts = collectScriptInvocations(context.scripts);

  for (const plugin of PLUGINS) {
    const override = context.config?.[plugin.name];

    if (override === false) {
      continue;
    }

    const scriptInvocations = scripts.filter((script) => plugin.commands.includes(script.command));
    const isForced = override === true || isPluginConfigObject(override);
    const isDeclared = plugin.packages.some((packageName) => context.dependencyNames.has(packageName));
    const isEnabled = await plugin.isEnabled?.(context, override) ?? false;

    if (!isForced && !isDeclared && !isEnabled && scriptInvocations.length === 0) {
      continue;
    }

    const contribution = await collectPluginContribution(plugin, context, scriptInvocations, override);

    if (!hasContribution(contribution) && !isDeclared && !isForced && !isEnabled) {
      continue;
    }

    activePlugins.add(plugin.name);
    mergeContribution(contribution, commandPackages, fileEntries, commandUsage);
    details.push({
      name: plugin.name,
      activation: [
        isDeclared ? "dependency" : null,
        scriptInvocations.length > 0 ? "script" : null,
        isForced ? "config" : null,
        isEnabled ? "config-file" : null,
      ].filter((value): value is string => Boolean(value)),
      packages: contribution.packages ?? [],
      fileEntries: contribution.fileEntries ?? [],
    });
  }

  return {
    activePlugins: [...activePlugins].sort(),
    commandPackages: [...commandPackages].sort(),
    fileEntries: [...fileEntries].sort(),
    details: details.sort((left, right) => left.name.localeCompare(right.name)),
    commandUsage: Object.fromEntries(
      [...commandUsage.entries()]
        .map(([packageName, sources]) => [packageName, [...sources].sort()] as const)
        .sort(([left], [right]) => left.localeCompare(right)),
    ),
  };
}

export async function analyzePluginInputs(
  packageDir: string,
  config: PluginInputsConfig | undefined,
): Promise<PluginAnalysis> {
  const commandPackages = new Set<string>();
  const fileEntries = new Set<string>();
  const commandUsage = new Map<string, Set<string>>();

  for (const packageName of config?.packageNames ?? []) {
    commandPackages.add(packageName);
    addUsage(commandUsage, packageName, "config:inputs.packageNames");
  }

  for (const entry of config?.entryFiles ?? []) {
    const filePath = path.resolve(packageDir, entry);

    if (await fileExists(filePath)) {
      fileEntries.add(filePath);
    }
  }

  return {
    activePlugins: commandPackages.size > 0 || fileEntries.size > 0 ? ["inputs"] : [],
    commandPackages: [...commandPackages].sort(),
    fileEntries: [...fileEntries].sort(),
    details: commandPackages.size > 0 || fileEntries.size > 0
      ? [{
          name: "inputs",
          activation: ["config"],
          packages: [...commandPackages].sort(),
          fileEntries: [...fileEntries].sort(),
        }]
      : [],
    commandUsage: Object.fromEntries(
      [...commandUsage.entries()]
        .map(([packageName, sources]) => [packageName, [...sources].sort()] as const)
        .sort(([left], [right]) => left.localeCompare(right)),
    ),
  };
}

function createToolPlugin(
  name: string,
  commands: string[],
  packages: string[],
  configPatterns: string[] = [],
  entryPatterns: string[] = [],
): PluginDefinition {
  return {
    name,
    commands,
    packages,
    configPatterns,
    entryPatterns,
    configFlags: CONFIG_FLAG_ALIASES,
  };
}

async function collectPluginContribution(
  plugin: PluginDefinition,
  context: PluginContext,
  scriptInvocations: ScriptInvocation[],
  override: boolean | PluginConfig | undefined,
): Promise<PluginContribution> {
  const packages = new Set<string>();
  const fileEntries = new Set<string>();
  const packageUsage = new Map<string, Set<string>>();

  for (const invocation of scriptInvocations) {
    if (plugin.packages[0]) {
      packages.add(plugin.packages[0]);
      addUsage(packageUsage, plugin.packages[0], `script:${invocation.scriptName}`);
    }

    for (const packageName of collectPackagesFromFlags(invocation.tokens, plugin.packageFlags ?? [])) {
      packages.add(packageName.name);
      addUsage(packageUsage, packageName.name, `script:${invocation.scriptName}`);
    }

    for (const filePath of await collectFilesFromFlags(context.packageDir, invocation.tokens, plugin.configFlags ?? [])) {
      fileEntries.add(filePath);
    }

    for (const filePath of await collectPositionalFiles(context.packageDir, invocation.tokens.slice(1))) {
      fileEntries.add(filePath);
    }
  }

  const configPatterns = isPluginConfigObject(override)
    ? toArray(override.config ?? plugin.configPatterns ?? [])
    : plugin.configPatterns ?? [];
  const entryPatterns = isPluginConfigObject(override)
    ? toArray(override.entry ?? plugin.entryPatterns ?? [])
    : plugin.entryPatterns ?? [];

  for (const filePath of await collectFilesFromPatterns(context.packageDir, configPatterns)) {
    fileEntries.add(filePath);
    const configContribution = plugin.analyzeConfig ? await plugin.analyzeConfig(filePath, context) : null;
    mergeContribution(configContribution, packages, fileEntries, packageUsage);
  }

  for (const filePath of await collectFilesFromPatterns(context.packageDir, entryPatterns)) {
    fileEntries.add(filePath);
  }

  mergeContribution(plugin.analyzePackageJson?.(context) ?? null, packages, fileEntries, packageUsage);

  return {
    packages: [...packages].sort(),
    fileEntries: [...fileEntries].sort(),
    packageUsage: Object.fromEntries(
      [...packageUsage.entries()].map(([packageName, sources]) => [packageName, [...sources].sort()] as const),
    ),
  };
}

function collectScriptInvocations(scripts: Record<string, string>): ScriptInvocation[] {
  const invocations: ScriptInvocation[] = [];

  for (const [scriptName, script] of Object.entries(scripts)) {
    for (const segment of splitCommandSegments(script)) {
      const tokens = tokenize(segment);
      const command = resolveCommandName(tokens);

      if (command) {
        invocations.push({ scriptName, command, tokens });
      }
    }
  }

  return invocations;
}

function splitCommandSegments(script: string): string[] {
  return script
    .split(/\r?\n/)
    .flatMap((line) => line.split(COMMAND_SPLIT_RE))
    .map((segment) => segment.trim())
    .filter(Boolean);
}

interface ScriptInvocation {
  scriptName: string;
  command: string;
  tokens: string[];
}

function collectPackagesFromFlags(
  tokens: string[],
  flags: NonNullable<PluginDefinition["packageFlags"]>,
): Array<{ name: string }> {
  const packages: Array<{ name: string }> = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = stripQuotes(tokens[index] ?? "");
    const flag = flags.find((candidate) => candidate.flag === token);
    const next = stripQuotes(tokens[index + 1] ?? "");

    if (!flag || !next) {
      continue;
    }

    packages.push({ name: flag.normalize ? flag.normalize(next) : next });
    index += 1;
  }

  return packages;
}

async function collectFilesFromFlags(packageDir: string, tokens: string[], flags: string[]): Promise<string[]> {
  const fileEntries = new Set<string>();

  for (let index = 0; index < tokens.length; index += 1) {
    const token = stripQuotes(tokens[index] ?? "");
    const next = stripQuotes(tokens[index + 1] ?? "");

    if (!flags.includes(token) || !next) {
      continue;
    }

    for (const filePath of await resolveEntryPattern(packageDir, next)) {
      fileEntries.add(filePath);
    }

    index += 1;
  }

  return [...fileEntries];
}

async function collectPositionalFiles(packageDir: string, tokens: string[]): Promise<string[]> {
  const entries = new Set<string>();

  for (const rawToken of tokens) {
    const token = stripQuotes(rawToken);

    if (!token || token.startsWith("-") || looksLikePackageSpecifier(token)) {
      continue;
    }

    for (const filePath of await resolveEntryPattern(packageDir, token)) {
      entries.add(filePath);
    }
  }

  return [...entries];
}

async function collectFilesFromPatterns(packageDir: string, patterns: string[]): Promise<string[]> {
  const entries = new Set<string>();

  for (const pattern of patterns) {
    for (const filePath of await resolveEntryPattern(packageDir, pattern)) {
      entries.add(filePath);
    }
  }

  return [...entries];
}

async function resolveEntryPattern(packageDir: string, pattern: string): Promise<string[]> {
  const cleanPattern = stripQuotes(pattern);
  const absolutePath = path.resolve(packageDir, cleanPattern);

  if (!hasGlobMagic(cleanPattern) && await fileExists(absolutePath)) {
    return [absolutePath];
  }

  return fg(cleanPattern, {
    cwd: packageDir,
    absolute: true,
    dot: true,
    onlyFiles: true,
    ignore: ["**/node_modules/**", "**/dist/**", "**/build/**", "**/.git/**"],
  });
}

async function analyzeEslintConfig(filePath: string, _context: PluginContext): Promise<PluginContribution | null> {
  if (!filePath.endsWith(".json") && !filePath.endsWith(".eslintrc")) {
    return null;
  }

  const config = await readJsonFile(filePath);

  if (!isRecord(config)) {
    return null;
  }

  const packages = new Set<string>();

  for (const value of toArray(config.extends)) {
    if (typeof value === "string" && !value.startsWith(".") && !path.isAbsolute(value)) {
      packages.add(normalizeEslintConfig(value));
    }
  }

  if (typeof config.parser === "string") {
    packages.add(config.parser);
  }

  for (const value of toArray(config.plugins)) {
    if (typeof value === "string") {
      packages.add(normalizeEslintPlugin(value));
    }
  }

  return packages.size > 0 ? { packages: [...packages] } : null;
}

function analyzePrettierPackageJson(context: PluginContext): PluginContribution | null {
  const prettierConfig = context.packageJson.prettier;

  if (!prettierConfig) {
    return null;
  }

  if (typeof prettierConfig === "string") {
    return {
      fileEntries: [path.resolve(context.packageDir, prettierConfig)],
    };
  }

  return {
    packages: [...new Set(prettierConfig.plugins ?? [])],
  };
}

async function analyzeTsConfig(filePath: string, _context: PluginContext): Promise<PluginContribution | null> {
  const config = await readJsonFile(filePath);

  if (!isRecord(config)) {
    return null;
  }

  const fileEntries = new Set<string>();
  const packages = new Set<string>();
  const baseDir = path.dirname(filePath);

  if (typeof config.extends === "string") {
    if (config.extends.startsWith(".") || config.extends.startsWith("/")) {
      const extendedPath = resolveTsConfigReference(baseDir, config.extends);
      if (await fileExists(extendedPath)) {
        fileEntries.add(extendedPath);
      }
    } else {
      packages.add(getPackageName(config.extends));
    }
  }

  for (const reference of toUnknownArray(config.references)) {
    if (!isRecord(reference) || typeof reference.path !== "string") {
      continue;
    }

    const referencePath = resolveTsConfigReference(baseDir, reference.path);
    if (await fileExists(referencePath)) {
      fileEntries.add(referencePath);
    }
  }

  const compilerOptions = isRecord(config.compilerOptions) ? config.compilerOptions : {};
  for (const plugin of toUnknownArray(compilerOptions.plugins)) {
    if (isRecord(plugin) && typeof plugin.name === "string") {
      packages.add(plugin.name);
    }
  }

  return fileEntries.size > 0 || packages.size > 0
    ? { fileEntries: [...fileEntries], packages: [...packages] }
    : null;
}

async function analyzeGitHubActionsConfig(filePath: string, context: PluginContext): Promise<PluginContribution | null> {
  const config = await readYamlFile(filePath);

  if (!isRecord(config)) {
    return null;
  }

  const packageDir = findGitHubActionsRoot(filePath);
  const fileEntries = new Set<string>();
  const packages = new Set<string>();
  const packageUsage = new Map<string, Set<string>>();

  if (isActionManifest(filePath)) {
    mergeContribution(collectNodeActionEntries(config, path.dirname(filePath)), packages, fileEntries, packageUsage);
  }

  for (const stepGroup of findStepGroups(config)) {
    const checkoutPath = findCheckoutPath(stepGroup.steps);

    for (const step of stepGroup.steps) {
      if (typeof step.run !== "string") {
        continue;
      }

      const workingDirectory = typeof step["working-directory"] === "string"
        ? step["working-directory"]
        : ".";
      const commandDir = path.resolve(
        packageDir,
        checkoutPath && workingDirectory === "." ? checkoutPath : workingDirectory,
      );

      mergeContribution(
        await collectCiCommandContribution(step.run, {
          context,
          commandDir,
          source: path.relative(packageDir, filePath) || path.basename(filePath),
        }),
        packages,
        fileEntries,
        packageUsage,
      );
    }
  }

  return fileEntries.size > 0 || packages.size > 0
    ? {
        packages: [...packages].sort(),
        fileEntries: [...fileEntries].sort(),
        packageUsage: Object.fromEntries(
          [...packageUsage.entries()].map(([packageName, sources]) => [packageName, [...sources].sort()] as const),
        ),
      }
    : null;
}

async function analyzeGitLabCiConfig(filePath: string, context: PluginContext): Promise<PluginContribution | null> {
  const config = await readYamlFile(filePath);

  if (!isRecord(config)) {
    return null;
  }

  const fileEntries = new Set<string>();
  const packages = new Set<string>();
  const packageUsage = new Map<string, Set<string>>();
  const source = path.relative(context.packageDir, filePath) || path.basename(filePath);

  const pendingCommandBlocks = toGitLabCommandBlocks(config);

  for (const command of pendingCommandBlocks) {
    mergeContribution(
      await collectCiCommandContribution(command, {
        context,
        commandDir: context.packageDir,
        source,
      }),
      packages,
      fileEntries,
      packageUsage,
    );
  }

  return fileEntries.size > 0 || packages.size > 0
    ? {
        packages: [...packages].sort(),
        fileEntries: [...fileEntries].sort(),
        packageUsage: Object.fromEntries(
          [...packageUsage.entries()].map(([packageName, sources]) => [packageName, [...sources].sort()] as const),
        ),
      }
    : null;
}

interface CiCommandOptions {
  context: PluginContext;
  commandDir: string;
  source: string;
  depth?: number;
}

async function collectCiCommandContribution(
  command: string,
  options: CiCommandOptions,
): Promise<PluginContribution | null> {
  const packages = new Set<string>();
  const fileEntries = new Set<string>();
  const packageUsage = new Map<string, Set<string>>();

  for (const invocation of collectScriptInvocations({ [options.source]: command })) {
    const commandPackage = getKnownCommandPackage(invocation.command, invocation.tokens);

    if (commandPackage) {
      packages.add(commandPackage);
      addUsage(packageUsage, commandPackage, options.source);
    }

    const packageScript = resolvePackageScript(invocation.tokens);
    if (packageScript && options.depth !== 2) {
      const nestedScript = options.context.scripts[packageScript];
      if (nestedScript) {
        mergeContribution(
          await collectCiCommandContribution(nestedScript, {
            ...options,
            commandDir: options.context.packageDir,
            depth: (options.depth ?? 0) + 1,
          }),
          packages,
          fileEntries,
          packageUsage,
        );
      }
    }

    for (const filePath of await collectPositionalFiles(options.commandDir, invocation.tokens.slice(1))) {
      fileEntries.add(filePath);
    }
  }

  return fileEntries.size > 0 || packages.size > 0
    ? {
        packages: [...packages].sort(),
        fileEntries: [...fileEntries].sort(),
        packageUsage: Object.fromEntries(
          [...packageUsage.entries()].map(([packageName, sources]) => [packageName, [...sources].sort()] as const),
        ),
      }
    : null;
}

function toGitLabCommandBlocks(config: Record<string, unknown>): string[] {
  const commandBlocks: string[] = [];

  visitUnknown(config, (node) => {
    if (!isRecord(node)) {
      return;
    }

    for (const key of ["before_script", "script", "after_script"]) {
      commandBlocks.push(...toCommandBlocks(node[key]));
    }
  });

  return commandBlocks;
}

function toCommandBlocks(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap(toCommandBlocks);
  }

  return [];
}

async function analyzeCircleCiConfig(filePath: string, context: PluginContext): Promise<PluginContribution | null> {
  const config = await readYamlFile(filePath);

  if (!isRecord(config)) {
    return null;
  }

  const jobs = isRecord(config.jobs) ? config.jobs : {};
  const fileEntries = new Set<string>();
  const packages = new Set<string>();
  const packageUsage = new Map<string, Set<string>>();
  const source = path.relative(context.packageDir, filePath) || path.basename(filePath);

  for (const job of Object.values(jobs)) {
    if (!isRecord(job)) {
      continue;
    }

    const jobDir = typeof job.working_directory === "string"
      ? path.resolve(context.packageDir, job.working_directory)
      : context.packageDir;

    for (const step of toUnknownArray(job.steps)) {
      const runStep = isRecord(step) ? step.run : null;

      if (typeof runStep === "string") {
        mergeContribution(
          await collectCiCommandContribution(runStep, {
            context,
            commandDir: jobDir,
            source,
          }),
          packages,
          fileEntries,
          packageUsage,
        );
        continue;
      }

      if (!isRecord(runStep) || typeof runStep.command !== "string") {
        continue;
      }

      const commandDir = typeof runStep.working_directory === "string"
        ? path.resolve(context.packageDir, runStep.working_directory)
        : jobDir;

      mergeContribution(
        await collectCiCommandContribution(runStep.command, {
          context,
          commandDir,
          source,
        }),
        packages,
        fileEntries,
        packageUsage,
      );
    }
  }

  return fileEntries.size > 0 || packages.size > 0
    ? {
        packages: [...packages].sort(),
        fileEntries: [...fileEntries].sort(),
        packageUsage: Object.fromEntries(
          [...packageUsage.entries()].map(([packageName, sources]) => [packageName, [...sources].sort()] as const),
        ),
      }
    : null;
}

async function analyzeAzurePipelinesConfig(filePath: string, context: PluginContext): Promise<PluginContribution | null> {
  const config = await readYamlFile(filePath);

  if (!isRecord(config)) {
    return null;
  }

  const commandBlocks: Array<{ command: string; commandDir: string }> = [];
  const source = path.relative(context.packageDir, filePath) || path.basename(filePath);

  visitUnknown(config, (node) => {
    if (!isRecord(node)) {
      return;
    }

    const workingDirectory = typeof node.workingDirectory === "string"
      ? path.resolve(context.packageDir, node.workingDirectory)
      : context.packageDir;

    for (const key of ["script", "bash", "pwsh"]) {
      if (typeof node[key] === "string") {
        commandBlocks.push({ command: node[key], commandDir: workingDirectory });
      }
    }
  });

  return collectCiCommandsContribution(commandBlocks, context, source);
}

async function analyzeBitbucketPipelinesConfig(filePath: string, context: PluginContext): Promise<PluginContribution | null> {
  const config = await readYamlFile(filePath);

  if (!isRecord(config)) {
    return null;
  }

  const commandBlocks: Array<{ command: string; commandDir: string }> = [];
  const source = path.relative(context.packageDir, filePath) || path.basename(filePath);

  visitUnknown(config, (node) => {
    if (!isRecord(node) || !("script" in node)) {
      return;
    }

    for (const command of toCommandBlocks(node.script)) {
      commandBlocks.push({ command, commandDir: context.packageDir });
    }
  });

  return collectCiCommandsContribution(commandBlocks, context, source);
}

async function collectCiCommandsContribution(
  commandBlocks: Array<{ command: string; commandDir: string }>,
  context: PluginContext,
  source: string,
): Promise<PluginContribution | null> {
  const fileEntries = new Set<string>();
  const packages = new Set<string>();
  const packageUsage = new Map<string, Set<string>>();

  for (const { command, commandDir } of commandBlocks) {
    mergeContribution(
      await collectCiCommandContribution(command, {
        context,
        commandDir,
        source,
      }),
      packages,
      fileEntries,
      packageUsage,
    );
  }

  return fileEntries.size > 0 || packages.size > 0
    ? {
        packages: [...packages].sort(),
        fileEntries: [...fileEntries].sort(),
        packageUsage: Object.fromEntries(
          [...packageUsage.entries()].map(([packageName, sources]) => [packageName, [...sources].sort()] as const),
        ),
      }
    : null;
}

interface WorkflowStep {
  run?: unknown;
  uses?: unknown;
  with?: unknown;
  "working-directory"?: unknown;
}

interface StepGroup {
  steps: WorkflowStep[];
}

function findStepGroups(value: unknown): StepGroup[] {
  const groups: StepGroup[] = [];

  visitUnknown(value, (node) => {
    if (!isRecord(node) || !Array.isArray(node.steps)) {
      return;
    }

    groups.push({
      steps: node.steps.filter(isRecord),
    });
  });

  return groups;
}

function findCheckoutPath(steps: WorkflowStep[]): string | null {
  for (const step of steps) {
    if (typeof step.uses !== "string" || !step.uses.startsWith("actions/checkout@")) {
      continue;
    }

    if (isRecord(step.with) && typeof step.with.path === "string" && typeof step.with.repository !== "string") {
      return step.with.path;
    }
  }

  return null;
}

function collectNodeActionEntries(config: Record<string, unknown>, actionDir: string): PluginContribution | null {
  const runs = isRecord(config.runs) ? config.runs : null;

  if (!runs || typeof runs.using !== "string" || !runs.using.startsWith("node")) {
    return null;
  }

  const fileEntries = ["pre", "main", "post"]
    .map((key) => runs[key])
    .filter((value): value is string => typeof value === "string")
    .map((value) => path.resolve(actionDir, value));

  return fileEntries.length > 0 ? { fileEntries } : null;
}

function findGitHubActionsRoot(filePath: string): string {
  const marker = `${path.sep}.github${path.sep}`;
  const index = filePath.indexOf(marker);

  return index >= 0 ? filePath.slice(0, index) : path.dirname(filePath);
}

function isActionManifest(filePath: string): boolean {
  const filename = path.basename(filePath);
  return filename === "action.yml" || filename === "action.yaml";
}

function resolveTsConfigReference(baseDir: string, value: string): string {
  const resolved = path.resolve(baseDir, value);
  return path.extname(resolved) ? resolved : path.join(resolved, "tsconfig.json");
}

async function readYamlFile(filePath: string): Promise<unknown> {
  try {
    return parseYaml(await readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function readJsonFile(filePath: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

function mergeContribution(
  contribution: PluginContribution | null | undefined,
  packages: Set<string>,
  fileEntries: Set<string>,
  packageUsage: Map<string, Set<string>>,
): void {
  if (!contribution) {
    return;
  }

  for (const packageName of contribution.packages ?? []) {
    packages.add(packageName);
  }

  for (const filePath of contribution.fileEntries ?? []) {
    fileEntries.add(filePath);
  }

  for (const [packageName, sources] of Object.entries(contribution.packageUsage ?? {})) {
    packages.add(packageName);

    for (const source of sources) {
      addUsage(packageUsage, packageName, source);
    }
  }
}

function hasContribution(contribution: PluginContribution): boolean {
  return Boolean(
    (contribution.packages?.length ?? 0) > 0
    || (contribution.fileEntries?.length ?? 0) > 0
    || Object.keys(contribution.packageUsage ?? {}).length > 0,
  );
}

function tokenize(command: string): string[] {
  return command.match(TOKEN_RE)?.map((token) => token.trim()).filter(Boolean) ?? [];
}

function resolveCommandName(tokens: string[]): string | null {
  const [first, second, third] = tokens;
  const command = stripQuotes(first ?? "");

  if (!command) {
    return null;
  }

  if (command === "npx" || command === "pnpx" || command === "bunx") {
    return stripQuotes(second ?? "") || null;
  }

  if ((command === "npm" || command === "pnpm" || command === "yarn") && stripQuotes(second ?? "") === "exec") {
    return stripQuotes(third ?? "") || null;
  }

  if ((command === "pnpm" || command === "yarn") && second && !isPackageManagerLifecycleCommand(stripQuotes(second))) {
    return stripQuotes(second) || null;
  }

  return command;
}

function resolvePackageScript(tokens: string[]): string | null {
  const [first, second, third] = tokens.map((token) => stripQuotes(token));

  if ((first === "npm" || first === "pnpm" || first === "yarn" || first === "bun") && second === "run") {
    return third || null;
  }

  if ((first === "pnpm" || first === "yarn" || first === "bun") && second && !isPackageManagerLifecycleCommand(second)) {
    return second;
  }

  return null;
}

function getKnownCommandPackage(command: string, _tokens: string[]): string | null {
  const commandPackages: Record<string, string> = {
    changeset: "@changesets/cli",
    eslint: "eslint",
    knip: "knip",
    nyc: "nyc",
    playwright: "@playwright/test",
    prisma: "prisma",
    "release-it": "release-it",
    semgrep: "semgrep",
    tsc: "typescript",
    tsx: "tsx",
    vite: "vite",
    vitest: "vitest",
    webpack: "webpack",
  };

  return commandPackages[command] ?? null;
}

function isPackageManagerLifecycleCommand(command: string): boolean {
  return [
    "add",
    "ci",
    "config",
    "dlx",
    "exec",
    "install",
    "i",
    "remove",
    "run",
    "self-update",
    "workspace",
  ].includes(command);
}

function visitUnknown(value: unknown, visitor: (value: unknown) => void): void {
  visitor(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      visitUnknown(item, visitor);
    }
    return;
  }

  if (isRecord(value)) {
    for (const item of Object.values(value)) {
      visitUnknown(item, visitor);
    }
  }
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

function normalizeEslintConfig(value: string): string {
  if (value.startsWith("@")) {
    if (value.includes("/eslint-config")) {
      return value;
    }

    const [scope, name] = value.split("/");
    return name ? `${scope}/eslint-config-${name}` : value;
  }

  return value.startsWith("eslint-config-") ? value : `eslint-config-${value}`;
}

function getPackageName(specifier: string): string {
  if (specifier.startsWith("@")) {
    const [scope, name] = specifier.split("/");
    return name ? `${scope}/${name}` : specifier;
  }

  return specifier.split("/")[0] ?? specifier;
}

function addUsage(usage: Map<string, Set<string>>, packageName: string, source: string): void {
  const sources = usage.get(packageName) ?? new Set<string>();
  sources.add(source);
  usage.set(packageName, sources);
}

function isPluginConfigObject(value: unknown): value is PluginConfig {
  return isRecord(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }

  return typeof value === "string" ? [value] : [];
}

function toUnknownArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stripQuotes(value: string): string {
  return value.replace(/^['"`]|['"`]$/g, "");
}

function hasGlobMagic(value: string): boolean {
  return /[*?[\]{}()!+@]/.test(value);
}

function looksLikePackageSpecifier(value: string): boolean {
  return !value.startsWith(".") && !value.startsWith("/") && !value.includes("*") && !/\.[cm]?[jt]sx?$/.test(value);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
