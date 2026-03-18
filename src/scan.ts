import { readFile } from "node:fs/promises";
import { builtinModules } from "node:module";
import { performance as nodePerformance } from "node:perf_hooks";
import path from "node:path";

import { findSourceFiles } from "./fileFinder.js";
import { parseImports } from "./importParser.js";
import { readPackageMetadata } from "./packageReader.js";
import { parsePackageScripts } from "./scriptParser.js";
import { mapToSourcePath } from "./sourceMapper.js";

export interface FileScanResult {
  filePath: string;
  relativePath: string;
  imports: string[];
  isProduction: boolean;
}

export interface ScanPerformance {
  discoverInputsMs: number;
  scriptParseMs: number;
  mapFilesMs: number;
  readFilesMs: number;
  analysisMs: number;
  totalMs: number;
}

export interface ScanResult {
  rootDir: string;
  packagePath: string;
  files: FileScanResult[];
  externalImports: string[];
  scriptCommandPackages: string[];
  scriptEntryFiles: string[];
  packageTraces: Record<string, string[]>;
  missingPackages: string[];
  unusedDependencies: string[];
  unusedDevDependencies: string[];
  misplacedDevDependencies: string[];
  performance: ScanPerformance;
}

export interface ScanOptions {
  production?: boolean;
  strict?: boolean;
}

export async function scanProject(rootDir: string, options: ScanOptions = {}): Promise<ScanResult> {
  const totalStart = nodePerformance.now();
  const absoluteRoot = path.resolve(rootDir);

  const discoverInputsStart = nodePerformance.now();
  const [files, packageMetadata] = await Promise.all([
    findSourceFiles(absoluteRoot),
    readPackageMetadata(absoluteRoot),
  ]);
  const discoverInputsMs = nodePerformance.now() - discoverInputsStart;

  const scriptParseStart = nodePerformance.now();
  const scriptAnalysis = await parsePackageScripts(
    packageMetadata.packageDir,
    packageMetadata.scripts,
  );
  const scriptParseMs = nodePerformance.now() - scriptParseStart;
  const allFiles = mergeFiles(files, scriptAnalysis.fileEntries);

  const selectedFiles = options.production || options.strict
    ? allFiles.filter((filePath) => isProductionFilePath(absoluteRoot, filePath))
    : allFiles;

  const mapFilesStart = nodePerformance.now();
  const mappedFiles = await Promise.all(
    selectedFiles.map((filePath) => mapToSourcePath(absoluteRoot, filePath)),
  );
  const mapFilesMs = nodePerformance.now() - mapFilesStart;
  const dedupedFiles = mergeFiles([], mappedFiles);

  const readFilesStart = nodePerformance.now();
  const fileResults = await Promise.all(
    dedupedFiles.map(async (filePath) => {
      const source = await readFile(filePath, "utf8");
      const imports = parseImports(source).map((entry) => entry.specifier);
      const relativePath = path.relative(absoluteRoot, filePath) || path.basename(filePath);

      return {
        filePath,
        relativePath,
        imports,
        isProduction: isProductionFilePath(absoluteRoot, filePath),
      };
    }),
  );
  const readFilesMs = nodePerformance.now() - readFilesStart;

  const analysisStart = nodePerformance.now();
  const externalImports = collectExternalImports(fileResults, scriptAnalysis.commandPackages);
  const packageTraces = collectPackageTraces(fileResults, scriptAnalysis.commandUsage);
  const missingPackages = externalImports.filter(
    (name) => !packageMetadata.allDependencies.has(name),
  );
  const effectivelyUsedPackages = getEffectivelyUsedPackages(
    externalImports,
    fileResults,
    packageMetadata.devDependencies,
  );
  const unusedDependencies = getUnusedDeclaredPackages(
    packageMetadata.dependencies,
    effectivelyUsedPackages,
  );
  const unusedDevDependencies = getUnusedDeclaredPackages(
    packageMetadata.devDependencies,
    effectivelyUsedPackages,
  );
  const misplacedDevDependencies = options.strict
    ? getMisplacedDevDependencies(fileResults, packageMetadata.devDependencies)
    : [];
  const scriptEntryFiles = await mapScriptEntryFiles(absoluteRoot, scriptAnalysis.fileEntries);
  const analysisMs = nodePerformance.now() - analysisStart;

  return {
    rootDir: absoluteRoot,
    packagePath: packageMetadata.packagePath,
    files: fileResults,
    externalImports,
    scriptCommandPackages: scriptAnalysis.commandPackages,
    scriptEntryFiles,
    packageTraces,
    missingPackages,
    unusedDependencies,
    unusedDevDependencies,
    misplacedDevDependencies,
    performance: {
      discoverInputsMs: roundMs(discoverInputsMs),
      scriptParseMs: roundMs(scriptParseMs),
      mapFilesMs: roundMs(mapFilesMs),
      readFilesMs: roundMs(readFilesMs),
      analysisMs: roundMs(analysisMs),
      totalMs: roundMs(nodePerformance.now() - totalStart),
    },
  };
}

