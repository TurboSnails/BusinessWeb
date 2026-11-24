# 验证报告：upgrade-market-radar

日期：2026-11-24。Verifier：Orchestrator（Claude），与四位 Implementer（Cursor）不同。本仓库没有 PR 门禁与 staging，以下均为本地结果；线上 CI（Pages 构建）要到推送后才有，推送等用户确认。

## 质量门禁（本地，最后一次改动之后重跑）

| 门禁 | 命令 | 结果 |
|---|---|---|
| 类型检查 | `npm run typecheck` | 退出码 0 |
| lint | `npm run lint` | 0 错误，26 条警告（均为既有文件，雷达相关文件 0 条） |
| 页面测试 | `npm run test` | 387 个文件、3,132 个用例全部通过 |
| 脚本测试 | `npm run test:scripts` | 1,044 个用例全部通过 |
| 构建 | `npx vite build --outDir <临时目录>` | 成功（未跑 `npm run build`，它的 prebuild 会改写 `public/changelog.json`） |
| 规范校验 | `openspec validate upgrade-market-radar` | 通过 |

没有跳过的测试。

## 独立复算（非实现者）

- 盈利取数时点修正：用新管线空跑，与修正前的线上数据逐月比对——646 个月里 35 个月雷达档位不同；全样本夏普 0.5855 → 0.5908，最大回撤不变。与实现者报告的数字一致，与审计的独立实现（34 个月、0.591）基本一致。
- 九项计分指标今天的打分与修正前完全相同（baaChange 0、pe −1、erp 0、equityShare −1、cashShare −1、finraDebtYoy 0、breadth 0、volume 0、epsYoy +1）；档位中性、冷热偏热不变。
- 月末收盘口径：全程持有夏普 0.479、雷达 0.522、十个月均线 0.535，与审计参考值一致。
- 综合策略页：仓位指令与标题逐字不变；融合规则仍无一采用；646 个月里 15 个月的热度分类变化，当前一格的历史月数 122 → 124。

## 浏览器验收（Playwright + Chrome，本地预览，真实数据）

脚本逐项操作并断言，1440 与 390 两种宽度各 17 项，共 34 项，33 项通过：

- 通过：无横向溢出；默认核心视图 26 行；总览点击「VIX 水平」后网址带 `ind=vix` 且只展开一项；历史图文字不小于 11px 且不出界；估值 · 全部 · 最热在前为 6 行，刷新后保持；无效网址参数被忽略；带 `ind=vvix`（非核心）打开会自动切到全部并展开；回测时段切换改变数字；披露默认收起；综合策略、宏观攻守、观察盘三页正常；控制台无报错。
- **未通过 1 项**：390 宽默认视图整页高度 9,009 像素，规范写的是不超过 9,000（改版前为 14,461）。差 9 像素，未再调整。

截图逐张看过（结论、总览、指标展开、筛选排序、回测、净值与回撤视图，两种宽度）。

## 与规范的差异

| 规范 | 情况 |
|---|---|
| 窄屏整页高度 ≤ 9,000 | 9,009，见上 |
| 深色主题 | 样式里写了深色变量，但验收脚本没能切到深色主题截图，**未验证** |
| 其余需求与场景 | 有对应测试或浏览器断言，无未解释差异 |

## 实现之外由 Orchestrator 直接改的小处

- `scripts/lib/market-radar/indicators.mjs`：家庭配置提示里的分数固定两位小数；18 项新指标的说明由内部文件名改成读者能看懂的定义与读法。
- `scripts/lib/combined-strategy/fusion.mjs`：披露末尾加一条盈利取数时点修正的说明。
- `src/features/market-radar/ForwardStats.tsx`：去掉「没有出现过」前多余的空格。
- `src/features/market-radar/IndicatorHistoryChart.tsx`：纵轴刻度取整数并只写数字（原来的「20.00 点」比图左边界多出 2 像素被裁）。

这四处没有经过第二人审查，改后都重跑了全量门禁。

## 未验证

- 2026 年各读数与来源原始值的逐项核对（审计没有联网；新接的四个来源由执行者当天实际拉取）。
- 本机抓不到 Multpl 盈利与席勒快照之外的最新价格、收益率（`fetch failed`，沿用缓存）；GitHub Actions 上的首次运行结果要推送后才能看到。
- 触屏手势、深色主题、Safari。

## 发布（2026-11-24，用户确认后）

- 提交 `bb30b471` 推送到 main。
- Vercel：提交状态 success；用 Chrome 打开 `https://business-web-black.vercel.app/invest/market-radar`，1440 与 390 两种宽度均返回 200，页面显示「55 项指标：50 项最新 · 1 项停更 · 4 项零星」、总览区存在、默认 26 行、回测结论句为新措辞，无横向溢出、无控制台报错。
- GitHub Pages：构建 45443084416 成功；`https://turbosnails.github.io/BusinessWeb/invest/market-radar` 在两种宽度下同样返回 200，内容与 Vercel 一致，无横向溢出、无控制台报错。
- 回滚：`git revert bb30b471` 后重跑 `node scripts/market-radar.mjs` 并推送。
