import { parseFileSymbolsWithOxc } from "./oxcParser.js";
import { createJavaScriptCodeMask, isCodeMatch } from "./sourceSanitizer.js";

export interface LocalReference {
  specifier: string;
  importedNames: string[];
  usesAllExports: boolean;
}

export interface FileSymbols {
  /** All import specifiers (external + local), deduplicated. */
  allSpecifiers: string[];
  /** Local references with named import tracking (for unused-export analysis). */
  localReferences: LocalReference[];
  /** Exported names from this file. */
  exportedNames: string[];
  /** Export aliases that expose the same local identifier more than once. */
  duplicateExportAliases: DuplicateExportAlias[];
  /** Exports tagged with a JSDoc ignore tag. */
  ignoredExportNames: string[];
}

export interface DuplicateExportAlias {
  canonical: string;
  aliases: string[];
}

export type ParseBackend = "oxc" | "regex";

export interface ParsedFileSymbols {
  symbols: FileSymbols;
  backend: ParseBackend;
}

const IMPORT_CLAUSE_RE = /\bimport\s+([\s\S]*?)\s+from\s+["'`]([^"'`]+)["'`]/g;
const IMPORT_SIDE_EFFECT_RE = /\bimport\s+["'`]([^"'`]+)["'`]/g;
const DYNAMIC_IMPORT_RE = /\bimport\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g;
const REQUIRE_RE = /\brequire\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g;
const REQUIRE_RESOLVE_RE = /\brequire\.resolve\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g;
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

const JSDOC_EXPORT_DECLARATION_RE = /\/\*\*([\s\S]*?)\*\/\s*export\s+(?:declare\s+)?(?:const|let|var|class|interface|type|enum|async\s+function|function)\s+([A-Za-z_$][\w$]*)/g;
const JSDOC_EXPORT_LIST_RE = /\/\*\*([\s\S]*?)\*\/\s*export\s*(?:type\s*)?{([^}]+)}(?!\s*from)/g;
const JSDOC_EXPORT_DEFAULT_RE = /\/\*\*([\s\S]*?)\*\/\s*export\s+default\b/g;

/**
 * Single-pass parse of a source file.
 * Replaces calling parseLocalReferences + parseExportedNames + parseIgnoredExportNames
 * + importParser.parseImports separately — all regex runs happen once over the same string.
 */
export function parseFileSymbols(source: string, jsdocIgnoreTags: string[], filename?: string): FileSymbols {
  return parseFileSymbolsDetailed(source, jsdocIgnoreTags, filename).symbols;
}

export function parseFileSymbolsDetailed(
  source: string,
  jsdocIgnoreTags: string[],
  filename?: string,
): ParsedFileSymbols {
  const ignoredExportNames = collectIgnoredExportNames(source, jsdocIgnoreTags);
  const oxcSymbols = parseFileSymbolsWithOxc(source, ignoredExportNames, filename);

  if (oxcSymbols) {
    return { symbols: oxcSymbols, backend: "oxc" };
  }

  const codeMask = createJavaScriptCodeMask(source);
  const allSpecifiers = new Set<string>();
  const references: LocalReference[] = [];

  // --- import "specifier" (side-effect only, no bindings) ---
  for (const match of source.matchAll(IMPORT_SIDE_EFFECT_RE)) {
    if (!isCodeMatch(match, codeMask)) continue;
    const specifier = match[1]?.trim();
    if (specifier) {
      allSpecifiers.add(specifier);
      // side-effect imports don't contribute to local reference tracking
    }
  }

  // --- import ... from "specifier" ---
  for (const match of source.matchAll(IMPORT_CLAUSE_RE)) {
    if (!isCodeMatch(match, codeMask)) continue;
    const clause = match[1]?.trim();
    const specifier = match[2]?.trim();
    if (!clause || !specifier) continue;
    allSpecifiers.add(specifier);
    references.push({ specifier, ...parseImportClause(clause) });
  }

  // --- import("specifier") ---
  for (const match of source.matchAll(DYNAMIC_IMPORT_RE)) {
    if (!isCodeMatch(match, codeMask)) continue;
    const specifier = match[1]?.trim();
    if (specifier) {
      allSpecifiers.add(specifier);
      references.push({ specifier, importedNames: [], usesAllExports: true });
    }
  }

  // --- require("specifier") ---
  for (const match of source.matchAll(REQUIRE_RE)) {
    if (!isCodeMatch(match, codeMask)) continue;
    const specifier = match[1]?.trim();
    if (specifier) {
      allSpecifiers.add(specifier);
      references.push({ specifier, importedNames: [], usesAllExports: true });
    }
  }

  // --- require.resolve("specifier") ---
  for (const match of source.matchAll(REQUIRE_RESOLVE_RE)) {
    if (!isCodeMatch(match, codeMask)) continue;
    const specifier = match[1]?.trim();
    if (specifier) {
      allSpecifiers.add(specifier);
      references.push({ specifier, importedNames: [], usesAllExports: true });
    }
  }

  // --- import X = require("specifier") ---
  for (const match of source.matchAll(IMPORT_EQUALS_RE)) {
    if (!isCodeMatch(match, codeMask)) continue;
    const specifier = match[1]?.trim();
    if (specifier) {
      allSpecifiers.add(specifier);
      references.push({ specifier, importedNames: [], usesAllExports: true });
    }
  }

  // --- export { X } from "specifier" ---
  for (const match of source.matchAll(EXPORT_FROM_RE)) {
    if (!isCodeMatch(match, codeMask)) continue;
    const specifier = match[2]?.trim();
    const importedNames = parseListedNames(match[1] ?? "", "source");
    if (specifier) {
      allSpecifiers.add(specifier);
      references.push({ specifier, importedNames, usesAllExports: false });
    }
  }

  // --- export * from / export * as ns from ---
  for (const pattern of [EXPORT_ALL_FROM_RE, EXPORT_ALL_AS_FROM_RE]) {
    for (const match of source.matchAll(pattern)) {
      if (!isCodeMatch(match, codeMask)) continue;
      const specifier = match[1]?.trim();
      if (specifier) {
        allSpecifiers.add(specifier);
        references.push({ specifier, importedNames: [], usesAllExports: true });
      }
    }
  }

  return {
    symbols: {
      allSpecifiers: [...allSpecifiers].sort(),
      localReferences: dedupeReferences(references),
      exportedNames: collectExportedNames(source, codeMask),
      duplicateExportAliases: collectDuplicateExportAliases(source, codeMask),
      ignoredExportNames,
    },
    backend: "regex",
  };
}

export function parseLocalReferences(source: string): LocalReference[] {
  const oxcSymbols = parseFileSymbolsWithOxc(source);

  if (oxcSymbols) {
    return oxcSymbols.localReferences;
  }

  const codeMask = createJavaScriptCodeMask(source);
  const references: LocalReference[] = [];

  for (const match of source.matchAll(IMPORT_CLAUSE_RE)) {
    if (!isCodeMatch(match, codeMask)) continue;
    const clause = match[1]?.trim();
    const specifier = match[2]?.trim();

    if (!clause || !specifier) {
      continue;
    }

    references.push({ specifier, ...parseImportClause(clause) });
  }

  for (const match of source.matchAll(DYNAMIC_IMPORT_RE)) {
    if (!isCodeMatch(match, codeMask)) continue;
    const specifier = match[1]?.trim();
    if (specifier) {
      references.push({ specifier, importedNames: [], usesAllExports: true });
    }
  }

  for (const match of source.matchAll(REQUIRE_RE)) {
    if (!isCodeMatch(match, codeMask)) continue;
    const specifier = match[1]?.trim();
    if (specifier) {
      references.push({ specifier, importedNames: [], usesAllExports: true });
    }
  }

  for (const match of source.matchAll(IMPORT_EQUALS_RE)) {
    if (!isCodeMatch(match, codeMask)) continue;
    const specifier = match[1]?.trim();
    if (specifier) {
      references.push({ specifier, importedNames: [], usesAllExports: true });
    }
  }

  for (const match of source.matchAll(EXPORT_FROM_RE)) {
    if (!isCodeMatch(match, codeMask)) continue;
    const specifier = match[2]?.trim();
    const importedNames = parseListedNames(match[1] ?? "", "source");

    if (specifier) {
      references.push({ specifier, importedNames, usesAllExports: false });
    }
  }

  for (const pattern of [EXPORT_ALL_FROM_RE, EXPORT_ALL_AS_FROM_RE]) {
    for (const match of source.matchAll(pattern)) {
      if (!isCodeMatch(match, codeMask)) continue;
      const specifier = match[1]?.trim();
      if (specifier) {
        references.push({ specifier, importedNames: [], usesAllExports: true });
      }
    }
  }

  return dedupeReferences(references);
}

export function parseIgnoredExportNames(source: string, tagNames: string[]): string[] {
  return collectIgnoredExportNames(source, tagNames);
}

export function parseExportedNames(source: string): string[] {
  const oxcSymbols = parseFileSymbolsWithOxc(source);

  if (oxcSymbols) {
    return oxcSymbols.exportedNames;
  }

  return collectExportedNames(source, createJavaScriptCodeMask(source));
}

function collectIgnoredExportNames(source: string, tagNames: string[]): string[] {
  if (tagNames.length === 0) {
    return [];
  }

  const normalizedTags = tagNames.map((tagName) => normalizeTag(tagName)).filter(Boolean);

  if (normalizedTags.length === 0) {
    return [];
  }

  const ignored = new Set<string>();

  for (const match of source.matchAll(JSDOC_EXPORT_DECLARATION_RE)) {
    if (!hasAnyJsDocTag(match[1] ?? "", normalizedTags)) {
      continue;
    }

    const exportName = match[2]?.trim();

    if (exportName) {
      ignored.add(exportName);
    }
  }

  for (const match of source.matchAll(JSDOC_EXPORT_LIST_RE)) {
    if (!hasAnyJsDocTag(match[1] ?? "", normalizedTags)) {
      continue;
    }

    for (const exportName of parseListedNames(match[2] ?? "", "exported")) {
      ignored.add(exportName);
    }
  }

  for (const match of source.matchAll(JSDOC_EXPORT_DEFAULT_RE)) {
    if (hasAnyJsDocTag(match[1] ?? "", normalizedTags)) {
      ignored.add("default");
    }
  }

  return [...ignored].sort();
}

function collectExportedNames(source: string, codeMask: boolean[]): string[] {
  const names = new Set<string>();

  for (const match of source.matchAll(EXPORT_DEFAULT_RE)) {
    if (isCodeMatch(match, codeMask)) {
      names.add("default");
      break;
    }
  }

  for (const pattern of EXPORT_DECLARATION_RES) {
    for (const match of source.matchAll(pattern)) {
      if (!isCodeMatch(match, codeMask)) continue;
      const name = match[1]?.trim();
      if (name) {
        names.add(name);
      }
    }
  }

  for (const pattern of [EXPORT_LIST_RE, EXPORT_TYPE_LIST_RE]) {
    for (const match of source.matchAll(pattern)) {
      if (!isCodeMatch(match, codeMask)) continue;
      for (const name of parseListedNames(match[1] ?? "", "exported")) {
        names.add(name);
      }
    }
  }

  return [...names].sort();
}

function collectDuplicateExportAliases(source: string, codeMask: boolean[]): DuplicateExportAlias[] {
  const exportedNames = new Set(collectExportedNames(source, codeMask));
  const aliasesByCanonical = new Map<string, Set<string>>();

  for (const match of source.matchAll(/\bexport\s+const\s+([A-Za-z_$][\w$]*)\s*=\s*([A-Za-z_$][\w$]*)\b/g)) {
    if (!isCodeMatch(match, codeMask)) continue;
    if (hasAliasJsDocBefore(source, match.index ?? 0)) continue;
    const alias = match[1]?.trim();
    const canonical = match[2]?.trim();

    if (alias && canonical && alias !== canonical && exportedNames.has(canonical)) {
      addDuplicateAlias(aliasesByCanonical, canonical, alias);
    }
  }

  for (const match of source.matchAll(/\bexport\s+default\s+([A-Za-z_$][\w$]*)\b/g)) {
    if (!isCodeMatch(match, codeMask)) continue;
    if (hasAliasJsDocBefore(source, match.index ?? 0)) continue;
    const canonical = match[1]?.trim();

    if (canonical && exportedNames.has(canonical)) {
      addDuplicateAlias(aliasesByCanonical, canonical, "default");
    }
  }

  return [...aliasesByCanonical.entries()]
    .map(([canonical, aliases]) => ({ canonical, aliases: [...aliases].sort() }))
    .sort((left, right) => left.canonical.localeCompare(right.canonical));
}

function addDuplicateAlias(aliasesByCanonical: Map<string, Set<string>>, canonical: string, alias: string): void {
  const aliases = aliasesByCanonical.get(canonical) ?? new Set<string>();
  aliases.add(alias);
  aliasesByCanonical.set(canonical, aliases);
}

function hasAliasJsDocBefore(source: string, start: number): boolean {
  const before = source.slice(0, start);
  const match = before.match(/\/\*\*([\s\S]*?)\*\/\s*$/);
  return Boolean(match?.[1]?.includes("@alias"));
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

function hasAnyJsDocTag(comment: string, tagNames: string[]): boolean {
  return tagNames.some((tagName) => comment.includes(`@${tagName}`));
}

function normalizeTag(tagName: string): string {
  return tagName.trim().replace(/^@/, "");
}
