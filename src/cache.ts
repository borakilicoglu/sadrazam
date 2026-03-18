import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ScanOptions, ScanResult } from "./scan.js";

const CACHE_FILE = ".sadrazam-cache.json";
const CACHE_VERSION = 1;

type CachedScanResult = Omit<ScanResult, "performance" | "cached">;

interface CacheEntry {
  fingerprint: string;
  result: CachedScanResult;
}

interface CacheFileShape {
  version: number;
  entries: Record<string, CacheEntry>;
}

interface ScanCacheInput {
  packageDir: string;
  packagePath: string;
  filePaths: string[];
  options: ScanOptions;
}

interface WriteScanCacheInput extends ScanCacheInput {
  result: CachedScanResult;
}

export async function readScanCache(input: ScanCacheInput): Promise<CachedScanResult | null> {
  const cache = await readCacheFile(path.join(input.packageDir, CACHE_FILE));

  if (!cache) {
    return null;
  }

  const entry = cache.entries[getCacheKey(input.options)];

  if (!entry) {
    return null;
  }

  const fingerprint = await buildFingerprint(input.packageDir, input.packagePath, input.filePaths);

  return entry.fingerprint === fingerprint ? entry.result : null;
}

export async function writeScanCache(input: WriteScanCacheInput): Promise<void> {
  const cachePath = path.join(input.packageDir, CACHE_FILE);
  const cache = (await readCacheFile(cachePath)) ?? { version: CACHE_VERSION, entries: {} };
  const fingerprint = await buildFingerprint(input.packageDir, input.packagePath, input.filePaths);

  cache.version = CACHE_VERSION;
  cache.entries[getCacheKey(input.options)] = {
    fingerprint,
    result: input.result,
  };

  await writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
}

async function buildFingerprint(
  packageDir: string,
  packagePath: string,
  filePaths: string[],
): Promise<string> {
  const metadataPaths = [packagePath, ...filePaths].sort();
  const entries = await Promise.all(
    metadataPaths.map(async (filePath) => {
      try {
        const fileStat = await stat(filePath);
        const relativePath = path.relative(packageDir, filePath) || path.basename(filePath);
        return `${relativePath}:${fileStat.size}:${Math.floor(fileStat.mtimeMs)}`;
      } catch {
        return `${filePath}:missing`;
      }
    }),
  );

  return createHash("sha256").update(entries.join("\n")).digest("hex");
}

async function readCacheFile(cachePath: string): Promise<CacheFileShape | null> {
  try {
    const content = await readFile(cachePath, "utf8");
    const parsed = JSON.parse(content) as Partial<CacheFileShape>;

    if (parsed.version !== CACHE_VERSION || !parsed.entries || typeof parsed.entries !== "object") {
      return null;
    }

    return {
      version: CACHE_VERSION,
      entries: parsed.entries,
    };
  } catch {
    return null;
  }
}

function getCacheKey(options: ScanOptions): string {
  return JSON.stringify({
    production: Boolean(options.production),
    strict: Boolean(options.strict),
  });
}
