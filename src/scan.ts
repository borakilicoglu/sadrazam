import { readFile } from "node:fs/promises";
import { builtinModules } from "node:module";
import { performance as nodePerformance } from "node:perf_hooks";
import path from "node:path";

import { readScanCache, writeScanCache } from "./cache.js";
import { findSourceFiles } from "./fileFinder.js";
import { parseImports } from "./importParser.js";
import { readPackageMetadata } from "./packageReader.js";
import { analyzePluginInputs, analyzePlugins, type PluginInputsConfig } from "./plugins.js";
import {
  parseExportedNames,
  parseIgnoredExportNames,
  parseLocalReferences,
  type LocalReference,
} from "./symbolParser.js";
import { parsePackageScripts } from "./scriptParser.js";
import { mapToSourcePath } from "./sourceMapper.js";

const DEFAULT_JSDOC_IGNORE_EXPORT_TAGS = ["sadrazam-ignore", "sadrazam-keep"];

const RESOLVABLE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".svelte",
  ".vue",
  ".mdx",
  ".astro",
];

export interface FileScanResult {
  filePath: string;
  relativePath: string;
  imports: string[];
  localReferences: LocalReference[];
  exportedNames: string[];
  ignoredExportNames: string[];
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

export interface ScanMemory {
  rssMb: number;
  heapUsedMb: number;
  heapTotalMb: number;
  externalMb: number;
  arrayBuffersMb: number;
}

export interface ScanResult {
  rootDir: string;
  packagePath: string;
  files: FileScanResult[];
  externalImports: string[];
  activePlugins: string[];
  scriptCommandPackages: string[];
  scriptEntryFiles: string[];
  packageTraces: Record<string, string[]>;
  exportTraces: Record<string, string[]>;
  missingPackages: string[];
  unusedDependencies: string[];
  unusedDevDependencies: string[];
  misplacedDevDependencies: string[];
  unusedFiles: string[];
  unusedExports: string[];
  performance: ScanPerformance;
  memory: ScanMemory;
  cached: boolean;
}

export interface ScanOptions {
  production?: boolean;
  strict?: boolean;
  cache?: boolean;
  pluginInputs?: PluginInputsConfig;
  jsdocIgnoreExportTags?: string[];
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
  const [scriptAnalysis, pluginAnalysis, inputAnalysis] = await Promise.all([
    parsePackageScripts(packageMetadata.packageDir, packageMetadata.scripts),
    analyzePlugins({ packageDir: packageMetadata.packageDir, scripts: packageMetadata.scripts }),
    analyzePluginInputs(packageMetadata.packageDir, options.pluginInputs),
  ]);
  const scriptParseMs = nodePerformance.now() - scriptParseStart;
  const allFiles = mergeFiles(files, scriptAnalysis.fileEntries, pluginAnalysis.fileEntries, inputAnalysis.fileEntries);

  const selectedFiles = options.production || options.strict
    ? allFiles.filter((filePath) => isProductionFilePath(absoluteRoot, filePath))
    : allFiles;

  const mapFilesStart = nodePerformance.now();
  const mappedFiles = await Promise.all(
    selectedFiles.map((filePath) => mapToSourcePath(absoluteRoot, filePath)),
  );
  const mapFilesMs = nodePerformance.now() - mapFilesStart;
  const dedupedFiles = mergeFiles([], mappedFiles);

  if (options.cache) {
    const cachedResult = await readScanCache({
      packageDir: packageMetadata.packageDir,
      packagePath: packageMetadata.packagePath,
      filePaths: dedupedFiles,
      options,
    });

    if (cachedResult) {
      return {
        ...cachedResult,
        cached: true,
        memory: getProcessMemoryUsage(),
        performance: {
          discoverInputsMs: roundMs(discoverInputsMs),
          scriptParseMs: roundMs(scriptParseMs),
          mapFilesMs: roundMs(mapFilesMs),
          readFilesMs: 0,
          analysisMs: 0,
          totalMs: roundMs(nodePerformance.now() - totalStart),
        },
      };
    }
  }

  const readFilesStart = nodePerformance.now();
  const fileResults = await Promise.all(
    dedupedFiles.map(async (filePath) => {
      const source = await readFile(filePath, "utf8");
      const imports = parseImports(source).map((entry) => entry.specifier);
      const localReferences = parseLocalReferences(source);
      const exportedNames = parseExportedNames(source);
      const ignoredExportNames = parseIgnoredExportNames(
        source,
        options.jsdocIgnoreExportTags ?? DEFAULT_JSDOC_IGNORE_EXPORT_TAGS,
      );
      const relativePath = path.relative(absoluteRoot, filePath) || path.basename(filePath);

      return {
        filePath,
        relativePath,
        imports,
        localReferences,
        exportedNames,
        ignoredExportNames,
        isProduction: isProductionFilePath(absoluteRoot, filePath),
      };
    }),
  );
  const readFilesMs = nodePerformance.now() - readFilesStart;

