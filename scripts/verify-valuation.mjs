import { collectSnapshot } from "../server/valuation/data/index.mjs";
import { analyzeSnapshot } from "../server/valuation/analysis/index.mjs";
import { calculateReport } from "../src/features/valuation/index.ts";
import { writeFile } from "node:fs/promises";
const args = process.argv.slice(2),
  get = (name, fallback) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] || fallback : fallback;
  };
const backend = get("--backend", "codex"),
  modelId = get("--model", "default"),
  [market, code] = get("--company", "us:AAPL").split(":");
const signal = AbortSignal.timeout(240000);
console.log(`真实验证 ${market}:${code} / ${backend} / ${modelId}`);
const snapshot = await collectSnapshot({ market, code }, { signal });
console.log("已取得字段：" + Object.keys(snapshot.facts).join(", "));
const { assumptions, execution } = await analyzeSnapshot(snapshot, {
  backend,
  modelId,
  signal,
  onEvent: () => {},
});
const report = calculateReport(snapshot, assumptions, {
  backend,
  requestedModelId: modelId,
  resolvedModelId: execution.resolvedModelId,
  cliVersion: execution.cliVersion,
});
await writeFile(
  `/private/tmp/valuation-report-${code}.json`,
  JSON.stringify(report, null, 2),
);
console.log(
  JSON.stringify(
    {
      company: code,
      requestedModelId: modelId,
      resolvedModelId: execution.resolvedModelId,
      methods: Object.fromEntries(
        Object.entries(report.results.base).map(([method, r]) => [
          method,
          { status: r.status, price: r.price },
        ]),
      ),
      missing: snapshot.missing,
    },
    null,
    2,
  ),
);
