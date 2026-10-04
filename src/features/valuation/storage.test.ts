import { it, expect, vi } from "vitest";
import { loadReports, saveReport, exportReport, importReport } from "./storage";
it("ignores unknown report versions without crashing", () => {
  localStorage.setItem(
    "businessweb.valuation.v1",
    JSON.stringify([{ schemaVersion: 99 }]),
  );
  expect(loadReports()).toEqual([]);
  localStorage.clear();
});
it("reports storage errors instead of claiming a save succeeded", () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("full");
  });
  expect(saveReport({ schemaVersion: 1 } as never).ok).toBe(false);
  vi.restoreAllMocks();
});

import fixture from "./report.fixture.json";
it("rejects malformed nested analysis and DCF in imported reports", () => {
  const valid = importReport(JSON.stringify(fixture));
  expect(valid.snapshot.security.code).toBe("AAPL");
  const badAnalysis = structuredClone(fixture);
  (badAnalysis.assumptions as unknown as { analysis: unknown[] }).analysis = [
    {},
  ];
  expect(() => importReport(JSON.stringify(badAnalysis))).toThrow(/报告格式/);
  const badDcf = structuredClone(fixture);
  (badDcf.assumptions.scenarios.base as unknown as { dcf: unknown }).dcf = {};
  expect(() => importReport(JSON.stringify(badDcf))).toThrow(/报告格式/);
});