  const analysisStart = nodePerformance.now();
  const commandPackages = mergeStringLists(
    scriptAnalysis.commandPackages,
    pluginAnalysis.commandPackages,
    inputAnalysis.commandPackages,
  );
  const commandUsage = mergeCommandUsage(
    scriptAnalysis.commandUsage,
    pluginAnalysis.commandUsage,
    inputAnalysis.commandUsage,
  );
  const externalImports = collectExternalImports(fileResults, commandPackages);
  const packageTraces = collectPackageTraces(fileResults, commandUsage);
  const exportTraces = collectExportTraces(
    absoluteRoot,
    fileResults,
    packageMetadata.entrySpecifiers,
    mergeFiles(scriptAnalysis.fileEntries, pluginAnalysis.fileEntries, inputAnalysis.fileEntries),
  );
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
  const scriptEntryFiles = await mapScriptEntryFiles(
    absoluteRoot,
    mergeFiles(scriptAnalysis.fileEntries, pluginAnalysis.fileEntries, inputAnalysis.fileEntries),
  );
  const unusedFiles = getUnusedFiles(
    absoluteRoot,
    fileResults,
    packageMetadata.entrySpecifiers,
    mergeFiles(scriptAnalysis.fileEntries, pluginAnalysis.fileEntries, inputAnalysis.fileEntries),
  );
  const unusedExports = getUnusedExports(
    absoluteRoot,
    fileResults,
    packageMetadata.entrySpecifiers,
    mergeFiles(scriptAnalysis.fileEntries, pluginAnalysis.fileEntries, inputAnalysis.fileEntries),
  );
  const analysisMs = nodePerformance.now() - analysisStart;

  const resultWithoutRuntime = {
    rootDir: absoluteRoot,
    packagePath: packageMetadata.packagePath,
    files: fileResults,
    externalImports,
    activePlugins: mergeStringLists(pluginAnalysis.activePlugins, inputAnalysis.activePlugins),
    scriptCommandPackages: commandPackages,
    scriptEntryFiles,
    packageTraces,
    exportTraces,
    missingPackages,
    unusedDependencies,
    unusedDevDependencies,
    misplacedDevDependencies,
    unusedFiles,
    unusedExports,
  };

  if (options.cache) {
    await writeScanCache({
      packageDir: packageMetadata.packageDir,
      packagePath: packageMetadata.packagePath,
      filePaths: dedupedFiles,
      options,
      result: resultWithoutRuntime,
    });
  }

