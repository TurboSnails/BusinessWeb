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

已完成实现及原生 Orca Run `run_c2f7b56af8d8` 交叉复核、修复回查和真实浏览器验收。全量264文件/1884测试、脚本346测试、typecheck、生产构建通过，lint 0 error。三页桌面/390px主路径及焦点回验通过；真实日K最初两次HTTP 502，随后上游恢复，完整六页均200，日K绘制、MACD、放大和刷新复验通过，触控手势未专项验证。维护说明见 docs/friend-update-integration.md，报告见 `.dev-team/runs/friend-integration-final-review/reports/`。所有Task completed、worker released；已提交并推送当前分支，Vercel Production 已发布；GitHub Pages 未跟随 main 更新。

## 2026-11-17 Cboe Put/Call
按用户“美股盈亏比”需求，以期权 Put÷Call 成交量比接入「杠杆与资金」，不是账户交易盈亏比。官方历史 CSV + `?dt=` 日页面补建241个连续月份，最新2026-11-16=0.95、历史49%分位；背景指标不打阶段分。采集/补建 `npm run macro:putcall-history`，日常沿用 `macro:update`。桌面/390px及刷新保留长历史已实测；数据口径见 docs/data-maintenance.md 末节。已提交并推送当前分支，Vercel Production 已发布；GitHub Pages 未跟随 main 更新。

## 2026-11-17 OFR 对冲基金股票多空比
用户确认接入免费代理：OFR Form PF Equity GNE L/S（`hfEquityLs`），与 Put/Call 并列于杠杆与资金；背景不打分。最新 2026-06-30=1.503（54 季，自 2013）。明确标注非高盛科技多空比。日常随 `macro:update`。

## 2026-11-17 股债息差补充
对照同事项目后仅补充沪深300中位数 PE 和上证50两条序列，不带入科创50价格趋势。序列由月度 PE 与每日价格/国债推算，页面明确非真实每日 PE；切换后当前位置、图表和事件表同步。全量264文件/1888测试、脚本346测试、typecheck、lint与真实浏览器切换/390px通过。维护见 docs/data-maintenance.md。此增量尚未提交、推送或部署。

## 2026-11-21 投资页面 UI 交互优化
用户要求以专业投资人视角优化 UI 交互与设计，Cursor/Kimi 实现、Claude（manager）审查；Codex 当日额度耗尽未参与。Run `run_68bc452e8c4a`，记录在 `.dev-team/runs/ui-investor-20261121/`。六项：导航三层选中态与横向滚动提示（`src/hooks/useOverflowFade.ts`）、公司研究列表首屏（筛选收进"更多筛选"）、候选池空状态与雷达表格、涨跌色统一（美股页改绿涨红跌、观察盘样式泄漏、K 线收盘价着色）、公司详情头部价格与情景刻度条及目录（`src/components/research/CompanyDetailHeader.tsx`、`CompanyDetailToc.tsx`、`scenarioPrices.ts`，样式 `src/styles/company-detail.css`）、财报前瞻/行业 ETF/ETF 择时的小字与点击目标。全量 321 文件/2,331 测试、typecheck、lint 0 error、生产构建通过；28 个核心路由桌面与 390px 无横向溢出、无控制台错误。分支 `ui/investor-polish-20261121`，截至记录时未提交、未推送、未部署。约定：折溢价不用涨跌色；SVG 图表文字按 viewBox 缩放，不适用"不低于 12px"的计算样式检查；情景价只做严格解析，不取中点。
### 第二轮（同日）
用户指示继续，新增六项：宏观温度 13 个页签分组（`PageTabs` 支持 `group` / `shortLabel`，网址参数不变）并把美股市场页的指数与区间控件收进图表区；其余投资页面与开盘啦、同花顺、今天几星子页签的小字（不低于 12px）与点击目标（不低于 32px，触屏 44px）。36 个路由在 1440 与 390 宽下无横向溢出、无偏小控件、无小于 12px 的非图表文字；全量 321 文件/2,337 测试、typecheck、lint 0 error、生产构建通过。量化脚本 `.dev-team/runs/ui-investor-20261121/tools/audit.mjs`。新增约定：单选 / 复选框保持原视觉大小，可点区域由 label 整行承担；`<summary>` 改 `display` 后必须自带展开指示；不用省略号截断日期、公司名、基金名、数值。两轮合计仍未提交、未推送、未部署。

