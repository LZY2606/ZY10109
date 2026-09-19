import { describe, expect, it, vi } from "vitest";
import * as coreExports from "../src/index";

describe("core public entry delegates to the semantic layer", () => {
  it("entriesToObject calls semantics aggregateEntries", () => {
    const spy = vi.spyOn(coreExports.merge, "aggregateEntries");

    coreExports.entriesToObject([["a.b", "1"]]);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[0]).toEqual([{ key: "a.b", value: "1" }]);
  });

  it("objectToEntries calls semantics flattenToEntries", () => {
    const spy = vi.spyOn(coreExports.flatten, "flattenToEntries");

    coreExports.objectToEntries({ a: 1 });

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("setPathValue calls semantics applyPathValue", () => {
    const spy = vi.spyOn(coreExports.merge, "applyPathValue");

    coreExports.setPathValue({}, "a.b", "1");

    expect(spy).toHaveBeenCalledTimes(1);
  });
});
