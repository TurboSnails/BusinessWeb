# 任务

执行者经 dev-team（Orca）派出；Reviewer 与 Verifier 由 Orchestrator（Claude）担任，与 Implementer 不同。共用一个检出（main），各任务文件不重叠；不切分支、不 stash、不 `git add -A`、不提交。

## 0. 契约（Orchestrator）

- [x] 0.1 写定 `src/features/market-radar/types.ts`（层：契约；验收：数据侧与页面侧任务卡都引用它）

## 1. 数据：指标（层：scripts；owner：`scripts/lib/market-radar/indicators.mjs`、`sources.mjs`、`scripts/market-radar.mjs`、`scripts/market-radar.test.mjs`、`data-raw/market-radar/`）

- [x] 1.1 tracer bullet：`--dry-run`；为现有 37 项输出全部新字段（design 1.1–1.7）；`current.counts`、`drivers`、`caveats`
- [x] 1.2 口径修正 A1、A2、A3、B4、B5、C1、C2、C3（design 第 3 节）；A1 前后对比数字写进回执
- [x] 1.3 新增 18 项指标与 4 个外部来源（design 第 2 节）；更新 `data-raw/market-radar/SOURCES.md`
- 验收：`node --test scripts/market-radar.test.mjs`、`npm run test:scripts`、`npm run lint -- scripts/lib/market-radar scripts/market-radar.mjs`、`node scripts/market-radar.mjs --dry-run`

## 2. 数据：回测（层：scripts；owner：`scripts/lib/market-radar/backtest.mjs`、新增 `scripts/market-radar-backtest.test.mjs`；blocked-by：无，与 1 并行）

- [x] 2.1 `timeline` 的 score / dims、`curves`、`tierStats`、`heatStats`
- [x] 2.2 `monthEndRows`、`sharpeGaps`（固定种子）、按区间措辞的 `verdict`
- [x] 2.3 披露补充（design 第 4 节末）
- 验收：`node --test scripts/market-radar-backtest.test.mjs scripts/market-radar.test.mjs`、`npm run lint -- scripts/lib/market-radar`

## 3. 页面：结论、总览、指标（层：web；owner：`src/features/market-radar/` 下除 types.ts、BacktestPanel*、EquityCurves*、ForwardStats*、backtest-panel.css 以外的文件，`src/styles/market-radar.css`，`src/pages/MarketRadar*.tsx`）

- [x] 3.1 `fixture.ts` 按新契约更新；`load.ts` 校验
- [x] 3.2 结论区（雷达图、驱动项、新鲜度、口径提示、综合分走势）
- [x] 3.3 总览区
- [x] 3.4 指标区（工具条、网址状态、对齐表格、展开面板与历史图、窄屏）
- 验收：`npx vitest run src/features/market-radar src/pages/MarketRadar.test.tsx`、`npm run typecheck`、`npm run lint -- src/features/market-radar src/pages`、`npm run test`（全量）

## 4. 页面：回测区（层：web；owner：`src/features/market-radar/BacktestPanel*.tsx`、新增 `EquityCurves*.tsx`、`ForwardStats*.tsx`、`backtest-panel.css`；blocked-by：3.1 的 fixture 回测部分由本任务自带的测试夹具解决，不改 fixture.ts）

- [x] 4.1 时段切换与指标表、稳健性小表
- [x] 4.2 净值曲线与回撤视图
- [x] 4.3 分组表现、披露收起
- 验收：`npx vitest run src/features/market-radar/BacktestPanel.test.tsx src/features/market-radar/EquityCurves.test.tsx src/features/market-radar/ForwardStats.test.tsx`、`npm run typecheck`

## 5. 集成与门禁（Orchestrator）

- [x] 5.1 逐任务审查真实 diff（Standards 轴 + Spec 轴）；独立复算 A1 的夏普与档位变化月数
- [x] 5.2 `node scripts/market-radar.mjs` 重新生成两份数据；核对体积、九项计分不变、综合策略页仍可用
- [x] 5.3 全量门禁：typecheck、lint、test、test:scripts、build
- [x] 5.4 浏览器验收：1440 与 390 两种宽度，逐项操作筛选、排序、展开、总览跳转、时段切换、净值曲线；截图逐张看
- [x] 5.5 写 `verification.md`，向用户汇报
- [ ] 5.6 用户确认后提交、推送、线上验收、归档
