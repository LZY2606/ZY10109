// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import {
  checkCapability,
  entriesToObject,
  capabilities as coreCapabilities,
  type AdapterCapabilities,
  type CapabilityKey,
  type Entry
} from "@form2js/core";
import { formToObject, capabilities as domCapabilities } from "@form2js/dom";
import { formDataToObject, capabilities as formDataCapabilities } from "@form2js/form-data";
import { installToObjectPlugin, capabilities as jqueryCapabilities } from "@form2js/jquery";
import { objectToForm, capabilities as js2formCapabilities } from "@form2js/js2form";
import {
  useForm2js,
  capabilities as reactCapabilities,
  type UseForm2jsOptions,
  type UseForm2jsResult
} from "@form2js/react";

const reactActScope = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
reactActScope.IS_REACT_ACT_ENVIRONMENT = true;

const adapterCapabilities: Record<string, AdapterCapabilities> = {
  core: coreCapabilities,
  dom: domCapabilities,
  "form-data": formDataCapabilities,
  jquery: jqueryCapabilities,
  react: reactCapabilities,
  js2form: js2formCapabilities
};

function expectUnsupported(adapter: string, capability: CapabilityKey): void {
  const result = checkCapability(adapterCapabilities[adapter], capability);
  expect(result.status).toBe("unsupported");
  if (result.status === "unsupported") {
    expect(result.adapter).toBe(adapterCapabilities[adapter].adapter);
    expect(result.reason.length).toBeGreaterThan(0);
  }
}

function renderForm(html: string): HTMLFormElement {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  const form = wrapper.querySelector("form");
  if (!(form instanceof HTMLFormElement)) {
    throw new Error("fixture did not contain a form");
  }
  document.body.appendChild(form);
  return form;
}

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
  installToObjectPlugin($);
  return $;
}

const mountedRoots: Array<{ root: ReturnType<typeof createRoot>; container: HTMLDivElement }> = [];

afterEach(() => {
  for (const mounted of mountedRoots) {
    act(() => {
      mounted.root.unmount();
    });
    mounted.container.remove();
  }
  mountedRoots.length = 0;
  document.body.innerHTML = "";
});

interface ReactReadOptions {
  options?: UseForm2jsOptions;
  prepare?: (container: HTMLDivElement) => void;
}

async function readViaReact(
  fields: React.ReactNode,
  readOptions: ReactReadOptions = {}
): Promise<unknown> {
  let captured: unknown;
  let latestState: UseForm2jsResult | undefined;

  function Harness(): React.ReactElement {
    const state = useForm2js((data) => {
      captured = data;
    }, readOptions.options ?? {});
    latestState = state;
    return React.createElement("form", { onSubmit: state.onSubmit }, fields);
  }

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push({ root, container });

  act(() => {
    root.render(React.createElement(Harness));
  });

  readOptions.prepare?.(container);

  const form = container.querySelector("form");
  if (!(form instanceof HTMLFormElement)) {
    throw new Error("react harness did not render a form");
  }

  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });

  if (latestState?.isError) {
    throw latestState.error;
  }

  return captured;
}

interface ReadMatrixCase {
  name: string;
  formHtml: string;
  reactFields: React.ReactNode;
  entries: Entry[];
  expected: unknown;
}

function runReadMatrixCase(testCase: ReadMatrixCase): void {
  it(`produces equivalent objects on every read path: ${testCase.name}`, async () => {
    const viaCore = entriesToObject(testCase.entries);

    const domForm = renderForm(testCase.formHtml);
    const viaDom = formToObject(domForm);
    domForm.remove();

    const formDataForm = renderForm(testCase.formHtml);
    const viaFormData = formDataToObject(new FormData(formDataForm));
    formDataForm.remove();

    const jqueryForm = renderForm(testCase.formHtml);
    const $ = createStubJQuery();
    const viaJquery = $(jqueryForm).toObject?.();
    jqueryForm.remove();

    const viaReact = await readViaReact(testCase.reactFields);

    expect(viaCore).toEqual(testCase.expected);
    expect(viaDom).toEqual(testCase.expected);
    expect(viaFormData).toEqual(testCase.expected);
    expect(viaJquery).toEqual(testCase.expected);
    expect(viaReact).toEqual(testCase.expected);
  });

  it(`writes equivalent control states on the js2form path: ${testCase.name}`, () => {
    const targetForm = renderForm(testCase.formHtml);

    objectToForm(targetForm, testCase.expected);

    expect(formToObject(targetForm)).toEqual(testCase.expected);
    targetForm.remove();
  });
}

