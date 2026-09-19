// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as semantics from "@form2js/core";
import { formToObject } from "../src/index";

describe("dom adapter shares the semantic layer", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("routes extracted controls through semantics.merge.aggregateEntries with source provenance", () => {
    const spy = vi.spyOn(semantics.merge, "aggregateEntries");

    document.body.innerHTML = `
      <form id="f">
        <input type="text" name="person.name" value="Neo" />
        <input type="checkbox" name="person.roles[]" value="admin" checked />
        <select name="person.color" multiple>
          <option value="red" selected>red</option>
        </select>
      </form>
    `;

    const result = formToObject(document.getElementById("f"));

    expect(spy).toHaveBeenCalledTimes(1);
    const entries = spy.mock.calls[0]?.[0] ?? [];
    expect(entries).toContainEqual({
      key: "person.name",
      value: "Neo",
      source: { adapter: "dom", kind: "input:text" }
    });
    expect(entries).toContainEqual({
      key: "person.roles[]",
      value: "admin",
      source: { adapter: "dom", kind: "input:checkbox" }
    });
    expect(entries).toContainEqual({
      key: "person.color",
      value: ["red"],
      source: { adapter: "dom", kind: "select-multiple" }
    });
    expect(result).toEqual({
      person: { name: "Neo", roles: ["admin"], color: ["red"] }
    });
  });

  it("does not implement its own emptiness or unsafe-segment decisions", () => {
    const aggregateSpy = vi.spyOn(semantics.merge, "aggregateEntries");

    document.body.innerHTML = `
      <form id="f">
        <input name="__proto__.polluted" value="yes" />
      </form>
    `;

    expect(() => formToObject(document.getElementById("f"))).toThrow(/Unsafe path segment/);
    expect(aggregateSpy).toHaveBeenCalledTimes(1);
  });

  it("keeps boolean control selection at the boundary and passes strings to semantics", () => {
    const spy = vi.spyOn(semantics.merge, "aggregateEntries");

    document.body.innerHTML = `
      <form id="f">
        <input type="checkbox" name="flag" value="true" checked />
        <input type="checkbox" name="off" value="true" />
      </form>
    `;

    formToObject(document.getElementById("f"));

    const entries = spy.mock.calls[0]?.[0] ?? [];
    expect(entries).toEqual([
      { key: "flag", value: "true", source: { adapter: "dom", kind: "input:checkbox" } }
    ]);
  });
});
