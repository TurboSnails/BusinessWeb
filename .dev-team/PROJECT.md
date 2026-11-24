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

## 2026-11-22 大跌切换的标普 500 信号
用户问"标普 500 跌多少时多卖稳定股、多买低位股"有没有回测。原研究只用纳指 100 做信号，本轮补上标普版。Run spx-signal（`run_baa79a55bef0`）：Cursor 做页面，Kimi 做独立复算与报告，Claude 审查、集成。在独立 worktree `spx-signal`（分支 `TurboSnails/spx-signal`）里完成，因为主检出当时有别的会话在改宏观页面。
- 页面：大跌切换可选信号指数（QQQ / SPY），结果页新增"信号指数当前位置"（`RunResult.signalState`，含最后一个交易日已触发未成交的 `pendingAction`）。信号用 ETF 复权价，与指数点位的跌幅略有差异（2022 年那轮 SPY 触发 2 步，`^GSPC` 为 3 步）。
- 研究：`docs/research/portfolio-rebalance-explore-2026-11-21/spx-signal.md`，程序 `data-raw/portfolio-explore/work/spx-signal/run.py`，锚点 `longrun/anchor_spx.py`。1986 年以来 54 个行业组合，标普 −10% 到 −30% 起点相对普通再平衡的年化中位差 +0.38 到 +0.67 个百分点，最大回撤加深 2.9 到 6.5 个百分点（50% 上限后 0.3 到 2.1）；−20% 在 40 年里只触发 5 次。Kimi 的独立程序与 manager 的复算逐项一致。
- 标普收盘用 Yahoo `^GSPC`，2019 年以来与腾讯 `us.INX` 逐日核对；本机当天连不上 FRED。
- SPY 已加入 `universe.json` 基准组；某只信号 ETF 缺数据时表单只列出有数据的那只。
- 全量 349 文件 / 2,696 测试、884 脚本测试、typecheck、lint 0 error、build 通过；桌面与 390 宽浏览器验收用离线夹具数据完成。用户确认后已推送 main（`96bba87f`），手动触发 `portfolio-prices` 生成 SPY 数据（腾讯核对 502 日一致），Vercel 与 Pages 线上在桌面和 390 宽均已验收。注意：`portfolio-prices` 的数据提交不会自动触发 Pages，新增代码后要手动 `gh workflow run pages.yml --ref main`；Vercel 会自动跟进。

