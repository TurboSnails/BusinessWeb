# 任务

Orchestrator（Claude 主会话）实现；Reviewer 为独立子 agent；Verifier 以命令输出为准。

## 1. 数据（owner：`scripts/lib/market-radar/backtest.mjs`、`indicators.mjs`、`scripts/market-radar-backtest.test.mjs`、`scripts/market-radar.test.mjs`）

- [x] 1.1 分组统计加 `before2000`、`episodes`、`independent`
- [x] 1.2 `predictive`（r 与 Newey-West t）
- [x] 1.3 时间线加 `heatScore`；headline 去掉综合分与档位
- [x] 1.4 测试；重新生成 `public/data/market-radar.json`
- 验收：`npm run test:scripts`、`node scripts/market-radar.mjs`

## 2. 页面（owner：`src/features/market-radar/`）

- [x] 2.1 `types.ts`、fixture
- [x] 2.2 `ConclusionPanel`：去综合分块，加冷热走势
- [x] 2.3 `ForwardStats`：冷热两段表 + 规则句；档位表移入折叠
- [x] 2.4 `BacktestPanel`：「历史检验」+ 折叠区
- [x] 2.5 组件测试
- 验收：`npx vitest run src/features/market-radar`、`npm run lint`、`npm run build`、390 宽无横向溢出

## 3. 收尾

- [x] 3.1 独立 Reviewer 审查
- [x] 3.2 研究文档补记；规范 delta

## 验证记录

- `npm run test:scripts`：1047 通过，0 失败
- `npx vitest run src/features/market-radar src/pages/MarketRadar.test.tsx src/pages/CombinedStrategy.test.tsx src/data/siteMap.test.ts`：全部通过
- `npx tsc --noEmit -p .`、`npx eslint`（改动范围）：无报错
- `npm run build`：通过
- 浏览器（ego-browser，本地预览）：1440 宽结论区不出现综合分和档位字样，折叠区默认收起；390 宽 `scrollWidth` = 390，默认页面高 6702 像素
- 重新生成的 `public/data/market-radar.json`：除新增字段和策略改名外，与改动前逐字段一致
- 本机 Node v26 下全量 vitest 有约 350 条与本次无关的 localStorage 失败（CI 用 Node 24），不在本次范围内
- 独立 Reviewer：必须修 1 条（数据在改名前生成，已重新生成），建议 7 条，采纳 2、3、4、6、7；5 已有覆盖；8 不在范围内
