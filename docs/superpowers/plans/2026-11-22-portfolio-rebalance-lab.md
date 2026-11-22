# 组合再平衡回测页 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `/lab/portfolio-rebalance` 提供组合再平衡回测页：选股票、填权重、选规则（含大跌切换），对比不动 / 动态平衡 / 等权 / 纳指 100，价格数据由定时工作流从 Yahoo 采集并存进仓库。

**Architecture:** 数据管道（Python yfinance 采集 + Node 交叉核对与写文件 + GitHub Actions）产出 `public/data/portfolio-prices/*.json`；纯函数 TypeScript 引擎 `src/features/portfolio-rebalance/engine.ts` 做全部计算；页面只负责输入、加载数据、调用引擎和展示。三者通过本计划定义的数据格式与函数签名解耦，可并行开发。

**Tech Stack:** React 18、TypeScript、Vite、Vitest、Node 24（`node --test`）、Python 3.12 + yfinance 1.8.0（经 `uv run`）、GitHub Actions。

**Spec:** `docs/superpowers/specs/2026-11-21-portfolio-rebalance-lab-design.md`

## Global Constraints

- 不新增 npm 依赖；图表用已有的 `lightweight-charts` 或 SVG。
- 页面根节点用 `<Page>`，一个 `<main>`、一个 h1；文字不小于 12px（图表内文字除外）；控件高度不低于 32px，`pointer: coarse` 下不低于 44px；单选 / 复选框保持原大小，可点区域由整行 label 承担。
- 涨跌色按美股口径：涨 `--system-green`、跌 `--system-red`；折溢价、风险状态不用涨跌色。
- 不新增 `style={{}}` 布局内联样式与色板外硬编码颜色（`src/styles/inlineStyleRatchet.test.ts`）。
- 执行规则：第 t 日收盘判断、第 t+1 日收盘成交；成本 = 单边换手 × 成本率，单边换手 = ½ Σ|成交后权重 − 成交前权重|；全部调回目标权重；年化按日历天数 ÷ 365.25；CER = 252 × (日均收益 − 1.5 × 日收益总体方差)。
- 数据只来自 Yahoo（yfinance 1.8.0，在 GitHub Actions 上运行）与腾讯（交叉核对）；不使用 Nasdaq。
- 页面不高亮"最佳"规则、不给推荐；常驻"组合是事后选的""未做显著性检验""不要按回测最高值挑规则""不构成投资建议"。
- 默认方案：AVGO、META、CB 各 25%，SOFI、RKLB 各 12.5%，相对偏离 40%，大跌切换关闭，起点为所选代码共同最早日，成本 0.10%，初始 1,000,000 美元。开启大跌切换时的默认参数：稳定资产为组合里第一只"稳定"分组的代码（默认方案为 CB），进入 −20%，档距 5 个百分点，每步 25%，恢复 −5%，累计卖出上限 50%，超时恢复关闭（依据 2026-11-22 长期压力测试：上限 50% 使回撤接近普通再平衡，18 个月超时结果最差）。
- 文案中文，面向投资人，不出现文件路径、环境变量名、内部字段名。

## Review Focus

1. 权重合计不等于 100%、某只权重为 0、同一代码选了两次：页面禁止计算并就地提示；引擎对非法输入抛出带中文信息的错误。（Task 2、Task 3 测试覆盖）
2. 起点早于某只股票上市日：引擎自动改为共同起点，结果里 `startAdjusted: true` 并给出实际起点，页面显示说明。（Task 2）
3. 所选股票数据过期（`status: "stale"`）或缺分红（`dividendStatus: "missing"`）：页面逐只列出提示，计算照常进行。（Task 3）
4. 开启大跌切换但稳定资产不在组合里，或信号指数（QQQ）缺某些交易日：引擎报错或按共同交易日对齐，不得静默跳过。（Task 2）
5. 网址参数里有未知代码、非数字、负数：页面回退到默认方案并提示"链接中的部分设置无效，已恢复默认"，不崩溃。（Task 3）

---

### Task 1: 价格数据管道（Yahoo 采集、腾讯核对、定时工作流）

