#!/usr/bin/env node
// 命令行估值：直接调用本机 CLI/pi，不需要浏览器、端口或 token。
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { execute } from "../server/valuation/jobs.mjs";
import { discoverBackends } from "../server/valuation/cli/registry.mjs";
import { listModels } from "../server/valuation/models/index.mjs";
import {
  searchCompanies,
  validateSecurity,
} from "../server/valuation/data/identity.mjs";
import { exportReport } from "../src/features/valuation/storage.ts";

const usage = `用法：
  npm run valuation -- <公司名或代码> [--cli pi|codex|claude|opencode] [--model <模型ID>] [--out <目录>]
  npm run valuation -- --list [--cli <名称>]      列出本机可用 CLI 与模型
示例：
  npm run valuation -- 腾讯 --cli claude --model claude-opus-5-5
  npm run valuation -- AAPL --cli pi --model anthropic/claude-opus-5-5`;
function parse(argv) {
  const opts = {
    cli: "",
    model: "default",
    out: "valuation-reports",
    list: false,
    query: "",
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--list") opts.list = true;
    else if (a === "--cli") opts.cli = argv[++i] || "";
    else if (a === "--model") opts.model = argv[++i] || "";
    else if (a === "--out") opts.out = argv[++i] || "";
    else if (a === "-h" || a === "--help") opts.help = true;
    else if (a.startsWith("--")) throw new Error("未知参数：" + a);
    else opts.query += (opts.query ? " " : "") + a;
  }
  return opts;
}
async function resolveSecurity(query) {
  const hits = await searchCompanies(query);
  if (!hits.length)
    throw new Error(
      `未找到公司“${query}”，请改用代码，例如 00700、600519、AAPL`,
    );
  const exact = hits.filter(
    (h) => h.code.toUpperCase() === query.toUpperCase() || h.name === query,
  );
  const pick =
    exact.length === 1 ? exact[0] : hits.length === 1 ? hits[0] : null;
  if (!pick)
    throw new Error(
      "匹配到多家公司，请用代码指定：\n" +
        hits.map((h) => `  ${h.code}  ${h.name}  (${h.market})`).join("\n"),
    );
  return validateSecurity(pick);
}
async function main() {
  const opts = parse(process.argv.slice(2));
  if (opts.help || (!opts.query && !opts.list)) return console.log(usage);
  const backends = await discoverBackends();
  if (opts.list) {
    for (const b of backends) {
      console.log(
        `${b.id}\t${b.installed ? "已安装 " + b.cliVersion : "未安装"}`,
      );
      if (b.installed && (!opts.cli || opts.cli === b.id))
        try {
          for (const m of await listModels(b.id))
            console.log(`  ${m.modelId}\t${m.displayName}`);
        } catch (e) {
          console.log("  （无法列出模型：" + e.message + "）");
        }
    }
    return;
  }
  const installed = backends.filter((b) => b.installed).map((b) => b.id);
  const cli =
    opts.cli || installed.find((id) => id === "claude") || installed[0];
  if (!installed.includes(cli))
    throw new Error(`CLI“${cli}”不可用。可用：${installed.join("、") || "无"}`);
  const security = await resolveSecurity(opts.query);
  console.log(
    `公司：${security.name} ${security.code} (${security.market})；CLI：${cli}；模型：${opts.model}`,
  );
  const controller = new AbortController();
  process.on("SIGINT", () => controller.abort());
  const stages = {
    collecting: "采集行情与财报",
    analyzing: "模型分析（可能需要数分钟）",
    calculating: "复算估值",
  };
  const report = await execute(
    { security, backend: cli, modelId: opts.model },
    {
      signal: controller.signal,
      emit: (type, payload) => {
        if (stages[type])
          console.log(`[${new Date().toLocaleTimeString()}] ${stages[type]}…`);
        if (type === "activity" && payload?.message)
          console.log("  " + payload.message);
      },
    },
  );
  const dir = resolve(opts.out);
  await mkdir(dir, { recursive: true });
  const base = join(dir, `${security.code}-${report.snapshot.asOf}`);
  await writeFile(base + ".md", exportReport(report, "markdown"));
  await writeFile(base + ".json", exportReport(report, "json"));
  console.log(`\n完成。报告已保存：\n  ${base}.md\n  ${base}.json`);
  console.log("本报告仅供研究参考，不构成个人投资建议。");
}
// pi 运行时可能保留后台句柄，完成后显式退出
main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("失败：" + e.message);
    process.exit(1);
  });
