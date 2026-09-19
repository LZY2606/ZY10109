// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@form2js/core", async (importOriginal) => {
  const actual = await importOriginal<typeof CoreModule>();
  return {
    ...actual,
    reduceEntries: vi.fn(actual.reduceEntries)
  };
});

import type * as CoreModule from "@form2js/core";
import * as core from "@form2js/core";
import { useForm2js, type UseForm2jsResult } from "../src/index";

const reduceEntriesMock = vi.mocked(core.reduceEntries);

const reactActScope = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
reactActScope.IS_REACT_ACT_ENVIRONMENT = true;

const mounted: { root: ReturnType<typeof createRoot>; container: HTMLDivElement }[] = [];

afterEach(() => {
  for (const entry of mounted) {
    act(() => {
      entry.root.unmount();
    });
    entry.container.remove();
  }
  mounted.length = 0;
});

describe("react adapter semantics layer usage", () => {
  beforeEach(() => {
    reduceEntriesMock.mockClear();
  });

  it("reaches the shared semantics layer through the form-data adapter", async () => {
    let captured: unknown = null;
    const snapshot: { state: UseForm2jsResult | null } = { state: null };

    function Harness(): React.ReactElement {
      const state = useForm2js((data) => {
        captured = data;
      });
      snapshot.state = state;
      return React.createElement(
        "form",
        { onSubmit: state.onSubmit },
        React.createElement("input", { name: "person.name", defaultValue: "Neo" })
      );
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    mounted.push({ root, container });

    act(() => {
      root.render(React.createElement(Harness));
    });

    const form = container.querySelector("form");
    if (!(form instanceof HTMLFormElement)) {
      throw new Error("form missing");
    }

    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(snapshot.state?.isError).toBe(false);
    expect(captured).toEqual({ person: { name: "Neo" } });
    expect(reduceEntriesMock).toHaveBeenCalled();
  });
});
