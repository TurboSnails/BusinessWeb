import type { ValuationReport } from "./types.ts";
import { METHODS, SCENARIOS } from "./types.ts";
import { validateSnapshot } from "./validation.ts";
const KEY = "businessweb.valuation.v1";
export function isReport(value: unknown): value is ValuationReport {
  const v = value as ValuationReport;
  if (
    !v ||
    v.schemaVersion !== 1 ||
    !v.snapshot ||
    !validateSnapshot(v.snapshot).ok ||
    !v.assumptions?.security ||
    !v.results ||
    !v.assumptions.methodSuitability ||
    !Array.isArray(v.assumptions.analysis) ||
    !v.createdAt ||
    !v.backend ||
    !v.requestedModelId
  )
    return false;
  return SCENARIOS.every((k) => {
    const s = v.assumptions.scenarios?.[k];
    return (
      s &&
      typeof s.rationale === "string" &&
      Array.isArray(s.sourceIds) &&
      Number.isInteger(s.year) &&
      Number.isFinite(s.requiredReturn) &&
      [
        "eps",
        "revenue",
        "bvps",
        "shares",
        "growth",
        "pe",
        "peg",
        "ps",
        "pb",
      ].every((f) => {
        const n = s[f as keyof typeof s];
        return n === null || (typeof n === "number" && Number.isFinite(n));
      }) &&
      METHODS.every(
        (m) =>
          v.results[k]?.[m] &&
          typeof v.results[k][m].reason === "string" &&
          v.assumptions.methodSuitability[m] &&
          typeof v.assumptions.methodSuitability[m].reason === "string",
      )
    );
  });
}
export function loadReports(): ValuationReport[] {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(value) ? value.filter(isReport) : [];
  } catch {
    return [];
  }
}
export function saveReport(report: ValuationReport): {
  ok: boolean;
  error?: string;
} {
  try {
    if (!isReport(report)) throw new Error("报告结构无效");
    localStorage.setItem(
      KEY,
      JSON.stringify(
        [
          report,
          ...loadReports().filter((r) => r.createdAt !== report.createdAt),
        ].slice(0, 20),
      ),
    );
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: "报告未保存：存储不可用或报告格式无效，仍可导出当前结果",
    };
  }
}
export function importReport(text: string): ValuationReport {
  const value = JSON.parse(text);
  if (!isReport(value)) throw new Error("报告格式或版本不支持");
  return value;
}
export function exportReport(
  report: ValuationReport,
  format: "json" | "markdown",
): string {
  if (format === "json") return JSON.stringify(report, null, 2);
  return [
    `# ${report.snapshot.security.name} 估值报告`,
    `${report.snapshot.security.code} · ${report.snapshot.asOf} · ${report.snapshot.security.quoteCurrency}`,
    `CLI: ${report.backend} ${report.cliVersion}；模型: ${report.requestedModelId}；实际返回: ${report.resolvedModelId || "未提供"}`,
    `## 估值情景`,
    ...SCENARIOS.flatMap((k) => [
      `### ${k}`,
      report.assumptions.scenarios[k].rationale,
      ...METHODS.map(
        (m) =>
          `${m}: ${report.results[k][m].price ?? "不可计算"}；${report.results[k][m].reason}`,
      ),
    ]),
    `## 分析`,
    ...report.assumptions.analysis.map(
      (a) =>
        `${a.dimension}: ${a.conclusion}\n依据：${a.evidence.join("；")}\n证伪：${a.falsification}`,
    ),
    `## 数据缺口`,
    ...report.snapshot.missing,
    `## 来源`,
    ...report.snapshot.sources.map((s) => `- ${s.title}: ${s.url}`),
    `## 完整假设`,
    `\`\`\`json`,
    JSON.stringify(report.assumptions, null, 2),
    `\`\`\``,
  ].join("\n\n");
}
