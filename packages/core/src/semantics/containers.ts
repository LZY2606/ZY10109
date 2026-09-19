import {
  createIndexRecord,
  getOwnRecordValue,
  isRecord,
  setOwnRecordValue
} from "./records";

export type ContainerKind = "missing" | "array" | "object" | "value" | "explicit-undefined";

export interface ContainerState {
  kind: ContainerKind;
  value: unknown;
}

/**
 * Describes what currently occupies a container slot without conflating a
 * missing property with an explicitly stored `undefined` value.
 */
export function inspectContainerSlot(container: unknown, name: string): ContainerState {
  if (name === "" && Array.isArray(container)) {
    return { kind: "array", value: container };
  }

  if (!isRecord(container)) {
    return { kind: "value", value: container };
  }

  if (!Object.prototype.hasOwnProperty.call(container, name)) {
    return { kind: "missing", value: undefined };
  }

  const existingValue = getOwnRecordValue(container, name);

  if (Array.isArray(existingValue)) {
    return { kind: "array", value: existingValue };
  }

  if (existingValue === undefined) {
    return { kind: "explicit-undefined", value: undefined };
  }

  if (isRecord(existingValue)) {
    return { kind: "object", value: existingValue };
  }

  return { kind: "value", value: existingValue };
}

export interface NamedArrayResolution {
  array: unknown[];
  created: boolean;
  replaced: boolean;
}

/**
 * Selects (and lazily creates) the array for a named slot. A pre-existing
 * array is reused; any other occupied slot is replaced, mirroring the legacy
 * append semantics. The `replaced` flag surfaces the array/object conflict
 * decision instead of hiding it inside the mutation.
 */
export function ensureNamedArray(container: unknown, arrayName: string): NamedArrayResolution {
  if (arrayName === "" && Array.isArray(container)) {
    return { array: container, created: false, replaced: false };
  }

  if (!isRecord(container)) {
    throw new TypeError("Expected object-like container when creating array path");
  }

  const state = inspectContainerSlot(container, arrayName);

  if (state.kind === "array") {
    return { array: state.value as unknown[], created: false, replaced: false };
  }

  const newArray: unknown[] = [];
  setOwnRecordValue(container, arrayName, newArray);

  return {
    array: newArray,
    created: true,
    replaced: state.kind !== "missing"
  };
}

export function pushToNamedArray(container: unknown, arrayName: string, value: unknown): unknown {
  const { array } = ensureNamedArray(container, arrayName);
  array.push(value);
  return array[array.length - 1];
}

export function createSlotMap(): Record<string, unknown> {
  return createIndexRecord();
}
