# Semantic Layer Contract

This document defines the boundary between the **semantic layer** (pure path
and value decisions) and the **adapters** (`@form2js/dom`,
`@form2js/form-data`, `@form2js/jquery`, `@form2js/react`,
`@form2js/js2form`). It is the reference for why a change to path handling must
land in exactly one place.

## Why

Every adapter reads or writes the same nested-path grammar:

- dot notation: `person.name.first`
- append arrays: `person.roles[]`
- indexed arrays with first-seen compaction: `items[5].name`
- rails-style object brackets: `rails[field1][foo]`
- nested indexed brackets: `matrix[0][1][bar]`

Before this layer, tokenization, container selection, emptiness rules and
unsafe-segment rejection were copied between `@form2js/core` and
`@form2js/js2form`, and every other adapter silently inherited whichever copy
its dependency exposed. Fixing one adapter let the others drift.

## Where the boundary is

The semantic layer lives in `@form2js/core` under `src/semantics/` and is
exported both as individual functions and as callable namespaces
(`records`, `tokens`, `containers`, `safety`, `values`, `merge`, `flatten`,
`capability`). It has **zero** runtime dependencies and never references
`Node`, `Document`, `FormData`, `React`, or `jQuery`.

| Module | Owns | Never owns |
| --- | --- | --- |
| `tokens` | Splitting a path into parts and classifying tokens (`prop` / `slot` / `push`), escape handling, bracket scanning | What a token means against a value |
| `containers` | Selecting object slots, distinguishing `missing` from `explicit-undefined`, lazily creating arrays, append ordering | Field types, checkbox state |
| `merge` | Applying one sourced entry to a tree, duplicate-key aggregation across a batch, conflict reporting | DOM/FormData/React/jQuery shapes |
| `flatten` | Object/array → path entries, enumeration order, sparse-array leaf behavior | Writing values into controls |
| `safety` | Dangerous-segment detection (`__proto__`, `prototype`, `constructor`, including bracket contents) | Trust policy UI |
| `values` | Entry normalization and the emptiness rule (`""` / `null` only) | Coercion decisions of a specific environment |
| `capability` | `supported` / `coerced` / `unsupported` / `dropped` results | Native value extraction |
| `records` | Null-prototype own-property storage helpers | Public data shapes |

### Adapter responsibilities (the only code allowed to touch the environment)

- **`@form2js/dom`** walks nodes, resolves disabled/fieldset rules, reads
  checkbox/radio/select state (including multi-select groups), translates
  button/submit controls into omission, and tags each emitted entry with a
  `source: { adapter: "dom", kind }` provenance tag.
- **`@form2js/form-data`** iterates `FormData` (or a generic iterable), tags
  `File` entries as `kind: "file"` and leaves them unstringified.
- **`@form2js/jquery`** keeps the legacy `$.fn.toObject()` shape and
  `first` / `all` / `combine` modes; it performs no path work itself.
- **`@form2js/react`** owns hook lifecycle (submit lock, `isSubmitting`,
  `isError`, `isSuccess`, `reset`); parsing is delegated unchanged.
- **`@form2js/js2form`** walks the form, maps controls to normalized names,
  checks radios/checkboxes, selects options and cleans fields. It consumes
  semantic flatten output but all DOM mutation stays here.

Adapters translate environment input into **entries with source
information** and consume the unified aggregate result. The reverse direction
consumes semantic flatten entries. No adapter implements tokenization,
container creation, unsafe-key rejection or emptiness decisions.

## The entry contract

```ts
interface Entry {
  key: string;              // raw path as authored in the environment
  value: unknown;           // passed through untouched
  source?: {                // attached by boundary layers
    adapter: string;        // "dom" | "form-data" | "js2form" | "entries"
    kind?: string;          // "input:checkbox" | "select-multiple" | "file" | ...
  };
}
```

Values are **never globally stringified**. A `File` stays a `File`, a boolean
stays a boolean where an environment can express one, and a numeric value
stays numeric. Only a specific boundary may stringify, and when it does that
is reported through the capability helpers rather than hidden inside merging.

## Decisions, exactly once

### Path tokens

`tokens.splitPathParts(path, delimiter, allowEscapedSegments)` is the single
tokenizer used by both the read path (merge) and the write path
(`js2form` name normalization). Quirky legacy outputs are preserved on
purpose — for example `a[]b`, `a[1]b` and `a[` all describe an append array
named `a`, while `a]b` is a literal property. Consecutive indexed brackets
such as `m[0][1]` produce nested arrays; consecutive object brackets such as
`a[foo][bar]` produce nested objects; non-numeric bracket contents such as
`a[0x]` stay object keys.

