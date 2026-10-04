import { it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Valuation from "./Valuation";
it("explains how to start the local service when disconnected", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("连接失败")));
  render(
    <MemoryRouter>
      <Valuation />
    </MemoryRouter>,
  );
  await waitFor(() =>
    expect(screen.getByText(/npm run valuation:server/)).toBeTruthy(),
  );
  expect(screen.getByRole("heading", { name: "公司估值工作台" })).toBeTruthy();
  vi.unstubAllGlobals();
});
it("selects a specific backend model and confirms a company identity", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => ({
      ok: true,
      json: async () =>
        url.endsWith("/health")
          ? { ok: true, token: "test" }
          : url.includes("/backends")
            ? [
                {
                  id: "codex",
                  installed: true,
                  cliVersion: "1",
                  canListModels: true,
                },
              ]
            : url.includes("/models")
              ? [
                  {
                    backend: "codex",
                    modelId: "gpt-specific",
                    displayName: "GPT Specific",
                    availability: "discovered",
                    isDefault: false,
                  },
                ]
              : url.includes("/companies")
                ? [
                    {
                      market: "us",
                      code: "AAPL",
                      name: "Apple",
                      quoteCurrency: "USD",
                      exchange: "US",
                    },
                  ]
                : { id: "job", state: "queued" },
    })),
  );
  render(
    <MemoryRouter>
      <Valuation />
    </MemoryRouter>,
  );
  await waitFor(() =>
    expect(screen.getByRole("option", { name: /GPT Specific/ })).toBeTruthy(),
  );
  fireEvent.change(screen.getByLabelText("公司名称或代码"), {
    target: { value: "Apple" },
  });
  fireEvent.click(screen.getByRole("button", { name: "查找公司" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: /Apple · AAPL/ })).toBeTruthy(),
  );
  fireEvent.click(screen.getByRole("button", { name: /Apple · AAPL/ }));
  expect(
    screen.getByRole("button", { name: "开始估值" }).hasAttribute("disabled"),
  ).toBe(false);
  vi.unstubAllGlobals();
});
