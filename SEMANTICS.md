# Semantics Layer and Adapter Boundaries

This document describes the shared semantics layer in `@form2js/core` and the
responsibilities that remain in each adapter package. It is the contract that
keeps `core`, `dom`, `form-data`, `jquery`, `react`, and `js2form` from
drifting apart when path or value behavior changes.

## Layering

```
┌──────────────────────────────────────────────────────────────┐
│ adapters (boundary layers)                                   │
│  dom        DOM control groups, disabled rules, nodeCallback │
│  form-data  FormData iteration, File values                  │
│  jquery     $.fn.toObject plugin shape (delegates to dom)    │
│  react      hook lifecycle, submit state (uses form-data)    │
│  js2form    object → control write-back, name normalization  │
└──────────────┬───────────────────────────────────────────────┘
               │ sourced entries in, unified objects out
┌──────────────▼───────────────────────────────────────────────┐
│ @form2js/core semantics layer (pure functions, no env deps)  │
│  path tokens · container selection · duplicate aggregation   │
│  unsafe segment rejection · missing vs explicit undefined    │
│  array/object conflict policy · capability results           │
└──────────────────────────────────────────────────────────────┘
```

Adapters translate environment input into entries tagged with source
information (`SourcedEntry`, carrying a non-enumerable `source` with the
adapter name and control kind) and then call the semantics layer
(`reduceEntries`, `objectToEntries`, `splitPathParts`, …). They never
re-implement path or merge decisions locally.

Dependency direction is strictly one-way: `core` depends on nothing,
`dom`/`form-data` depend on `core`, `jquery` depends on `dom`, `react`
depends on `form-data`, and `js2form` depends on `core`. No cycles.

## What the semantics layer owns

All of these live in `packages/core/src/semantics.ts` and are re-exported
from `@form2js/core`:

- **Path tokens** — `splitPathParts` turns a delimited path into parts
  (`items[8].name` → `["items[8]", "name"]`, `foo[0][1][bar]` →
  `["foo[0]", "[1]", "bar"]`); `classifyPathPart`/`tokenizePath` classify
  each part as `key`, `index`, or trailing `push` (`[]`).
- **Object container selection** — `selectNestedContainer` decides whether a
  descending step creates an object or an array; `ensureArrayContainer`
  creates or reuses array containers.
- **Duplicate key aggregation** — plain keys are last-write-wins, `name[]`
  appends into one array, and `name[i]` coalesces repeated indexes through
  the merge context so indexed rows compact in first-seen order.
  `mergeRepeatedValue` is the same single/append/replace policy used by the
  js2form field map.
- **Dangerous key rejection** — `assertSafePath`/`isSafePath` reject
  `__proto__`, `prototype`, and `constructor` segments unless
  `allowUnsafePathSegments: true` is passed for trusted input. Trusted
  segments are always written as own properties via `defineProperty`
  (`setOwn`), never through the prototype chain.
- **Missing vs explicit undefined** — `MISSING`, `hasOwn`, and `readOwn`
  distinguish "key absent" from "key present with value `undefined`".
  Explicit `undefined` leaf values are preserved as own properties in the
  result; container reuse decisions are presence-based, so descending into
  an explicit `undefined` leaf raises the same conflict error as descending
  into a scalar.
- **Array/object conflicts** — a later `[]` push replaces a previous scalar
  or object with an array container; descending into a scalar leaf throws
  `TypeError`; named keys on arrays remain own properties.
- **Capability results** — `checkCapability` turns an adapter's
  `capabilities` descriptor into `{ status: "ok" }` or an explicit
  `{ status: "unsupported", adapter, capability, reason }` when an input is
  not expressible on that path.

## What stays at the boundary

- **dom** — control-group value selection (checked checkbox/radio, selected
  options, disabled fieldset rules, `nodeCallback`, `SKIP_NODE`). Values
  stay strings; nothing is coerced.
- **form-data** — `FormData` iteration and `File` values. Files pass through
  the semantics layer by reference and are never stringified.
- **jquery** — the `$.fn.toObject` plugin shape (`first`/`all`/`combine`
  modes); all parsing is delegated to `@form2js/dom`.
- **react** — hook lifecycle, submit state machine, and schema wiring; all
  parsing is delegated to `@form2js/form-data`.
- **js2form** — object-to-form write-back: field discovery, first-seen index
  renumbering of field names, and control state assignment. Path splitting
  and dangerous-key-safe field maps come from the semantics layer.

## Invariants

- Values are never blanket-stringified; only the DOM boundary produces
  strings because that is what controls hold.
- Property enumeration order is first-seen insertion order.
- Indexed paths compact to dense arrays in first-seen order; sparse array
  holes are not preserved in either direction.
- `SourcedEntry.source` is non-enumerable, so tagging never changes
  `toEqual` comparisons, enumeration order, or existing output shapes.

## Capability matrix

| Capability | core | dom | form-data | jquery | react | js2form |
| --- | --- | --- | --- | --- | --- | --- |
| `fileValues` (File/Blob pass-through) | ✅ | — | ✅ | — | ✅ | — |
| `nullValues` | ✅ | — | — | — | — | — |
| `explicitUndefined` | ✅ | — | — | — | — | — |
| `emptyCollections` | ✅ | ✅ | — | ✅ | — | — |
| `booleanControls` (checkbox/radio) | — | ✅ | — | ✅ | — | ✅ |
| `escapedPaths` (delimiter/bracket in keys) | — | — | — | — | — | — |
| `sparseArrays` | — | — | — | — | — | — |

`core` is `read-write`; `dom`, `form-data`, `jquery`, `react` are `read`;
`js2form` is `write`.

Each package exports its descriptor as `capabilities`. Use
`checkCapability(capabilities, key)` to get an explicit capability result
instead of probing behavior.

## Contract matrix

`test/integration/contract-matrix.test.ts` exercises one expressible input
across all six paths and asserts equivalent objects (read paths) or
equivalent control states (js2form). It covers escaped paths, consecutive
brackets, numeric-like keys, repeated checkboxes, empty collections, `null`,
explicit `undefined`, `File`, and `__proto__` segments, and asserts the
explicit capability result wherever a path cannot express the input.

Per-package spy tests (`packages/*/test/semantics-spy.test.ts`) prove that
every adapter routes through the shared semantics layer instead of a local
copy.
