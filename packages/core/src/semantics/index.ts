/**
 * Pure semantic layer shared by every form2js adapter.
 *
 * Nothing in this module touches the DOM, FormData, React or jQuery. Adapters
 * translate environment inputs into sourced entries and consume the results.
 */

import * as recordsNs from "./records";
import * as tokensNs from "./tokens";
import * as containersNs from "./containers";
import * as safetyNs from "./safety";
import * as valuesNs from "./values";
import * as mergeNs from "./merge";
import * as flattenNs from "./flatten";
import * as capabilityNs from "./capability";

export const records = recordsNs;
export const tokens = tokensNs;
export const containers = containersNs;
export const safety = safetyNs;
export const values = valuesNs;
export const merge = mergeNs;
export const flatten = flattenNs;
export const capability = capabilityNs;

export {
  createIndexRecord,
  getOwnRecordValue,
  hasOwnRecordValue,
  isRecord,
  setOwnRecordValue
} from "./records";
export {
  findBracketMatches,
  splitPathParts,
  tokenizePath,
  tokenizePathPart
} from "./tokens";
export type { BracketMatch, PathToken, PathTokenKind } from "./tokens";
export {
  ensureNamedArray,
  inspectContainerSlot,
  pushToNamedArray
} from "./containers";
export type { ContainerKind, ContainerState, NamedArrayResolution } from "./containers";
export { assertPathIsSafe, findUnsafePathToken } from "./safety";
export { normalizeEntry, shouldSkipValue } from "./values";
export {
  aggregateEntries,
  applyPathValue,
  createMergeContext,
  getMergeConflicts
} from "./merge";
export type { AggregateResult, MergeConflict, MergeConflictKind } from "./merge";
export { flattenToEntries, flattenToNameValues } from "./flatten";
export {
  classifyEntryValue,
  coerced,
  dropped,
  supported,
  unsupported
} from "./capability";
export type { CapabilityResult, CapabilityStatus } from "./capability";
