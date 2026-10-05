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

// ── 离开再回来：恢复进行中的任务、显示分析进度、保留最近一次结果 ──
import fixture from "../features/valuation/report.fixture.json";
import { act } from "@testing-library/react";

class FakeEventSource {
  static last: FakeEventSource | null = null;
  onmessage: ((m: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) {
    FakeEventSource.last = this;
  }
  send(event: object) {
    this.onmessage?.({ data: JSON.stringify(event) });
  }
  close() {}
}

const service = (job: object) =>
  vi.fn(async (url: string) => ({
    ok: true,
    json: async () =>
      url.endsWith("/health")
        ? { ok: true, token: "t" }
        : url.includes("/backends")
          ? [{ id: "codex", installed: true, cliVersion: "1", canListModels: true }]
          : url.includes("/models")
            ? []
            : job,
  }));

it("回到页面时接上进行中的任务：恢复公司、步骤，并显示模型输出进度", async () => {
  sessionStorage.clear();
  sessionStorage.setItem(
    "valuation-job",
    JSON.stringify({ id: "job1", security: fixture.snapshot.security, backend: "codex", startedAt: Date.now() - 65_000 }),
  );
  vi.stubGlobal("fetch", service({ id: "job1", state: "analyzing" }));
  vi.stubGlobal("EventSource", FakeEventSource);
  render(<MemoryRouter><Valuation /></MemoryRouter>);
  expect(screen.getByText(/已选择 AAPL/)).toBeTruthy();
  await waitFor(() => expect(FakeEventSource.last?.url).toContain("job1"));
  act(() => {
    FakeEventSource.last!.send({ id: 1, jobId: "job1", type: "analyzing", stage: "analyzing", payload: { message: "本地CLI正在生成三情景假设" }, at: "2026-10-05T08:00:00Z" });
    FakeEventSource.last!.send({ id: 2, jobId: "job1", type: "activity", stage: "analyzing", payload: { message: "模型正在推理", chars: 1234, preview: "先看收入增速" }, at: "2026-10-05T08:00:05Z" });
  });
  expect(screen.getByRole("list", { name: "估值进度" }).textContent).toContain("模型分析");
  expect(screen.getByText(/模型已输出 1,234 字/)).toBeTruthy();
  expect(screen.getByText(/先看收入增速/)).toBeTruthy();
  expect(screen.getByText(/已用时 1:0\d/)).toBeTruthy();
  expect(screen.getByRole("list", { name: "运行记录" }).textContent).toContain("模型正在推理");
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

it("估值完成后离开再回来，仍显示刚才的结果", async () => {
  sessionStorage.clear();
  sessionStorage.setItem("valuation-last", JSON.stringify(fixture));
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("离线")));
  render(<MemoryRouter><Valuation /></MemoryRouter>);
  expect(screen.getByText(/已选择 AAPL/)).toBeTruthy();
  expect((screen.getByLabelText("公司名称或代码") as HTMLInputElement).value).toBe("AAPL");
  expect(screen.queryByText("已取得的财务资料")).toBeNull(); // 有结果时显示结果而不是中间资料
  vi.unstubAllGlobals();
  sessionStorage.clear();
});
