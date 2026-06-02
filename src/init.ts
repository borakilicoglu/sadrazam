import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  cancel,
  confirm,
  intro,
  isCancel,
  multiselect,
  note,
  outro,
  select,
  text,
} from "@clack/prompts";

import type { SadrazamConfig } from "./config.js";
import { findNearestPackageJson, readPackageJson } from "./packageReader.js";
import { SUPPORTED_REPORTERS, type FindingType, type ReporterType } from "./reporters.js";

interface PackageJsonShape {
  name?: string;
  workspaces?: string[] | { packages?: string[] };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

interface DetectedContext {
  isMonorepo: boolean;
  hasTypeScript: boolean;
  hasVitest: boolean;
  hasJest: boolean;
  hasEslint: boolean;
  hasPrettier: boolean;
  packageName: string;
}

const FINDING_TYPES = [
  "missing",
  "unresolved-imports",
  "unused-dependencies",
  "unused-devDependencies",
  "misplaced-devDependencies",
  "unused-files",
  "unused-exports",
  "duplicate-exports",
  "namespace-members",
] as const satisfies readonly FindingType[];

const NOISE_FINDING_TYPES = [
  "unused-devDependencies",
  "unused-files",
  "unused-exports",
  "namespace-members",
] as const satisfies readonly FindingType[];

export async function runInit(targetDir: string): Promise<void> {
  const absoluteDir = path.resolve(targetDir);
  const configPath = path.join(absoluteDir, "sadrazam.json");

  if (process.stdin.isTTY) {
    await runClackInit(absoluteDir, configPath);
    return;
  }

  const promptSession = await createPromptSession();

  try {
    // Check if config already exists
    if (await fileExists(configPath)) {
      const answer = await promptSession.ask("sadrazam.json already exists. Overwrite? (y/N) ");
      if (answer.trim().toLowerCase() !== "y") {
        console.log("Aborted.");
        return;
      }
    }

    const context = await detectContext(absoluteDir);
    const config = await promptConfig(context, promptSession.ask);
    const shouldWrite = await confirmWrite(promptSession.ask);
    if (!shouldWrite) {
      console.log("Aborted.");
      return;
    }

    await writeConfigFile(absoluteDir, configPath, config);
    printConfigSummary(config);
  } finally {
    promptSession.close();
  }
}

type Asker = (question: string) => Promise<string>;

interface PromptSession {
  ask: Asker;
  close: () => void;
}

async function createPromptSession(): Promise<PromptSession> {
  const answers = splitInputLines(await readAllStdin());
  let index = 0;

  return {
    ask: async (question: string) => {
      process.stdout.write(question);
      const answer = answers[index] ?? "";
      index += 1;
      return answer;
    },
    close: () => {},
  };
}

async function readAllStdin(): Promise<string> {
  let input = "";
  process.stdin.setEncoding("utf8");

  for await (const chunk of process.stdin) {
    input += chunk;
  }

  return input;
}

function splitInputLines(input: string): string[] {
  return input.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

async function promptConfig(context: DetectedContext, ask: Asker): Promise<SadrazamConfig> {
  const config: SadrazamConfig = {};

  console.log(`\nInitializing sadrazam for ${context.packageName}`);
  console.log("Press Enter to accept defaults, or type a value.\n");

  // Reporter
  const reporter = await ask("Default reporter? (text/json/compact-json/markdown/sarif) [text]: ");
  const trimmedReporter = reporter.trim();
  if (trimmedReporter && trimmedReporter !== "text") {
    if (isReporter(trimmedReporter)) {
      config.reporter = trimmedReporter;
    } else {
      console.log(`  Unknown reporter "${trimmedReporter}", using text.`);
    }
  }

  const scanMode = (await ask(
    "Scan mode? (default/production/production-strict) [default]: ",
  )).trim().toLowerCase();
  if (scanMode === "production" || scanMode === "production-strict" || scanMode === "strict") {
    config.production = true;
    if (scanMode === "production-strict" || scanMode === "strict") {
      config.strict = true;
    }
  }

  console.log("\nFinding types: missing, unused-dependencies, unused-devDependencies,");
  console.log("               misplaced-devDependencies, unresolved-imports, unused-files, unused-exports,");
  console.log("               duplicate-exports, namespace-members");
  const include = await ask("Focus on finding types? (comma-separated, or Enter for all): ");
  const includeList = parseFindingList(include);
  if (includeList.length > 0) {
    config.include = includeList;
  }

  const exclude = await ask("Exclude noisy finding types? (comma-separated, or Enter to skip): ");
  const excludeList = exclude
    ? parseFindingList(exclude)
    : [];
  if (excludeList.length > 0) {
    config.exclude = excludeList;
  }

  // Monorepo workspace filter
  if (context.isMonorepo) {
    const workspace = await ask(
      "Filter to specific workspaces? (comma-separated names, or Enter to scan all): ",
    );
    const workspaceList = workspace
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (workspaceList.length > 0) {
      config.workspace = workspaceList;
    }
  }

  const ignorePackages = await ask(
    "Ignore specific packages in all findings? (comma-separated, or Enter to skip): ",
  );
  const ignoreList = parseCommaList(ignorePackages);
  if (ignoreList.length > 0) {
    config.ignorePackages = ignoreList;
  }

  const customInputs = await ask("Add custom entry files or package names? (y/N) [N]: ");
  if (customInputs.trim().toLowerCase() === "y") {
    const entryFiles = parseCommaList(
      await ask("Entry files? (comma-separated, or Enter to skip): "),
    );
    const packageNames = parseCommaList(
      await ask("Package names? (comma-separated, or Enter to skip): "),
    );
    if (entryFiles.length > 0 || packageNames.length > 0) {
      config.inputs = {};
      if (entryFiles.length > 0) {
        config.inputs.entryFiles = entryFiles;
      }
      if (packageNames.length > 0) {
        config.inputs.packageNames = packageNames;
      }
    }
  }

  return config;
}

async function confirmWrite(ask: Asker): Promise<boolean> {
  const answer = await ask("Write sadrazam.json? (Y/n) [Y]: ");
  const value = answer.trim().toLowerCase();
  return value === "" || value === "y" || value === "yes";
}

async function runClackInit(absoluteDir: string, configPath: string): Promise<void> {
  intro("sadrazam init");

  if (await fileExists(configPath)) {
    const overwrite = await confirm({
      message: "sadrazam.json already exists. Overwrite?",
      initialValue: false,
    });
    if (isCancel(overwrite) || !overwrite) {
      cancel("Aborted.");
      return;
    }
  }

  const context = await detectContext(absoluteDir);
  const config = await promptClackConfig(context);
  if (!config) {
    cancel("Aborted.");
    return;
  }

  note(
    Object.keys(config).length === 0
      ? "Using all defaults."
      : JSON.stringify(config, null, 2),
    "Configuration preview",
  );

  const shouldWrite = await confirm({
    message: "Write sadrazam.json?",
    initialValue: true,
  });
  if (isCancel(shouldWrite) || !shouldWrite) {
    cancel("Aborted.");
    return;
  }

  await writeConfigFile(absoluteDir, configPath, config);
  outro("Run `sadrazam .` to start scanning.");
}

async function promptClackConfig(context: DetectedContext): Promise<SadrazamConfig | null> {
  const config: SadrazamConfig = {};

  note(`Project: ${context.packageName}`, "Detected context");

  const reporter = await select({
    message: "Default reporter",
    initialValue: "text",
    options: SUPPORTED_REPORTERS.map((value) => ({
      label: value,
      value,
    })),
  });
  if (isCancel(reporter)) {
    return null;
  }
  if (isReporter(reporter) && reporter !== "text") {
    config.reporter = reporter;
  }

  const scanMode = await select({
    message: "Scan mode",
    initialValue: "default",
    options: [
      { label: "Default", value: "default", hint: "all files and dependency categories" },
      { label: "Production", value: "production", hint: "production files only" },
      {
        label: "Production + strict",
        value: "production-strict",
        hint: "also flag dev dependencies in production files",
      },
    ],
  });
  if (isCancel(scanMode)) {
    return null;
  }
  if (scanMode === "production" || scanMode === "production-strict") {
    config.production = true;
  }
  if (scanMode === "production-strict") {
    config.strict = true;
  }

  const include = await multiselect({
    message: "Finding focus",
    required: false,
    options: FINDING_TYPES.map((value) => ({
      label: value,
      value,
    })),
  });
  if (isCancel(include)) {
    return null;
  }
  if (include.length > 0) {
    config.include = include;
  }

  const exclude = await multiselect({
    message: "Noise exclusions",
    required: false,
    options: NOISE_FINDING_TYPES.map((value) => ({
      label: value,
      value,
    })),
  });
  if (isCancel(exclude)) {
    return null;
  }
  if (exclude.length > 0) {
    config.exclude = exclude;
  }

  if (context.isMonorepo) {
    const workspace = await text({
      message: "Workspace filter",
      placeholder: "packages/web,apps/docs",
    });
    if (isCancel(workspace)) {
      return null;
    }
    const workspaceList = parseCommaList(workspace);
    if (workspaceList.length > 0) {
      config.workspace = workspaceList;
    }
  }

  const ignorePackages = await text({
    message: "Ignore packages",
    placeholder: "react,lodash",
  });
  if (isCancel(ignorePackages)) {
    return null;
  }
  const ignoreList = parseCommaList(ignorePackages);
  if (ignoreList.length > 0) {
    config.ignorePackages = ignoreList;
  }

  const customInputs = await confirm({
    message: "Add custom entry files or package names?",
    initialValue: false,
  });
  if (isCancel(customInputs)) {
    return null;
  }
  if (customInputs) {
    const entryFiles = await text({
      message: "Entry files",
      placeholder: "scripts/bootstrap.ts,src/setup.ts",
    });
    if (isCancel(entryFiles)) {
      return null;
    }

    const packageNames = await text({
      message: "Package names",
      placeholder: "tsx,typescript",
    });
    if (isCancel(packageNames)) {
      return null;
    }

    const entryFileList = parseCommaList(entryFiles);
    const packageNameList = parseCommaList(packageNames);
    if (entryFileList.length > 0 || packageNameList.length > 0) {
      config.inputs = {};
      if (entryFileList.length > 0) {
        config.inputs.entryFiles = entryFileList;
      }
      if (packageNameList.length > 0) {
        config.inputs.packageNames = packageNameList;
      }
    }
  }

  return config;
}

async function writeConfigFile(
  absoluteDir: string,
  configPath: string,
  config: SadrazamConfig,
): Promise<void> {
  await mkdir(absoluteDir, { recursive: true });
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function printConfigSummary(config: SadrazamConfig): void {
  console.log(`\nCreated sadrazam.json`);

  if (Object.keys(config).length === 0) {
    console.log("No options selected - using all defaults.");
  } else {
    console.log("\nConfiguration summary:");
    for (const [key, value] of Object.entries(config)) {
      console.log(`  ${key}: ${JSON.stringify(value)}`);
    }
  }

  console.log("\nRun `sadrazam .` to start scanning.");
}

function parseCommaList(value: string | symbol): string[] {
  if (typeof value !== "string") {
    return [];
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseFindingList(value: string): FindingType[] {
  return parseCommaList(value).filter(isFindingType);
}

function isFindingType(value: string): value is FindingType {
  return FINDING_TYPES.includes(value as FindingType);
}

function isReporter(value: string): value is ReporterType {
  return SUPPORTED_REPORTERS.includes(value as ReporterType);
}

async function detectContext(packageDir: string): Promise<DetectedContext> {
  try {
    const packagePath = await findNearestPackageJson(packageDir);
    const packageJson = (await readPackageJson(packagePath)) as PackageJsonShape;
    const allDeps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    const isMonorepo =
      Array.isArray(packageJson.workspaces) ||
      (typeof packageJson.workspaces === "object" &&
        Array.isArray((packageJson.workspaces as { packages?: string[] }).packages)) ||
      (await fileExists(path.join(packageDir, "pnpm-workspace.yaml")));

    return {
      isMonorepo,
      hasTypeScript: "typescript" in allDeps,
      hasVitest: "vitest" in allDeps,
      hasJest: "jest" in allDeps,
      hasEslint: "eslint" in allDeps,
      hasPrettier: "prettier" in allDeps,
      packageName: packageJson.name ?? path.basename(packageDir),
    };
  } catch {
    return {
      isMonorepo: false,
      hasTypeScript: false,
      hasVitest: false,
      hasJest: false,
      hasEslint: false,
      hasPrettier: false,
      packageName: path.basename(packageDir),
    };
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
