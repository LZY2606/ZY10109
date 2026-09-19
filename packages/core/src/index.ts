import { reduceEntries } from "./semantics";
import type {
  EntryInput,
  InferSchemaOutput,
  ObjectTree,
  ParseOptions,
  SchemaValidator,
  ValidationOptions
} from "./types";

export function entriesToObject(entries: Iterable<EntryInput>, options?: ParseOptions): ObjectTree;
export function entriesToObject<TSchema extends SchemaValidator>(
  entries: Iterable<EntryInput>,
  options: ParseOptions & { schema: TSchema }
): InferSchemaOutput<TSchema>;
export function entriesToObject(
  entries: Iterable<EntryInput>,
  options: ParseOptions & ValidationOptions = {}
): unknown {
  return reduceEntries(entries, options);
}

export {
  assertSafePath,
  capabilities,
  CAPABILITY_KEYS,
  checkCapability,
  classifyPathPart,
  createIndexRecord,
  createMergeContext,
  ensureArrayContainer,
  findBracketMatches,
  findUnsafePathSegment,
  hasOwn,
  isCapabilityUnsupported,
  isRecord,
  isSafePath,
  mergeRepeatedValue,
  MISSING,
  normalizeEntry,
  objectToEntries,
  processNameValues,
  pushToArrayContainer,
  readOwn,
  reduceEntries,
  selectNestedContainer,
  setOwn,
  setPathValue,
  shouldSkipEntryValue,
  splitPathParts,
  tokenizePath,
  UNSAFE_PATH_SEGMENTS,
  withSource
} from "./semantics";

export type {
  AdapterCapabilities,
  AdapterDirection,
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
