import { access, readFile } from "node:fs/promises";
import path from "node:path";

export interface PackageMetadata {
  packagePath: string;
  packageDir: string;
  packageJson: PackageJsonShape;
  dependencies: Set<string>;
  devDependencies: Set<string>;
  peerDependencies: Set<string>;
  optionalDependencies: Set<string>;
  allDependencies: Set<string>;
  scripts: Record<string, string>;
  entrySpecifiers: string[];
}

export interface PackageJsonShape {
  workspaces?: string[] | { packages?: string[] };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  babel?: unknown;
  commitlint?: unknown;
  "lint-staged"?: unknown;
  prettier?: string | {
    plugins?: string[];
  };
  main?: string;
  module?: string;
  types?: string;
  typings?: string;
  browser?: string | Record<string, string | false>;
  bin?: string | Record<string, string>;
  exports?: unknown;
}

export async function readPackageMetadata(rootDir: string): Promise<PackageMetadata> {
  const packagePath = await findNearestPackageJson(rootDir);
  const packageJson = (await readPackageJson(packagePath)) as PackageJsonShape;

  const dependencies = new Set<string>(Object.keys(packageJson.dependencies ?? {}));
  const devDependencies = new Set<string>(Object.keys(packageJson.devDependencies ?? {}));
  const peerDependencies = new Set<string>(Object.keys(packageJson.peerDependencies ?? {}));
  const optionalDependencies = new Set<string>(Object.keys(packageJson.optionalDependencies ?? {}));
  const allDependencies = new Set<string>([
    ...dependencies,
    ...devDependencies,
    ...peerDependencies,
    ...optionalDependencies,
  ]);

  const workspaceRootPath = await findWorkspaceRootPackageJson(path.dirname(packagePath));

  if (workspaceRootPath && workspaceRootPath !== packagePath) {
    const workspaceRootJson = (await readPackageJson(workspaceRootPath)) as PackageJsonShape;

    for (const packageName of [
      ...Object.keys(workspaceRootJson.dependencies ?? {}),
      ...Object.keys(workspaceRootJson.devDependencies ?? {}),
      ...Object.keys(workspaceRootJson.peerDependencies ?? {}),
      ...Object.keys(workspaceRootJson.optionalDependencies ?? {}),
    ]) {
      allDependencies.add(packageName);
    }
  }

  return {
    packagePath,
    packageDir: path.dirname(packagePath),
    packageJson,
    dependencies,
    devDependencies,
    peerDependencies,
    optionalDependencies,
    allDependencies,
    scripts: packageJson.scripts ?? {},
    entrySpecifiers: collectEntrySpecifiers(packageJson),
  };
}

export async function readPackageJson(packagePath: string): Promise<unknown> {
  return JSON.parse(await readFile(packagePath, "utf8"));
}

export async function findNearestPackageJson(startDir: string): Promise<string> {
  let currentDir = path.resolve(startDir);

  while (true) {
    const candidate = path.join(currentDir, "package.json");

    try {
      await readFile(candidate, "utf8");
      return candidate;
    } catch (error) {
      const typedError = error as NodeJS.ErrnoException;

      if (typedError.code !== "ENOENT") {
        throw error;
      }
    }

    const parentDir = path.dirname(currentDir);

    if (parentDir === currentDir) {
      throw new Error(`No package.json found from ${startDir}`);
    }

    currentDir = parentDir;
  }
}

async function findWorkspaceRootPackageJson(startDir: string): Promise<string | null> {
  let currentDir = path.resolve(startDir);

  while (true) {
    const packagePath = path.join(currentDir, "package.json");

    try {
      const packageJson = (await readPackageJson(packagePath)) as PackageJsonShape;

      if (hasWorkspaceConfig(packageJson) || await hasWorkspaceRootFile(currentDir)) {
        return packagePath;
      }
    } catch (error) {
      const typedError = error as NodeJS.ErrnoException;

      if (typedError.code !== "ENOENT") {
        throw error;
      }
    }

    const parentDir = path.dirname(currentDir);

    if (parentDir === currentDir) {
      return null;
    }

    currentDir = parentDir;
  }
}

function hasWorkspaceConfig(packageJson: PackageJsonShape): boolean {
  return Array.isArray(packageJson.workspaces) || Array.isArray(packageJson.workspaces?.packages);
}

async function hasWorkspaceRootFile(dir: string): Promise<boolean> {
  for (const filename of ["pnpm-workspace.yaml", "lerna.json", "rush.json"]) {
    try {
      await access(path.join(dir, filename));
      return true;
    } catch {
      // Try the next supported workspace root file.
    }
  }

  return false;
}

function collectEntrySpecifiers(packageJson: PackageJsonShape): string[] {
  const values = new Set<string>();

  addEntryValue(values, packageJson.main);
  addEntryValue(values, packageJson.module);
  addEntryValue(values, packageJson.types);
  addEntryValue(values, packageJson.typings);
  collectBrowserEntries(values, packageJson.browser);
  collectBinEntries(values, packageJson.bin);
  collectExportEntries(values, packageJson.exports);

  return [...values].sort();
}

function collectBrowserEntries(values: Set<string>, browser: PackageJsonShape["browser"]): void {
  if (!browser) {
    return;
  }

  if (typeof browser === "string") {
    addEntryValue(values, browser);
    return;
  }

  for (const entry of Object.values(browser)) {
    if (typeof entry === "string") {
      addEntryValue(values, entry);
    }
  }
}

function collectBinEntries(values: Set<string>, bin: PackageJsonShape["bin"]): void {
  if (!bin) {
    return;
  }

  if (typeof bin === "string") {
    addEntryValue(values, bin);
    return;
  }

  for (const entry of Object.values(bin)) {
    addEntryValue(values, entry);
  }
}

function collectExportEntries(values: Set<string>, exportsField: unknown): void {
  if (!exportsField) {
    return;
  }

  if (typeof exportsField === "string") {
    addEntryValue(values, exportsField);
    return;
  }

  if (Array.isArray(exportsField)) {
    for (const entry of exportsField) {
      collectExportEntries(values, entry);
    }
    return;
  }

  if (typeof exportsField === "object") {
    for (const entry of Object.values(exportsField as Record<string, unknown>)) {
      collectExportEntries(values, entry);
    }
  }
}

function addEntryValue(values: Set<string>, value: string | undefined): void {
  if (!value) {
    return;
  }

  const trimmed = value.trim();

  if (!trimmed || trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return;
  }

  values.add(trimmed);
}