**Files:**
- Create: `scripts/portfolio-prices/universe.json`
- Create: `scripts/portfolio-prices-yf.py`
- Create: `scripts/portfolio-prices.mjs`
- Create: `scripts/portfolio-prices.test.mjs`
- Create: `.github/workflows/portfolio-prices.yml`
- Modify: `docs/data-maintenance.md`（末尾新增一节）
- Modify: `scripts/data-freshness-check.mjs`（新增一项：`public/data/portfolio-prices/index.json` 的 `asOf`，5 个自然日内算新鲜）

**Interfaces:**
- Produces（供 Task 3 读取）：
  - `public/data/portfolio-prices/index.json`：`{ schemaVersion: 1, generatedAt: string, items: Array<{ symbol: string; name: string; group: 'growth'|'highVol'|'stable'|'benchmark'; first: string; last: string; asOf: string; status: 'ok'|'stale'; statusNote?: string; dividendStatus: 'ok'|'missing'|'none' }> }`
  - `public/data/portfolio-prices/<SYMBOL>.json`：`{ schemaVersion: 1, symbol, name, currency: 'USD', asOf, fetchedAt, source: { prices: string; crossCheck: string }, status, dividendStatus, splits: Array<[string, number]>, dates: string[], adjClose: number[] }`，`dates` 升序 `YYYY-MM-DD`，`adjClose` 为 Yahoo 复权收盘价（含拆股与分红），保留 6 位有效小数。
- `universe.json` 每项：`{ symbol, name, group, tencent: string /* 如 "usAVGO.OQ" */, validFrom?: string }`，首批 23 个代码见 spec 5.1；RKLB `validFrom: "2021-08-25"`，SOFI `validFrom: "2021-06-01"`。

- [ ] **Step 1: 写失败的测试** `scripts/portfolio-prices.test.mjs`，被测函数从 `scripts/portfolio-prices.mjs` 导出：
  - `test('crossCheck 通过：最近 2 年日期一致且收盘差异 ≤0.5%')` → `crossCheck(yahooRows, tencentRows)` 返回 `{ ok: true, mismatches: 0 }`。
  - `test('crossCheck 失败：某日差 1%')` → `{ ok: false }`，`mismatches >= 1`。
  - `test('buildSeries 按 validFrom 截断并升序')` → `buildSeries(rows, { validFrom: '2021-08-25' }).dates[0] === '2021-08-25'`。
  - `test('单日复权收益超过 ±50% 且不在 knownEvents 中则标记 stale')` → `assessSeries(series, knownEvents=[])` 返回 `{ status: 'stale' }`。
  - `test('核对失败的代码保留上次文件，index 标 stale 并写原因')` → `mergeIndex(prevIndex, results)` 中该项 `status === 'stale'` 且 `statusNote` 含"交叉核对"。
  - `test('分红：历史有分红但本次未返回 → missing；从未分红 → none')`。

- [ ] **Step 2: 运行确认失败** — `node --test scripts/portfolio-prices.test.mjs`，期望全部 FAIL（函数未定义）。

- [ ] **Step 3: 实现**
  - `scripts/portfolio-prices-yf.py`：读 stdin 的 `{ "symbols": [...], "start": "2010-01-01" }`，对每个代码用 `yf.Ticker(s).history(start=..., auto_adjust=False, actions=True)` 输出 `{ symbol: { rows: [[date, close, adjClose]], dividends: [[date, amount]], splits: [[date, ratio]], error } }` 到 stdout；代码间至少间隔 0.35 秒；单个失败不中断。文件头注释写调用方式（参照 `scripts/earnings-calendar-yf.py`）。
  - `scripts/portfolio-prices.mjs`：导出 `crossCheck`、`buildSeries`、`assessSeries`、`mergeIndex`；`main()` 调用 `uv run --python 3.12 --with yfinance==1.8.0 python scripts/portfolio-prices-yf.py`（可用 `PORTFOLIO_YF_CMD` 覆盖，方便测试），分段请求腾讯（每段 ≤2000 条）做核对，写数据文件与 `index.json`；任一代码失败最终 `process.exitCode = 1`。
  - `.github/workflows/portfolio-prices.yml`：结构照搬 `.github/workflows/earnings-calendar.yml`（checkout、setup-node 24、setup-uv、`npm ci`、运行、有变更才提交、推送重试 3 次），`schedule: cron '45 22 * * 1-5'` 加 `workflow_dispatch`，提交信息 `data(portfolio-prices): 更新组合回测价格 <北京日期>`，只 `git add public/data/portfolio-prices/`。
  - `docs/data-maintenance.md`：新增"组合再平衡回测价格 portfolio-prices"一节：来源、口径（复权含分红）、交叉核对规则、失败处理、如何新增代码（改 `universe.json` 后手动触发工作流）。

