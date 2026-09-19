import {
  entriesToObject as coreEntriesToObject,
  reduceEntries,
  withSource,
  type AdapterCapabilities,
  type EntryInput,
  type InferSchemaOutput,
  type ObjectTree,
  type ParseOptions,
  type SchemaValidator,
  type SourcedEntry,
  type ValidationOptions
} from "@form2js/core";

const FORM_DATA_ADAPTER = "@form2js/form-data";

export const capabilities: AdapterCapabilities = {
  adapter: FORM_DATA_ADAPTER,
  direction: "read",
  fileValues: true,
  nullValues: false,
  explicitUndefined: false,
  emptyCollections: false,
  booleanControls: false,
  escapedPaths: false,
  sparseArrays: false
};

export type KeyValueEntryInput = EntryInput;

export interface FormDataToObjectOptions extends ParseOptions {}

function isFileValue(value: unknown): value is File {
  return typeof File !== "undefined" && value instanceof File;
}

function toSourcedEntries(
  entries: Iterable<readonly [string, FormDataEntryValue]>
): SourcedEntry[] {
  const sourced: SourcedEntry[] = [];

  for (const [key, value] of entries) {
    sourced.push(
      withSource(
        { key, value },
        { adapter: FORM_DATA_ADAPTER, control: isFileValue(value) ? "file" : "text" }
      )
    );
  }

  return sourced;
}

export function entriesToObject(entries: Iterable<KeyValueEntryInput>, options?: ParseOptions): ObjectTree;
export function entriesToObject<TSchema extends SchemaValidator>(
  entries: Iterable<KeyValueEntryInput>,
  options: ParseOptions & { schema: TSchema }
): InferSchemaOutput<TSchema>;
export function entriesToObject(
  entries: Iterable<KeyValueEntryInput>,
  options: ParseOptions & ValidationOptions = {}
): unknown {
  return coreEntriesToObject(entries, options);
}

export function formDataToObject(
  formData: FormData | Iterable<readonly [string, FormDataEntryValue]>,
  options?: FormDataToObjectOptions
): ObjectTree;
export function formDataToObject<TSchema extends SchemaValidator>(
  formData: FormData | Iterable<readonly [string, FormDataEntryValue]>,
  options: FormDataToObjectOptions & { schema: TSchema }
): InferSchemaOutput<TSchema>;
export function formDataToObject(
  formData: FormData | Iterable<readonly [string, FormDataEntryValue]>,
  options: FormDataToObjectOptions & ValidationOptions = {}
): unknown {
  const entries =
    formData instanceof FormData ? formData.entries() : formData;

  return reduceEntries(toSourcedEntries(entries), options);
}

export type {
  AdapterCapabilities,
  CapabilityKey,
  CapabilityResult,
  EntryInput,
  EntrySource,
  InferSchemaOutput,
  ObjectTree,
  ParseOptions,
  SchemaValidator,
  SourcedEntry,
  ValidationOptions
} from "@form2js/core";