function collectExternalImports(files: FileScanResult[], scriptPackages: string[]): string[] {
  const packages = new Set<string>();

  for (const file of files) {
    for (const specifier of file.imports) {
      if (!isExternalSpecifier(specifier)) {
        continue;
      }

      const packageName = getPackageName(specifier);

      if (!isBuiltinPackage(packageName)) {
        packages.add(packageName);
      }
    }
  }

  for (const packageName of scriptPackages) {
    if (!isBuiltinPackage(packageName)) {
      packages.add(packageName);
    }
  }

  return [...packages].sort();
}

function collectPackageTraces(
  files: FileScanResult[],
  scriptUsage: Record<string, string[]>,
): Record<string, string[]> {
  const traces = new Map<string, Set<string>>();

  for (const file of files) {
    for (const specifier of file.imports) {
      if (!isExternalSpecifier(specifier)) {
        continue;
      }

      const packageName = getPackageName(specifier);

      if (isBuiltinPackage(packageName)) {
        continue;
      }

      const entries = traces.get(packageName) ?? new Set<string>();
      entries.add(file.relativePath);
      traces.set(packageName, entries);
    }
  }

  for (const [packageName, entries] of Object.entries(scriptUsage)) {
    if (isBuiltinPackage(packageName)) {
      continue;
    }

    const currentEntries = traces.get(packageName) ?? new Set<string>();

    for (const entry of entries) {
      currentEntries.add(entry);
    }

    traces.set(packageName, currentEntries);
  }

  return Object.fromEntries(
    [...traces.entries()]
      .map(([packageName, entries]) => [packageName, [...entries].sort()] as const)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function isExternalSpecifier(specifier: string): boolean {
  return !specifier.startsWith(".") && !path.isAbsolute(specifier);
}

function getPackageName(specifier: string): string {
  if (specifier.startsWith("@")) {
    const [scope, name] = specifier.split("/");
    return scope && name ? `${scope}/${name}` : specifier;
  }

  const [name] = specifier.split("/");
  return name ?? specifier;
}

function isBuiltinPackage(packageName: string): boolean {
  return builtinModules.includes(packageName) || builtinModules.includes(packageName.replace(/^node:/, ""));
}

function mergeFiles(files: string[], extraFiles: string[]): string[] {
  return [...new Set([...files, ...extraFiles])].sort();
}

async function mapScriptEntryFiles(rootDir: string, fileEntries: string[]): Promise<string[]> {
  const mappedEntries = await Promise.all(
    fileEntries.map(async (filePath) => {
      const mappedPath = await mapToSourcePath(rootDir, filePath);
      return path.relative(rootDir, mappedPath) || path.basename(mappedPath);
    }),
  );

  return [...new Set(mappedEntries)].sort();
}

function getEffectivelyUsedPackages(
  externalImports: string[],
  files: FileScanResult[],
  devDependencies: Set<string>,
): string[] {
  const usedPackages = new Set(externalImports);

  if (shouldTreatNodeTypesAsUsed(files, devDependencies)) {
    usedPackages.add("@types/node");
  }

  return [...usedPackages].sort();
}

function shouldTreatNodeTypesAsUsed(
  files: FileScanResult[],
  devDependencies: Set<string>,
): boolean {
  if (!devDependencies.has("@types/node")) {
    return false;
  }

  return files.some((file) =>
    isTypeScriptFile(file.filePath)
    && file.imports.some((specifier) => isBuiltinPackage(getPackageName(specifier))),
  );
}

function isTypeScriptFile(filePath: string): boolean {
  return /\.(ts|tsx|cts|mts)$/i.test(filePath);
}

function getUnusedDeclaredPackages(
  declaredPackages: Set<string>,
  usedPackages: string[],
): string[] {
  const usedSet = new Set(usedPackages);

  return [...declaredPackages]
    .filter((packageName) => !usedSet.has(packageName))
    .sort();
}

function getMisplacedDevDependencies(
  files: FileScanResult[],
  devDependencies: Set<string>,
): string[] {
  const misplaced = new Set<string>();

  for (const file of files) {
    if (!file.isProduction) {
      continue;
    }

    for (const specifier of file.imports) {
      if (!isExternalSpecifier(specifier)) {
        continue;
      }

      const packageName = getPackageName(specifier);

      if (!isBuiltinPackage(packageName) && devDependencies.has(packageName)) {
        misplaced.add(packageName);
      }
    }
  }

  return [...misplaced].sort();
}

function isProductionFilePath(rootDir: string, filePath: string): boolean {
  const relativePath = path.relative(rootDir, filePath);
  const normalizedPath = relativePath.split(path.sep).join("/");

  return !(
    normalizedPath.includes("/__tests__/") ||
    normalizedPath.includes("/__mocks__/") ||
    normalizedPath.includes("/fixtures/") ||
    normalizedPath.includes("/test-utils/") ||
    /\.test\.[^.]+$/i.test(normalizedPath) ||
    /\.spec\.[^.]+$/i.test(normalizedPath) ||
    /\.stories\.[^.]+$/i.test(normalizedPath)
  );
}

function roundMs(value: number): number {
  return Number(value.toFixed(1));
}
