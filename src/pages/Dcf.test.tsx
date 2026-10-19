import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Dcf from "./Dcf";
import { loadDcfRecords } from "../features/dcf";

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
function fillRequired(overrides: Record<string, string> = {}) {
  const data: Record<string, string> = {
    公司名称: "贵州茅台",
    股票代码: "600519",
    起始自由现金流: "100",
    流通股数: "10",
    当前股价: "15",
    ...overrides,
  };
  for (const [label, value] of Object.entries(data)) fill(label, value);
}

describe("现金流折现估值页", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("填入必要项后给出合理价与买卖结论", () => {
    render(<Dcf />);
    expect(screen.getByText(/请填写起始自由现金流/)).toBeTruthy();
    fillRequired();
    // 100 亿起始 FCF / 10 亿股 → 合理价 144.62，远高于现价 15
    expect(screen.getAllByText("¥144.62").length).toBeGreaterThan(0);
    expect(screen.getByText("BUY")).toBeTruthy();
  });

  it("有结果时显示 5×5 敏感性矩阵，数据不全时不显示", () => {
    render(<Dcf />);
    expect(screen.queryByRole("table", { name: "DCF 敏感性矩阵" })).toBeNull();
    fillRequired();
    const table = screen.getByRole("table", { name: "DCF 敏感性矩阵" });
    // 表头 1 行 + 5 行折现率；每行 1 个行标题 + 5 个格子
    expect(table.querySelectorAll("tbody tr")).toHaveLength(5);
    expect(table.querySelectorAll("tbody tr:first-child td")).toHaveLength(6);
    expect(table.querySelector(".dcf-sens__center")?.textContent).toBe("¥144.62");
  });

  it("从公司研究页带参数打开时预填名称、市场、币种和当前价", () => {
    window.history.pushState({}, "", "/dcf?company=%E8%85%BE%E8%AE%AF%E6%8E%A7%E8%82%A1&code=0700&market=hk&currency=HKD&price=512.5");
    try {
      render(<Dcf />);
      expect((screen.getByLabelText("公司名称") as HTMLInputElement).value).toBe("腾讯控股");
      expect((screen.getByLabelText("股票代码") as HTMLInputElement).value).toBe("0700");
      expect((screen.getByLabelText("当前股价") as HTMLInputElement).value).toBe("512.5");
      expect((screen.getByLabelText("市场") as HTMLSelectElement).value).toBe("hk");
      expect((screen.getByLabelText("币种") as HTMLSelectElement).value).toBe("HKD");
      expect(screen.getByText(/已从公司研究页带入 腾讯控股/)).toBeTruthy();
    } finally {
      window.history.pushState({}, "", "/");
    }
  });

  it("保存后再次分析同一家公司会覆盖上一次的记录", () => {
    render(<Dcf />);
    fillRequired();
    fireEvent.click(screen.getByRole("button", { name: /保存本次分析/ }));
    expect(screen.getByText(/已保存 贵州茅台/)).toBeTruthy();
    expect(loadDcfRecords()).toHaveLength(1);

    fill("当前股价", "300");
    fireEvent.click(screen.getByRole("button", { name: /保存并覆盖 贵州茅台/ }));
    expect(screen.getByText(/已覆盖 贵州茅台/)).toBeTruthy();

    const records = loadDcfRecords();
    expect(records).toHaveLength(1);
    expect(records[0].input.currentPrice).toBe(300);
  });

  it("不同公司各存一条，可从列表载入", () => {
    render(<Dcf />);
    fillRequired();
    fireEvent.click(screen.getByRole("button", { name: /保存本次分析/ }));
    fillRequired({ 公司名称: "腾讯控股", 股票代码: "0700" });
    fireEvent.click(screen.getByRole("button", { name: /保存本次分析/ }));
    expect(loadDcfRecords()).toHaveLength(2);

    // 载入第一条后表单被覆盖，再次保存仍是两家
    fireEvent.click(screen.getAllByRole("button", { name: "载入" })[1]);
    expect(screen.getByText(/已载入/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /保存并覆盖/ }));
    expect(loadDcfRecords()).toHaveLength(2);
  });

  it("WACC 可回填为折现率", () => {
    render(<Dcf />);
    fillRequired();
    fill("市值", "1000");
    fill("有息负债", "200");
    fill("β 值", "1.2");
    fill("利息支出", "10");
    fill("税前收入", "300");
    fill("所得税", "75");
    fill("无风险利率 (%)", "3");
    fill("市场预期回报 (%)", "8");
    expect(screen.getByText(/WACC 8\.13%/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "用 WACC 作为折现率" }));
    expect((screen.getByLabelText("期望折现率 (%)") as HTMLInputElement).value).toBe(
      "8.13",
    );
  });
  it("搜索股票后自动填好假设并给出合理价，改动后可恢复自动值", async () => {
    const YI = 1e8;
    const library = { schemaVersion: 1, generatedAt: "2026-10-20T00:00:00Z", universe: 1, issues: [],
      riskFree: { cn: { value: 1.65, date: "2026-10-19", label: "中国10年期国债" }, us: { value: 4.2, date: "2026-10-16", label: "美国10年期国债" } },
      items: [{ m: "cn", c: "600519", n: "贵州茅台", g: ["沪深300"], px: 1324.97, pxDate: "2026-10-19", ccy: "CNY", fy: "2025-12-31",
        years: [["2025", 1688 * YI, 615 * YI, 31 * YI], ["2024", 1709 * YI, 925 * YI, 47 * YI], ["2023", 1477 * YI, 666 * YI, 26 * YI], ["2022", 1241 * YI, 367 * YI, 53 * YI]],
        cash: 516.9 * YI, inv: 88.7 * YI, debt: 2.3 * YI, shares: 12.5 * YI, interest: 0.3 * YI, pretax: 1147.6 * YI, tax: 294.4 * YI, ebitda: 1170.7 * YI, ni: 823.2 * YI,
        beta: 0.9, betaRaw: 0.85, betaWeeks: 104, src: "https://example.com", at: "2026-10-20" }] };
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => library })));
    render(<Dcf />);
    const search = await screen.findByLabelText("搜索股票名称或代码");
    await screen.findByText(/共 1 家/);
    fireEvent.change(search, { target: { value: "茅台" } });
    fireEvent.click(screen.getByRole("button", { name: /贵州茅台/ }));
    expect((screen.getByLabelText("公司名称") as HTMLInputElement).value).toBe("贵州茅台");
    expect((screen.getByLabelText("有息负债") as HTMLInputElement).value).toBe("2.3");
    expect(screen.getByText(/近3年平均（2023–2025年报/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "估值结论 · 贵州茅台" })).toBeTruthy();
    expect(screen.getByText("买入参考价", { selector: "small" })).toBeTruthy();
    expect(screen.getByText(/^可信度/, { selector: ".dcf-cred" })).toBeTruthy();
    // 一键估算后完整参数默认收起，关键假设用滑块调整
    expect((screen.getByText(/完整参数（进阶）/).closest("details") as HTMLDetailsElement).open).toBe(false);
    fireEvent.change(screen.getByRole("slider", { name: "折现率" }), { target: { value: "12" } });
    expect((screen.getByLabelText("期望折现率 (%)") as HTMLInputElement).value).toBe("12");
    fill("五年成长率 (%)", "3");
    expect(screen.getByText(/已手动修改（自动值 11）/)).toBeTruthy();
    const growthField = screen.getByLabelText("五年成长率 (%)").closest(".dcf-field") as HTMLElement;
    fireEvent.click(within(growthField).getByRole("button", { name: "恢复" }));
    expect((screen.getByLabelText("五年成长率 (%)") as HTMLInputElement).value).toBe("11");
  });
});
