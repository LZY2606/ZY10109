import type { Entry, EntryValue, MergeContext, MergeOptions, ObjectTree } from "../types";
import {
  createIndexRecord,
  getOwnRecordValue,
  isRecord,
  setOwnRecordValue
} from "./records";
import { ensureNamedArray, inspectContainerSlot, pushToNamedArray } from "./containers";
import { splitPathParts, tokenizePathPart, type PathToken } from "./tokens";
import { assertPathIsSafe, findUnsafePathToken } from "./safety";

export type MergeConflictKind =
  | "array-replaces-object"
  | "array-replaces-value"
  | "leaf-replaces-container"
  | "container-replaces-leaf"
  | "empty-value-skipped"
  | "non-object-container";

export interface MergeConflict {
  kind: MergeConflictKind;
  path: string;
  detail?: string;
}

const conflictStores = new WeakMap<MergeContext, MergeConflict[]>();

export function getMergeConflicts(context: MergeContext): MergeConflict[] {
  return conflictStores.get(context) ?? [];
}

function reportConflict(context: MergeContext, conflict: MergeConflict): void {
  const conflicts = conflictStores.get(context);
  if (conflicts) {
    conflicts.push(conflict);
  } else {
    conflictStores.set(context, [conflict]);
  }
}

function nextContainerForToken(nextToken: PathToken): [] | {} {
  return /^[0-9a-z_]+\[?/i.test(nextToken.raw) ? {} : [];
}

function reportArrayReplacement(
  context: MergeContext,
  previousKind: string,
  path: string,
  name: string
): void {
  if (previousKind === "missing") {
    return;
  }

  reportConflict(context, {
    kind: previousKind === "value" || previousKind === "explicit-undefined"
      ? "array-replaces-value"
      : "array-replaces-object",
    path,
    detail: name
  });
}

export function createMergeContext(): MergeContext {
  const context: MergeContext = { arrays: createIndexRecord() as MergeContext["arrays"] };
  conflictStores.set(context, []);
  return context;
}

/**
 * Applies one sourced path/value pair to an object tree. All path and value
 * decisions live here; adapters never implement their own traversal.
 */
export function applyPathValue(
  target: ObjectTree,
  path: string,
  value: EntryValue,
  options: MergeOptions = {}
): ObjectTree {
  const delimiter = options.delimiter ?? ".";
  const context = options.context ?? createMergeContext();
  const allowUnsafePathSegments = options.allowUnsafePathSegments ?? false;
  const nameParts = splitPathParts(path, delimiter, options.allowEscapedSegments ?? false);
  assertPathIsSafe(nameParts, allowUnsafePathSegments);

  if (!allowUnsafePathSegments) {
    // Check the raw path too: legacy splitting merges bracket contents with
    // trailing literals (a[__proto__]b -> "__proto__b"), so segment-level
    // checks alone cannot see the dangerous identifier.
    for (const bracketMatch of path.matchAll(/[[]([^[\]]*)[\]]/g)) {
      if (findUnsafePathToken(`[${bracketMatch[1] ?? ""}]`)) {
        throw new TypeError(
          `Unsafe path segment "${bracketMatch[1]}" is not allowed. ` +
            "Pass allowUnsafePathSegments: true only for trusted input."
        );
      }
    }
  }

  let currentResult: unknown = target;
  let arrayNameFull = "";

  for (let partIndex = 0; partIndex < nameParts.length; partIndex += 1) {
    const namePart = nameParts[partIndex] ?? "";
    const token = tokenizePathPart(namePart);
    const isLast = partIndex === nameParts.length - 1;

    if (token.kind === "push" && isLast) {
      arrayNameFull += token.name;

      const previousKind = token.name === "" && Array.isArray(currentResult)
        ? "array"
        : inspectContainerSlot(currentResult, token.name).kind;
      const { array: targetArray } = ensureNamedArray(currentResult, token.name);
      reportArrayReplacement(context, previousKind, path, token.name);
      targetArray.push(value);
      continue;
    }

    if (token.kind === "push" || token.kind === "slot") {
      const arrayIndex = token.kind === "push" ? "" : token.index ?? "";
      arrayNameFull += `_${token.name}_${arrayIndex}`;

      if (token.name !== "") {
        const previousKind = inspectContainerSlot(currentResult, token.name).kind;
        ensureNamedArray(currentResult, token.name);
        reportArrayReplacement(context, previousKind, path, token.name);
      }

      const existingArrayMap = getOwnRecordValue(context.arrays, arrayNameFull);
      const arrayMap = isRecord(existingArrayMap) ? existingArrayMap : createIndexRecord();
      if (!isRecord(existingArrayMap)) {
        setOwnRecordValue(context.arrays, arrayNameFull, arrayMap);
      }

      if (isLast) {
        const inserted = pushToNamedArray(currentResult, token.name, value);
        setOwnRecordValue(arrayMap, arrayIndex, inserted);
      } else if (getOwnRecordValue(arrayMap, arrayIndex) === undefined) {
        const nextNamePart = nameParts[partIndex + 1] ?? "";
        const nextToken = tokenizePathPart(nextNamePart);
        const nextContainer = nextContainerForToken(nextToken);

        const inserted = pushToNamedArray(currentResult, token.name, nextContainer);
        setOwnRecordValue(arrayMap, arrayIndex, inserted);
      }

      currentResult = getOwnRecordValue(arrayMap, arrayIndex);
      continue;
    }

    arrayNameFull += namePart;

    if (!isRecord(currentResult)) {
      reportConflict(context, {
        kind: "non-object-container",
        path,
        detail: namePart
      });
      throw new TypeError("Expected object-like container while setting nested path");
    }

    if (!isLast) {
      // Legacy rule: an occupied intermediate node is reused as-is, even when
      // it is an array, a scalar or an explicit undefined. Only a genuinely
      // missing own property is created. Reuse surfaces as a non-object
      // container error on the next hop instead of silent replacement.
      if (inspectContainerSlot(currentResult, namePart).kind === "missing") {
        setOwnRecordValue(currentResult, namePart, {});
      }

      currentResult = getOwnRecordValue(currentResult, namePart);
    } else {
      const state = inspectContainerSlot(currentResult, namePart);
      if (state.kind === "object" || state.kind === "array") {
        reportConflict(context, {
          kind: "leaf-replaces-container",
          path,
          detail: namePart
        });
      }
      setOwnRecordValue(currentResult, namePart, value);
    }
  }

  return target;
}

export interface AggregateResult {
  result: ObjectTree;
  context: MergeContext;
  conflicts: MergeConflict[];
  applied: { entry: Entry; path: string }[];
}

/**
 * Shared aggregation loop for every input adapter. Entries carry their raw
 * source information; emptiness and unsafe-segment decisions are made once
 * here instead of per adapter.
 */
export function aggregateEntries(
  entries: Iterable<Entry>,
  options: {
    delimiter?: string;
    skipEmpty?: boolean;
    allowUnsafePathSegments?: boolean;
    allowEscapedSegments?: boolean;
  } = {}
): AggregateResult {
  const delimiter = options.delimiter ?? ".";
  const skipEmpty = options.skipEmpty ?? true;
  const allowUnsafePathSegments = options.allowUnsafePathSegments ?? false;
  const allowEscapedSegments = options.allowEscapedSegments ?? false;
  const context = createMergeContext();
  const result: ObjectTree = {};
  const applied: { entry: Entry; path: string }[] = [];

  for (const entry of entries) {
    if (entry.value === "" || entry.value === null) {
      if (skipEmpty) {
        reportConflict(context, { kind: "empty-value-skipped", path: entry.key });
        continue;
      }
    }

    applyPathValue(result, entry.key, entry.value, {
      delimiter,
      context,
      allowUnsafePathSegments,
      allowEscapedSegments
    });
    applied.push({ entry, path: entry.key });
  }

  return {
    result,
    context,
    conflicts: getMergeConflicts(context),
    applied
  };
}
