import { describe, expect, it } from "vitest";
import {
  assertSafePath,
  capabilities,
  CAPABILITY_KEYS,
  checkCapability,
  classifyPathPart,
  createMergeContext,
  hasOwn,
  isCapabilityUnsupported,
  isSafePath,
  mergeRepeatedValue,
  MISSING,
  readOwn,
  reduceEntries,
  selectNestedContainer,
  setOwn,
  setPathValue,
  splitPathParts,
  tokenizePath,
  withSource
} from "../src/index";

describe("splitPathParts", () => {
  it("splits dot-delimited object paths", () => {
    expect(splitPathParts("person.name.first")).toEqual(["person", "name", "first"]);
  });

  it("keeps indexed segments attached to their name", () => {
    expect(splitPathParts("items[8].name")).toEqual(["items[8]", "name"]);
  });

  it("splits consecutive bracket groups into separate parts", () => {
    expect(splitPathParts("foo[0][1][bar]")).toEqual(["foo[0]", "[1]", "bar"]);
  });

  it("splits rails-style object brackets from their base", () => {
    expect(splitPathParts("rails[field1][foo]")).toEqual(["rails", "field1", "foo"]);
  });

  it("honors custom delimiters", () => {
    expect(splitPathParts("a:b:c", ":")).toEqual(["a", "b", "c"]);
  });
});

describe("tokenizePath", () => {
  it("classifies plain keys, indexes and pushes", () => {
    expect(tokenizePath("person.friends[3].name")).toEqual([
      { kind: "key", name: "person", raw: "person" },
      { kind: "index", name: "friends", index: "3", raw: "friends[3]" },
      { kind: "key", name: "name", raw: "name" }
    ]);
  });

  it("classifies a trailing empty bracket as a push token", () => {
    expect(tokenizePath("person.favFood[]")).toEqual([
      { kind: "key", name: "person", raw: "person" },
      { kind: "push", name: "favFood", raw: "favFood[]" }
    ]);
  });

  it("treats non-terminal empty brackets as indexed tokens", () => {
    const tokens = tokenizePath("foo[].bar");
    expect(tokens[0]).toEqual({ kind: "index", name: "foo", index: "", raw: "foo[]" });
  });
});

describe("classifyPathPart", () => {
  it("only treats [] as a push when it is the last part", () => {
    expect(classifyPathPart("a[]", true).kind).toBe("push");
    expect(classifyPathPart("a[]", false).kind).toBe("index");
  });
});

describe("selectNestedContainer", () => {
  it("selects objects for named segments and arrays for root indexes", () => {
    expect(selectNestedContainer("name")).toEqual({});
    expect(selectNestedContainer("[0]")).toEqual([]);
  });
});

describe("missing vs explicit undefined", () => {
  it("distinguishes absent keys from keys holding undefined", () => {
    const record: Record<string, unknown> = {};
    setOwn(record, "present", undefined);

    expect(readOwn(record, "absent")).toBe(MISSING);
    expect(readOwn(record, "present")).toBeUndefined();
    expect(hasOwn(record, "present")).toBe(true);
    expect(hasOwn(record, "absent")).toBe(false);
  });

  it("keeps explicit undefined as an own property in reduced objects", () => {
    const result = reduceEntries([{ key: "a", value: undefined }], { skipEmpty: false });

    expect(Object.prototype.hasOwnProperty.call(result, "a")).toBe(true);
    expect(result.a).toBeUndefined();
  });

  it("does not treat inherited properties as own values", () => {
    const record = Object.create({ inherited: "nope" }) as Record<string, unknown>;
    expect(readOwn(record, "inherited")).toBe(MISSING);
  });
});

describe("duplicate key aggregation", () => {
  it("applies last-write-wins for repeated plain keys", () => {
    const result = reduceEntries(
      [
        { key: "a", value: "first" },
        { key: "a", value: "second" }
      ],
      { skipEmpty: false }
    );

    expect(result).toEqual({ a: "second" });
  });

  it("appends repeated push keys into one array", () => {
    const result = reduceEntries([
      { key: "a[]", value: "first" },
      { key: "a[]", value: "second" }
    ]);

    expect(result).toEqual({ a: ["first", "second"] });
  });

  it("coalesces repeated indexes instead of duplicating containers", () => {
    const result = reduceEntries([
      { key: "a[0].x", value: "1" },
      { key: "a[0].y", value: "2" }
    ]);

    expect(result).toEqual({ a: [{ x: "1", y: "2" }] });
  });

  it("merges repeated values with single, append and replace policies", () => {
    expect(mergeRepeatedValue(undefined, "a")).toBe("a");
    expect(mergeRepeatedValue("a", "b")).toBe("b");
    expect(mergeRepeatedValue(["a"], "b")).toEqual(["a", "b"]);
    expect(mergeRepeatedValue("a", ["b", "c"])).toEqual(["a", "b", "c"]);
    expect(mergeRepeatedValue(["a"], ["b", "c"])).toEqual(["a", "b", "c"]);
  });
});

describe("unsafe path segments", () => {
  it("rejects __proto__, prototype and constructor segments", () => {
    for (const segment of ["__proto__", "prototype", "constructor"]) {
      expect(() => { assertSafePath([segment], false); }).toThrow(/Unsafe path segment/);
      expect(isSafePath(`a.${segment}.b`)).toBe(false);
    }
  });

  it("allows the same segments when explicitly trusted", () => {
    expect(() => { assertSafePath(["__proto__"], true); }).not.toThrow();
  });

  it("writes trusted __proto__ keys as own properties without pollution", () => {
    const target = {} as Record<string, unknown>;
    setOwn(target, "__proto__", { polluted: "yes" });

    expect(Object.getPrototypeOf(target)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe("array/object conflicts", () => {
  it("lets a later push replace a scalar with an array container", () => {
    const target: Record<string, unknown> = {};
    const context = createMergeContext();

    setPathValue(target, "a", "scalar", { context });
    setPathValue(target, "a[]", "item", { context });

    expect(target).toEqual({ a: ["item"] });
  });

  it("throws when descending into a scalar leaf", () => {
    const target: Record<string, unknown> = {};
    const context = createMergeContext();

    setPathValue(target, "a", "scalar", { context });

    expect(() => setPathValue(target, "a.b", "x", { context })).toThrow(
      /Expected object-like container/
    );
  });
});

describe("sourced entries", () => {
  it("attaches non-enumerable source metadata", () => {
    const entry = withSource({ key: "a", value: "v" }, { adapter: "test", control: "text" });

    expect(entry.source).toEqual({ adapter: "test", control: "text" });
    expect(Object.keys(entry)).toEqual(["key", "value"]);
    expect(entry).toEqual({ key: "a", value: "v" });
  });
});

describe("capabilities", () => {
  it("declares every capability key on the core descriptor", () => {
    for (const key of CAPABILITY_KEYS) {
      expect(typeof capabilities[key]).toBe("boolean");
    }
  });

  it("returns ok results for supported capabilities", () => {
    expect(checkCapability(capabilities, "nullValues")).toEqual({
      status: "ok",
      adapter: "@form2js/core",
      capability: "nullValues"
    });
  });

  it("returns explicit unsupported results for missing capabilities", () => {
    const result = checkCapability(capabilities, "escapedPaths");

    expect(result.status).toBe("unsupported");
    expect(isCapabilityUnsupported(result)).toBe(true);
    if (result.status === "unsupported") {
      expect(result.reason).toContain("escape");
    }
  });
});