  return {
    ...resultWithoutRuntime,
    cached: false,
    performance: {
      discoverInputsMs: roundMs(discoverInputsMs),
      scriptParseMs: roundMs(scriptParseMs),
      mapFilesMs: roundMs(mapFilesMs),
      readFilesMs: roundMs(readFilesMs),
      analysisMs: roundMs(analysisMs),
      totalMs: roundMs(nodePerformance.now() - totalStart),
    },
    memory: getProcessMemoryUsage(),
  };
}

function mergeStringLists(...lists: string[][]): string[] {
  return [...new Set(lists.flat())].sort();
}

function mergeCommandUsage(
  ...usages: Array<Record<string, string[]>>
): Record<string, string[]> {
  const merged = new Map<string, Set<string>>();

  for (const usage of usages) {
    for (const [packageName, sources] of Object.entries(usage)) {
      const entries = merged.get(packageName) ?? new Set<string>();

      for (const source of sources) {
        entries.add(source);
      }

      merged.set(packageName, entries);
    }
  }

  return Object.fromEntries(
    [...merged.entries()]
      .map(([packageName, sources]) => [packageName, [...sources].sort()] as const)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
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

function collectExportTraces(
  rootDir: string,
  files: FileScanResult[],
  packageEntries: string[],
  scriptEntryFiles: string[],
): Record<string, string[]> {
  const filePathSet = new Set(files.map((file) => file.filePath));
  const { reachableFiles } = getReachableFilePaths(rootDir, files, packageEntries, scriptEntryFiles);
  const relativePaths = new Map(files.map((file) => [file.filePath, file.relativePath] as const));
  const traces = new Map<string, Set<string>>();

  for (const file of files) {
    if (!reachableFiles.has(file.filePath)) {
      continue;
    }

    for (const reference of file.localReferences) {
      if (!isLocalSpecifier(reference.specifier)) {
        continue;
      }

      const target = resolveLocalImport(file.filePath, reference.specifier, filePathSet);

      if (!target || !reachableFiles.has(target)) {
        continue;
      }

      const targetRelativePath = relativePaths.get(target);

      if (!targetRelativePath) {
        continue;
      }

      if (reference.usesAllExports) {
        const targetFile = files.find((candidate) => candidate.filePath === target);

        for (const exportName of targetFile?.exportedNames ?? []) {
          addExportTrace(traces, `${targetRelativePath}:${exportName}`, file.relativePath);
        }

        continue;
      }

      for (const exportName of reference.importedNames) {
        addExportTrace(traces, `${targetRelativePath}:${exportName}`, file.relativePath);
      }
    }
  }

  return Object.fromEntries(
    [...traces.entries()]
      .map(([traceTarget, entries]) => [traceTarget, [...entries].sort()] as const)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function addExportTrace(
  traces: Map<string, Set<string>>,
  traceTarget: string,
  importer: string,
): void {
  const entries = traces.get(traceTarget) ?? new Set<string>();
  entries.add(importer);
  traces.set(traceTarget, entries);
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

function getUnusedFiles(
  rootDir: string,
  files: FileScanResult[],
  packageEntries: string[],
  scriptEntryFiles: string[],
): string[] {
  const { reachableFiles } = getReachableFilePaths(rootDir, files, packageEntries, scriptEntryFiles);

  if (reachableFiles.size === 0) {
    return [];
  }

  return files
    .filter((file) => !reachableFiles.has(file.filePath))
    .filter((file) => !shouldIgnoreUnusedFile(file.relativePath))
    .map((file) => file.relativePath)
    .sort();
}

function getUnusedExports(
  rootDir: string,
  files: FileScanResult[],
  packageEntries: string[],
  scriptEntryFiles: string[],
): string[] {
  const filePathSet = new Set(files.map((file) => file.filePath));
  const { entryFiles, reachableFiles } = getReachableFilePaths(
    rootDir,
    files,
    packageEntries,
    scriptEntryFiles,
  );

  if (reachableFiles.size === 0) {
    return [];
  }

  const exportedNamesByFile = new Map(
    files.map((file) => [file.filePath, new Set(file.exportedNames)] as const),
  );
  const ignoredExportNamesByFile = new Map(
    files.map((file) => [file.filePath, new Set(file.ignoredExportNames)] as const),
  );
  const usedExports = new Map<string, Set<string>>();

  for (const entryFile of entryFiles) {
    markAllExportsUsed(entryFile, exportedNamesByFile, usedExports);
  }

  for (const file of files) {
    if (!reachableFiles.has(file.filePath)) {
      continue;
    }

    for (const reference of file.localReferences) {
      if (!isLocalSpecifier(reference.specifier)) {
        continue;
      }

      const target = resolveLocalImport(file.filePath, reference.specifier, filePathSet);

      if (!target) {
        continue;
      }

      if (reference.usesAllExports) {
        markAllExportsUsed(target, exportedNamesByFile, usedExports);
        continue;
      }

      for (const name of reference.importedNames) {
        markExportUsed(target, name, usedExports);
      }
    }
  }

  return files
    .filter((file) => reachableFiles.has(file.filePath) && file.exportedNames.length > 0)
    .flatMap((file) => {
      const used = usedExports.get(file.filePath) ?? new Set<string>();
      const ignored = ignoredExportNamesByFile.get(file.filePath) ?? new Set<string>();

      return file.exportedNames
        .filter((name) => !used.has(name) && !ignored.has(name))
        .map((name) => `${file.relativePath}: ${name}`);
    })
    .sort();
}

function getReachableFilePaths(
  rootDir: string,
  files: FileScanResult[],
  packageEntries: string[],
  scriptEntryFiles: string[],
): { entryFiles: string[]; reachableFiles: Set<string> } {
  const filePathSet = new Set(files.map((file) => file.filePath));
  const entryFiles = resolveEntryFiles(rootDir, files, packageEntries, scriptEntryFiles, filePathSet);

  if (entryFiles.length === 0) {
    return { entryFiles: [], reachableFiles: new Set<string>() };
  }

  const graph = buildLocalImportGraph(files, filePathSet);
  const visited = new Set<string>();
  const stack = [...entryFiles];

  while (stack.length > 0) {
    const current = stack.pop();

    if (!current || visited.has(current)) {
      continue;
    }

    visited.add(current);

    for (const next of graph.get(current) ?? []) {
      if (!visited.has(next)) {
        stack.push(next);
      }
    }
  }

  return { entryFiles, reachableFiles: visited };
}

function buildLocalImportGraph(
  files: FileScanResult[],
  filePathSet: Set<string>,
): Map<string, string[]> {
  const graph = new Map<string, string[]>();

  for (const file of files) {
    const localImports = new Set<string>();

    for (const reference of file.localReferences) {
      if (!isLocalSpecifier(reference.specifier)) {
        continue;
      }

      const resolved = resolveLocalImport(file.filePath, reference.specifier, filePathSet);

      if (resolved) {
        localImports.add(resolved);
      }
    }

    graph.set(file.filePath, [...localImports].sort());
  }

  return graph;
}

function markAllExportsUsed(
  filePath: string,
  exportedNamesByFile: Map<string, Set<string>>,
  usedExports: Map<string, Set<string>>,
): void {
  const exportedNames = exportedNamesByFile.get(filePath);

  if (!exportedNames) {
    return;
  }

  for (const name of exportedNames) {
    markExportUsed(filePath, name, usedExports);
  }
}

function markExportUsed(
  filePath: string,
  exportName: string,
  usedExports: Map<string, Set<string>>,
): void {
  const names = usedExports.get(filePath) ?? new Set<string>();
  names.add(exportName);
  usedExports.set(filePath, names);
}

function resolveEntryFiles(
  rootDir: string,
  files: FileScanResult[],
  packageEntries: string[],
  scriptEntryFiles: string[],
  filePathSet: Set<string>,
): string[] {
  const entries = new Set<string>();
  const packageDir = path.dirname(path.join(rootDir, "package.json"));

  for (const entry of packageEntries) {
    const resolved = resolvePackageEntry(packageDir, entry, filePathSet);

    if (resolved) {
      entries.add(resolved);
    }
  }

  for (const entry of scriptEntryFiles) {
    const absolute = path.resolve(rootDir, entry);

    if (filePathSet.has(absolute)) {
      entries.add(absolute);
    }
  }

  for (const file of files) {
    if (file.relativePath.startsWith("src/index.") || file.relativePath === "index.ts" || file.relativePath === "index.js") {
      entries.add(file.filePath);
    }
  }

  return [...entries].sort();
}

function resolvePackageEntry(
  packageDir: string,
  specifier: string,
  filePathSet: Set<string>,
): string | null {
  if (!specifier.startsWith(".") && !path.isAbsolute(specifier)) {
    return null;
  }

  const target = path.resolve(packageDir, specifier);
  return resolveFileCandidate(target, filePathSet);
}

function resolveLocalImport(
  fromFilePath: string,
  specifier: string,
  filePathSet: Set<string>,
): string | null {
  const target = path.resolve(path.dirname(fromFilePath), specifier);
  return resolveFileCandidate(target, filePathSet);
}

function resolveFileCandidate(target: string, filePathSet: Set<string>): string | null {
  const candidates = new Set<string>([target]);

  for (const extension of RESOLVABLE_EXTENSIONS) {
    candidates.add(`${target}${extension}`);
    candidates.add(path.join(target, `index${extension}`));
  }

  for (const candidate of candidates) {
    if (filePathSet.has(candidate)) {
      return candidate;
    }
  }

  return null;
}

function isExternalSpecifier(specifier: string): boolean {
  return !specifier.startsWith(".") && !path.isAbsolute(specifier);
}

function isLocalSpecifier(specifier: string): boolean {
  return specifier.startsWith(".") || path.isAbsolute(specifier);
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

function mergeFiles(...fileGroups: string[][]): string[] {
  return [...new Set(fileGroups.flat())].sort();
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
function shouldIgnoreUnusedFile(relativePath: string): boolean {
  return /(\.|\/)(test|spec)\.[^.]+$/i.test(relativePath)
    || /(^|\/)__tests__(\/|$)/i.test(relativePath)
    || /(^|\/)stories\//i.test(relativePath)
    || /\.stories\.[^.]+$/i.test(relativePath)
    || /(^|\/)(vitest|jest|tsdown|vite|webpack|rollup|eslint|prettier|biome)\.config\.[^.]+$/i.test(relativePath);
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

function getProcessMemoryUsage(): ScanMemory {
  const usage = process.memoryUsage();

  return {
    rssMb: roundMb(usage.rss),
    heapUsedMb: roundMb(usage.heapUsed),
    heapTotalMb: roundMb(usage.heapTotal),
    externalMb: roundMb(usage.external),
    arrayBuffersMb: roundMb(usage.arrayBuffers),
  };
}

function roundMb(value: number): number {
  return Number((value / (1024 * 1024)).toFixed(1));
}

function roundMs(value: number): number {
  return Number(value.toFixed(1));
}
