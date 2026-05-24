import { createJavaScriptCodeMask, isCodeMatch } from "./sourceSanitizer.js";

const IMPORT_RE =
  /\bimport\s+(?:type\s+)?(?:[^"'`]+?\s+from\s+)?["'`]([^"'`]+)["'`]/g;
const IMPORT_EQUALS_RE = /\bimport\s+[\w*\s{},]+\s*=\s*require\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g;
const DYNAMIC_IMPORT_RE = /\bimport\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g;
const REQUIRE_RE = /\brequire\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g;
const REQUIRE_RESOLVE_RE = /\brequire\.resolve\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g;
const EXPORT_FROM_RE = /\bexport\s+(?:\*|{[^}]+})\s+from\s+["'`]([^"'`]+)["'`]/g;

export interface ParsedImport {
  specifier: string;
  kind:
    | "import"
    | "import-equals"
    | "export-from"
    | "dynamic-import"
    | "require"
    | "require-resolve";
}

export function parseImports(source: string): ParsedImport[] {
  const matches: ParsedImport[] = [];
  const codeMask = createJavaScriptCodeMask(source);

  collectMatches(matches, source, codeMask, IMPORT_RE, "import");
  collectMatches(matches, source, codeMask, IMPORT_EQUALS_RE, "import-equals");
  collectMatches(matches, source, codeMask, EXPORT_FROM_RE, "export-from");
  collectMatches(matches, source, codeMask, DYNAMIC_IMPORT_RE, "dynamic-import");
  collectMatches(matches, source, codeMask, REQUIRE_RE, "require");
  collectMatches(matches, source, codeMask, REQUIRE_RESOLVE_RE, "require-resolve");

  return dedupe(matches);
}

function collectMatches(
  matches: ParsedImport[],
  source: string,
  codeMask: boolean[],
  pattern: RegExp,
  kind: ParsedImport["kind"],
): void {
  for (const match of source.matchAll(pattern)) {
    if (!isCodeMatch(match, codeMask)) {
      continue;
    }

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
