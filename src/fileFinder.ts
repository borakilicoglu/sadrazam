import fg from "fast-glob";
import path from "node:path";

const DEFAULT_PATTERNS = ["**/*.{js,cjs,mjs,ts,cts,mts,jsx,tsx}"];
const DEFAULT_IGNORES = ["**/node_modules/**", "**/dist/**", "**/.git/**"];

export async function findSourceFiles(rootDir: string): Promise<string[]> {
  const cwd = path.resolve(rootDir);

  return fg(DEFAULT_PATTERNS, {
    cwd,
    absolute: true,
    onlyFiles: true,
    ignore: DEFAULT_IGNORES,
  });
}
