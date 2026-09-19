export type PathTokenKind = "prop" | "slot" | "push";

export interface PathToken {
  kind: PathTokenKind;
  /** Property name for "prop"; container/array name for "slot" and "push" ("" at root). */
  name: string;
  /** Compacted index key for "slot" (may be "" or numeric-like text). */
  index?: string;
  /** Raw segment text as produced by the path splitter. */
  raw: string;
}

export interface BracketMatch {
  content: string;
  index: number;
  text: string;
}

export function findBracketMatches(input: string): BracketMatch[] {
  const matches: BracketMatch[] = [];
  let cursor = 0;

  while (cursor < input.length) {
    const startIndex = input.indexOf("[", cursor);
    if (startIndex === -1) {
      break;
    }

    const endIndex = input.indexOf("]", startIndex + 1);
    if (endIndex === -1) {
      break;
    }

    matches.push({
      content: input.slice(startIndex + 1, endIndex),
      index: startIndex,
      text: input.slice(startIndex, endIndex + 1)
    });
    cursor = endIndex + 1;
  }

  return matches;
}

const ESCAPED_DELIMITER = "\uE000";
const ESCAPED_OPEN_BRACKET = "\uE001";
const ESCAPED_CLOSE_BRACKET = "\uE002";
const ESCAPED_BACKSLASH = "\uE003";

function protectEscapes(input: string): string {
  let protectedInput = "";

  for (let cursor = 0; cursor < input.length; cursor += 1) {
    const char = input[cursor] ?? "";

    if (char !== "\\") {
      protectedInput += char;
      continue;
    }

    const nextChar = input[cursor + 1];

    if (nextChar === undefined) {
      protectedInput += "\\";
      continue;
    }

    if (nextChar === ".") {
      protectedInput += ESCAPED_DELIMITER;
    } else if (nextChar === "[") {
      protectedInput += ESCAPED_OPEN_BRACKET;
    } else if (nextChar === "]") {
      protectedInput += ESCAPED_CLOSE_BRACKET;
    } else if (nextChar === "\\") {
      protectedInput += ESCAPED_BACKSLASH;
    } else {
      // Unrecognized escapes keep both characters verbatim (\x, \ space).
      protectedInput += char;
      protectedInput += nextChar;
    }

    cursor += 1;
  }

  return protectedInput;
}

function restoreEscapes(part: string): string {
  return part
    .replace(new RegExp(ESCAPED_DELIMITER, "g"), ".")
    .replace(new RegExp(ESCAPED_OPEN_BRACKET, "g"), "[")
    .replace(new RegExp(ESCAPED_CLOSE_BRACKET, "g"), "]")
    .replace(new RegExp(ESCAPED_BACKSLASH, "g"), "\\");
}

/**
 * Splits a path into the legacy name parts: plain segments, `[index]`/`[]`
 * array segments, and rails-style `[name]` object segments.
 *
 * The algorithm is shared verbatim by every adapter so escaping, consecutive
 * brackets and unmatched brackets behave identically across packages.
 */
export function splitPathParts(name: string, delimiter: string, allowEscapedSegments = false): string[] {
  const protectedName = allowEscapedSegments ? protectEscapes(name) : name;
  const rawParts = protectedName.split(delimiter);
  const nameParts: string[] = [];

  for (const rawPart of rawParts) {
    const bracketMatches = findBracketMatches(rawPart);
    if (bracketMatches.length === 0) {
      nameParts.push(allowEscapedSegments ? restoreEscapes(rawPart) : rawPart);
      continue;
    }

    let currentPart = "";
    let cursor = 0;

    for (const match of bracketMatches) {
      const literalText = rawPart.slice(cursor, match.index ?? cursor);
      if (literalText !== "") {
        currentPart += literalText;
      }

      const bracketContent = match.content;
      const isArraySegment = bracketContent === "" || /^\d+$/.test(bracketContent);

      if (isArraySegment) {
        if (currentPart !== "" && currentPart.endsWith("]")) {
          nameParts.push(currentPart);
          currentPart = "";
        }

        currentPart = `${currentPart}[${bracketContent}]`;
      } else {
        if (currentPart !== "") {
          nameParts.push(currentPart);
        }

        currentPart = bracketContent;
      }

      cursor = match.index + match.text.length;
    }

    const trailingText = rawPart.slice(cursor);
    if (trailingText !== "") {
      currentPart += trailingText;
    }

    if (currentPart !== "") {
      nameParts.push(allowEscapedSegments ? restoreEscapes(currentPart) : currentPart);
    }
  }

  return nameParts;
}

const SLOT_INDEX_REGEXP = /(^([a-z_]+)?\[)|(\]$)/gi;

/**
 * Classifies one legacy name part into a structural path token.
 *
 * - `prop`  — plain object property (`person`, `name`, `0` after a delimiter)
 * - `slot`  — indexed array element (`items[5]`, `[0]`, `[0][1]`'s outer slot)
 * - `push`  — append marker (`items[]`, `[]`)
 */
export function tokenizePathPart(part: string): PathToken {
  const openBracketIndex = part.indexOf("[");
  const name = openBracketIndex === -1 ? part : part.slice(0, openBracketIndex);

  if (part.includes("[]")) {
    return { kind: "push", name, raw: part };
  }

  if (openBracketIndex !== -1) {
    const index = part.replace(SLOT_INDEX_REGEXP, "");
    return { kind: "slot", name, index, raw: part };
  }

  return { kind: "prop", name: part, raw: part };
}

export function tokenizePath(path: string, delimiter = ".", allowEscapedSegments = false): PathToken[] {
  const parts = splitPathParts(path, delimiter, allowEscapedSegments);
  return parts.map((part) => tokenizePathPart(part));
}
