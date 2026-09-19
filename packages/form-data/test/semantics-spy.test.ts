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
import { formDataToObject } from "../src/index";

const reduceEntriesMock = vi.mocked(core.reduceEntries);

describe("form-data adapter semantics layer usage", () => {
  beforeEach(() => {
    reduceEntriesMock.mockClear();
  });

  it("reduces FormData through the shared semantics layer", () => {
    const formData = new FormData();
    formData.append("user.name", "Neo");

    const result = formDataToObject(formData);

    expect(result).toEqual({ user: { name: "Neo" } });
    expect(reduceEntriesMock).toHaveBeenCalledTimes(1);
  });

  it("hands File values to the semantics layer without stringifying them", () => {
    const file = new File(["payload"], "report.txt", { type: "text/plain" });
    const formData = new FormData();
    formData.append("doc", file);

    const result = formDataToObject(formData);

    expect((result as { doc: File }).doc).toBeInstanceOf(File);

    const call = reduceEntriesMock.mock.calls[0];
    const entries = Array.from(call?.[0] ?? []) as core.SourcedEntry[];
    expect(entries[0]?.value).toBe(file);
    expect(entries[0]?.source).toEqual({ adapter: "@form2js/form-data", control: "file" });
  });
});
