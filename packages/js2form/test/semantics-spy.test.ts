// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { tokens, flatten } from "@form2js/core";
import { flattenDataForForm, mapFieldsByName, objectToForm } from "../src/index";

describe("js2form adapter shares the semantic layer", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("flattens write-back data through semantics.flatten.flattenToEntries", () => {
    const spy = vi.spyOn(flatten, "flattenToEntries");

    const entries = flattenDataForForm({ foo: { bar: ["a"] } });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(entries).toContainEqual({ key: "foo.bar[0]", value: "a" });
  });

  it("normalizes field names through the shared tokens.findBracketMatches decision", () => {
    const spy = vi.spyOn(tokens, "findBracketMatches");

    document.body.innerHTML = `
      <form id="f">
        <input type="checkbox" name="items[5].name" value="a" />
        <input type="checkbox" name="items[1].name" value="b" />
      </form>
    `;

    const fields = mapFieldsByName("f", { shouldClean: false });

    expect(spy).toHaveBeenCalled();
    expect(Object.keys(fields)).toContain("items[0].name");
    expect(Object.keys(fields)).toContain("items[1].name");
  });

  it("populates controls using semantically flattened paths", () => {
    const spy = vi.spyOn(flatten, "flattenToEntries");

    document.body.innerHTML = `
      <form id="f">
        <input name="person.name" />
      </form>
    `;

    objectToForm(document.getElementById("f"), { person: { name: "Neo" } });

    expect(spy).toHaveBeenCalledTimes(1);
    expect((document.querySelector("input[name='person.name']") as HTMLInputElement).value).toBe(
      "Neo"
    );
  });
});
