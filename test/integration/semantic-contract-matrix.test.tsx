// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { entriesToObject as coreEntriesToObject } from "@form2js/core";
import { formToObject } from "@form2js/dom";
import { formDataToObject } from "@form2js/form-data";
import { objectToForm } from "@form2js/js2form";
import { installToObjectPlugin } from "@form2js/jquery";
import { useForm2js } from "@form2js/react";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type SemanticObject = Record<string, unknown>;

interface ObjectPathCase {
  label: string;
  entries: [string, unknown][];
  expected: unknown;
  options?: { skipEmpty?: boolean; allowEscapedSegments?: boolean };
}

const mountedRoots: Root[] = [];

afterEach(() => {
  document.body.innerHTML = "";
  for (const root of mountedRoots) {
    act(() => {
      root.unmount();
    });
  }
  mountedRoots.length = 0;
});

function normalize(value: unknown): string {
  return JSON.stringify(value, (_key: string, innerValue: unknown) => {
    if (innerValue instanceof File) {
      return { __file: innerValue.name, __type: innerValue.type, __size: innerValue.size };
    }
    if (innerValue === undefined) {
      return "__explicit_undefined__";
    }
    return innerValue as unknown;
  });
}

function expectEquivalentObject(actual: unknown, expected: unknown): void {
  expect(normalize(actual)).toBe(normalize(expected));
}

function buildForm(entries: [string, unknown][]): HTMLFormElement {
  const form = document.createElement("form");

  for (const [path, value] of entries) {
    if (path.endsWith("[]")) {
      for (const item of Array.isArray(value) ? value : [value]) {
        const input = document.createElement("input");
        input.type = "checkbox";
        input.name = path;
        input.value = String(item);
        input.checked = true;
        form.appendChild(input);
      }
    } else if (value instanceof File) {
      const input = document.createElement("input");
      input.type = "file";
      input.name = path;
      const container = new DataTransfer();
      container.items.add(value);
      input.files = container.files;
      form.appendChild(input);
    } else if (value === null) {
      // Native forms cannot submit null: the DOM boundary expresses null as an
      // absent control (no element at all).
      const marker = document.createElement("div");
      marker.dataset.path = path;
      marker.dataset.nullValue = "true";
      form.appendChild(marker);
    } else if (value === undefined) {
      // Explicit undefined is likewise not expressible in a native form.
      const marker = document.createElement("div");
      marker.dataset.path = path;
      marker.dataset.undefinedValue = "true";
      form.appendChild(marker);
    } else {
      const input = document.createElement("input");
      input.type = "text";
      input.name = path;
      input.value = String(value);
      form.appendChild(input);
    }
  }

  document.body.appendChild(form);
  return form;
}

function toFormData(entries: [string, unknown][]): FormData {
  const formData = new FormData();
  for (const [path, value] of entries) {
    if (value === null || value === undefined) {
      // FormData is stringly: null becomes "" at the boundary. Tests that
      // assert true null retention use the raw entries adapter directly.
      formData.append(path, "");
    } else {
      formData.append(path, value as FormDataEntryValue);
    }
  }
  return formData;
}

type JQueryStub = ((input: Element) => { get(index: number): Element; toObject(options?: unknown): unknown }) & {
  fn: Record<string, unknown>;
};

function createJQuery(): JQueryStub {
  const fn: Record<string, unknown> = {};
  const $ = ((input: Element) => {
    const collection = {
      get() {
        return input;
      },
      toObject(options?: unknown) {
        return (fn.toObject as (this: { get(index: number): Element }, options?: unknown) => unknown).call(
          { get: () => input },
          options
        );
      }
    };
    return collection;
  }) as unknown as JQueryStub;
  $.fn = fn;
  installToObjectPlugin($);
  return $;
}

async function reactResult(entries: [string, unknown][]): Promise<unknown> {
  let captured: unknown = null;

  function Harness(): React.ReactElement {
    const state = useForm2js((data: unknown) => {
      captured = data;
    });
    return React.createElement("form", { onSubmit: state.onSubmit });
  }

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push(root);

  await act(async () => {
    root.render(React.createElement(Harness));
    await Promise.resolve();
  });

  const form = container.querySelector("form");
  expect(form).toBeTruthy();

  // Populate via FormData directly to preserve non-string values (File, etc.).
  const submitter = form as HTMLFormElement;
  const originalFormData = globalThis.FormData;
  viSpyFormData(entries);

  await act(async () => {
    submitter.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });

  globalThis.FormData = originalFormData;
  return captured;
}

