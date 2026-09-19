---
"@form2js/core": patch
"@form2js/dom": patch
"@form2js/form-data": patch
"@form2js/jquery": patch
"@form2js/react": patch
"@form2js/js2form": patch
---

Introduced a shared pure semantic layer in `@form2js/core` for path tokens,
container selection, duplicate-key aggregation, dangerous-key rejection,
missing vs explicit `undefined`, and array/object conflicts. All adapters now
translate environment input into sourced entries and consume the same
aggregate result. Added opt-in escaped path segments
(`allowEscapedSegments`), conflict reporting on `aggregateEntries`,
`File`/provenance tagging, and fixed object flattening for nested arrays and
numeric-like keys. Public entry points, package names, standalone builds,
and emitted output for existing inputs are unchanged.