## 2026-11-22 宏观大师页「当前位置」
用户问这页方不方便、大师靠不靠谱、数据合不合理、现在该攻还是守。先三方讨论（Codex / Cursor / Kimi 各自独立作答，`.dev-team/runs/mm-stance/reports/`），结论一致后实施。
- **定案**：结论来自分维度证据，不做总分、不让九位投票（同一读数会重复计票，七年估值预测与日线风险线不能混算）。只有本人给过明确规则的才给档位（目前只有都铎·琼斯的 200 日均线）；其余逐项对照并写明缺什么；索罗斯、邓普顿、科斯托拉尼只列线索。
- **判定** `src/features/macro-masters/cycleView.ts`（纯函数 `buildCycleView`）：八个维度（趋势、宽度、信用、货币政策为短线；流动性、盈利与就业为中期；估值为长期；情绪为逆向线索）→ 短线攻守档与置信度 → 两轴阶段（趋势 × 基本面：扩张 / 修正 / 熊市 / 修复）→ 支持、反面、改判条件 → 九位大师对照。口径写在任务卡 `.dev-team/runs/mm-impl/tasks/engine.md`，页面上全部公开并注明「本站口径，未经回测证实」。回测过的是总回报指数 10 个月均线（S1）和 CAPE 分档（S3），不是 200 日均线，文案不要写错。
- **读数** `readings.ts`：分位按原生频率算（月频、季频不再被周采样规则误杀）；跨度 30 年以上另给长历史分位；月频 95 天、季频 270 天才算过期；新增政策利率（IORB，含最近一次调整与连续调整串）、回撤、四个相对表现、失业率、萨姆规则、家庭偿债比、非金融企业市值 ÷ GDP、Put/Call。过期读数不参与判定。数字、单位、日期格式统一在 `format.ts`。
- **内容** `masters.ts`：每位加 `track`（能不能检验 / 适合回答 / 不适合回答 / 公开失误），只写研究文档有据的内容，不打星。
- **界面**：总览页自上而下为现在的位置、分维度的证据、九位大师（现在怎么看与靠不靠谱合并，行内展开）、指标对照（主题 / 大师筛选写入网址参数 `theme`、`who`，历史分位刻度条）；吸顶页内导航，证据可跳转到对应维度与读数。大师页加「按他的方法，现在怎么看」，指标表三列。共用标签在 `chips.tsx`。约定：表格里的展开内容一律渲染成行下方的全宽面板，不把 `<details>` 放进单元格（会把列挤坏）；新文件不用内联样式（有棘轮测试），需要按数值定位时用 SVG 属性；验收要把每种展开状态都打开看。
- **已知数据限制**：高收益债利差免费数据只有近三年，没有分位；NAAIM 公开数据滞后约三个月（标过期、不参与判定）；前瞻市盈率、AAII、基金经理现金样本太少不给分位；10 年期实际收益率的周度历史在 2026-08-05 之后有缺口（股债息差快照里前瞻市盈率来源停在 8 月初，实际收益率序列跟着被截断）；茨威格的优惠利率规则是用政策利率变动推算的，宽度推力与 4% 模型缺原口径数据；格兰瑟姆的「偏离长期趋势 2 个标准差」还没有算。
- **流程**：Run mm-stance（讨论）、mm-impl（Codex 引擎、Cursor 读数、Kimi 内容）、mm-ui（Cursor 总览、Kimi 大师页）、mm-review（Codex 额度用尽后由 Claude 替补审查）。多个会话共用工作区，期间另有会话在改 `src/features/macro/` 的估值热力图，互不触碰。
- **发布**：用户确认后于 2026-11-22 推送 main（`a008acef`），Vercel 生产与 GitHub Pages 均已部署；线上总览页与都铎·琼斯页实测内容、标题正确，控制台无报错。发布时本地 main 上有另一个会话未推送的估值热力图提交，故在临时 worktree 里把本次提交单独挑到 origin/main 上推送，没有替它发布；随后在共享工作区 `git pull --rebase` 并跳过已在远端的重复提交。上线后发现首屏证据条目的列表圆点错位（条目改成可点按钮后未复看首屏），已补一处样式修复。

## 2026-11-24 市场雷达体检与修正
用户问宏观攻守时间线与雷达月度档位对照是否不同、要不要优化。结论：两套不同策略，规则都不改。修两处：回测市盈率改为当月月均价 ÷ 三个月前可得盈利折算（`priceAdjustedPe`，`scripts/lib/market-radar/sources.mjs`）；雷达页大师方案直接取 `macro-posture.json` 的 `backtest.timeline`（`mastersTimeline`），当时版本口径另列 `mastersRealtime` 行。回测区新增脚本生成的 `backtest.verdict`。预注册五类打分改法均未采用，记录与复现脚本 `docs/research/market-radar-v2-2026-11-24.md`。Run radar-fix-1124（`run_4812fcdf1e01`）：Cursor 实现，Claude 独立复算与审查。提交 210c7bfe 已推送。后续可选项：宏观攻守页时间线改用当时版本口径，需要按日的 ALFRED 版本缓存（现只有月末快照）。

## 2026-11-24 宏观攻守时间线统一为实时数据口径
规格第 15 节。月度主结果（timeline / tiers / recessions / falseAlarms / singles / costs）改用 ALFRED 月末已发布版本，变体表 `full`＝实时数据、新增 `revised` 对照、取消 `realtime` 行；每日时间线按版本发布日取数，版本库 `data-raw/macro-posture-vintage-history/`（`loadVintageHistory` / `panelAtVintage`），月末缓存与 `panelWithVintages` 接口不变。`loadVintages` 抓取失败只让缺的月末退回修订值并写 `incomplete`。雷达回测表去掉 `mastersRealtime` 行。Run posture-realtime-1124（`run_cf2c3d56cc38`）：两个 Cursor 并行（引擎、页面与雷达），Claude 独立核对：新 full＝旧 realtime、revised＝旧 full、时间线与独立算出的实时档位 646 个月 0 处不同、每日月末核对 0/646。同日另：断开了重复的 Vercel 项目 businessweb-free-cloud-foundation 的 Git 自动部署（它占掉每日部署额度的大半，导致主站 business-web 被限额）。