describe("contract matrix: nested dot paths", () => {
  runReadMatrixCase({
    name: "person.name.first / person.name.last",
    formHtml: `
      <form>
        <input name="person.name.first" value="John" />
        <input name="person.name.last" value="Doe" />
      </form>
    `,
    reactFields: [
      React.createElement("input", { key: "f", name: "person.name.first", defaultValue: "John" }),
      React.createElement("input", { key: "l", name: "person.name.last", defaultValue: "Doe" })
    ],
    entries: [
      { key: "person.name.first", value: "John" },
      { key: "person.name.last", value: "Doe" }
    ],
    expected: { person: { name: { first: "John", last: "Doe" } } }
  });
});

describe("contract matrix: consecutive brackets", () => {
  runReadMatrixCase({
    name: "matrix[0][1]",
    formHtml: `<form><input name="matrix[0][1]" value="x" /></form>`,
    reactFields: React.createElement("input", { name: "matrix[0][1]", defaultValue: "x" }),
    entries: [{ key: "matrix[0][1]", value: "x" }],
    expected: { matrix: [["x"]] }
  });
});

describe("contract matrix: numeric-like keys compact to dense arrays", () => {
  runReadMatrixCase({
    name: "items[8].name / items[5].name",
    formHtml: `
      <form>
        <input name="items[8].name" value="A" />
        <input name="items[5].name" value="B" />
      </form>
    `,
    reactFields: [
      React.createElement("input", { key: "a", name: "items[8].name", defaultValue: "A" }),
      React.createElement("input", { key: "b", name: "items[5].name", defaultValue: "B" })
    ],
    entries: [
      { key: "items[8].name", value: "A" },
      { key: "items[5].name", value: "B" }
    ],
    expected: { items: [{ name: "A" }, { name: "B" }] }
  });
});

describe("contract matrix: repeated checkboxes aggregate", () => {
  runReadMatrixCase({
    name: "roles[] checkboxes",
    formHtml: `
      <form>
        <input type="checkbox" name="roles[]" value="admin" checked />
        <input type="checkbox" name="roles[]" value="operator" checked />
        <input type="checkbox" name="roles[]" value="guest" />
      </form>
    `,
    reactFields: [
      React.createElement("input", { key: "a", type: "checkbox", name: "roles[]", value: "admin", defaultChecked: true }),
      React.createElement("input", { key: "o", type: "checkbox", name: "roles[]", value: "operator", defaultChecked: true }),
      React.createElement("input", { key: "g", type: "checkbox", name: "roles[]", value: "guest" })
    ],
    entries: [
      { key: "roles[]", value: "admin" },
      { key: "roles[]", value: "operator" }
    ],
    expected: { roles: ["admin", "operator"] }
  });
});

describe("contract matrix: empty collections", () => {
  const formHtml = `
    <form>
      <select name="colors[]" multiple>
        <option value="red">red</option>
        <option value="blue">blue</option>
      </select>
    </form>
  `;

  it("is expressible on core, dom and jquery paths", () => {
    const expected = { colors: [] };

    expect(entriesToObject([{ key: "colors", value: [] }])).toEqual(expected);

    const domForm = renderForm(formHtml);
    expect(formToObject(domForm)).toEqual(expected);
    domForm.remove();

    const jqueryForm = renderForm(formHtml);
    const $ = createStubJQuery();
    expect($(jqueryForm).toObject?.()).toEqual(expected);
    jqueryForm.remove();
  });

  it("returns explicit capability results where not expressible", async () => {
    expectUnsupported("form-data", "emptyCollections");
    expectUnsupported("react", "emptyCollections");
    expectUnsupported("js2form", "emptyCollections");

    const formDataForm = renderForm(formHtml);
    expect(formDataToObject(new FormData(formDataForm))).toEqual({});
    formDataForm.remove();

    const viaReact = await readViaReact(
      React.createElement(
        "select",
        { name: "colors[]", multiple: true },
        React.createElement("option", { value: "red" }, "red"),
        React.createElement("option", { value: "blue" }, "blue")
      )
    );
    expect(viaReact).toEqual({});
  });

  it("writes an equivalent control state on the js2form path", () => {
    const targetForm = renderForm(formHtml);

    objectToForm(targetForm, { colors: [] });

    const options = targetForm.querySelectorAll("option");
    expect(Array.from(options).every((option) => !option.selected)).toBe(true);
    expect(formToObject(targetForm)).toEqual({ colors: [] });
    targetForm.remove();
  });
});

describe("contract matrix: null values", () => {
  it("is only expressible on the core path", () => {
    expect(entriesToObject([{ key: "a", value: null }], { skipEmpty: false })).toEqual({
      a: null
    });

    expectUnsupported("dom", "nullValues");
    expectUnsupported("form-data", "nullValues");
    expectUnsupported("jquery", "nullValues");
    expectUnsupported("react", "nullValues");
    expectUnsupported("js2form", "nullValues");
  });
});

