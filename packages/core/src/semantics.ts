import type {
  AdapterCapabilities,
  BracketMatch,
  CapabilityKey,
  CapabilityResult,
  Entry,
  EntryInput,
  EntrySource,
  EntryValue,
  InferSchemaOutput,
  MergeContext,
  MergeOptions,
  NameValuePair,
  ObjectTree,
  ParseOptions,
  PathToken,
  SchemaValidator,
  SourcedEntry,
  ValidationOptions
} from "./types";

const SUB_ARRAY_REGEXP = /^\[\d+?\]/;
const SUB_OBJECT_REGEXP = /^[a-zA-Z_][a-zA-Z_0-9]*/;
const PATH_TOKEN_REGEXP = /[a-zA-Z_][a-zA-Z0-9_]*/g;
const NESTED_OBJECT_HINT_REGEXP = /^[0-9a-z_]+\[?/i;
const ARRAY_INDEX_EXTRACT_REGEXP = /(^([a-z_]+)?\[)|(\]$)/gi;

export const UNSAFE_PATH_SEGMENTS: ReadonlySet<string> = new Set([
  "__proto__",
  "prototype",
  "constructor"
]);

export const MISSING: unique symbol = Symbol("form2js.missing");

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function createIndexRecord(): Record<string, unknown> {
  return Object.create(null) as Record<string, unknown>;
}

export function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

export function readOwn(record: Record<string, unknown>, key: string): unknown {
  return hasOwn(record, key) ? record[key] : MISSING;
}

export function setOwn(record: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(record, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true
  });
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

export function splitPathParts(path: string, delimiter = "."): string[] {
  const rawParts = path.split(delimiter);
  const nameParts: string[] = [];

  for (const rawPart of rawParts) {
    const bracketMatches = findBracketMatches(rawPart);
    if (bracketMatches.length === 0) {
      nameParts.push(rawPart);
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
      nameParts.push(currentPart);
    }
  }

  return nameParts;
}

export function classifyPathPart(part: string, isLast: boolean): PathToken {
  if (part.includes("[]") && isLast) {
    return { kind: "push", name: part.slice(0, part.indexOf("[")), raw: part };
  }

  if (part.includes("[")) {
    return {
      kind: "index",
      name: part.slice(0, part.indexOf("[")),
      index: part.replace(ARRAY_INDEX_EXTRACT_REGEXP, ""),
      raw: part
    };
  }

  return { kind: "key", name: part, raw: part };
}

export function tokenizePath(path: string, delimiter = "."): PathToken[] {
  const parts = splitPathParts(path, delimiter);
  return parts.map((part, index) => classifyPathPart(part, index === parts.length - 1));
}

export function findUnsafePathSegment(part: string): string | null {
  const tokens = part.match(PATH_TOKEN_REGEXP);
  if (!tokens) {
    return null;
  }

  for (const token of tokens) {
    if (UNSAFE_PATH_SEGMENTS.has(token)) {
      return token;
    }
  }

  return null;
}

export function assertSafePath(nameParts: string[], allowUnsafePathSegments: boolean): void {
  if (allowUnsafePathSegments) {
    return;
  }

  for (const namePart of nameParts) {
    const unsafeToken = findUnsafePathSegment(namePart);
    if (unsafeToken) {
      throw new TypeError(
        `Unsafe path segment "${unsafeToken}" is not allowed. ` +
          "Pass allowUnsafePathSegments: true only for trusted input."
      );
    }
  }
}

export function isSafePath(path: string, delimiter = "."): boolean {
  const parts = splitPathParts(path, delimiter);
  return parts.every((part) => findUnsafePathSegment(part) === null);
}

export function selectNestedContainer(nextPart: string): ObjectTree | unknown[] {
  return NESTED_OBJECT_HINT_REGEXP.test(nextPart) ? {} : [];
}

export function ensureArrayContainer(container: unknown, arrayName: string): unknown[] {
  if (arrayName === "" && Array.isArray(container)) {
    return container;
  }

  if (!isRecord(container)) {
    throw new TypeError("Expected object-like container when creating array path");
  }

  const existingValue = readOwn(container, arrayName);
  if (Array.isArray(existingValue)) {
    return existingValue;
  }

  const newArray: unknown[] = [];
  setOwn(container, arrayName, newArray);
  return newArray;
}

export function pushToArrayContainer(container: unknown, arrayName: string, value: unknown): unknown {
  const targetArray = ensureArrayContainer(container, arrayName);
  targetArray.push(value);
  return targetArray[targetArray.length - 1];
}

export function mergeRepeatedValue<T>(existing: T | T[] | undefined, incoming: T | T[]): T | T[] {
  if (existing === undefined) {
    return incoming;
  }

  if (Array.isArray(existing)) {
    return Array.isArray(incoming) ? [...existing, ...incoming] : [...existing, incoming];
  }

  if (Array.isArray(incoming)) {
    return [existing, ...incoming];
  }

  return incoming;
}

export function createMergeContext(): MergeContext {
  return { arrays: createIndexRecord() as MergeContext["arrays"] };
}

export function setPathValue(
  target: ObjectTree,
  path: string,
  value: EntryValue,
  options: MergeOptions = {}
): ObjectTree {
  const delimiter = options.delimiter ?? ".";
  const context = options.context ?? createMergeContext();
  const allowUnsafePathSegments = options.allowUnsafePathSegments ?? false;
  const nameParts = splitPathParts(path, delimiter);
  assertSafePath(nameParts, allowUnsafePathSegments);

  let currResult: unknown = target;
  let arrayNameFull = "";

  for (let partIndex = 0; partIndex < nameParts.length; partIndex += 1) {
    const namePart = nameParts[partIndex] ?? "";
    const isLast = partIndex === nameParts.length - 1;
    const token = classifyPathPart(namePart, isLast);

    if (token.kind === "push") {
      arrayNameFull += token.name;

      pushToArrayContainer(currResult, token.name, value);
      continue;
    }

    if (token.kind === "index") {
      const arrayName = token.name;
      const arrayIndex = token.index;

      arrayNameFull += `_${arrayName}_${arrayIndex}`;

      if (arrayName !== "") {
        ensureArrayContainer(currResult, arrayName);
      }

      const existingArrayMap = readOwn(context.arrays, arrayNameFull);
      const arrayMap = isRecord(existingArrayMap) ? existingArrayMap : createIndexRecord();
      if (!isRecord(existingArrayMap)) {
        setOwn(context.arrays, arrayNameFull, arrayMap);
      }

      if (isLast) {
        const inserted = pushToArrayContainer(currResult, arrayName, value);
        setOwn(arrayMap, arrayIndex, inserted);
      } else if (readOwn(arrayMap, arrayIndex) === MISSING) {
        const nextNamePart = nameParts[partIndex + 1] ?? "";
        const nextContainer = selectNestedContainer(nextNamePart);

        const inserted = pushToArrayContainer(currResult, arrayName, nextContainer);
        setOwn(arrayMap, arrayIndex, inserted);
      }

      currResult = readOwn(arrayMap, arrayIndex);
      continue;
    }

    arrayNameFull += namePart;

    if (!isRecord(currResult)) {
      throw new TypeError("Expected object-like container while setting nested path");
    }

    if (!isLast) {
      if (readOwn(currResult, namePart) === MISSING) {
        setOwn(currResult, namePart, {});
      }

      currResult = readOwn(currResult, namePart);
    } else {
      setOwn(currResult, namePart, value);
    }
  }

  return target;
}

export function normalizeEntry(entry: EntryInput): Entry {
  if (Array.isArray(entry) && typeof entry[0] === "string") {
    const tupleEntry = entry as readonly [string, EntryValue];
    return { key: tupleEntry[0], value: tupleEntry[1] };
  }

  if ("key" in entry && typeof entry.key === "string") {
    return { key: entry.key, value: entry.value };
  }

  if ("name" in entry && typeof entry.name === "string") {
    return { key: entry.name, value: entry.value };
  }

  throw new TypeError("Invalid entry. Expected [key, value], { key, value }, or { name, value }.");
}

export function shouldSkipEntryValue(value: EntryValue, skipEmpty: boolean): boolean {
  return skipEmpty && (value === "" || value === null);
}

export function reduceEntries(entries: Iterable<EntryInput>, options?: ParseOptions): ObjectTree;
export function reduceEntries<TSchema extends SchemaValidator>(
  entries: Iterable<EntryInput>,
  options: ParseOptions & { schema: TSchema }
): InferSchemaOutput<TSchema>;
export function reduceEntries(
  entries: Iterable<EntryInput>,
  options: ParseOptions & ValidationOptions = {}
): unknown {
  const delimiter = options.delimiter ?? ".";
  const skipEmpty = options.skipEmpty ?? true;
  const allowUnsafePathSegments = options.allowUnsafePathSegments ?? false;
  const context = createMergeContext();
  const result: ObjectTree = {};

  for (const rawEntry of entries) {
    const entry = normalizeEntry(rawEntry);

    if (shouldSkipEntryValue(entry.value, skipEmpty)) {
      continue;
    }

    setPathValue(result, entry.key, entry.value, {
      delimiter,
      context,
      allowUnsafePathSegments
    });
  }

  if (options.schema) {
    return options.schema.parse(result);
  }

  return result;
}

function objectToNameValues(obj: unknown): NameValuePair[] {
  const result: NameValuePair[] = [];

  if (obj === null || obj === undefined) {
    result.push({ name: "", value: null });
    return result;
  }

  if (typeof obj === "string" || typeof obj === "number" || typeof obj === "boolean") {
    result.push({ name: "", value: obj });
    return result;
  }

  if (Array.isArray(obj)) {
    for (let index = 0; index < obj.length; index += 1) {
      const name = `[${index}]`;
      result.push(...getSubValues(obj[index], name));
    }
    return result;
  }

  if (isRecord(obj)) {
    for (const key of Object.keys(obj)) {
      result.push(...getSubValues(obj[key], key));
    }
  }

  return result;
}

function getSubValues(subObject: unknown, name: string): NameValuePair[] {
  const result: NameValuePair[] = [];
  const tempResult = objectToNameValues(subObject);

  for (const item of tempResult) {
    let itemName = name;

    if (SUB_ARRAY_REGEXP.test(item.name)) {
      itemName += item.name;
    } else if (SUB_OBJECT_REGEXP.test(item.name)) {
      itemName += `.${item.name}`;
    }

    result.push({ name: itemName, value: item.value });
  }

  return result;
}

export function objectToEntries(value: unknown): Entry[] {
  return objectToNameValues(value).map((item) => ({
    key: item.name,
    value: item.value
  }));
}

export function processNameValues(
  nameValues: Iterable<NameValuePair>,
  skipEmpty = true,
  delimiter = "."
): ObjectTree {
  const entries: Entry[] = [];

  for (const pair of nameValues) {
    entries.push({ key: pair.name, value: pair.value });
  }

  return reduceEntries(entries, { skipEmpty, delimiter });
}

export function withSource(entry: EntryInput, source: EntrySource): SourcedEntry {
  const normalized = normalizeEntry(entry);
  const sourced: SourcedEntry = { key: normalized.key, value: normalized.value };
  Object.defineProperty(sourced, "source", {
    configurable: true,
    enumerable: false,
    value: source,
    writable: true
  });
  return sourced;
}

export const CAPABILITY_KEYS: readonly CapabilityKey[] = [
  "fileValues",
  "nullValues",
  "explicitUndefined",
  "emptyCollections",
  "booleanControls",
  "escapedPaths",
  "sparseArrays"
];

const CAPABILITY_REASONS: Record<CapabilityKey, string> = {
  fileValues: "Adapter cannot carry File/Blob values; files stay at the FormData boundary.",
  nullValues: "Adapter cannot represent null values; empty controls surface as empty strings or are skipped.",
  explicitUndefined:
    "Adapter cannot distinguish a missing value from an explicit undefined value.",
  emptyCollections: "Adapter cannot represent an empty collection; no entry is emitted for it.",
  booleanControls: "Adapter has no checkbox/radio boolean control semantics.",
  escapedPaths:
    "Path segments containing the delimiter or bracket characters cannot be escaped.",
  sparseArrays: "Indexed paths are compacted to dense arrays in first-seen order."
};

export function checkCapability(
  capabilities: AdapterCapabilities,
  capability: CapabilityKey
): CapabilityResult {
  if (capabilities[capability]) {
    return { status: "ok", adapter: capabilities.adapter, capability };
  }

  return {
    status: "unsupported",
    adapter: capabilities.adapter,
    capability,
    reason: CAPABILITY_REASONS[capability]
  };
}

export function isCapabilityUnsupported(result: CapabilityResult): boolean {
  return result.status === "unsupported";
}

export const capabilities: AdapterCapabilities = {
  adapter: "@form2js/core",
  direction: "read-write",
  fileValues: true,
  nullValues: true,
  explicitUndefined: true,
  emptyCollections: true,
  booleanControls: false,
  escapedPaths: false,
  sparseArrays: false
};
