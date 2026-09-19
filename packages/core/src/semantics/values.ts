import type { Entry, EntryInput, EntryValue } from "../types";

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

/**
 * Legacy emptiness rule: only "" and null are dropped. Every other value,
 * including `false`, `0`, `undefined` and File objects, is retained.
 */
export function shouldSkipValue(value: EntryValue, skipEmpty: boolean): boolean {
  return skipEmpty && (value === "" || value === null);
}
