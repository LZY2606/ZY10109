import { describe, expect, it } from "vitest";
import { objectToEntries, entriesToObject } from "../src/index";

describe("numeric-like keys roundtrip", () => {
  it("keeps object properties whose name starts with a digit out of array syntax", () => {
    const data = { a: { "0": { b: "V" } } };
    const flat = objectToEntries(data);
    expect(flat).toEqual([{ key: "a.0.b", value: "V" }]);
  });

  it("still emits bracket syntax for real array indices", () => {
    const flat = objectToEntries({ items: ["x", "y"] });
    expect(flat).toEqual([
      { key: "items[0]", value: "x" },
      { key: "items[1]", value: "y" }
    ]);
  });

  it("round-trips delimiter numeric keys through entriesToObject", () => {
    const roundTrip = entriesToObject(objectToEntries({ a: { "0": { b: "V" } } }), {
      skipEmpty: false
    });
    expect(roundTrip).toEqual({ a: { "0": { b: "V" } } });
  });
});