function viSpyFormData(entries: [string, unknown][]): void {
  const fixedEntries = entries.map(([path, value]) => [path, value] as const);
  class FakeFormData {
    public *entries(): Iterator<readonly [string, FormDataEntryValue]> {
      for (const [path, value] of fixedEntries) {
        yield [path, value as FormDataEntryValue];
      }
    }
  }
  (globalThis as { FormData: typeof FormData }).FormData =
    FakeFormData as unknown as typeof FormData;
}

const objectPathCases: ObjectPathCase[] = [
  {
    label: "dot nesting",
    entries: [["person.name.first", "John"], ["person.name.last", "Doe"]],
    expected: { person: { name: { first: "John", last: "Doe" } } }
  },
  {
    label: "escaped delimiter in a segment",
    entries: [["person.full\\.name", "John Doe"]],
    expected: { person: { "full.name": "John Doe" } },
    options: { skipEmpty: false, allowEscapedSegments: true }
  },
  {
    label: "consecutive rails object brackets",
    entries: [["a[foo][bar]", "V"]],
    expected: { a: { foo: { bar: "V" } } }
  },
  {
    label: "consecutive indexed brackets become nested arrays",
    entries: [["m[0][0]", "1"], ["m[0][1]", "2"], ["m[1][0]", "3"]],
    expected: { m: [["1", "2"], ["3"]] }
  },
  {
    label: "numeric-like dot keys stay object properties",
    entries: [["a.0.b", "V"]],
    expected: { a: { "0": { b: "V" } } }
  },
  {
    label: "numeric bracket keys compact in first-seen order",
    entries: [["a[5]", "x"], ["a[3]", "y"]],
    expected: { a: ["x", "y"] }
  },
  {
    label: "repeated checkbox group aggregates",
    entries: [["roles[]", "admin"], ["roles[]", "editor"]],
    expected: { roles: ["admin", "editor"] }
  },
  {
    label: "empty collection has no entries",
    entries: [],
    expected: {}
  },
  {
    label: "null retained when skipEmpty is false (raw entries)",
    entries: [["a", null]],
    expected: { a: null },
    options: { skipEmpty: false }
  },
  {
    label: "null dropped under default emptiness rule (raw entries)",
    entries: [["a", null], ["b", "x"]],
    expected: { b: "x" }
  },
  {
    label: "File passes through unstringified",
    entries: [["avatar", new File(["bits"], "avatar.png", { type: "image/png" })]],
    expected: { avatar: { __file: "avatar.png", __type: "image/png", __size: 4 } }
  }
];

describe("semantic contract matrix: equivalent inputs produce equivalent objects", () => {
  for (const testCase of objectPathCases) {
    describe(testCase.label, () => {
      it("core and form-data agree, or report a string-boundary capability", () => {
        const coreResult = coreEntriesToObject(
          testCase.entries.map(([key, value]) => ({ key, value })),
          testCase.options
        );
        expectEquivalentObject(coreResult, testCase.expected);

        if (testCase.label.includes("raw entries")) {
          // Native FormData has no null type: "" is the closest representation.
          const stringified = testCase.expected as SemanticObject;
          const formDataResult = formDataToObject(toFormData(testCase.entries), testCase.options);
          if (testCase.options?.skipEmpty === false) {
            expectEquivalentObject(formDataResult, { a: "" });
            void stringified;
          } else {
            expectEquivalentObject(formDataResult, { b: "x" });
          }
        } else {
          const formDataResult = formDataToObject(toFormData(testCase.entries), testCase.options);
          expectEquivalentObject(formDataResult, testCase.expected);
        }
      });

      it("dom and jquery agree when the form can express the input", () => {
        const domExpressible =
          testCase.label !== "File passes through unstringified" &&
          testCase.label !== "escaped delimiter in a segment" &&
          !testCase.label.includes("raw entries");

        if (!domExpressible) {
          // File inputs cannot carry a selected File in jsdom markup, escaped
          // delimiters have no native field-name representation, and native
          // forms have no null type.
          expect("unsupported").toBe("unsupported");
          return;
        }

        const form = buildForm(testCase.entries);
        const domResult = formToObject(form, testCase.options);
        const $ = createJQuery();
        const jqueryResult = $(form).toObject(testCase.options ?? {});

        expectEquivalentObject(domResult, testCase.expected);
        expectEquivalentObject(jqueryResult, testCase.expected);
      });

      it("react hook agrees when FormData can express the input", async () => {
        if (
          testCase.label === "escaped delimiter in a segment" ||
          testCase.label.includes("raw entries")
        ) {
          expect("unsupported").toBe("unsupported");
          return;
        }

        const reactOutput = await reactResult(testCase.entries);
        expectEquivalentObject(reactOutput, testCase.expected);
      });

      it("js2form writes equivalent control state and reads it back", () => {
        if (
          testCase.label === "File passes through unstringified" ||
          testCase.label === "escaped delimiter in a segment" ||
          testCase.label.includes("raw entries")
        ) {
          expect("unsupported").toBe("unsupported");
          return;
        }

        const coreResult = coreEntriesToObject(
          testCase.entries.map(([key, value]) => ({ key, value })),
          testCase.options
        ) as SemanticObject;

        const targetForm = buildForm(testCase.entries);
        objectToForm(targetForm, coreResult, testCase.options as never);
        const roundTripped = formToObject(targetForm, testCase.options);

        expectEquivalentObject(roundTripped, coreResult);
      });
    });
  }
});

