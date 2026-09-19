// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as semantics from "@form2js/core";
import { useForm2js } from "../src/index";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("react adapter shares the semantic layer", () => {
  it("submits through semantics.merge.aggregateEntries while owning hook lifecycle", async () => {
    const spy = vi.spyOn(semantics.merge, "aggregateEntries");
    const submit = vi.fn(() => Promise.resolve());
    const received: unknown[] = [];
    submit.mockImplementation((data: unknown) => {
      received.push(data);
    });

    function Harness(): React.ReactElement {
      const state = useForm2js(submit);
      return React.createElement(
        "form",
        { onSubmit: state.onSubmit },
        React.createElement("input", { name: "person.name", defaultValue: "Neo" }),
        React.createElement("button", { type: "submit" }, "Submit")
      );
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(Harness));
      await Promise.resolve();
    });

    const form = container.querySelector("form");
    expect(form).toBeTruthy();

    await act(async () => {
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(spy).toHaveBeenCalledTimes(1);
    const entries = spy.mock.calls[0]?.[0] ?? [];
    expect(entries).toContainEqual({
      key: "person.name",
      value: "Neo",
      source: { adapter: "form-data", kind: "field" }
    });
    expect(received[0]).toMatchObject({ person: { name: "Neo" } });

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
