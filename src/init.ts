import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import * as readline from "node:readline";

import type { SadrazamConfig } from "./config.js";
import { findNearestPackageJson, readPackageJson } from "./packageReader.js";

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

export async function runInit(targetDir: string): Promise<void> {
  const absoluteDir = path.resolve(targetDir);
  const configPath = path.join(absoluteDir, "sadrazam.json");

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

    await mkdir(absoluteDir, { recursive: true });
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    console.log(`\nCreated sadrazam.json`);

    if (Object.keys(config).length === 0) {
      console.log("No options selected — using all defaults.");
    } else {
      console.log("\nConfiguration summary:");
      for (const [key, value] of Object.entries(config)) {
        console.log(`  ${key}: ${JSON.stringify(value)}`);
      }
    }

    console.log("\nRun `sadrazam .` to start scanning.");
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
  if (!process.stdin.isTTY) {
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

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  return {
    ask: makeReadlineAsker(rl),
    close: () => rl.close(),
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

function makeReadlineAsker(rl: readline.Interface): Asker {
  let closed = false;
  rl.on("close", () => { closed = true; });

  return (question: string) =>
    new Promise((resolve) => {
      if (closed) {
        resolve("");
        return;
      }

      let settled = false;

      const settle = (value: string) => {
        if (!settled) {
          settled = true;
          resolve(value);
        }
      };

      rl.question(question, settle);
      rl.once("close", () => settle(""));
    });
}

async function promptConfig(context: DetectedContext, ask: Asker): Promise<SadrazamConfig> {
  const config: SadrazamConfig = {};

  console.log(`\nInitializing sadrazam for ${context.packageName}`);
  console.log("Press Enter to accept defaults, or type a value.\n");

  // Reporter
  const reporter = await ask("Default reporter? (text/json/compact-json/markdown/sarif) [text]: ");
  const trimmedReporter = reporter.trim();
  if (trimmedReporter && trimmedReporter !== "text") {
    const valid = ["text", "json", "compact-json", "toon", "markdown", "sarif"];
    if (valid.includes(trimmedReporter)) {
      config.reporter = trimmedReporter as NonNullable<SadrazamConfig["reporter"]>;
    } else {
      console.log(`  Unknown reporter "${trimmedReporter}", using text.`);
    }
  }

  // Cache
  const cache = await ask("Enable cache by default? (y/N) [y]: ");
  const cacheVal = cache.trim().toLowerCase() || "y";
  if (cacheVal === "y") {
    config.cache = true;
  }

  // Production mode
  const production = await ask("Scan production files only? (y/N) [N]: ");
  if (production.trim().toLowerCase() === "y") {
    config.production = true;

    // Strict mode (only relevant with production)
    const strict = await ask("Enable strict mode (flag devDeps in production files)? (y/N) [N]: ");
    if (strict.trim().toLowerCase() === "y") {
      config.strict = true;
    }
  }

  // Exclude finding types
  console.log("\nFinding types: missing, unused-dependencies, unused-devDependencies,");
  console.log("               misplaced-devDependencies, unused-files, unused-exports,");
  console.log("               duplicate-exports, namespace-members");
  const exclude = await ask("Exclude any finding types? (comma-separated, or Enter to skip): ");
  const excludeList = exclude
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (excludeList.length > 0) {
    config.exclude = excludeList as NonNullable<SadrazamConfig["exclude"]>;
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

  // Allowlists
  const allowUnused = await ask(
    "Allow specific unused dependencies? (comma-separated, or Enter to skip): ",
  );
  const allowUnusedList = allowUnused
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowUnusedList.length > 0) {
    config.allowUnusedDependencies = allowUnusedList;
  }

  const ignorePackages = await ask(
    "Ignore specific packages in all findings? (comma-separated, or Enter to skip): ",
  );
  const ignoreList = ignorePackages
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (ignoreList.length > 0) {
    config.ignorePackages = ignoreList;
  }

  // AI
  const ai = await ask("Configure AI summary? (y/N) [N]: ");
  if (ai.trim().toLowerCase() === "y") {
    const provider = await ask("AI provider? (openai/anthropic/gemini) [openai]: ");
    const trimmedProvider = provider.trim() || "openai";
    config.ai = { provider: trimmedProvider };

    const model = await ask("AI model? (Enter for provider default): ");
    if (model.trim()) {
      config.ai.model = model.trim();
    }
  }

  return config;
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
