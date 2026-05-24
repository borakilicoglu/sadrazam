export function createJavaScriptCodeMask(source: string): boolean[] {
  const mask = Array.from({ length: source.length }, () => true);
  let index = 0;
  let quote: '"' | "'" | "`" | null = null;
  let escaped = false;

  while (index < source.length) {
    const current = source[index] ?? "";
    const next = source[index + 1] ?? "";

    if (quote) {
      mask[index] = false;

      if (escaped) {
        escaped = false;
      } else if (current === "\\") {
        escaped = true;
      } else if (current === quote) {
        quote = null;
      }

      index += 1;
      continue;
    }

    if (current === '"' || current === "'" || current === "`") {
      quote = current;
      mask[index] = false;
      index += 1;
      continue;
    }

    if (current === "/" && next === "/") {
      mask[index] = false;
      mask[index + 1] = false;
      index += 2;

      while (index < source.length) {
        const commentChar = source[index] ?? "";

        if (commentChar === "\n" || commentChar === "\r") {
          index += 1;
          break;
        }

        mask[index] = false;
        index += 1;
      }

      continue;
    }

    if (current === "/" && next === "*") {
      mask[index] = false;
      mask[index + 1] = false;
      index += 2;

      while (index < source.length) {
        const commentChar = source[index] ?? "";
        const nextCommentChar = source[index + 1] ?? "";

        if (commentChar === "*" && nextCommentChar === "/") {
          mask[index] = false;
          mask[index + 1] = false;
          index += 2;
          break;
        }

        mask[index] = false;
        index += 1;
      }

      continue;
    }

    index += 1;
  }

  return mask;
}

export function isCodeMatch(match: RegExpMatchArray, codeMask: boolean[]): boolean {
  return match.index !== undefined && codeMask[match.index] === true;
}
