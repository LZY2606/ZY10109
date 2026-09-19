// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@form2js/core", async (importOriginal) => {
  const actual = await importOriginal<typeof CoreModule>();
  return {
    ...actual,
    objectToEntries: vi.fn(actual.objectToEntries),
    splitPathParts: vi.fn(actual.splitPathParts)
  };
});

import type * as CoreModule from "@form2js/core";
import * as core from "@form2js/core";
import { objectToForm } from "../src/index";

const objectToEntriesMock = vi.mocked(core.objectToEntries);
const splitPathPartsMock = vi.mocked(core.splitPathParts);

describe("js2form adapter semantics layer usage", () => {
  beforeEach(() => {
    objectToEntriesMock.mockClear();
    splitPathPartsMock.mockClear();
  });

  it("flattens write data through the shared semantics layer", () => {
    document.body.innerHTML = `<form id="f"><input name="person.name" /></form>`;

    objectToForm("f", { person: { name: "Neo" } });

    expect(objectToEntriesMock).toHaveBeenCalledTimes(1);
    expect((document.querySelector("input") as HTMLInputElement).value).toBe("Neo");
  });

  it("tokenizes field names with the shared path splitter", () => {
    document.body.innerHTML = `<form id="f"><input name="items[5].name" /></form>`;

    objectToForm("f", { items: [{ name: "Neo" }] });

    expect(splitPathPartsMock).toHaveBeenCalled();
    expect((document.querySelector("input") as HTMLInputElement).value).toBe("Neo");
  });
});