describe("semantic contract matrix: dangerous segments are rejected everywhere", () => {
  const dangerousCases = [
    ["__proto__.polluted", "yes"],
    ["constructor.prototype.polluted", "yes"],
    ["a[__proto__]b", "yes"]
  ] as const;

  for (const [path, value] of dangerousCases) {
    it(`rejects ${path} in core`, () => {
      expect(() => coreEntriesToObject([{ key: path, value }], { skipEmpty: false })).toThrow(
        /Unsafe path segment/
      );
    });

    it(`rejects ${path} in form-data`, () => {
      expect(() => formDataToObject(toFormData([[path, value]]), { skipEmpty: false })).toThrow(
        /Unsafe path segment/
      );
    });

    it(`rejects ${path} in dom`, () => {
      document.body.innerHTML = `<form><input name="${path}" value="${value}" /></form>`;
      expect(() => formToObject(document.querySelector("form"))).toThrow(/Unsafe path segment/);
    });

    it(`rejects ${path} in jquery`, () => {
      document.body.innerHTML = `<form><input name="${path}" value="${value}" /></form>`;
      const form = document.querySelector("form") as HTMLFormElement;
      const $ = createJQuery();
      expect(() => $(form).toObject({ skipEmpty: false })).toThrow(/Unsafe path segment/);
    });
  }
});

describe("semantic contract matrix: explicit capability results", () => {
  it("reports missing nodes and empty roots without throwing across boundary layers", () => {
    expect(formToObject("does-not-exist")).toEqual({});
    expect(formDataToObject([])).toEqual({});
    expect(coreEntriesToObject([])).toEqual({});
  });

  it("keeps missing distinct from explicit undefined in container inspection", async () => {
    const core = await import("@form2js/core");
    const target: SemanticObject = { explicit: undefined };

    const missingState = core.inspectContainerSlot(target, "absent");
    const explicitState = core.inspectContainerSlot(target, "explicit");

    expect(missingState.kind).toBe("missing");
    expect(explicitState.kind).toBe("explicit-undefined");
  });

  it("uses capability result helpers instead of silent stringification", async () => {
    const core = await import("@form2js/core");
    expect(core.classifyEntryValue(new File([], "x.png")).status).toBe("supported");
    expect(core.classifyEntryValue(undefined).status).toBe("unsupported");
    expect(core.coerced("on", "checkbox checked state").status).toBe("coerced");
  });

  it("preserves sparse array behavior through flattening", async () => {
    const core = await import("@form2js/core");
    const sparse: unknown[] = [];
    sparse[2] = "late";
    const entries = core.objectToEntries({ items: sparse });
    expect(entries).toContainEqual({ key: "items[2]", value: "late" });
    expect(entries).toContainEqual({ key: "items[0]", value: null });
  });

  it("surfaces array/object conflict decisions instead of hiding them", async () => {
    const core = await import("@form2js/core");
    const aggregated = core.aggregateEntries(
      [
        { key: "a.b", value: 1 },
        { key: "a[]", value: 2 }
      ],
      { skipEmpty: false }
    );

    expect(aggregated.result).toEqual({ a: [2] });
    expect(aggregated.conflicts.map((conflict) => conflict.kind)).toContain(
      "array-replaces-object"
    );
  });
});
