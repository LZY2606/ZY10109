export type EntryValue = unknown;

export interface Entry {
  key: string;
  value: EntryValue;
}

export interface NameValuePair {
  name: string;
  value: EntryValue;
}

export interface ParseOptions {
  delimiter?: string;
  skipEmpty?: boolean;
  allowUnsafePathSegments?: boolean;
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
}

export type ObjectTree = Record<string, unknown>;

export interface EntrySource {
  adapter: string;
  control?: string;
}

export interface SourcedEntry extends Entry {
  source?: EntrySource;
}

export interface BracketMatch {
  content: string;
  index: number;
  text: string;
}

export type PathToken =
  | { kind: "key"; name: string; raw: string }
  | { kind: "push"; name: string; raw: string }
  | { kind: "index"; name: string; index: string; raw: string };

export type AdapterDirection = "read" | "write" | "read-write";

export type CapabilityKey =
  | "fileValues"
  | "nullValues"
  | "explicitUndefined"
  | "emptyCollections"
  | "booleanControls"
  | "escapedPaths"
  | "sparseArrays";

export interface AdapterCapabilities {
  adapter: string;
  direction: AdapterDirection;
  fileValues: boolean;
  nullValues: boolean;
  explicitUndefined: boolean;
  emptyCollections: boolean;
  booleanControls: boolean;
  escapedPaths: boolean;
  sparseArrays: boolean;
}

export type CapabilityResult =
  | { status: "ok"; adapter: string; capability: CapabilityKey }
  | { status: "unsupported"; adapter: string; capability: CapabilityKey; reason: string };

export type EntryInput =
  | Entry
  | NameValuePair
  | readonly [string, EntryValue]
  | {
      key: string;
      value: EntryValue;
    }
  | {
      name: string;
      value: EntryValue;
    };
