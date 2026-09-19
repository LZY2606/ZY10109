const PATH_TOKEN_REGEXP = /[a-zA-Z_][a-zA-Z0-9_]*/g;
const UNSAFE_PATH_SEGMENTS = new Set(["__proto__", "prototype", "constructor"]);

export function findUnsafePathToken(part: string): string | null {
  // Bracket contents are checked literally too: a[__proto__] must be rejected
  // even though the surrounding characters are brackets rather than dots.
  for (const bracketMatch of part.matchAll(/[[]([^[\]]*)[\]]/g)) {
    const bracketContent = bracketMatch[1] ?? "";
    if (UNSAFE_PATH_SEGMENTS.has(bracketContent)) {
      return bracketContent;
    }
  }

  // Identifiers discovered anywhere in the part (including bracket contents
  // merged with trailing literals such as a[__proto__]b) are unsafe.
  const tokens = part.match(PATH_TOKEN_REGEXP);
  if (tokens) {
    for (const token of tokens) {
      if (UNSAFE_PATH_SEGMENTS.has(token)) {
        return token;
      }
    }
  }

  return null;
}

export function assertPathIsSafe(nameParts: readonly string[], allowUnsafePathSegments: boolean): void {
  if (allowUnsafePathSegments) {
    return;
  }

  for (const namePart of nameParts) {
    const unsafeToken = findUnsafePathToken(namePart);
    if (unsafeToken) {
      throw new TypeError(
        `Unsafe path segment "${unsafeToken}" is not allowed. ` +
          "Pass allowUnsafePathSegments: true only for trusted input."
      );
    }
  }
}