- [ ] **Step 4: 运行测试** — `node --test scripts/portfolio-prices.test.mjs` 全部 PASS；`npm run test:scripts` 全部 PASS。

- [ ] **Step 5: 用假命令跑一次 main** — `PORTFOLIO_YF_CMD="node scripts/fixtures/fake-yf.mjs" node scripts/portfolio-prices.mjs --out /tmp/pp-test`（假数据脚本放 `scripts/fixtures/` 下，3 个代码），检查输出目录有 `index.json` 和 3 个代码文件、格式符合 Interfaces。本机对 Yahoo 限流，不要对真实 Yahoo 发请求。

- [ ] **Step 6: Commit**

```bash
git add scripts/portfolio-prices* scripts/fixtures .github/workflows/portfolio-prices.yml docs/data-maintenance.md scripts/data-freshness-check.mjs
git commit -m "feat(data): 组合回测价格采集（Yahoo 复权价，腾讯交叉核对）"
```

---

### Task 2: 回测引擎

**Files:**
- Create: `src/features/portfolio-rebalance/types.ts`
- Create: `src/features/portfolio-rebalance/engine.ts`
- Create: `src/features/portfolio-rebalance/engine.test.ts`
- Create: `src/features/portfolio-rebalance/fixtures.ts`（从 `data-raw/portfolio-explore/prices-adjusted.json` 读取并转成 `PriceBook`，仅测试用）

**Interfaces:**
- Produces（Task 3 使用）：

```ts
export type Series = { dates: string[]; adjClose: number[] }          // 升序
export type PriceBook = Record<string, Series>
export type Rule =
  | { kind: 'buyHold' }
  | { kind: 'relative'; pct: number }        // 0.40 = 目标 ×(1±40%)
  | { kind: 'absolute'; points: number }     // 0.10 = 目标 ±10 个百分点
  | { kind: 'calendar'; every: 'month' | 'quarter' | 'year' }  // 期末最后一个交易日决定
export type SwitchRule = {
  stable: string; entry: number; gap: number; step: number
  recover: number | 'newHigh'; cap?: number; timeoutMonths?: number
}
export type RunInput = {
  symbols: string[]; weights: number[]; rule: Rule; switch?: SwitchRule
  start?: string; end?: string; cost: number; initial: number; signal?: string // 默认 'QQQ'
}
export type Trade = {
  date: string; reason: 'band' | 'calendar' | 'switchStep' | 'switchRecover' | 'switchTimeout'
  trigger?: { symbol: string; weight: number }; amounts: Record<string, number> // 正为买入金额，负为卖出
}
export type Episode = { enter: string; steps: number; recover: string | null } // enter / recover 为信号日（判断日），成交在下一交易日
export type Distance = { symbol: string; weight: number; lower: number; upper: number; riseToUpper: number; fallToLower: number }
export type RunResult = {
  start: string; end: string; startAdjusted: boolean; dates: string[]; equity: number[]
  final: number; finalAmount: number; cagr: number; vol: number
  maxDrawdown: { value: number; peak: string; trough: string }; cer: number
  trades: Trade[]; tradeCount: number; annualTurnover: number; totalCost: number
  finalWeights: Record<string, number>; yearly: { year: number; ret: number }[]
  distance: Distance[]; episodes: Episode[]
}
export function runBacktest(book: PriceBook, input: RunInput): RunResult
export function equalWeightInput(input: RunInput): RunInput   // 相对偏离、绝对偏离都原样沿用（平均目标权重不变）
export function leaveOneOutInputs(input: RunInput): { dropped: string; input: RunInput }[] // 剔除者权重按比例分给其余；绝对偏离点数乘以 1/(1−剔除者权重)
export function compareSet(book: PriceBook, input: RunInput): {
  custom: { hold: RunResult; active: RunResult }
  equal: { hold: RunResult; active: RunResult }
  benchmarks: Record<'QQQ' | 'QQEW', RunResult | null>
  leaveOneOut: { dropped: string; hold: RunResult; active: RunResult }[]
}
```

