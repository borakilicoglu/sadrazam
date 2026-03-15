const IMPORT_RE =
  /\bimport\s+(?:type\s+)?(?:[^"'`]+?\s+from\s+)?["'`]([^"'`]+)["'`]/g;
const DYNAMIC_IMPORT_RE = /\bimport\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g;
const REQUIRE_RE = /\brequire\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g;

export interface ParsedImport {
  specifier: string;
  kind: "import" | "dynamic-import" | "require";
}

export function parseImports(source: string): ParsedImport[] {
  const matches: ParsedImport[] = [];

  collectMatches(matches, source, IMPORT_RE, "import");
  collectMatches(matches, source, DYNAMIC_IMPORT_RE, "dynamic-import");
  collectMatches(matches, source, REQUIRE_RE, "require");

  return dedupe(matches);
}

function collectMatches(
  matches: ParsedImport[],
  source: string,
  pattern: RegExp,
  kind: ParsedImport["kind"],
): void {
  for (const match of source.matchAll(pattern)) {
    const specifier = match[1]?.trim();

    if (specifier) {
      matches.push({ specifier, kind });
    }
  }
}

function dedupe(items: ParsedImport[]): ParsedImport[] {
  const seen = new Set<string>();

  return items.filter((item) => {
    const key = `${item.kind}:${item.specifier}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}
