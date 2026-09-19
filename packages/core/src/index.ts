import type {
  Entry,
  EntryInput,
  InferSchemaOutput,
  MergeOptions,
  NameValuePair,
  ObjectTree,
  ParseOptions,
  SchemaValidator,
  ValidationOptions
} from "./types";
import { aggregateEntries, applyPathValue, flattenToEntries, normalizeEntry } from "./semantics";

export { createMergeContext } from "./semantics";

export function setPathValue(
  target: ObjectTree,
  path: string,
  value: unknown,
  options: MergeOptions = {}
): ObjectTree {
  return applyPathValue(target, path, value, options);
}

export function entriesToObject(entries: Iterable<EntryInput>, options?: ParseOptions): ObjectTree;
export function entriesToObject<TSchema extends SchemaValidator>(
  entries: Iterable<EntryInput>,
  options: ParseOptions & { schema: TSchema }
): InferSchemaOutput<TSchema>;
export function entriesToObject(
  entries: Iterable<EntryInput>,
  options: ParseOptions & ValidationOptions = {}
): unknown {
  const normalizedEntries: Entry[] = [];

  for (const rawEntry of entries) {
    normalizedEntries.push(normalizeEntry(rawEntry));
  }

  const { result } = aggregateEntries(normalizedEntries, options);

  if (options.schema) {
    return options.schema.parse(result);
  }

  return result;
}

export function objectToEntries(value: unknown): Entry[] {
  return flattenToEntries(value);
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

  return entriesToObject(entries, { skipEmpty, delimiter });
}

// Re-exported so adapters and tests can observe the shared decision layer.
export {
  aggregateEntries,
  applyPathValue,
  assertPathIsSafe,
  classifyEntryValue,
  coerced,
  createIndexRecord,
  dropped,
  ensureNamedArray,
  findBracketMatches,
  findUnsafePathToken,
  flattenToEntries,
  flattenToNameValues,
  getMergeConflicts,
  getOwnRecordValue,
  hasOwnRecordValue,
  inspectContainerSlot,
  isRecord,
  normalizeEntry,
  pushToNamedArray,
  setOwnRecordValue,
  shouldSkipValue,
  splitPathParts,
  supported,
  tokenizePath,
  tokenizePathPart,
  unsupported
} from "./semantics";
export { records, tokens, containers, safety, values, merge, flatten, capability } from "./semantics";
export type {
  BracketMatch,
  CapabilityResult,
  CapabilityStatus,
  ContainerKind,
  ContainerState,
  AggregateResult,
  MergeConflict,
  MergeConflictKind,
  NamedArrayResolution,
  PathToken,
  PathTokenKind
} from "./semantics";

export type {
  Entry,
  EntrySource,
  EntryInput,
  EntryValue,
  InferSchemaOutput,
  MergeContext,
  MergeOptions,
  NameValuePair,
  ObjectTree,
  ParseOptions,
  SchemaValidator,
  ValidationOptions
} from "./types";