- 大跌切换算法见 spec 5.2；`distance` 中 `riseToUpper` / `fallToLower` 为"其余不动时该股需再涨 / 再跌多少"，公式 `g = b(1−w)/((1−b)w) − 1`（b 为边界、w 为当前权重）；`buyHold` 与 `calendar` 规则时 `distance` 为空数组。

- [ ] **Step 1: 写失败的测试** `engine.test.ts`（夹具为 `prices-adjusted.json`，`close` 当作 `adjClose`，成本 0.001，初始 1）：
  - `it('A1 买入持有')`：symbols AVGO、META、CB、SOFI、RKLB，weights [0.25,0.25,0.25,0.125,0.125]，start '2021-08-25'，end '2026-11-20' → `final.toFixed(4) === '3.1020'`，`tradeCount === 0`。
  - `it('A2 相对偏离 40%')` → `'3.6138'`，`tradeCount === 17`。
  - `it('大跌切换主设定')`：A2 加 `switch: { stable: 'CB', entry: 0.20, gap: 0.05, step: 0.25, recover: 0.05 }` → `'4.2821'`，`tradeCount === 21`，`maxDrawdown.value.toFixed(4) === '-0.4739'`，`episodes.map(e => e.enter)` 含 `'2022-03-14'` 与 `'2025-04-04'`。
  - `it('A3/A4 长窗口')`：AVGO、META、CB、TSLA、NVDA 同权重，start '2016-01-04' → 买入持有 `'29.7227'`；相对偏离 40% `'18.1600'`、`tradeCount === 16`。
  - `it('A5 QQQ')` → `'1.6234'`。
  - `it('起点早于上市日时自动调整')`：start '2015-01-02' 含 RKLB → `startAdjusted === true`，`start === '2021-08-25'`。
  - `it('非法输入抛错')`：权重合计 0.9、重复代码、切换稳定资产不在组合里 → 各自抛出含"权重合计""重复""稳定资产"的错误。
  - `it('剔除换算')`：五只各 20%、绝对偏离 0.05，`leaveOneOutInputs` 每项为四只各 25%、points 0.0625；`equalWeightInput` 对 25/25/25/12.5/12.5 返回五只各 0.2，points 不变。
  - `it('距离公式')`：权重 0.235、上界 0.35 → `riseToUpper` 约 0.75（±0.01）。

- [ ] **Step 2: 运行确认失败** — `npx vitest run src/features/portfolio-rebalance`，FAIL。

- [ ] **Step 3: 实现** `engine.ts`，算法与 `data-raw/portfolio-explore/anchor.py`、`data-raw/stock5-rebalance` 研究脚本一致；`compareSet` 中基准缺数据时为 `null`。

- [ ] **Step 4: 运行测试** — `npx vitest run src/features/portfolio-rebalance` 全部 PASS；`npm run typecheck` 通过。

- [ ] **Step 5: Commit**

```bash
git add src/features/portfolio-rebalance
git commit -m "feat(portfolio-rebalance): 回测引擎（再平衡、大跌切换、等权与剔除派生）"
```

---

### Task 3: 回测页面

**Files:**
- Create: `src/features/portfolio-rebalance/data.ts`（加载 index 与按需加载代码文件，返回 `PriceBook`）
- Create: `src/features/portfolio-rebalance/urlState.ts`（网址参数 ⇄ `RunInput`）
- Create: `src/features/portfolio-rebalance/components/`（输入区、四格对比、指标表、净值曲线、逐年收益、当前状态、逐一剔除、逐轮大跌、调仓记录）
- Create: `src/pages/PortfolioRebalanceLab.tsx`
- Create: `src/styles/portfolio-rebalance.css`
- Test: `src/features/portfolio-rebalance/urlState.test.ts`、`src/pages/PortfolioRebalanceLab.test.tsx`