When `allowEscapedSegments` is enabled, `\.`, `\[`, `\]` and `\\` are
protected before splitting, so `person.full\.name` creates one property named
`full.name`. Escaping is opt-in; without the flag every character is treated
literally, exactly as before.

### Object container selection and missing vs explicit undefined

`containers.inspectContainerSlot` returns one of `missing`,
`explicit-undefined`, `array`, `object`, `value`. A genuinely missing own
property is lazily created; an occupied intermediate node is reused (legacy
behavior — a scalar or array at an intermediate position surfaces a
non-object-container error on the next hop instead of being silently
replaced).

### Duplicate-key aggregation

Repeated `[]` markers append. Explicit indices compact in **first-seen
order** (`a[5]` then `a[3]` yields `a[0]`, `a[1]`) and share one synthetic
slot map, so siblings of an indexed row (`items[5].title`,
`items[5].name`) populate the same element. Empty markers between siblings
(`items[][title]`, `items[][description]`) are grouped by suffix.

### Dangerous keys

`safety` rejects `__proto__`, `prototype` and `constructor` by default,
checking dot-separated segments, identifier tokens and **bracket contents**
(including legacy-merged forms like `a[__proto__]b`). The rejection message
and the `allowUnsafePathSegments` escape hatch are unchanged. Storage always
uses null-prototype own-property descriptors, so even trusted access never
mutates `Object.prototype`.

### Empty values, null, File

Only `""` and `null` are skipped when `skipEmpty` is true (the default).
`false`, `0`, `undefined` and `File` objects are retained. With
`skipEmpty: false`, `null` is stored as `null`. A skipped entry is recorded
as an `empty-value-skipped` conflict instead of vanishing invisibly.

### Array/object conflicts

When one entry requires an array where an object or scalar already exists
(or vice versa), the legacy observable result is preserved, but the decision
is recorded on the aggregate result:

- `array-replaces-object` / `array-replaces-value`
- `leaf-replaces-container` / `container-replaces-leaf`
- `non-object-container` (the legacy thrown `TypeError`)
- `empty-value-skipped`

Consume `aggregateEntries(entries, options).conflicts` to observe them; the
returned `result` tree is byte-for-byte the legacy tree.

### Enumeration order and sparse arrays

Flattening follows `Object.keys` for objects and dense index order for
arrays. Sparse array holes keep the legacy null-leaf representation
(`sparse[0]` → `null`), while arrays of objects and nested arrays now emit
round-trippable paths (`items[0].title`, `a[0][0].x`).

## Capability matrix

Same expressible input across all six paths yields an equivalent object (or
equivalent control state). When an environment cannot express an input, the
boundary reports a capability result instead of mangling the value:

| Input | core | form-data | dom | jquery | react | js2form |
| --- | --- | --- | --- | --- | --- | --- |
| dot / rails / indexed paths | object | object | object | object | object | control state |
| escaped segments (`allowEscapedSegments`) | object | object | unsupported (no native field spelling) | unsupported | unsupported | unsupported |
| consecutive brackets | object | object | object | object | object | control state |
| numeric-like key `a.0.b` | object key `"0"` | object key `"0"` | object key `"0"` | object key `"0"` | object key `"0"` | control match |
| repeated checkbox group | `["a","b"]` via `[]` entries | `["a","b"]` | checked group only | checked group only | checked group only | group checked |
| empty collection | `{}` | `{}` | `{}` | `{}` | `{}` on submit | no-op |
| `null` | retained with `skipEmpty:false` | boundary sends `""` | missing control | missing control | missing control | cleared value |
| explicit `undefined` | own property retained | unsupported | missing control | missing control | missing control | cleared value |
| `File` | pass-through | `File` retained (`kind: "file"`) | file selection is a browser concern | file selection is a browser concern | `File` retained | not assignable |
| `__proto__` / `prototype` / `constructor` | rejected unless trusted | rejected | rejected | rejected | rejected | not emitted |

The executable version of this matrix is
`test/integration/semantic-contract-matrix.test.tsx`.

## Spy guarantee

Each package ships a `semantics-spy` test that spies on the semantic
namespaces and proves the adapter routes through them
(`semantics.merge.aggregateEntries`, `semantics.flatten.flattenToEntries`,
`semantics.tokens.findBracketMatches`). If an adapter reintroduces a private
copy of a path or value decision, its spy test fails. Cross-package test
imports resolve to TypeScript sources through the root `vitest.config.ts`
alias so ESM bindings remain spyable; published builds are unaffected.

## Dependency rule

```
core/semantics  (no imports upward)
core            → semantics
form-data       → core
dom             → core
jquery          → dom
react           → form-data
js2form         → core
```

No package may import back into a package that imports it
(verified with `npx madge --circular`).
