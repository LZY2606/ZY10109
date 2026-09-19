// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@form2js/core", async (importOriginal) => {
  const actual = await importOriginal<typeof CoreModule>();
  return {
    ...actual,
    reduceEntries: vi.fn(actual.reduceEntries)
  };
});

import type * as CoreModule from "@form2js/core";
import * as core from "@form2js/core";
import { formToObject } from "../src/index";

const reduceEntriesMock = vi.mocked(core.reduceEntries);

describe("dom adapter semantics layer usage", () => {
  beforeEach(() => {
    reduceEntriesMock.mockClear();
  });

  it("reduces extracted form values through the shared semantics layer", () => {
    document.body.innerHTML = `
      <form id="f">
        <input name="person.name" value="Neo" />
        <input type="checkbox" name="person.roles[]" value="admin" checked />
      </form>
    `;

    const result = formToObject("f");

    expect(result).toEqual({ person: { name: "Neo", roles: ["admin"] } });
    expect(reduceEntriesMock).toHaveBeenCalledTimes(1);
  });

  it("passes sourced entries into the semantics layer", () => {
    document.body.innerHTML = `<form id="f"><input name="a" value="1" /></form>`;

    formToObject("f");

    const call = reduceEntriesMock.mock.calls[0];
    expect(call).toBeDefined();
    const entries = Array.from(call?.[0] ?? []) as core.SourcedEntry[];
    expect(entries).toHaveLength(1);
    expect(entries[0]?.source).toEqual({ adapter: "@form2js/dom", control: "text" });
  });
});
