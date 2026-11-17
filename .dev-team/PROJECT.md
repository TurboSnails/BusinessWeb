# 开发上下文

本项目是 React 18 / TypeScript / Vite 5 的 Web 项目；后端包含 server/、api/ 和 supabase/。依据：package.json 与目录布局。包管理器 npm，项目声明 Node 24。

前端入口 src/，后端候选范围在 config.json。现有检查：npm run typecheck、npm run test、npm run test:knowledge、npm run test:valuation-server；只运行与实际变更相关的检查。npm run build 带 prebuild，会生成 changelog/sitemap，执行前核对已有改动。

这里没有 Android 工程，android.paths/checks 留空；迁移到 Android 仓库后从其 Gradle 模块、variant 与 CI 重新发现，不能沿用本项目命令。SDK、模拟器、真机目前未验证。

manager 开工后按实际目标补充业务入口、API 契约位置、验收和发布方式。范围内可逆开发可执行，外部发布动作遵循用户已有授权。技能本身独立于本项目业务。

`.dev-team/config.json` 的 paths/checks 是探测候选，派工前按任务核对。既有 AGENTS.md/CLAUDE.md 仍是项目约束来源。本文件不存账号、密钥或剩余额度。

## 2026-10-17 牛熊周期自动化审查

业务入口 `/monitor?tab=market-cycle`，独立模块 `src/features/market-cycle/`；行情采集 `scripts/market-cycle-snapshot.mjs`，宏观与估值复用 `server/macro.mjs`、`server/indexes.mjs`。已发布观察版；估值、资金、宽度仍需补录。需求详见 `docs/requirements/2026-10-17-cn-hk-market-cycle.md`。当前用户指定Claude独立审查并提出尽量全自动方案；本轮不改生产代码或自动交易，不申请付费数据。近期全量1116测试、同步48测试通过；本任务不需要重复全量构建。

四执行器讨论已完成：Claude、Antigravity CLI1.4.0、Kimi2.2.0、OpenCode1.19.0/MiniMax-M3；7个任务（含事实纠偏/交叉讨论）结算。团队裁决位于 docs/reviews/2026-10-17-market-cycle-automation-team.md，P0-P3已加入docs/TODO-投资工具优化.md。OpenCode并发/性能/费用保证未采纳，正式报告已由manager整理；自动化仍为待实现方案。

## 自动化实施接续

用户已授权实施及提交推送发布。Run run_0a5816e1e4ef：manager负责共享契约、前端、自动周报与CI，Claude完成事实采集及校验修复；Kimi宽度轮次因扩大探测且未交付代码由manager主动停止，同Task通过retry-of交给Claude；Antigravity负责只读交叉审查。当前自动化实现说明 docs/market-cycle-automation.md。自动观察与交易执行分开，尚无策略回测或自动下单。

## 2026-10-20 综合估值方法论
用户授权Codex与Claude讨论四维估值框架并纳入项目。正式裁决 docs/investment-valuation-framework.md；可迁移规范 .agents/skills/stock-analysis/references/public-markets/multidimensional-valuation.md。网站摘要源 src/data/notionNotes.ts，生成脚本 scripts/generate-investment-method.mjs。本轮只改研究标准与技能，不改引擎、不重算个股、不发布；已有ADR/HK估值会话改动保留。Claude独立Task成功并已release/ack，无reclaimable资源。

## 2026-11-15 标普500仓位规则回测
先讨论（Cursor/Codex/Claude 三方，结论：不做 0–100 总分）后实施。预注册 docs/research/sp500-allocation-backtest-prereg-2026-11-15.md 先于代码提交；实现 scripts/sp500-allocation-backtest.mjs（Cursor），独立审查 Claude（0 阻断，R1–R6 已修）。结果 docs/research/sp500-allocation-backtest-results-2026-11-15.md：S1 趋势/S3 CAPE/S4 组合均"未证实"，S2 波动目标"无效"。分支 research/sp500-allocation-backtest，未推送。下一步候选：信用利差层、国际数据交叉验证（需新预注册版本）。
### v2（同日）：估值预测力
预注册 v2.1（Codex 审后修订）先于代码提交；Claude 文献 + Cursor 数据调研 → Cursor 实现 → Claude 独立复现审查（1 阻断已修）。结果 docs/research/sp500-valuation-predict-results-v2-2026-11-15.md：1985 起共同窗口 CAPE收益率/ECY/SOP × 1–10 年全部"无/未证实"；长窗口（1955/63 起）ECY、SOP 10 年 OOS R² +0.29/+0.39；交易规则 T1 估值+动量、T2 SOP 倾斜 ΔCER +0.13%/+0.26%，Holm p=0.16 未证实。AIAE 等 Z.1 变量仅探索性（无 vintage）。

## 2026-11-16 朋友更新集成
用户已授权 dev-team 先复核 docs/reviews/2026-11-16-friend-project-update-evaluation.md，合理则实施并由团队交叉检查。Run计划 friend-integration-20261116，基线 d47cc4fa。重点六项为指数比较/官方ETF关系、网格行情图、技术筛选、跨页联动及质量解释；候选资金流/主升浪/择时须沿研究门禁，不引入优选名单和未核实EPS。本次未授权推送部署。先独立架构与产品复核，再冻结owner拆实现。

已完成实现及原生 Orca Run `run_c2f7b56af8d8` 交叉复核、修复回查和真实浏览器验收。全量264文件/1884测试、脚本346测试、typecheck、生产构建通过，lint 0 error。三页桌面/390px主路径及焦点回验通过；真实日K最初两次HTTP 502，随后上游恢复，完整六页均200，日K绘制、MACD、放大和刷新复验通过，触控手势未专项验证。维护说明见 docs/friend-update-integration.md，报告见 `.dev-team/runs/friend-integration-final-review/reports/`。所有Task completed、worker released；未提交、推送或部署。

## 2026-11-17 Cboe Put/Call
按用户“美股盈亏比”需求，以期权 Put÷Call 成交量比接入「杠杆与资金」，不是账户交易盈亏比。官方历史 CSV + `?dt=` 日页面补建241个连续月份，最新2026-11-16=0.95、历史49%分位；背景指标不打阶段分。采集/补建 `npm run macro:putcall-history`，日常沿用 `macro:update`。桌面/390px及刷新保留长历史已实测；数据口径见 docs/data-maintenance.md 末节。未提交、推送或部署。
