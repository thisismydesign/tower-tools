import { MantineProvider } from "@mantine/core";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../App";
import { TOOLS } from "./index";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
  window.location.hash = "";
});

describe.each(TOOLS)("$title", ({ id, title, Component }) => {
  it("renders its heading without console errors", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <MantineProvider>
        <Component />
      </MantineProvider>,
    );
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it(`is reachable at #/${id}`, () => {
    window.location.hash = `#/${id}`;
    render(
      <MantineProvider>
        <App />
      </MantineProvider>,
    );
    const nav = screen.getByRole("navigation");
    expect(within(nav).getByText(title)).toBeInTheDocument();
    expect(within(screen.getByRole("main")).getByRole("heading", { level: 1 })).toBeInTheDocument();
  });
});

it("falls back to the first tool on an unknown route", () => {
  window.location.hash = "#/does-not-exist";
  render(
    <MantineProvider>
      <App />
    </MantineProvider>,
  );
  expect(within(screen.getByRole("main")).getByRole("heading", { level: 1 })).toBeInTheDocument();
});
