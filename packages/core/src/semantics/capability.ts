import type { EntryValue } from "../types";

export type CapabilityStatus = "supported" | "coerced" | "unsupported" | "dropped";

export interface CapabilityResult<TValue = unknown> {
  status: CapabilityStatus;
  value?: TValue;
  reason?: string;
}

export function supported<TValue>(value: TValue): CapabilityResult<TValue> {
  return { status: "supported", value };
}

export function coerced<TValue>(value: TValue, reason: string): CapabilityResult<TValue> {
  return { status: "coerced", value, reason };
}

export function unsupported(reason: string): CapabilityResult {
  return { status: "unsupported", reason };
}

export function dropped(reason: string): CapabilityResult {
  return { status: "dropped", reason };
}

/**
 * Boundary layers use this to decide whether a native value can cross into
 * the semantic entry stream. The semantic layer itself never stringifies;
 * adapters that have to (DOM text controls) report a "coerced" result.
 */
export function classifyEntryValue(value: EntryValue): CapabilityResult {
  if (value === undefined) {
    return unsupported("explicit undefined cannot be represented by this environment");
  }

  return supported(value);
}
