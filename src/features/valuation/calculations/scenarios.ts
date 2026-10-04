import type {
  FinancialSnapshot,
  ValuationAssumptions,
  ValuationReport,
  MethodResult,
} from "../types.ts";
import { SCENARIOS, METHODS } from "../types.ts";
import { calculateMultiple } from "./multiples.ts";
import { calculateDcf } from "./dcf.ts";
export function calculateReport(
  snapshot: FinancialSnapshot,
  assumptions: ValuationAssumptions,
  execution: Pick<
    ValuationReport,
    "backend" | "requestedModelId" | "resolvedModelId" | "cliVersion"
  >,
): ValuationReport {
  const results = {} as ValuationReport["results"];
  const currencies = new Set(
    Object.values(snapshot.facts)
      .filter((f) => f.unit !== "shares" && f.value != null && f.currency)
      .map((f) => f.currency),
  );
  const fxMissing = [...currencies].some(
    (c) =>
      c !== snapshot.security.quoteCurrency &&
      snapshot.facts["fx_" + c]?.value == null,
  );
  for (const key of SCENARIOS) {
    const s = assumptions.scenarios[key];
    results[key] = {} as Record<(typeof METHODS)[number], MethodResult>;
    for (const method of METHODS) {
      let result: MethodResult;
      if (!assumptions.methodSuitability[method].applicable)
        result = {
          status: "notApplicable",
          price: null,
          reason: assumptions.methodSuitability[method].reason,
        };
      else if (fxMissing)
        result = {
          status: "missingData",
          price: null,
          reason: "缺少跨币种汇率，无法计算每股价格",
        };
      else if (method === "dcf" || method === "multistage") {
        const d = s[method];
        result = d
          ? method === "multistage" &&
            (!d.projections || d.projections.length < 5 || !d.financingNote)
            ? {
                status: "missingData",
                price: null,
                reason:
                  "多阶段模型需5–15年收入/利润率/再投资路径及融资稀释说明",
              }
            : calculateDcf(d)
          : {
              status: "missingData",
              price: null,
              reason: "缺少现金流预测或股权价值桥接",
            };
      } else
        result = calculateMultiple({
          method,
          metric:
            method === "ps" ? s.revenue : method === "pb" ? s.bvps : s.eps,
          multiple: s[method],
          growth: s.growth,
          shares: s.shares,
          years: Math.max(0, s.year - Number(snapshot.asOf.slice(0, 4))),
          requiredReturn: s.requiredReturn,
        });
      results[key][method] = result;
    }
  }
  return {
    schemaVersion: 1,
    snapshot,
    assumptions,
    results,
    ...execution,
    createdAt: new Date().toISOString(),
  };
}
