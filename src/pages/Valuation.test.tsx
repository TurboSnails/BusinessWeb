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
it("服务没开时，给出带着同一家公司的 DCF 计算器入口", async () => {
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("连接失败")));
  render(
    <MemoryRouter initialEntries={["/valuation?market=hk&code=00700"]}>
      <Valuation />
    </MemoryRouter>,
  );
  const link = await screen.findByRole("link", { name: /改用 DCF 计算器/ });
  const url = new URL(`http://x${link.getAttribute("href")}`);
  expect(url.pathname).toBe("/dcf");
  expect(url.searchParams.get("code")).toBe("00700");
  expect(url.searchParams.get("market")).toBe("hk");
  expect(url.searchParams.get("currency")).toBe("HKD");
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

it("公司链接按市场和代码恢复报告，离线 DCF 沿用目标证券", async () => {
  sessionStorage.clear();
  sessionStorage.setItem("valuation-last", JSON.stringify(fixture));
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("离线")));
  try {
    render(<MemoryRouter initialEntries={["/valuation?market=hk&code=AAPL"]}><Valuation /></MemoryRouter>);
    await screen.findByText("无法连接本地估值服务");
    expect(screen.queryByText(/已选择 AAPL/)).toBeNull();
    expect(screen.queryByRole("heading", { name: "模型结果对比" })).toBeNull();
    expect(screen.getByRole("link", { name: /改用 DCF 计算器/ }).getAttribute("href")).toContain("market=hk");
    expect(sessionStorage.getItem("valuation-last")).toBe(JSON.stringify(fixture));
  } finally {
    sessionStorage.clear();
    vi.unstubAllGlobals();
  }
});

it("打开另一家公司时保留原任务，主动返回后才接上原任务", async () => {
  sessionStorage.clear();
  const job = JSON.stringify({ id: "previous-job", security: fixture.snapshot.security });
  sessionStorage.setItem("valuation-job", job);
  const api = service({ state: "analyzing" });
  vi.stubGlobal("fetch", api);
  vi.stubGlobal("EventSource", FakeEventSource);
  try {
    render(<MemoryRouter initialEntries={["/valuation?market=hk&code=00700"]}><Valuation /></MemoryRouter>);
    await screen.findByText("本地服务已连接");
    expect((screen.getByLabelText("公司名称或代码") as HTMLInputElement).value).toBe("hk:00700");
    expect(screen.queryByText(/已选择 AAPL/)).toBeNull();
    expect(api.mock.calls.some(([url]) => url.includes("/jobs/previous-job"))).toBe(false);
    expect(sessionStorage.getItem("valuation-job")).toBe(job);
    fireEvent.click(screen.getByRole("link", { name: "查看上一次任务" }));
    await waitFor(() => expect(FakeEventSource.last?.url).toContain("/jobs/previous-job/events"));
    expect(screen.getByText(/已选择 AAPL/)).toBeTruthy();
  } finally {
    sessionStorage.clear();
    vi.unstubAllGlobals();
  }
});
