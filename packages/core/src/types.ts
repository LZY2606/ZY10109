export type EntryValue = unknown;

export interface EntrySource {
  /** Adapter that produced the entry (e.g. "dom", "form-data"). */
  adapter: string;
  /** Optional provenance detail (control kind, node name, etc.). */
  kind?: string;
}

export interface Entry {
  key: string;
  value: EntryValue;
  /** How the entry was produced. Boundary layers attach this; semantic output preserves it. */
  source?: EntrySource;
}

export interface NameValuePair {
  name: string;
  value: EntryValue;
}

export interface ParseOptions {
  delimiter?: string;
  skipEmpty?: boolean;
  allowUnsafePathSegments?: boolean;
  allowEscapedSegments?: boolean;
}

export interface SchemaValidator<TOutput = unknown> {
  parse(input: unknown): TOutput;
}

export type InferSchemaOutput<TSchema> = TSchema extends SchemaValidator<infer TOutput>
  ? TOutput
  : never;

export interface ValidationOptions<TSchema extends SchemaValidator = SchemaValidator> {
  schema?: TSchema;
}

export interface MergeContext {
  arrays: Record<string, Record<string, unknown>>;
}

export interface MergeOptions {
  delimiter?: string;
  context?: MergeContext;
  allowUnsafePathSegments?: boolean;
  allowEscapedSegments?: boolean;
}

export type ObjectTree = Record<string, unknown>;

export type EntryInput =
  | Entry
  | NameValuePair
  | readonly [string, EntryValue]
  | {
      key: string;
      value: EntryValue;
      source?: EntrySource;
    }
  | {
      name: string;
      value: EntryValue;
    };