## 2026-11-24 综合策略页
用户要求：市场综合不该放雷达页；另开一页融合宏观攻守与雷达并给出仓位策略；雷达页只做股市自身分析与回测。设计 `docs/superpowers/specs/2026-11-24-combined-strategy-design.md`，契约 `src/features/combined-strategy/types.ts`。新页 `/invest/strategy`（`src/pages/CombinedStrategy.tsx`、`src/features/combined-strategy/`），数据 `public/data/combined-strategy.json` 由 `scripts/market-radar.mjs` 同次运行生成（`scripts/lib/combined-strategy/`）。预注册六种融合规则（研究文档第三轮）无一过线：仓位只按宏观攻守，雷达热度（估值与拥挤度维度均分，≤ −0.5 偏热）用于九格状态矩阵与每格做法。雷达页回测只剩四行、单带时间线（`TimelineView` 新增可选 `singleBand`）；市场综合面板与大师对照移到新页。Run strategy-page-1124（`run_cccdcd837df6`）：两个 Cursor 并行，Claude 独立复算八行融合结果与九格统计并验收。教训：新增导航入口后要跑全量测试，`src/data/siteMap.test.ts`、`src/components/SectionChrome.test.tsx` 按顺序断言入口，worker 的局部测试范围没覆盖到。

## 2026-11-24 全站只有一个仓位出口；指数估值新页
用户问宏观温度的「美国」「估值位置」页签和宏观攻守、市场雷达、综合策略之间怎么优化，要求确定的方案。线上核对到同一天五个说法（预警 / 趋势防守 / 85% / 70% / 85% 不用调）；独立评审 agent 逐条核实后定案，记在 `docs/superpowers/specs/2026-11-24-combined-strategy-design.md` 第 10 节。Run verdict-ia-1124（`run_00276622c9b9`）：三个 Cursor 任务（雷达口径；结论条、范围标注与导航；指数估值页与页签精简），前两项并行、第三项在后；Claude 审查、集成。
- **原则**：只有综合策略给美股仓位数字。`VerdictBar`（读 `combined-strategy.json` 的 `current.instruction`）放在观察盘、宏观攻守（美国）、市场雷达、宏观温度顶部；宏观温度的美国宏观、美股市场页签不再放 `SummaryCard`（宏观大师、顶级投资人页仍在用）。
- **范围**：`stages.ts` 的阶段展示名改为「风险预算阶段」（只管主动额度和备用金，规则与投资计划共用、未动）；牛熊周期的标普、纳指标「观察版」；「上限」＝计划里的股票目标权重（用户定）。
- **雷达**：`market-radar.json` 的 `current` 加 `heat`、`heatScore`，`headline` 不含仓位百分比；结论面板首行是冷热。
- **导航**：观察盘组顺序为观察盘、综合策略、宏观攻守、市场雷达、宏观温度…；三页互链 `TrioNav`。`scripts/prepare-pages.mjs` 补了 `invest/strategy`。
- **指数估值** `/invest/index-valuation`（`src/pages/IndexValuation.tsx`）：估值位置、股债息差搬出宏观温度，视图组件仍在 `src/features/macro/`；`/monitor?tab=valuation|spread` 用 `Navigate` 跳转；宏观温度「方法」三页签并成 `?tab=method&m=`，旧参数仍可用，共 9 个页签。
- **没做**：指标行互链、攻守与雷达合页、搬美股市场与牛熊周期页签、统一两套均线规则（理由见设计第 10 节）。
- **教训**：纵向 flex 容器里的 `flex: 1 1 12rem` 会把基准变成高度，窄屏出现大片空白；执行器自查的「无横向溢出」不等于排版正常，窄屏截图要自己看。用户要求先在本地看（`npx vite --host --port 5199`）再发布，发布前不提交。`npm run build` 会改 `public/changelog.json`，不随功能提交。
