import {
  merge as semantics,
  normalizeEntry,
  type Entry,
  type EntryInput,
  type EntrySource,
  type InferSchemaOutput,
  type ObjectTree,
  type ParseOptions,
  type SchemaValidator,
  type ValidationOptions
} from "@form2js/core";

export type KeyValueEntryInput = EntryInput;

export interface FormDataToObjectOptions extends ParseOptions {}

function isFileLike(value: unknown): value is File {
  return (
    typeof File !== "undefined" &&
    value instanceof File
  );
}

function toSourcedEntries(
  entries: Iterable<KeyValueEntryInput>,
  adapterLabel: string
): Entry[] {
  const sourcedEntries: Entry[] = [];

  for (const rawEntry of entries) {
    const entry = normalizeEntry(rawEntry);
    const source: EntrySource = entry.source ?? {
      adapter: adapterLabel,
      kind: isFileLike(entry.value) ? "file" : "field"
    };
    sourcedEntries.push({ key: entry.key, value: entry.value, source });
  }

  return sourcedEntries;
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
  const { result } = semantics.aggregateEntries(toSourcedEntries(entries, "entries"), options);

  if (options.schema) {
    return options.schema.parse(result);
  }

  return result;
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
  const rawEntries =
    formData instanceof FormData ? Array.from(formData.entries()) : Array.from(formData);
  const sourcedEntries = toSourcedEntries(rawEntries, "form-data");

  const { result } = semantics.aggregateEntries(sourcedEntries, options);

  if (options.schema) {
    return options.schema.parse(result);
  }

  return result;
}

export type {
  Entry,
  EntryInput,
  EntrySource,
  InferSchemaOutput,
  ObjectTree,
  ParseOptions,
  SchemaValidator,
  ValidationOptions
} from "@form2js/core";