**Interfaces:**
- Consumes：Task 2 的 `runBacktest`、`compareSet`、各类型；Task 1 的数据格式（开发时用 `fixtures.ts` 生成的 `PriceBook` 与一个手写的 `index.json` 夹具）。
- Produces：默认导出页面组件 `PortfolioRebalanceLab`（Task 4 挂路由）。
- `urlState.ts`：`encode(input: RunInput): URLSearchParams`、`decode(params: URLSearchParams, known: string[]): { input: RunInput; invalid: boolean }`。参数名：`s=AVGO:25,META:25`、`rule=relative:40|absolute:10|calendar:month|hold`、`sw=CB:20:5:25:5[:cap50][:t18]`（关闭时省略）、`from=YYYY-MM-DD`、`cost=0.1`、`init=1000000`。

- [ ] **Step 1: 写失败的测试**
  - `urlState.test.ts`：`it('往返一致')`（默认方案 encode 后 decode 相等）；`it('未知代码或非数字回退默认并标 invalid')`。
  - `PortfolioRebalanceLab.test.tsx`（mock `data.ts` 返回夹具）：`it('默认打开显示四格对比，含"不动""动态平衡""等权"与 QQQ')`；`it('权重合计 90% 时计算按钮禁用并提示"合计须为 100%"')`；`it('缺分红代码显示"只算价格涨跌，结果偏低"')`；`it('开启大跌切换后出现"逐轮大跌"表')`；`it('页面不出现"最佳""推荐"字样')`；`it('数据加载失败显示错误与"重试"按钮')`。

- [ ] **Step 2: 运行确认失败** — `npx vitest run src/features/portfolio-rebalance src/pages/PortfolioRebalanceLab`，FAIL。

- [ ] **Step 3: 实现页面**，布局按 spec 5.3；计算放在 `useMemo`，输入变化后点"计算"才运行；默认展示时自动计算一次。

- [ ] **Step 4: 运行测试与检查** — 上述测试 PASS；`npx vitest run src/styles` PASS；`npm run typecheck` 通过。

- [ ] **Step 5: 浏览器自测** — `npx vite --port 5241 --strictPort`，临时在本地挂一个路由或用 Task 4 合并后的路由，1440 与 390 宽截图；用 `.dev-team/runs/ui-investor-20261121/tools/audit.mjs` 检查 ovf=0、small=0、tiny=0、err=0。

- [ ] **Step 6: Commit**

```bash
git add src/features/portfolio-rebalance src/pages/PortfolioRebalanceLab* src/styles/portfolio-rebalance.css
git commit -m "feat(portfolio-rebalance): 组合再平衡回测页"
```

---

### Task 4: 集成（manager）

**Files:**
- Modify: `src/App.tsx`（`const PortfolioRebalanceLab = lazy(() => import('./pages/PortfolioRebalanceLab'))`，`<Route path="/lab/portfolio-rebalance" element={<PortfolioRebalanceLab />} />`）
- Modify: `src/data/siteMap.ts`（"实验观察"组加 `{ path: '/lab/portfolio-rebalance', label: '组合再平衡回测', short: '目标权重、偏离再平衡与大跌切换', desc: '选几只美股设目标权重，对比不动、动态平衡、等权与纳指 100；支持大跌时切换稳定股；历史回测，不是买卖指令' }`）
- Modify: `scripts/prerender-routes.mjs`（如该文件维护静态路由清单，加入新路由）

- [ ] **Step 1:** 合并 Task 1–3，挂路由与站点地图。
- [ ] **Step 2:** `npm test`、`npm run test:scripts`、`npm run typecheck`、`npm run lint`、`npm run build` 全部通过（build 后还原 prebuild 改写的生成文件）。
- [ ] **Step 3:** 推送 main 前先手动触发一次 `portfolio-prices` 工作流需要工作流文件已在默认分支：经用户确认后推送，`gh workflow run portfolio-prices.yml`，核对首批数据文件与 `index.json`，页面加载真实数据后在 1440 / 390 宽验收。
- [ ] **Step 4: Commit** `feat(lab): 上线组合再平衡回测页`
