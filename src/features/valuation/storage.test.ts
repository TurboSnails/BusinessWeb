import { it, expect, vi } from "vitest";
import { loadReports, saveReport, exportReport } from "./storage";
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
