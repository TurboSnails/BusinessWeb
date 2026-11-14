# 普通人入口页 · 团队定稿（2026-11-14）

用户要求：新增一个面向普通人的入口页，现有页面不动，缺的能力补上；多轮讨论、商业级最优解。

过程（dev_team，Orca Run `run_dd7fdc34e4ca`）：R1 Claude 产品方案 / Codex 架构方案 → R2 交叉质询并各出修订版 → R3 Cursor 独立核实、4 类用户画像走查、商业级标准打分、分歧裁决 → R4 两方签字（均有条件同意，补充修正已并入本文）。原始报告在本地 `.dev-team/runs/newcomer-entry/reports/`（product、arch、product-r2、arch-r2、review、review-r3、signoff-product、signoff-arch），不入库。

## 用户拍板

1. 首页书籍区与投资页顶部各加一行文字链接（不改布局与导航顺序）。
2. 第一期只做入口页 `/invest/start`；「我的计划与持仓」`/invest/my-plan` 放第二期。
3. 研究路线主动额度：默认 5%（书 9.9），本人确认后可调至 20%（9.1/9.4/33.1 为作者案例）；不设 10% 档。

## 第一期（1a）：`/invest/start`「从这里开始」，纯前端

**页面结构**：一句话下一步（未自测→开始自测；先打底→攒应急金、读开篇四步；省心→勾选第一步；已设检查日→倒计时）→ 页顶固定「不构成投资建议、不承诺收益」与风险提示（在结果卡上方）→ 自测（单一 fieldset 流程，手机/桌面同一套 DOM）→ 结果卡（路线 + 每条理由链接书章节）→ 路线清单（稳定 stepId）→ 应急金临时算式（月支出 × 月数，只在内存）→ 检查日与 `.ics` → 旧投资计划只读卡（折叠）→ 可信度图例、术语、「这些先别开」说明。

**推荐规则（纯函数 `evaluate(answers)`，表驱动，全组合测试）**
- 先打底 R1：`Q1 ≠ 6 个月以上应急金 OR Q2=a OR Q3=a`，资金规模不得覆盖期限；仅因 Q3 命中时文案为「这笔钱不进市场，可以按另一笔钱重做」。
- 先判 R5（研究可达）再判 R4，修复遮蔽；Q6 时间用半开区间（b=`≥1 且 <2` 小时/周，c=`≥2 且 <5`）；Q8 新手经验按 arch-r2 拆选项，Q8=d 不进研究。
- 结合 / 研究建议额度均为 500bps；`userResearchCapBps?: number` 只存本人选择的 0–2000 整数，不生成默认 1000，不反写 `plan2026`。
- 配置档位：结果只给 `allocation: 'needs-confirmation'`，不显示系统判定的保守/均衡/积极，不预选模板；提供书 7.2/9.10「愿意/能够/需要」三问讨论链接与旧模板链接。
- 未答完：`incomplete`，只给静态「先打底学习路径」，不给入市比例。
- 删除「最多 N 只」：只显示「观察 M 家 ≠ 持仓；额度是上限，可以为 0」。

**存储与隐私**
- 唯一写入 `localStorage['start:v1']`（答案、rulesVersion、清单进度按 stepId 单独存且与 rulesVersion 解耦、检查日、本人额度）；结果不持久化，由答案 + rulesVersion 重算。
- 只读 `plan2026:fund-total|fund-split|fund-cap|holdings`（cashflow 仅算式展开时）；**等于投资计划页默认值（100 万、75/20/5 等）一律视为「未填写」**；未经本人确认不展示金额；确认后标签用旧页名称「配置底仓 / 主动 / 备用金」并注明「不是书 7.1 的近期用款 / 应急 / 长期」，备用金不当应急金。
- 无日期的旧持仓：有效性一律 `unknown`；可另设 `calculatedDeviation` 展示「按原记录计算」，不得显示「当前区间安全」或触发操作提示。
- 不写 `plan2026`；不进 public JSON、URL、SEO；不发任何网络请求；清除只清 `start:v1`；禁止 `localStorage.clear()`。
- 不做本机计数或任何分析上报（项目无分析 SDK，站长读不到访客本机数据）。效果验收改为上线前 5 人走查。

**`.ics` 检查日提醒**：按 arch-r2 §5（RFC 边界）；全天事件加当天 09:00 VALARM，文案注明部分日历（如 Google 日历）可能忽略提醒、改期需删除旧系列再导入、文件不含金额。两种日历客户端实测导入后才宣称「提醒可用」。

**现有页面改动白名单（只允许这 6 处）**：① `src/App.tsx` 一条路由 ② `src/data/siteMap.ts` EXTRA_PAGES 一条（描述含新手 / 入门 / 定投；不进 INVEST_GROUPS）③ `src/pages/InvestHub.tsx` 页头一行「第一次来？从这里开始 →」④ `src/pages/Home.tsx` 书籍区一行「不懂投资？从这里开始」⑤ `src/utils/seo.ts` 专属 title/description ⑥ `scripts/generate-sitemap.mjs` 加路径。禁止改 NAV、INVEST_GROUPS、旧计划逻辑、候选池 / ETF / 公司页。

**代码位置**：`src/pages/StartHere.tsx`（懒加载）；`src/features/invest-start/{types,validation,content,recommend,legacyPlan,store,checks,calendar,useStartState,components/*}`。

**验收**
- `recommend.test.ts`：全合法组合；R1 不可绕过；R5 可达；Q8=d 不进研究；未答完无入市比例；额度默认 500、上限 2000。
- `legacyPlan` 默认值判未填写、无日期持仓为 unknown；`store` 不写 plan2026、清除只清 start:v1；`calendar` 含 VALARM、无金额。
- `StartHere.test.tsx`：键盘路径、`aria-live`、隐私模式（localStorage 抛错时页面可用）；关键声明存在；结果与清单不含交易指令。
- 回归 Home / InvestHub / App：只允许白名单链接差异。
- 网络面板无新增请求；首屏不引入 InvestmentPlan2026 页面代码；移动端 300px 无横向滚动；44px 触控目标；`prefers-reduced-motion`。
- 文案人工审读通过；上线前 5 人走查（完全新手、定投上班族、每周 2 小时选股者、已有一堆个股者各至少 1 人）。

## 第二期清单

`/invest/my-plan`：应急金（月 × 月数）、三笔预算（core / research / reserve）、配置类手录市值（可只填合计）、定投按月 / 按季、检查日默认半年、「检查日核对、越过阈值才调」；单文档存储（旧键一次性迁移，预览 + 本人确认，不回写；旧页布局不动）；站长专用 `plan-sync`（聚合路由）与周报一节（无金额）；访客无云端与邮件；入口页计划卡改读新存储。

## 明确不做

连接券商、自动交易、推荐具体基金、收益预测、访客云端与邮件、用前复权价或累计净值自动计算市值、多租户、第三方追踪、把金额写入公开文件或 GitHub issue、第一期上完整账本或双写 `plan2026`。