describe("contract matrix: explicit undefined", () => {
  it("is only expressible on the core path as an own property", () => {
    const result = entriesToObject([{ key: "a", value: undefined }], { skipEmpty: false });

    expect(Object.prototype.hasOwnProperty.call(result, "a")).toBe(true);
    expect(result.a).toBeUndefined();

    expectUnsupported("dom", "explicitUndefined");
    expectUnsupported("form-data", "explicitUndefined");
    expectUnsupported("jquery", "explicitUndefined");
    expectUnsupported("react", "explicitUndefined");
    expectUnsupported("js2form", "explicitUndefined");
  });
});

describe("contract matrix: File values stay unstringified", () => {
  it("passes File references through core and form-data paths", () => {
    const file = new File(["payload"], "report.txt", { type: "text/plain" });

    const viaCore = entriesToObject([{ key: "doc", value: file }]) as { doc: File };
    expect(viaCore.doc).toBe(file);

    const formData = new FormData();
    formData.append("doc", file);
    const viaFormData = formDataToObject(formData) as { doc: File };
    expect(viaFormData.doc).toBeInstanceOf(File);
    expect(viaFormData.doc.name).toBe("report.txt");
  });

  it("carries a File instance through the react hook path", async () => {
    const viaReact = (await readViaReact(
      React.createElement("input", { type: "file", name: "doc" }),
      {
        prepare(container) {
          const input = container.querySelector("input");
          if (!(input instanceof HTMLInputElement)) {
            throw new Error("file input missing");
          }
          const file = new File(["payload"], "report.txt", { type: "text/plain" });
          Object.defineProperty(input, "files", { value: [file], configurable: true });
        }
      }
    )) as { doc: File };

    expect(viaReact.doc).toBeInstanceOf(File);
  });

  it("returns explicit capability results where File values are not expressible", () => {
    expectUnsupported("dom", "fileValues");
    expectUnsupported("jquery", "fileValues");
    expectUnsupported("js2form", "fileValues");
  });
});

describe("contract matrix: __proto__ and dangerous segments", () => {
  const dangerousForm = `<form><input name="__proto__.polluted" value="yes" /></form>`;

  it("is rejected by every read path", async () => {
    expect(() => entriesToObject([{ key: "__proto__.polluted", value: "yes" }])).toThrow(
      /Unsafe path segment/
    );

    const domForm = renderForm(dangerousForm);
    expect(() => formToObject(domForm)).toThrow(/Unsafe path segment/);
    domForm.remove();

    expect(() => formDataToObject([["__proto__.polluted", "yes"]])).toThrow(
      /Unsafe path segment/
    );

    const jqueryForm = renderForm(dangerousForm);
    const $ = createStubJQuery();
    expect(() => $(jqueryForm).toObject?.()).toThrow(/Unsafe path segment/);
    jqueryForm.remove();

    await expect(
      readViaReact(React.createElement("input", { name: "__proto__.polluted", defaultValue: "yes" }))
    ).rejects.toThrow(/Unsafe path segment/);

    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("cannot pollute through the js2form write path", () => {
    const targetForm = renderForm(`<form><input name="safe" value="keep" /></form>`);
    const data = JSON.parse('{"__proto__":{"polluted":"yes"},"safe":"updated"}') as unknown;

    objectToForm(targetForm, data);

    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    const input = targetForm.querySelector("input");
    expect(input?.value).toBe("updated");
    targetForm.remove();
  });
});

describe("contract matrix: escaped paths", () => {
  it("is not expressible on any adapter", () => {
    for (const adapter of Object.keys(adapterCapabilities)) {
      expectUnsupported(adapter, "escapedPaths");
    }
  });

  it("treats backslashes as literal characters, not escapes", () => {
    const result = entriesToObject([{ key: "a\\.b", value: "x" }], { skipEmpty: false });

    expect(result).toEqual({ "a\\": { b: "x" } });
  });
});

describe("contract matrix: capability descriptors", () => {
  it("declares a complete capability descriptor per adapter", () => {
    const expected: Record<string, Partial<AdapterCapabilities>> = {
      core: { direction: "read-write", fileValues: true, nullValues: true },
      dom: { direction: "read", booleanControls: true, emptyCollections: true },
      "form-data": { direction: "read", fileValues: true },
      jquery: { direction: "read", booleanControls: true },
      react: { direction: "read", fileValues: true },
      js2form: { direction: "write", booleanControls: true }
    };

    for (const [adapter, partial] of Object.entries(expected)) {
      expect(adapterCapabilities[adapter]).toMatchObject(partial);
    }
  });
});
