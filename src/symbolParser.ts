export interface LocalReference {
  specifier: string;
  importedNames: string[];
  usesAllExports: boolean;
}

const IMPORT_CLAUSE_RE = /\bimport\s+([\s\S]*?)\s+from\s+["'`]([^"'`]+)["'`]/g;
const DYNAMIC_IMPORT_RE = /\bimport\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g;
const REQUIRE_RE = /\brequire\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g;
const IMPORT_EQUALS_RE = /\bimport\s+[\w*\s{},]+\s*=\s*require\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g;
const EXPORT_FROM_RE = /\bexport\s+{([^}]+)}\s+from\s+["'`]([^"'`]+)["'`]/g;
const EXPORT_ALL_FROM_RE = /\bexport\s+\*\s+from\s+["'`]([^"'`]+)["'`]/g;
const EXPORT_ALL_AS_FROM_RE = /\bexport\s+\*\s+as\s+[A-Za-z_$][\w$]*\s+from\s+["'`]([^"'`]+)["'`]/g;
const EXPORT_DEFAULT_RE = /\bexport\s+default\b/g;
const EXPORT_DECLARATION_RES = [
  /\bexport\s+(?:declare\s+)?(?:const|let|var|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g,
  /\bexport\s+(?:declare\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
];
const EXPORT_LIST_RE = /\bexport\s*{([^}]+)}(?!\s*from)/g;
const EXPORT_TYPE_LIST_RE = /\bexport\s+type\s*{([^}]+)}(?!\s*from)/g;

export function parseLocalReferences(source: string): LocalReference[] {
  const references: LocalReference[] = [];

  for (const match of source.matchAll(IMPORT_CLAUSE_RE)) {
    const clause = match[1]?.trim();
    const specifier = match[2]?.trim();

    if (!clause || !specifier) {
      continue;
    }

    references.push({ specifier, ...parseImportClause(clause) });
  }

  for (const match of source.matchAll(DYNAMIC_IMPORT_RE)) {
    const specifier = match[1]?.trim();
    if (specifier) {
      references.push({ specifier, importedNames: [], usesAllExports: true });
    }
  }

  for (const match of source.matchAll(REQUIRE_RE)) {
    const specifier = match[1]?.trim();
    if (specifier) {
      references.push({ specifier, importedNames: [], usesAllExports: true });
    }
  }

  for (const match of source.matchAll(IMPORT_EQUALS_RE)) {
    const specifier = match[1]?.trim();
    if (specifier) {
      references.push({ specifier, importedNames: [], usesAllExports: true });
    }
  }

  for (const match of source.matchAll(EXPORT_FROM_RE)) {
    const specifier = match[2]?.trim();
    const importedNames = parseListedNames(match[1] ?? "", "source");

    if (specifier) {
      references.push({ specifier, importedNames, usesAllExports: false });
    }
  }

  for (const pattern of [EXPORT_ALL_FROM_RE, EXPORT_ALL_AS_FROM_RE]) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1]?.trim();
      if (specifier) {
        references.push({ specifier, importedNames: [], usesAllExports: true });
      }
    }
  }

  return dedupeReferences(references);
}

export function parseExportedNames(source: string): string[] {
  const names = new Set<string>();

  if (EXPORT_DEFAULT_RE.test(source)) {
    names.add("default");
  }

  for (const pattern of EXPORT_DECLARATION_RES) {
    for (const match of source.matchAll(pattern)) {
      const name = match[1]?.trim();
      if (name) {
        names.add(name);
      }
    }
  }

  for (const pattern of [EXPORT_LIST_RE, EXPORT_TYPE_LIST_RE]) {
    for (const match of source.matchAll(pattern)) {
      for (const name of parseListedNames(match[1] ?? "", "exported")) {
        names.add(name);
      }
    }
  }

  return [...names].sort();
}

function parseImportClause(clause: string): Pick<LocalReference, "importedNames" | "usesAllExports"> {
  const normalized = clause.replace(/^type\s+/, "").trim();

  if (normalized.startsWith("* as ")) {
    return { importedNames: [], usesAllExports: true };
  }

  if (normalized.startsWith("{") && normalized.endsWith("}")) {
    return {
      importedNames: parseListedNames(normalized.slice(1, -1), "source"),
      usesAllExports: false,
    };
  }

  if (normalized.includes(",")) {
    const [left = "", right = ""] = normalized.split(/,(.+)/s).map((part) => part?.trim() ?? "");
    const importedNames = new Set<string>();

    if (left && !left.startsWith("{") && !left.startsWith("*")) {
      importedNames.add("default");
    }

    if (right.startsWith("* as ")) {
      return { importedNames: [], usesAllExports: true };
    }

    if (right.startsWith("{") && right.endsWith("}")) {
      for (const name of parseListedNames(right.slice(1, -1), "source")) {
        importedNames.add(name);
      }
    }

    return { importedNames: [...importedNames].sort(), usesAllExports: false };
  }

  if (normalized) {
    return { importedNames: ["default"], usesAllExports: false };
  }

  return { importedNames: [], usesAllExports: false };
}

function parseListedNames(value: string, mode: "source" | "exported"): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const cleaned = part.replace(/^type\s+/, "").trim();

      if (!cleaned.includes(" as ")) {
        return cleaned;
      }

      const [left, right] = cleaned.split(/\s+as\s+/);
      return (mode === "source" ? left : right)?.trim() ?? cleaned;
    })
    .filter(Boolean)
    .sort();
}

function dedupeReferences(references: LocalReference[]): LocalReference[] {
  const seen = new Set<string>();

  return references.filter((reference) => {
    const key = `${reference.specifier}:${reference.usesAllExports}:${reference.importedNames.join(",")}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}
