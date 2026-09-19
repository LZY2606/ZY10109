// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as semantics from "@form2js/core";
import { installToObjectPlugin } from "../src/index";

type StubCollection = {
  length: number;
  get(index: number): Element | undefined;
  each(callback: (this: Element, index: number, element: Element) => void): StubCollection;
  toObject?: (options?: unknown) => unknown;
};

type StubJQuery = ((input: string | Element | Element[]) => StubCollection) & {
  fn: Record<string, unknown>;
};

function createStubJQuery(): StubJQuery {
  const fn: Record<string, unknown> = {};

  const $ = ((input: string | Element | Element[]): StubCollection => {
    const elements =
      typeof input === "string"
        ? Array.from(document.querySelectorAll(input))
        : Array.isArray(input)
          ? input
          : [input];

    const collection: StubCollection = {
      length: elements.length,
      get(index) {
        return elements[index];
      },
      each(callback) {
        for (let index = 0; index < elements.length; index += 1) {
          const element = elements[index];
          if (element) {
            callback.call(element, index, element);
          }
        }
        return this;
      }
    };

    Object.setPrototypeOf(collection, fn);
    return collection;
  }) as StubJQuery;

  $.fn = fn;
  return $;
}

describe("jquery adapter shares the semantic layer", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("routes first/all/combine modes through the shared semantic merge", () => {
    const spy = vi.spyOn(semantics.merge, "aggregateEntries");

    document.body.innerHTML = `
      <form class="part"><input name="person.first" value="Neo" /></form>
      <form class="part"><input name="person.last" value="Anderson" /></form>
    `;

    const $ = createStubJQuery();
    installToObjectPlugin($);

    $(".part").toObject?.({ mode: "first" });
    $(".part").toObject?.({ mode: "all" });
    $(".part").toObject?.({ mode: "combine" });

    expect(spy.mock.calls.length).toBe(4);
    for (const call of spy.mock.calls) {
      const entries = Array.from(call[0] ?? []);
      expect(entries[0]?.source?.adapter).toBe("dom");
    }
  });

  it("keeps the jQuery collection shape at the boundary without changing merge results", () => {
    vi.spyOn(semantics.merge, "aggregateEntries");

    document.body.innerHTML = `
      <form id="f"><input name="person.name" value="Trinity" /></form>
    `;

    const $ = createStubJQuery();
    installToObjectPlugin($);

    expect($("#f").toObject?.()).toEqual({ person: { name: "Trinity" } });
  });
});
