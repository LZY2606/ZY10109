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
import { installToObjectPlugin } from "../src/index";

const reduceEntriesMock = vi.mocked(core.reduceEntries);

type StubCollection = {
  get(index: number): Element | undefined;
  each(callback: (this: Element, index: number, element: Element) => void): StubCollection;
  toObject?: (options?: Record<string, unknown>) => unknown;
};

function createStubJQuery() {
  const fn: Record<string, unknown> = {};
  const $ = ((input: Element | Element[]) => {
    const elements = Array.isArray(input) ? input : [input];
    const collection: StubCollection = {
      get(index: number) {
        return elements[index];
      },
      each(callback) {
        for (let index = 0; index < elements.length; index += 1) {
          const element = elements[index];
          if (element) {
            callback.call(element, index, element);
          }
        }
        return collection;
      }
    };
    Object.setPrototypeOf(collection, fn);
    return collection;
  }) as ((input: Element | Element[]) => StubCollection) & { fn: Record<string, unknown> };

  $.fn = fn;
  return $;
}

describe("jquery adapter semantics layer usage", () => {
  beforeEach(() => {
    reduceEntriesMock.mockClear();
  });

  it("reaches the shared semantics layer through the dom adapter", () => {
    document.body.innerHTML = `<form id="f"><input name="person.name" value="Neo" /></form>`;
    const $ = createStubJQuery();
    installToObjectPlugin($);

    const form = document.getElementById("f");
    if (!form) {
      throw new Error("form missing");
    }

    const result = $(form).toObject?.();

    expect(result).toEqual({ person: { name: "Neo" } });
    expect(reduceEntriesMock).toHaveBeenCalledTimes(1);
  });
});
