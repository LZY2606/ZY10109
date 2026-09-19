import { isRecord } from "./records";
import type { Entry, NameValuePair } from "../types";

const SUB_ARRAY_REGEXP = /^\[\d+\]/;
const SUB_OBJECT_REGEXP = /^[a-zA-Z_][a-zA-Z_0-9]*/;

/**
 * Pure object-to-path flattening. Values pass through untouched: strings are
 * not stringified and null/undefined leaves keep their legacy representation.
 * Enumeration follows Object.keys order for objects and dense index order for
 * arrays (sparse holes keep the legacy null-leaf behavior).
 */
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
    } else if (item.name === "") {
      // Scalar/empty leaf under the current name.
    } else if (item.name.startsWith("[")) {
      // Bracket segment that is not an array index: legacy behavior drops the
      // content rather than stringifying it.
    } else if (SUB_OBJECT_REGEXP.test(item.name)) {
      // Original grammar: identifiers join with the delimiter regardless of
      // whether the prefix ends in a bracket ([0].title, items.title).
      itemName += `.${item.name}`;
    } else {
      // Non-identifier property names (e.g. "0") are joined with the delimiter
      // at an object root ("a" + ".0"); the legacy loose regex would otherwise
      // swallow the numeric key as an array marker.
      itemName += `.${item.name}`;
    }

    result.push({ name: itemName, value: item.value });
  }

  return result;
}

export function flattenToNameValues(value: unknown): NameValuePair[] {
  return objectToNameValues(value);
}

export function flattenToEntries(value: unknown, source?: Entry["source"]): Entry[] {
  return objectToNameValues(value).map((item) => ({
    key: item.name,
    value: item.value,
    ...(source ? { source } : {})
  }));
}