## 2026-11-22 组合再平衡回测页
用户要求持续实施到上线。Run portfolio-lab：Codex 数据管道、Cursor 引擎、Kimi 页面，Claude 审查与集成。页面 `/lab/portfolio-rebalance`，引擎 `src/features/portfolio-rebalance/engine.ts`（共享类型 `types.ts`），数据 `public/data/portfolio-prices/`，采集 `scripts/portfolio-prices.mjs` + `scripts/portfolio-prices-yf.py`，工作流 `.github/workflows/portfolio-prices.yml`（UTC 22:45 工作日）。数据源 Yahoo（yfinance，只在 Actions 上取；本机对 Yahoo 限流）+ 腾讯不复权日线交叉核对（不可用时不阻塞写入）。腾讯 fqkline 参数须为 `code,day,start,end,2000,`（末尾逗号）；本机大量请求后腾讯会返回 501 验证页。研究依据见 `docs/research/portfolio-rebalance-explore-2026-11-21/`。全量 331 文件 / 2,502 测试、863 脚本测试、typecheck、lint 0 error、build 通过；Vercel 与 Pages 线上已验收。Pages 现为全部 lab 页面生成静态入口。
### 大师长期持仓（2026-11-22）
可选股票 23 → 37：从 SEC 13F 原始信息表筛选（最新一期 ≥5% 且五年前同季度已持有，CUSIP 前 6 位比对），程序 `data-raw/masters-13f/masters_13f.py`。holders 字段写在 universe.json，经 mergeIndex 进 index.json，页面显示「大师」徽标与 13F 明细；每季 13F 披露后人工更新。采集脚本新增：拆股感知交叉核对、带点腾讯代码回退（usBRK.B.N）、新代码首次失败不写入 index、knownEvents 按代码查表（PDD 2022-03-16）。英特尔改入高波动组。重算见 `docs/research/masters-holdings-rebalance-2026-11-22/`（网站引擎 + 独立 Python 复算 202/202 一致）。Run masters-universe：Cursor 实现，Claude 审查。

## 2026-11-22 宏观大师、美股宽度与铜金比、回测页结论
- 宏观大师 `/invest/macro-masters`（九人各一页，`src/features/macro-masters/`，研究 `docs/research/macro-masters/<slug>/`）。内容只取自研究文档；同口径读数与"本站近似"分开（`readings` / `proxyReadings`）。读数按指标与来源隔离，分位按周采样且至少 52 个点、覆盖 60%。
- 美股宽度：`advDec` 由 `.github/workflows/us-market-breadth.yml` 独占（纽约 16:40 + 次日 03:15 补跑，独立并发组，每次成功都派发 Pages）；market-cycle 不再跑宽度脚本。
- 铜金比：`scripts/us-market-data.mjs` 用 Yahoo HG=F/GC=F，日期标签 = 纽约时区(时间戳+6h)，17:30 ET 前不写当日；上线后核对近一年 252 个交易日、无周末日期。
- 回测页：自动结论（`conclusions.ts`）与研究观察；反事实与基准用原组合实际交易日；纳指 100 等权基准为 QQQE（QQEW 自 2025-12-22 改为精选 50 只）。
- 流程：Cursor/Kimi/Codex 实现，Claude 自审 + Codex 独立审查四轮后发布。教训：读取 `public/data` 实时数据的测试不要写死读数数量或日期，否则数据采集后会让 Pages 部署失败。
