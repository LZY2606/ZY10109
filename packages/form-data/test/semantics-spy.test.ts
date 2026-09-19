// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as semantics from "@form2js/core";
import { entriesToObject, formDataToObject } from "../src/index";

describe("form-data adapter shares the semantic layer", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("routes FormData through semantics.merge.aggregateEntries", () => {
    const spy = vi.spyOn(semantics.merge, "aggregateEntries");

    const formData = new FormData();
    formData.append("person.name", "Neo");
    formData.append("person.roles[]", "admin");

    const result = formDataToObject(formData);

    expect(spy).toHaveBeenCalledTimes(1);
    const passedEntries = spy.mock.calls[0]?.[0];
    expect(passedEntries).toEqual([
      { key: "person.name", value: "Neo", source: { adapter: "form-data", kind: "field" } },
      { key: "person.roles[]", value: "admin", source: { adapter: "form-data", kind: "field" } }
    ]);
    expect(result).toEqual({ person: { name: "Neo", roles: ["admin"] } });
  });

  it("tags File values with file provenance and keeps them unstringified", () => {
    const spy = vi.spyOn(semantics.merge, "aggregateEntries");
    const file = new File(["bits"], "avatar.png", { type: "image/png" });

    const formData = new FormData();
    formData.append("avatar", file);

    const result = formDataToObject(formData) as { avatar: File };

    expect(spy.mock.calls[0]?.[0]).toEqual([
      { key: "avatar", value: file, source: { adapter: "form-data", kind: "file" } }
    ]);
    expect(result.avatar).toBe(file);
    expect(result.avatar.name).toBe("avatar.png");
  });

  it("routes generic entries through the same semantic decision layer", () => {
    const spy = vi.spyOn(semantics.merge, "aggregateEntries");

    entriesToObject([["a.b", "1"]]);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[0]).toEqual([
      { key: "a.b", value: "1", source: { adapter: "entries", kind: "field" } }
    ]);
  });

  it("reports unsafe segments from the shared safety decision instead of adapter logic", () => {
    vi.spyOn(semantics.merge, "aggregateEntries");

    expect(() => formDataToObject([["__proto__.x", "1"]], { skipEmpty: false })).toThrow(
      /Unsafe path segment/
    );
  });
});
