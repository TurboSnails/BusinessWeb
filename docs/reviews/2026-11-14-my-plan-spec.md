# 第二期「我的计划与持仓」实施规格

日期：2026-11-14。状态：供 Cursor 实施、manager 验收；本文未实施代码、运行迁移或发信。产品路由 `/invest/my-plan`，H1「我的计划与持仓」。本规格中的 MUST 均为验收要求。

## 1. 依据、优先级与范围裁决

依次采用：本期 `.dev-team/runs/my-plan/BRIEF.md`、`docs/reviews/2026-11-14-newcomer-entry.md` 的用户拍板与第二期范围、当前一期代码、书原文；历史讨论只补充未定细节。已核对 `arch-r2.md` §3–7、`product-r2.md` A2/A22/向导与首屏、`review-r3.md` E.2、两份 signoff、code-review、copy-review、sim-walkthrough，以及现有同步、周报和迁移模式。历史报告的 10% 档、自动判均衡档、无 VALARM、1 年资金门槛、备用金从分母剔除，均不得照抄。

明确裁决：

1. 本期新功能的唯一资金/检查日来源是 repository。`InvestmentPlan2026.tsx` 的布局、逻辑、旧键写入行为均不改；不实施 arch-r2 提议的旧页适配器，因为本期没有授权这项现有页数据层改造。新页提示「旧投资计划页是另一份独立记录；导入后，在本页继续维护，旧页的修改不会同步到这里」。不是两页已统一的承诺。
2. `start:v1` 仍保存自测/学习进度；新文档存在后，两个页面的计划检查日与本人额度操作一律交给 repository。旧 `start:v1.review`/额度作为迁移来源保留原样，不回写、不删除，也不再作为已建计划的回退来源。
3. 当前题目与规则均为 v2：Q3 是「不到 3 年 / 3 年到不足 5 年 / 5 年及以上」，Q5 有「没经历过，不确定」。不得将旧 v1 答案按 v2 重新解释。
4. 第7章 7.4/第9章 9.1：参考总额 = 配置底仓预算 + 主动预算 + 备用金预算；近期确定支出先排除，自住房不计。应急需求是需求测算，可由备用金覆盖，但不能再加一次到参考总额，也不能看到 reserve 就认定应急充足。
5. 本期支持季度/半年检查（默认半年），首日 1–28 日，直接复用现有日历算法。历史产品稿的年度与月末支持不纳入本期；不新增另一套夹月末算法。
6. 只做 CNY 元手录/本人换算后的人民币等值；不做 FX 服务。外币资产必须本人填人民币等值和日期，产品不能直接把 USD/HKD 与 CNY 相加。

交付：应急需求、近期用款提醒、三笔预算、配置类别目标与市值合计（不用证券代码）、可选研究持仓、月/季定投预算、检查记录和简单年度复盘、一次性导入、备份恢复与清除、站长可选云快照和周报一节。不得连接券商、自动交易、推荐具体产品、预测收益、用前复权价或累计净值计算市值、做访客账户/邮件/云同步、第三方追踪、完整交易账本、旧页双写、候选池改造或额外 cron。

## 2. 代码边界与文件责任

新增目录 `src/features/investment-plan/`，它可以单向导入 `invest-start` 的纯类型/校验/推荐/日期/日历/旧值读取，不得反向引入页面、行情或候选云 store。不得 import `InvestmentPlan2026.tsx` 获取模板。

| 新文件 | 职责 |
| --- | --- |
| `types.ts`, `validation.ts`, `money.ts` | 下节完整契约、unknown 校验、十进制定点换算 |
| `migration.ts` | 预览、源指纹、选项确认、旧→新映射 |
| `repository.ts`, `usePlan.ts` | 唯一本机持久化、订阅、原子 patch、冲突保护 |
| `selectors.ts`, `schedule.ts` | 状态/偏离/额度/待办；schedule 适配现有 checks 纯函数 |
| `backup.ts` | 显式文件导出和校验后替换；绝不上传文件 |
| `calendar.ts` | 薄适配现有 buildIcs/publicPageUrl/downloadIcs |
| `cloud.ts`, `usePlanSync.ts` | 仅站长显式动作才加载/运行的同步状态机 |
| `weekly.ts` | 只从计划投影无金额的检查事项；纯函数，供服务端调用 |
| `components/{PlanSummaryCard,PlanWizard,MigrationPreview,FundingEditor,AllocationEditor,ContributionEditor,ReviewFlow,HistoryPanel,BackupControls,OwnerSyncPanel}.tsx` | 可组合 UI；不在组件直接读写 localStorage |
| 同名 `*.test.ts` / `*.test.tsx` | 下文用例；合成数据 |
| `src/pages/MyPlan.tsx`, `src/pages/MyPlan.test.tsx`, `src/styles/investment-plan.css` | 懒加载页面、集成测试、局部样式 |
| `server/plan-sync.ts`, `server/plan-sync.test.ts` | 鉴权/校验/ETag/CAS；可注入 env/fetch 方便测试 |
| `server/functions/plan-sync.js` | 仅 `export { default } from '../plan-sync.js'` |
| `supabase/migrations/202611140002_investment_plan.sql` | §9 SQL；仅交付文件，由 manager 协调用户 SQL Editor 执行 |

允许修改的既有文件，除此之外先报 manager 扩白名单，不能自行扩大：

- `src/App.tsx`：MyPlan lazy import + 一条路由。
- `src/data/siteMap.ts`：EXTRA_PAGES 一条，不能改 NAV/INVEST_GROUPS/排序。
- `src/utils/seo.ts`：静态标题描述；不含任何个人数据。
- `src/pages/StartHere.tsx`：计划卡、计划按钮与已建计划的检查日/额度接入、隐私说明。
- `src/features/invest-start/components/ResultCard.tsx`：仅必要的额度受控 props/已建计划编辑链接；保留未建计划原行为。
- `src/features/invest-start/calendar.ts`：publicPageUrl 允许第四参数 `path: 'invest/start' | 'invest/my-plan' = 'invest/start'`，现有调用默认不变；不能改序列化算法。
- `src/features/invest-start/calendar.test.ts`、`src/features/invest-start/reviewPanelUrl.test.tsx`、`src/pages/StartHere.test.tsx`：只补新边界与集成用例，不能删旧断言掩盖回归。
- `api/market-data/[marketRoute].js`：仅添加惰性加载 `plan-sync` 项。
- `server/weekly-digest.ts`、`server/weekly-digest.test.ts`：计划读取、无金额 section、失败隔离和已有周认领门禁。
- `src/features/weekly/weeklySummary.ts`、`src/features/weekly/weeklySummary.test.ts`：扩充类型以接纳明确传入的无金额 section，不从浏览器/服务器自行加载计划。
- `tsconfig.server.json`：include `server/plan-sync.ts`（传递导入的纯模块由 TS 自动跟随）。
- `scripts/check-functions.mjs`：复制新 wrapper、检查加载及未配置响应；不新增 npm 依赖。

不修改 Home、InvestHub、旧计划页、候选/ETF/公司页、公开 JSON、导航、现有迁移。`/invest/my-plan` 不进 sitemap，本期只需 EXTRA_PAGES 可搜索；个人工具无需搜索引擎收录，`seo.ts` 只用公共静态说明。生产构建生成物不得混进实施提交；本规格文件由 manager 统一维护，实施任务不改它。

## 3. PlanDocument v1：唯一领域契约

以下类型必须逐字落实字段与可空语义；可补内部类型，不得另存计算结果。Day/Answers/Route 引用 `src/features/invest-start/types.ts`。Instant 是严格 UTC ISO 字符串。所有金额的 `amount` 是人民币「元」的规范十进制串，内部计算转 bigint 分；JSON 不放 bigint。

```ts
export type Day = string; // YYYY-MM-DD，真实日期 1900–2200；实现时复用现有类型，不重复导出冲突名
export type Instant = string; // YYYY-MM-DDTHH:mm:ss.sssZ，真实时点
export type Yuan = string; // /^(0|[1-9]\d{0,11})\.\d{2}$/
export type Money = { currency: 'CNY'; amount: Yuan };
export type Mark = { value: Money | null; asOf: Day | null;
  source: 'manual' | 'legacy'; verifiedAt: Instant | null };
export type Budget = { core: Money | null; research: Money | null;
  reserve: Money | null; confirmedAt: Instant | null };
export type PlanReview = { id: string; anchor: Day; intervalMonths: 3 | 6;
  completedDates: Day[]; calendarSequence: number;
  mode: 'calendar-check-band-act' | 'calendar-rebalance' };
export type Allocation = { id: string; label: string; targetBps: number | null;
  relativeBandBps: number | null; mark: Mark; riskTags: string[] };
export type ResearchPosition = { id: string; label: string; mark: Mark;
  instrument: { market: 'cn' | 'hk' | 'us'; code: string } | null;
  candidateRef: { market: 'cn' | 'hk' | 'us'; code: string } | null;
  riskTags: string[] };
export type Contribution = { id: string; label: string; amount: Money;
  intervalMonths: 1 | 3; anchor: Day; enabled: boolean;
  acknowledgedDates: Day[] }; // 记下本期预算核对，不代表实际扣款
export type CheckSnapshot = { funding: Budget; core: Allocation[];
  coreTotalOnly: Mark | null; research: ResearchPosition[];
  researchTotalOnly: Mark | null; reserve: Mark };
export type ReviewRecord = { id: string; scheduleId: string | null;
  scheduledDate: Day | null; checkedAt: Instant; asOf: Day;
  outcome: 'no-action' | 'cashflow' | 'adjusted' | 'deferred';
  note: string; snapshot: CheckSnapshot };
export type AnnualReview = { id: string; year: number; at: Instant;
  followedRules: string; changedNeeds: string; nextVerification: string };
export interface PlanDocument {
  schemaVersion: 1; id: string; localRevision: number;
  createdAt: Instant; updatedAt: Instant;
  wizard: { nextStep: 1 | 2 | 3 | 4; completed: boolean;
    skippedSteps: (1 | 2 | 3 | 4)[] };
  assessment: { questionnaireVersion: number; rulesVersion: number;
    answers: Answers; assessedAt: Instant | null;
    selectedRoute: Route | null; importedAt: Instant } | null;
  funding: { monthlyNecessaryExpense: Money | null; emergencyMonths: number | null;
    recentNeedAmount: Money | null;
    earliestUse: 'under-3y' | '3-to-5y' | '5y-plus' | null;
    highInterestDebt: boolean | null; budgets: Budget;
    reserveActual: Mark; legacyAnnualExpense: Money | null };
  limits: { researchCapBps: number | null; singleStockCapBps: number | null;
    confirmedAt: Instant | null; increaseAcknowledgedAt: Instant | null };
  core: Allocation[];
  coreTotalOnly: Mark | null; // 与 core 非空互斥；仅录底仓合计时不能判断类别偏离
  research: ResearchPosition[];
  researchTotalOnly: Mark | null; // 与 research 非空互斥；只能判断总体，不能判断单只
  researchCompleteAt: Instant | null; // 本人声明研究持仓记录完整；不代表认证
  review: PlanReview | null;
  contributions: Contribution[];
  history: ReviewRecord[];
  annualReviews: AnnualReview[];
  migration: { confirmedAt: Instant;
    legacy: { fingerprint: string; imported: boolean } | null;
    start: { fingerprint: string; imported: boolean } | null } | null;
  notifications: { ownerWeeklyEnabled: boolean }; // 默认为 false；仅 owner 面板可改
}
```

校验规范（`parsePlanDocument(input: unknown): {ok:true; value:PlanDocument} | {ok:false; issues:ValidationIssue[]}`；issue 只带字段路径+固定错误码，不带原值）：

- 严格对象白名单，未知 schema/字段拒绝，避免恢复/同步时静默丢字段；客户端和服务端使用同一个纯校验器。不得仅 `as PlanDocument`。
- JSON UTF-8 ≤262144 bytes；先限长再 parse，数组 core+research 总计 ≤200、contributions ≤30、history ≤100、annualReviews ≤20。快照也检查行数与全字段；整体限长优先，不能因次数未满就绕过 256KiB。
- ID：`^[a-z0-9-]{1,64}$`；新建用 crypto.randomUUID；所有同级集合 ID 唯一，历史记录与年度记录不复用 ID。label 1–80 字符、code 1–24 `[A-Za-z0-9.-]`、note/三个复盘字段各 ≤1000；riskTags 每条 ≤8 个、每个 1–32 字符、去重。纯文本呈现，不用 HTML。
- Yuan 必须规范两位，非负、最大 999999999999.99；UI 接收普通数字最多两位小数并规范化。禁负数、指数、NaN/Infinity、逗号混用、空串和自动 parseFloat 截断。空输入→null，明确输入 0→`0.00`。
- targetBps 为 null 或整数 1–10000；relativeBandBps 为 null 或整数 1–10000。未填/合计不是10000是允许保存的草稿，但 selectors 输出 unknown，不能给行动/绿灯。阈值默认建议值 2500（相对±25%，8.3 示例），仅在本人添加类别并保存时落盘，不自动生成资产比例。
- researchCapBps null 或0–2000整数，singleStockCapBps null 或1–10000整数；UI 4%–5%只解释为9.5案例，不自动设定；自测建议500bps不自动确认为本人上限。提高主动上限至>500须两项本人声明（已写完整决策记录37.4、读过退出判据18.10），保存 increaseAcknowledgedAt。确认预算与确认上限是两项不同动作。
- 所有日期严格真实。asOf≤本地今天（服务器验收≤UTC今日+1日以容纳全球本地日期）；无日期必为null。verifiedAt 不能靠导入/勾选「是我的」生成。Mark value=null 时 asOf/verifiedAt 必须null；legacy value非空可无日期；manual非空必须同时有 asOf+verifiedAt。
- instant 通过严格格式+roundtrip验证。计数/版本均非负安全整数（localRevision从1，calendarSequence≤10000）。Day不等于instant.substring(0,10)；UI显示时按用户本地日期。
- review anchor日号≤28、interval=3或6；completedDates≤200，唯一排序，必须是该原锚点序列上的日期。contribution anchor同样≤28，acknowledgedDates≤200且属于序列。不能保存不在序列的完成记录。
- 所有 Money 都是 CNY。instrument仅可选标识，不参与估价。candidateRef不读候选云、不触发写入，也不改变资金。
- assessment answers使用当前 `parseStartState`/`sanitizeAnswers` 规则；旧题版本迁移时清空答案并提示重做。selectedRoute仅在本人在预览/向导选定时保存；系统结果由 answers+版本纯计算，不另存 result。
- budgets、limits 的确认后修改任一相关值，清空其 confirmedAt。配置目标/市值改变清空本次检查核对状态，不修改历史。禁止把记录缺失解释为0；禁止持仓合计与预算叠加。

新空文档工厂 `createEmptyPlan(now,id)`：schemaVersion=1、revision=1、createdAt=updatedAt=now；wizard={nextStep:1,completed:false,skippedSteps:[]}；assessment/migration/review/coreTotalOnly/researchTotalOnly/researchCompleteAt均null；core/research/contributions/history/annualReviews均[]；所有funding金额/期限/欠款/月数和limits字段均null，reserveActual={value:null,asOf:null,source:'manual',verifiedAt:null}；notifications.ownerWeeklyEnabled=false。所有声明字段必须存在，null表示未知，不使用undefined省略来混淆未知与0。UI未提交草稿可用空字符串，但不能写入规范文档。

派生量：`referenceTotal = coreBudget + researchBudget + reserveBudget`，三项全有且confirmedAt才有效；应急需求 = 月必要支出×本人月数（整数1–60，UI提示开篇6–12只是起点），不存第二份应急金额；备用金实际余额只记录一次。缺口=max(需求−reserveActual,0)，需求/余额缺失显示未知；reserveActual无日期也不能断言当前充足。预算是计划分配，市值是实际记录，不能拿预算冒充市值。

## 4. repository、本机键与并发

键精确如下，不再增加分散资金键：

| 键 | 内容 |
| --- | --- |
| `businessweb:investment-plan:v1` | 仅 PlanDocument，唯一当前资金文档 |
| `businessweb:investment-plan:sync:v1` | `{schemaVersion:1, planId, baseRevision:number|null, dirty:boolean}`；无 token/金额 |
| `businessweb:investment-plan:conflict:v1` | `{schemaVersion:1, reason:'local'|'cloud'|'restore', local:PlanDocument, remote:PlanDocument, remoteRevision:number|null, at:Instant}`；最多一组，双方有效后才保存；敏感本机副本 |
| `businessweb:investment-plan:imports:v1` | `{schemaVersion:1, legacyConsumed:boolean, startConsumed:boolean}`；确认导入成功后置true，清除计划仍保留；非金额防复活收据 |

导入收据是冗余防线：文档 migration 为主；先写当前文档成功，再写收据。收据写失败明确提示；下次本人执行保存/确认操作时从文档 migration恢复收据，纯加载仍零写入。读任一收据失败/不认识时禁自动导入，仅允许显式预览并说明；不存在双键事务的承诺。清除后默认不再自动提议已消费的旧来源；本人仍可选择「从旧记录重新预览」创建新计划，不能偷偷复活资金。

```ts
export type PlanRead = { mode:'empty'|'ready'|'corrupt'|'unavailable';
  document:PlanDocument|null; unsaved:boolean; conflict:boolean };
export type WriteResult = { ok:true; persisted:boolean; document:PlanDocument } |
  { ok:false; reason:'invalid'|'revision-conflict'|'protected'|'storage'; issues?:ValidationIssue[] };
export interface PlanRepository {
  getSnapshot(): PlanRead; // 同一状态返回稳定引用，可供 useSyncExternalStore
  subscribe(fn:()=>void): ()=>void;
  create(doc:PlanDocument): Promise<WriteResult>; // 只可 empty；显式创建
  patch(expectedLocalRevision:number, change:(latest:PlanDocument)=>PlanDocument): Promise<WriteResult>;
  replace(expectedLocalRevision:number|null, next:PlanDocument,
    reason:'restore'|'cloud-resolution'): Promise<WriteResult>;
  clear(expectedLocalRevision:number): Promise<{ok:boolean}>;
  refresh(): void;
}
```

repository依赖注入 storage/clock/idFactory；生产使用模块单例。组件不得setItem；加载/渲染绝不写默认文档。patch只允许变业务字段，由仓库生成 localRevision+1和updatedAt；create生成id/时间/revision=1；replace有本机文档时保留本机planId/createdAt并递增本机revision，云带来的业务内容与原云id作为冲突备份保留；空本机时沿用导入文档id/createdAt但本机revision重置1。corrupt状态的replace必须额外获得UI明确确认并完成原文下载提示，不能以expectedLocalRevision=null绕过保护。云revision完全独立，不能拿localRevision作ETag。

create/patch/replace/clear均进入同页写串行队列；跨标签用 `navigator.locks.request('businessweb-investment-plan', ...)` 包住 read-latest→compare→validate→setItem。不支持 Web Locks 的浏览器进入明确的单标签编辑模式：写前重读比对 revision，storage事件出现不同版本时停止保存并保留内存草稿；不宣称localStorage实现跨标签CAS。storage事件/visibilitychange/SPA重新进入时refresh；不轮询。最新revision不匹配不能盲重放闭包；展示「另一窗口更新了计划，先比较两份」，内存保留双方；有持久冲突后禁止继续覆盖它。

setItem失败保留新文档于内存，返回persisted:false、置unsaved、提供下载备份，不能显示「已保存/已导入」。corrupt/未知版本保留原字符串，所有常规写入保护；先下载原文（固定文件名）、本人确认后才允许恢复/重建。clear先remove当前键成功才清UI；失败保持原界面并显示错误。清除只删当前计划、sync元数据和本人确认要删除的conflict；保留imports收据、所有plan2026/start/候选键；不删除云端、不删除外部日历。不得localStorage.clear()。

## 5. 一次性迁移：预览后本人确认

入口 `/invest/my-plan` 为空时显示「新建空计划」「预览本机已有记录」，不自动打开金额预览、不自动保存。source读取仅发生在本人点击预览后（start可用loadStart读非金额摘要）。有新文档后正常加载绝不回退旧资金；坏文档也不回退。

`migration.ts` 导出 `buildMigrationPreview(storage, today)` 和 `confirmMigration(preview, choices, repository)`；preview为内存对象，包括各来源状态、固定字段映射、问题列表、规范化候选与源指纹。先显示是否有填写/默认/损坏，金额默认遮蔽；本人点「显示本机记录并核对」才展开。确认按钮必须含「这是我的记录；我确认这些字段的来源与单位」，不能沿用一期 legacyConfirmation 自动批准。可取消无写入。

### 5.1 plan2026 映射

MUST 调用 `readLegacyPlan` 与其 `LEGACY_KEYS/LEGACY_DEFAULTS/fingerprintOf`，不可复制一套较弱校验。它认定default的字段不进入候选：100万元、75/20/5、5%默认单只上限、所有amount空的模板均为未填写。真实数据恰等默认时也不猜测，显示「与旧示例相同，请在新计划手填确认」；不能通过「全部导入」跳过。

| 旧来源 | 新字段与规则 |
| --- | --- |
| fund-total 填写值 | 元=万元×10000；只作预览候选总额，不另存referenceTotal |
| fund-split 填写值 | base→core，active→research，reserve→reserve预算；仅total/split都有效且本人选择后计算三项元预算；先算core/research分，reserve为总额减两项，预览显示最多1分舍入差；默认split不能配合填写total生成75/20/5 |
| fund-cap 填写值 | 百分数×100→singleStockCapBps，校验整数精度；只候选，需本人单独确认limits；不可把20%的旧active直接当本人新主动上限 |
| holdings 填写行 | 资产类别而非证券：id=`legacy-`+合法旧id（不合法/过长使用稳定序号），label=name；target%×100、band%×100；amount万元×10000；mark source=legacy,asOf=null,verifiedAt=null；riskTags=[]；不推断代码、成本、收益或真正持仓史 |
| cashflow.expense | 仅在本人点击「预览旧现金流」后读；年万元→年元，再÷12四舍五入至分；预览同时显示年/月与舍入提示；确认后存monthlyNecessaryExpense及legacyAnnualExpense来源值，不重复算资产 |
| cashflow.reserve | 实际备用金候选，和总览reserve预算分列；双方不同显示「预算/实际余额口径不同，请核对」；本人可选择作为reserveActual legacy无日期或跳过；不覆盖预算，不自动当应急充足 |
| cashflow.yields / review-* / checks / pretrade-log | 不导入。收益率按旧name关联不稳定且本期不用；作者复盘不是私人记录；冷静期仍在旧页原键保留，起点不重置 |

金额换算用十进制字符串→分的整数算法，不用浮点乘10000；超出分精度时half-up舍入并在预览逐项提示，不允许静默截断。非法、负数、空amount分别invalid/unknown；单行错误只允许跳过该行或回去更正，不把它变0。目标不齐/目标和错可保存草稿，偏离unknown；不得因确认拥有而认定数据有效。导入类别标「原记录无估值日期」，可看历史数学偏离，不能给当前绿灯。

### 5.2 start:v1 映射与所有权切换

使用 `loadStart/parseStartState`，不直接cast。64KiB上限和版本保护同一期。预览包含合法review、答案版本、evaluate结果、本人cap；不复制结果对象或清单勾选（学习进度仍由start独占）。

- 当前题版本答案和assessedAt迁入assessment；selectedRoute默认null，显示推导路线为「自测整理结果」；本人可选择沿用并确认，浏览其他路线不等于选择。
- 老questionnaireVersion：按parseStartState清空答案，保留合法schedule及本人cap；显示「旧题目不能按新题解释，请重做」。rulesVersion过旧则不给当前路线已确认结论，提示重做。
- review保持id/anchor/interval/completedDates/calendarSequence，新增mode默认calendar-check-band-act；保存不会改既有日历UID。parseReview容错忽略的坏review在预览显示问题，不能伪称成功迁入。
- userResearchCapBps是已存本人选择，放limits候选；迁入后仍需本次limits确认；未存时null，不生成500或1000。新向导可显示500建议，但本人未提交不持久化；foundation/incomplete不显示资金许可。
- 同时有legacy/start上限：start只管researchCap，legacy cap只管singleStock，不是冲突字段。研究预算超过已选主动上限时标待核，不能显示nothing-to-do。
- 新建时两来源都未选择则migration=null；选入来源写对应fingerprint/imported:true及本次时间。首次创建时跳过的来源不能以后后台补入；之后只提供显式替换预览，先备份现有文档。

确认时再次读取源并比对预览fingerprint（含cashflow若展开过；start指纹包括版本/答案/review/cap，不包含无关学习进度）。变化则废弃预览、要求重新核对；构造完整doc→校验→repository单次写当前键→成功后写imports收据。任何失败旧键/start逐字不变；不写回、不删除；重试不追加重复行。若预览期间其他窗口已创建文档，create拒绝，不能覆盖。

## 6. 页面和 StartHere 交互

### 6.1 初次向导：四步、每步可跳过

统一一套DOM、`ol`步骤条、当前项aria-current=step；「上一步」「保存并继续」「跳过这一步」始终明确。跳过保留既有值、不清已导入内容；草稿nextStep保存，刷新能继续。最后按钮「保存这份计划」，没有「通过/可以投资」。全部跳过生成合法空草稿，home显示缺项，不显示安全。

1. **资金先分用途**：月必要支出（元）、应急月数（可选默认草稿6，未提交不落盘）、只读需求算式；近期确定支出（元）、该笔资金最早用款档、是否高息欠款。说明「预算不代替资金检查」。under-3y显示底座.5警示，不生成权益模板或定投执行建议；仍允许整理已有持仓。不得仅凭资产规模绕过期限/欠款提示。
2. **三笔投资预算**：core/research/reserve三项元，实时参考总额；明确reserve在分母内、近期支出不在分母内。无自动75/20/5。主动/单只上限可跳过；提示额度可为0、不用满；提高确认见§3。本人点「确认这三笔预算」写budgets.confirmedAt。
3. **记录配置与市值**：默认没有选中模板。本人可手填类别/目标/相对阈值/本类别合计市值/估值日期，不需要证券代码或逐只产品；显式选择教学模板（9.10 30/70、50/50、70/30，仅股票/债券两类别，注明简化示意），展示三问后本人应用，任何模板不自动等于适合本人。应用只改core目标，若已有金额先提示并保留未删除类别金额；需删除的类别先确认并预览，不能静默抹掉记录。也可仅填底仓总额→coreTotalOnly，此时明确「合计已记下，类别偏离还不能判断」。可选研究总额或逐条手录，切换模式须确认替换；不能两模式同时计数。已有个股者可填真实记录，即使自测simple，也不自动清空或生成卖出提示。
4. **检查日和预算节奏**：半年默认、季度可选，anchor草稿建议今天+6个月并限定1–28（若本日29–31，候选夹到28且展示确认；不修改导入锚点）。保存才创建review；模式默认calendar-check-band-act，展开解释另一个选项。可选定投：金额/标签、每月或每季、首个预算日1–28；默认无定投。保存后可下载.ics；定投只是预算备忘，本站不会扣款。

### 6.2 Home 首屏与派生状态

H1后固定信任条/免责声明，再按顺序：①下次检查日倒计时或「检查日已到」②本期待办列表③有条件的「今天没有例行检查待办」。首屏不放行情、收益曲线、产品代码推荐。后续卡片：家庭资金与三预算、配置类别、可选研究持仓/额度、可选定投、检查记录、年度复盘（三个问题）、备份/恢复/清除；高级内容折叠。

`selectPlanStatus(doc,today)` 返回 `{review, todos, dataState, allocationState, limitState, canSayNothingToDo}`；today注入，不在纯函数读Date。todos按稳定id去重排序：保存/冲突→资金用途/已知近期用款→缺预算/未确认上限→数据待核→检查日→预算日。数量为待核事项，不是交易数。

| 状态 | 展示 |
| --- | --- |
| empty | 新建/显式迁移预览；无金额默认值 |
| corrupt/unsupported | 原记录不可识别、下载原文/恢复；不覆盖、不旧值回退 |
| unavailable/unsaved | 常驻「这次尚未保存，关页会丢失，请备份」；编辑计算仍可用 |
| missing/stale/undated/invalid | 具体缺哪项；不可显示绿色「安全」或nothing-to-do；有日期的历史记录不因过了一天就stale，见§7 |
| 到检查日 | 只一条待办；「先核对日期与资金用途，再看事先约定条件」 |
| 有越界 | 「记录显示超出事先阈值，待核对」；不是「马上买/卖」 |
| 无待办且资料充分 | 「今天没有例行检查待办。未到检查日，资金安全、重大产品公告和家庭用款变化仍要及时处理。」 |

nothing-to-do必须同时满足：持久化成功、无冲突、向导已结束、必要资金字段已填（支出/月数/近期支出明确0也可/期限/欠款）、预算已确认且referenceTotal>0、reserveActual有效可核对、review已设且不due、类别目标/完整同日记录已由本人核对、在当前检查周期有效且未越界、需要判断的limits已确认、无定投预算核对待办、无under-3y/高息欠款/应急不足待核事项。仅录总额也可完成向导，但不能说类别已在区间；空计划永远不显示nothing-to-do。研究总额0且声明完整可不要求单只上限；有研究持仓而未填single cap则单只风险unknown。

检查流程：核对用途→手录本次同一asOf市值/备用金（本人点击「这些金额已按该日核对」）→看条件→选择「本次未调整 / 记录新增资金安排 / 已自行调整 / 暂缓并记原因」→保存记录。只在本人保存时追加ReviewRecord快照，同一次scheduleId+scheduledDate不得重复；重复保存更新本次记录需显式确认。deferred不把scheduledDate加入completedDates，仍有一条待复核；其余加入。一次检查只完成最近一期到期日，旧漏检不累积轰炸；未来从原anchor计算。历史最多100，满时先提示导出备份，用户确认才淘汰最旧；不因浏览自动生成快照，不从快照差推收益。

### 6.3 StartHere 切换（同一发布批次）

在旧计划卡位置放新的PlanSummaryCard：empty→「还没有本页计划，去建立/导入」；ready→下次检查日/待办数/数据待核，不显示个人金额；corrupt→去恢复；unavailable→未保存说明。入口仍可链接「查看旧页独立记录」，但不能读旧金额当新计划卡。原LegacyPlanCard不再在StartHere渲染，迁移入口移到MyPlan。

- 通过usePlan订阅，路由返回/跨标签立即刷新。新doc存在后，nextLine读取repository review；用简短摘要+「去我的计划检查」替换本地ReviewPanel编辑，不能两个存储同时可改同一schedule。
- 没有新doc时保留一期ReviewPanel和start额度编辑；迁移必须本人确认，不能为访问StartHere自动创建doc。新doc存在但review=null时也不能回退start.review；显示去设检查日。
- 新doc存在后ResultCard本人额度显示limits.researchCapBps；编辑按钮去MyPlan，不再写start。StartHere重做自测只改start，不改变已有计划，提示「已有计划不会自动改动」；需要更新时在MyPlan显式预览新自测（保留既有资金，不走旧金额迁移）。
- StartHere「清除本页」仍只清start，不清新计划；隐私说明分别说明自测与计划两个本机记录。不会因clear或旧标签写start而回滚新计划。

## 7. 计算规则与书出处（全部纯函数）

权重、触发、输入有效性分开返回，未知不是0。所有比较使用整数有理式，展示百分比四舍五入不能参与触发。

| 规则 | 精确定义/依据 |
| --- | --- |
| 底仓分母 | S=所有core类别mark.value分之和；不含research/reserve/近期用款。完整类别、目标合计10000、每项金额明确含0、同一asOf、S>0才可计算（8.6）。只填类别合计足够，不需要证券明细。coreTotalOnly不能计算偏离 |
| 相对偏离 | 当前权重bps=amount/S×10000；相对偏离bps=(当前权重bps−targetBps)/targetBps×10000。越界严格 `abs(amount*10000-targetBps*S)*10000 > relativeBandBps*targetBps*S`；等于边界不触发（8.3） |
| 边界案例 | 目标15%，阈值相对±25%：11.25%–18.75%含边界都within；11.24%/18.76%越界。不是±25个百分点。目标0/缺目标/缺金额/S=0一律unknown |
| 两种触发 | 默认calendar-check-band-act=到检查日核对且严格越界才显示条件计算；calendar-rebalance=到检查日按事先目标复核，不能偷偷再加越界条件。8.2明确两种方式，本页默认是产品选择，不能说书只允许阈值方式。平日越界仅提示记录待核，不生成交易量 |
| 理论差额 | gap=targetBps*S/10000−amount，展示至分、标「按本次记录与目标计算的差额（正/负）」；只在due且本人本次核对且数据有效、模式触发时展开，绝不出现「需买入/卖出X元」。费用/税费/流动性/用款可能改变本人决定（8.5.1/8.6） |
| 参考总额 | T=三预算之和且本人确认，分母明确固定。research实际合计/T与researchCapBps比较；不是research预算作分母；单只实际/T与singleCap比较（7.4、9.1、36.6）。研究总额模式不能判断单只；未声明记录完整不得说额度内 |
| 额度比较 | 上限严格大于才breached，等于为at-limit文字提示；任一缺值/日期无效为unknown。预算research/T超过本人cap也单列待核。上限余量=max(cap*T−实际,0)，只称余量不用满（33.1），不称可买额度 |
| 相关风险 | riskTags人工填，按相同tag列共同暴露及「未包含基金间接敞口」；不算有效分散、不认证安全，不用股票只数代替风险分析（36.3–36.6）。观察数不占额度，不生成最多N只 |
| 估值日期 | 无asOf或verifiedAt→unknown；source=legacy即使已确认拥有仍unknown，须本人重新核对金额/日期后改manual。不同日期不能合成“当前”比例。有效同日记录即使asOf<today也仅标“基于某日填写的记录”，非检查期不因此生成每日更新待办。dataState=stale只用于已到最近检查日、却尚未在该检查日或之后核对的记录（以verifiedAt的本地日期与due比较）；重新核对需本人确认，不能自动改估值日期。周末可核对上个实际估值日的金额，但所有类别asOf仍需一致。此处不声称市值是实时的，也不发明书中没有的3/45/120天阈值 |
| 检查日期 | 复用checks.occurrence/reviewStatus/daysBetween；本地日历today，不按本地毫秒差除86400000。最近一期未完成才一条due；完成后下一期仍从原anchor算 |
| 定投预算 | 每月/每季均从原anchor；最近一期未ack才1条「核对本期预算」，不补累计漏扣；确认只记预算核对。小额时可显示9.9「考虑按季、先核对费用」，不判定统一最低金额；不翻倍补扣（10.7） |
| 期限/底座 | under-3y/高息负债/应急缺口提示优先，不能因已有配置而掩盖；不自动生成卖出/清仓。冷静期不暂停必要风险、资金安全、家庭用款处理（底座.5、7.1–7.4、37.5） |

可点读的一手出处（以章节节号为准；书内数据是教学案例，不是个人处方）：[7.1–7.4资金用途与分母](../../public/first-book/第7章-配置优先.md)、[8.2/8.3/8.6两种触发与相对偏离](../../public/first-book/第8章-动态平衡.md)、[9.1/9.5/9.9/9.10参考案例与小额起步](../../public/first-book/第9章-参考方案.md)、[33.1额度不是任务](../../public/first-book/第33章-组合搭配.md)、[36.3–36.6数量/观察/单只与共同风险](../../public/first-book/第36章-仓位与纪律.md)、[37.4/37.5决策与冷静期](../../public/first-book/第37章-犯错与复盘.md)、[底座.5近期目标](../../public/first-book/专题-家庭财务底座.md)、[10.7定投预算](../../public/first-book/第10章-标普500与纳指100落地.md)。

历史数学结果可附 `calculatedDeviation` 只作派生，不持久化；dataState仍unknown/stale，不升级成当前安全。任何限额和模式确认都是本人记规则，不是网站审批。

## 8. 日历、备份、移动端、性能与文案

MyPlan calendar.ts调用现有buildIcs，review投影丢弃mode（不在ics带比例）；保留同id→UID、calendarSequence、滚动未来两年、RRULE、全天事件/排他DTEND、UTC DTSTAMP、CRLF/UTF-8 75字节折行、转义、09:00 VALARM和Blob释放。backlink用现有publicPageUrl第四参数invest/my-plan；当前公开origin+BASE_URL，本地开发回正式站根路径；不允许用户输入URL。变更anchor/interval时sequence+1、completedDates重置（旧history不清），改mode不需改日期系列。取消/清除需提示手动删除外部日历系列；不宣称网站会后台通知。至少Apple+Google两客户端实际导入核对后才能声称提醒可用，未验证只说「生成文件」。

备份：固定文件名 `investment-plan-backup.json`；显式点击，内容 `{format:'businessweb-investment-plan', version:1, exportedAt, document}`，不含token、sync元数据、conflict、原始旧键。下载前提示含私人金额；Blob本机生成，不进public目录。恢复限262144 bytes加固定包装开销（最多263168），先parse和预览差异，确认后replace；坏文件原状态逐字不变。有现有文档先提供下载，冲突备份写成功或本人完成下载并确认后才允许替换。更高版本拒绝。清除与恢复分别确认，取消无写入。

固定风险文案：「不构成投资建议，不承诺收益。这里帮你记录规则与核对事项，不是对资金、能力或投资资格的审核。」访客信任条：「计划保存在这台设备的浏览器里，服务器不会收到本机计划；换浏览器或清理本站数据可能丢失，请定期备份。公共电脑用完请清除本机计划。」站长开启云端后改为「你已选择把计划副本同步到站长专用云端；本机与云端可分别保留」，不得继续声称服务器看不到。不说加密/绝对安全。

所有数字标「你填写·估值日期」，未知日期明说；规则/教学案例/本人选择分开。禁输出买卖指令、保证、安全评级、合格/许可、满额任务、根据行情加减仓。研究路线门槛是本页保守解释，不能说书定义了≥5小时精确条件。已有持仓提示「先把记录列清，不因自测结果直接改变持仓；必要风险处理仍需及时核对」。不得粗暴全页禁词（会误伤“不构成买入推荐”），采用结构输出测试+人工文案审读。

可访问性：金额label带元，inputMode=decimal；错误aria-describedby+role=alert；跳步/保存后焦点移到下一步标题，返回保留草稿；新增/删除行用稳定id且删除后焦点合理；aria-live=polite只播报保存/步骤/待办变化，不逐按键播报金额。手动展开敏感金额，默认收起摘要。所有按钮/可独立操作目标≥44px；正文内联链接符合行内例外并有清晰焦点。对比度≥4.5:1，状态有文字/图标不只颜色。300/375/390px单列无页面横滚（表格改卡片）、200%缩放、键盘全流程、prefers-reduced-motion。

性能：MyPlan lazy，StartHere只引repository/types/selectors/轻量摘要；OwnerSyncPanel及cloud显式站长入口后dynamic import。不得带入旧计划宏观请求、整本书、行情图、估值引擎、候选store或第三方SDK。普通访问/编辑/备份/.ics零业务网络请求；仅静态chunk/font允许。payload≤256KiB，读取一次缓存+事件刷新，不在render扫描旧键。build记录新增chunk实际gzip体积与依赖，不编造现有基线；无新依赖，建议新页面及纯模块合计gzip≤60KiB（不计既有共享React），超过需manager审查。

## 9. 站长同步 API 与 SQL

### 9.1 Owner 入口与协议

公开界面不出现云/邮件选项。站长手动打开 `/invest/my-plan#owner-sync` 才加载OwnerSyncPanel，提示「站长专用」；hash只控制可见性，不是鉴权，不含秘密。输入专用PLAN_SYNC_TOKEN（≥32字符），token仅保留当前页面内存，刷新清掉；不借用候选PULSE token、不保存在URL/localStorage/备份、不放VITE环境变量。GET鉴权成功才允许选择同步与周报开关；没有token绝不发云请求。关闭面板/断开丢内存token，现有本机计划仍保留。

默认同源 `/api/market-data/plan-sync`；如复用构建VITE_API_BASE，只允许manager受信的API部署origin，不接受用户填写endpoint。不新增CORS，不承诺GitHub Pages跨域站长同步；在那里显示「请在API同源站点使用站长同步」。普通本机功能不受影响。

`api/market-data/[marketRoute].js` 的Map添加 `['plan-sync',(req,res)=>import('../../server/functions/plan-sync.js').then(m=>m.default(req,res))]`。不得新增顶层api文件，保留12函数部署约束。server/plan-sync.ts可用createPlanSyncHandler注入deps，默认导出生产handler；纯领域校验引用路径带.js用于native ESM。

全部响应包括错误设Cache-Control:no-store和X-Content-Type-Options:nosniff；不加Access-Control-Allow-Origin。配置校验与candidates-sync一致（HTTPS *.supabase.co根origin、无凭证/端口/路径/query，SUPABASE_SECRET_KEY，独立PLAN_SYNC_TOKEN≥32），错误503固定文案。Bearer字节长度相等后timingSafeEqual；401不请求DB。提供Origin头且非本站origin拒403（可信部署origin为服务端PLAN_SYNC_ORIGIN，默认https://business-web-black.vercel.app；仅允许HTTPS根origin、无凭证/端口/query/hash，不信任任意Host，也不从import.meta.env读取服务端配置）；无Origin的受权CLI允许。只GET/PUT，其他405+Allow。

- GET：返回 `{schemaVersion:1, document:PlanDocument|null}`，空云合法返回null/revision0；200带`ETag: "N"`, `X-Revision:N`。N为DB revision。
- PUT同一包装，document必须非null有效PlanDocument。Content-Type:application/json；body JSON UTF-8≤263168且document≤262144；未知包装/无效文档400、超限413、不支持媒体415。If-Match必须精确引号非负安全整数如`"0"`，缺失/非法428；不接受`*`或多ETag。
- RPC原子compare，成功返回新revision，响应200 `{ok:true, revision:N+1}`并带新ETag/X-Revision。冲突409仅固定错误与latestRevision（另GET获取云副本），不回显请求。DB不合法/失败502，6秒Abort超时504；finally清timer。Supabase headers沿样板apikey，新sb_secret_不额外Bearer，旧service_role key带Bearer。禁止日志输出body/金额/token/上游原始错误。

客户端不自动上传/后台定时同步：按钮「读取云端并比较」「同步当前本机副本」。首次GET云非空与本机非空且不同，即进入双副本比较，不能用云覆盖本机；空云上传也必须先GET版本。持久sync元数据baseRevision/dirty：任一本机patch置dirty，成功PUT只在发起时localRevision仍是当前时清dirty；上传中继续编辑不能被成功回包标成全已同步。无metadata时baseRevision=null，必须先GET。请求失败不删除本机，不改基线；401清内存token。

409：保留当次发送前本机doc和GET最新云doc于conflict键，均验证后才能启用决策按钮；GET失败保留本机+旧基线并暂停，不重试覆盖。持久化冲突失败时只允许下载两份，不允许覆盖任一。解决提供「保留本机并用最新云版本覆盖云」「采用云端作为当前计划」「分别下载，暂不处理」；没有自动合并字段/最后写入获胜。前两者必须确认，落败副本conflict保留至本人明确清除。采用本机PUT仍携带最近ETag，若再409重新取并比较且先导出旧冲突，不能静默覆盖唯一冲突档。采用云只replace本机，不再次PUT；同步元数据baseRevision=云版本、dirty=false。sync元数据若写失败，视为基线未知并暂停上传，不能显示已同步；下次重新GET比较，绝不猜ETag。离线恢复后不自动选择。

### 9.2 迁移 SQL（实现时逐字放入指定文件）

由manager将此文件交给用户在独立BusinessWeb项目SQL Editor手动执行；实现agent不得运行生产SQL。幂等不清空旧表；RLS不建公众policy；业务写入只有service_role CAS。

```sql
begin;
create table if not exists public.businessweb_plan_snapshot (
  id integer primary key check (id = 1),
  revision bigint not null default 0 check (revision between 0 and 9007199254740990),
  payload jsonb null,
  updated_at timestamptz not null default now(),
  check (payload is null or (
    jsonb_typeof(payload) = 'object'
    and payload @> '{"schemaVersion":1}'::jsonb
    and octet_length(payload::text) <= 524288
  ))
);
alter table public.businessweb_plan_snapshot enable row level security;
revoke all on public.businessweb_plan_snapshot from public, anon, authenticated;
grant select, update on public.businessweb_plan_snapshot to service_role;
insert into public.businessweb_plan_snapshot (id) values (1)
  on conflict (id) do nothing;

create or replace function public.businessweb_put_plan_snapshot(
  expected_revision bigint, next_payload jsonb
) returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare result_revision bigint;
begin
  if expected_revision < 0 or expected_revision >= 9007199254740990
    or next_payload is null
    or jsonb_typeof(next_payload) <> 'object'
    or not (next_payload @> '{"schemaVersion":1}'::jsonb)
    or octet_length(next_payload::text) > 524288 then
    raise exception 'invalid plan payload';
  end if;
  update public.businessweb_plan_snapshot
    set payload = next_payload, revision = revision + 1, updated_at = now()
    where id = 1 and revision = expected_revision
    returning revision into result_revision;
  return result_revision; -- NULL means CAS conflict; UPDATE holds row lock
end;
$$;
revoke all on function public.businessweb_put_plan_snapshot(bigint,jsonb)
  from public, anon, authenticated;
grant execute on function public.businessweb_put_plan_snapshot(bigint,jsonb)
  to service_role;
notify pgrst, 'reload schema';
commit;
```

SQL的524288是jsonb重排空格后防御上限，不替代HTTP对原始document 262144的严格校验；DB保存document本体不保存HTTP包装。RPC返回新revision或null；null时服务端读取当前revision供409，不读出金额到错误消息。并发同expected_revision只能一个成功；不使用先SELECT再无条件UPDATE。空云种子payload=null，避免在SQL塞虚构计划。DB迁移未执行时新同步失败隔离，不影响访客或原周报。

## 10. 周报：仅站长、只有日期与待核事实

继续走 `candidate-alerts-digest?weekly=1`→createWeeklyDigest，同一CRON_SECRET、既有Gmail/收件人、`weekly|YYYY-Www` DB认领；不改日报、不新增cron、不增加访客网络请求。计划仅云端notifications.ownerWeeklyEnabled=true才参与，默认关闭。本机开关未成功同步不会被服务器读到。

`investment-plan/weekly.ts` 定义投影，避免把完整计划放进WeeklySummary：

```ts
export type PlanWeeklyFacts = { snapshotDate: Day;
  dueDate: Day | null; upcomingDate: Day | null; deferred: boolean };
export function planWeeklyFacts(doc:PlanDocument, today:Day): PlanWeeklyFacts|null;
// weeklySummary.ts 新增 SectionId 'plan'，WeeklyLine.kind 'plan-review'，
// WeeklyInputs.plan?: PlanWeeklyFacts；除此之外不传PlanDocument。
```

规则：today=周报运行时beijingDay(now())；日期是本人选的日历日期，页面以本地today算，因此海外用户临界日可能相差一天，owner面板注明邮件按北京时间检查日期。due使用同一reviewStatus；upcomingDate为[today,today+6]且尚未完成的最近检查日；due优先，最多1行。deferred只在该due对应最新记录outcome=deferred时为true。只有“过期但仍待核/未来7天到检查日”生成plan section；不因为金额未知/越界发金额或偏离通知。

邮件只准固定模板：

- 「我的计划：检查日 YYYY-MM-DD 已到，仍待核对。」
- 或「我的计划：未来 7 天内有检查日 YYYY-MM-DD。」
- 可加「上次记为暂缓，仍待复核。」；来源「站长已同步的计划（同步日期 YYYY-MM-DD）」；链接固定 `/invest/my-plan`。

不含金额、币种、市值、配置比例、基金/公司名、证券代码、个人备注、自测答案、指纹、token、收益或调整方向。section为context:true，不计已有“变化项数”，不会让原本无变化的周报单独发送；原候选/市场有可发事项时才附加。本期不发送“本周曾触发”故事，不新增episode邮件。

server/weekly-digest.ts通过独立小函数以service key读取private plan表（受信Supabase origin、6秒超时），不从公共URL拉私人快照，不向plan-sync转发token。读失败/校验失败/未配置/开关关闭只省略plan section，原周报照常；warnings只固定无金额文字。plan读取不可复用公共fetchJson的站点URL缓存。已存在sentLog=missing时的进程内fallback只能继续用于原有公共部分：计划section在sentLog非ok时必须省略。所有含计划的发送必须通过既有DB weekly认领；claim失败不发；发信失败release沿用现有流程。dryRun仍鉴权/no-store，返回中只能有投影与固定模板，禁止返回PlanDocument，即使仅站长可读也不泄露金额。`weeklySummary.ts` 不自行读localStorage，公开候选页面不传plan投影，因此访客不会看到站长事项。

## 11. 隐私与发布约束

金额、答案、备注、指纹、token绝不进入public、URL/query/hash、SEO、静态预渲染、构建日志、异常原值、analytics、AI请求、GitHub issue/报告截图。唯一例外是本人显式站长同步的TLS请求/私有DB和本人本地下载备份；邮件和ics始终无金额。测试用纯合成数据，不拿浏览器真实计划做fixture。不要声称localStorage加密；同源脚本可读。云开启前说明私有副本边界；断开只清token，不宣称云副本删除；本期不实现远程删除API。

静态SEO只写功能与教育说明，不能把repository读到的值塞meta。所有原始错误进入固定错误码，禁止console.log(document/body)；源码/测试中的金额仅合成例子。没有第三方计数，也不新增本机metrics。

## 12. 实施任务顺序（禁止并行触碰共享文件）

任务依赖 T1→T2→T3→T4，Cursor每项完成给出文件清单、验证证据与未验收项；不得在T2补改T1契约时不通知manager。

| 任务 | 所有权与完成条件 |
| --- | --- |
| T1 数据底座 | 新investment-plan的types/validation/money/migration/repository/usePlan/selectors/schedule/backup及其单测。锁定§3/4 API；不改任何既有文件、不做云/UI。迁移仅预览确认、默认识别/精度/日期unknown/原键逐字保留、并发与失败保护全部通过 |
| T2 本机页面与入口 | 新MyPlan/样式/components（除OwnerSyncPanel）、calendar适配/测试；独占App/siteMap/seo/StartHere/ResultCard/既有calendar及相关既有测试修改。不改T1实现（需要变更由manager串行交回）；四步跳过、home、检查/定投/复盘、备份恢复与StartHere切换集成通过，生产普通浏览无业务请求 |
| T3 云与周报 | 新cloud/usePlanSync/OwnerSyncPanel/weekly投影/server plan-sync/wrapper/SQL及测试；独占aggregator/weekly-digest/weeklySummary/tsconfig.server/check-functions既有文件。T2预留`#owner-sync`惰性组件接点；若必须改MyPlan，只在T2完全结束后由T3单独接入这一点。CAS/双副本、周报无金额/失败隔离、函数数不增通过；SQL只交付不执行 |
| T4 manager验收 | 只读复核diff/文案/完整回归，协调两日历和真人走查、用户执行SQL、生产鉴权dryRun；发现问题交回原任务文件owner修复。不把未做手工验收写成通过，不自动部署/发真实邮件 |

各任务可以在内部按纯模块分小提交，但本期不需要helper workers并行操作同一目录。manager如另派只读review不修改实现文件。

## 13. 测试清单与最终验收

### 13.1 必须新增/保留的自动化证据

| 文件/层 | 必测场景 |
| --- | --- |
| money/validation | 0与null、两位规范化、万元转元/年转月舍入、超限/负数/指数/NaN、未知schema/字段、UTF-8字节限长、重复id、实际日期/时点、200/30/100边界、合计目标错可保存但unknown |
| migration | 全默认→无资金；真实值恰等默认不猜；total缺split/反向缺失；非默认混合；无日期始终unknown；holdings类别非证券；cashflow两reserve不覆盖；旧作者日志不读；v1题目不重释、v2 cap0/500/2000；源变化拒确认；import一次；写失败不标成功；旧键与start逐字不变；旧窗口再写不自动合并 |
| repository | 首次加载零写、patch最新快照、revision冲突、storage事件/返回刷新、Web Locks序列化和fallback冻结草稿；set/get/remove独立失败；unknown原文不覆盖；clear保留旧键/收据；收据失败可从migration恢复；restore备份/取消/坏JSON不覆盖；没有localStorage.clear |
| selectors | 独立算术oracle验证15±25%边界；空/S0/缺目标/异日/无日期；过去日期在两次检查间不产生每日待办，到期未核对才stale；budget与mark不重复；T包括reserve，研究/单只不同分母；cap0/at-limit/breached；两mode到期/平日不同；没有交易量指令；应急与近期用款优先；仅合计unknown；nothing-to-do严格条件 |
| schedule/calendar | 季/半年/跨年/闰年/DST；逾期一条/完成原锚点/暂缓不推进；月季定投不倍补；滚动未来窗口含今天/已完成今天；旧UID保留、改期sequence；root/BASE_URL/localhost backlink；CRLF/UTF-8/转义/VALARM；ics无合成金额/答案/标的/token |
| MyPlan组件 | 全跳过→草稿非安全；只支出×月数；只按类别合计无需代码可判断；仅整个底仓合计则unknown；默认无模板；模板不抹资金；步骤保存焦点；导入预览遮蔽/确认/取消；undated→手录确认日期；检查记录四outcome；restore/clear失败；隐私模式；300px键盘路径；不得私自动用户持仓 |
| StartHere集成 | 没doc仍旧schedule；doc有review即时读新；doc无review不回退；清start不清plan；重做答案不改plan；ResultCard已有plan额度只跳编辑；跨标签替换/删除后UI可重设；计划卡无金额；一期推荐/红线/不完整规则回归不删 |
| plan-sync路由 | 405/503/401/403/428/400/413/415/409/502/504、每个no-store、未鉴权零DB；GET空云0；成功新ETag；DB坏schema拒；并发同版本一成功；无CORS；错误/日志不含payload；native ESM wrapper与聚合加载 |
| cloud状态机 | 首次GET比较不覆盖；PUT中本机修改保持dirty；409留双份；获取最新失败不覆盖；冲突存储失败不能选择；二次409保护旧冲突；401清token；token无持久化；外域部署禁同步；断开不清本机 |
| weekly | 默认关闭/无表/坏文档/超时不影响原周报；future7含边界、due、deferred最多一行；北京时间跨日；context不触发单独发信；缺去重表省略plan；claim失败不发；成功仍weekly单封；dryRun正文/JSON无金额/备注/比例/名称/token；访客buildWeeklySummary不传plan节为空 |
| 边界静态检查 | 新目录不import旧page/行情/候选store；无新api顶层函数；无真实计划写public/URL/日志；允许文件diff白名单 |

推荐命令（由实施者执行，本文不宣称已通过）：

```sh
npm test -- --run src/features/investment-plan src/pages/MyPlan.test.tsx src/pages/StartHere.test.tsx src/features/invest-start src/features/weekly/weeklySummary.test.ts server/plan-sync.test.ts server/weekly-digest.test.ts
npm test -- --run src/pages/InvestmentPlan2026.test.tsx src/pages/Home.test.tsx src/App.test.tsx src/components/SectionChrome.test.tsx
npm run typecheck
npm run test:functions
npm run test:scripts
npm run build
```

build可能改生成物，检查并避免提交无关文件；不得用git reset清除其他worker改动。若现有测试文件实际命名不同，先rg --files定位等价测试并报告，不为不存在路径声称通过。SQL CAS/匿名撤权必须在隔离测试库验证（若无测试库，标待用户执行，不以mock声称DB安全已经验证）；不得用生产数据做并发写测试。

### 13.2 最终通过条件

1. `/invest/my-plan`可直接进入、投资导航高亮、⌘K搜「我的计划/持仓/定投」命中，页面懒加载；旧页DOM与代码未改。
2. 四步均可跳过；应急需求与三预算口径准确；从类别合计完成偏离检查；缺值/无日期/旧默认不能出现当前安全结论，3年内用款不能被路线或金额绕过。
3. 迁移预览+本人确认、单位正确、一次导入无双写；旧plan2026/start原字符串未变。StartHere已建计划检查日/额度只读新repository，无schedule分叉。
4. 明确默认复合模式与8.2两种方式；严格阈值边界、7.4分母、36.x额度/共同风险正确；输出无交易指令/资格认定/收益暗示。
5. 备份恢复清除/本机写失败/跨标签冲突可恢复；409双方可下载可选择，不丢本机；访客无云/邮件入口和计划请求。
6. 站长专用独立token、无新增API函数、SQL撤公众权限、CAS并发有证据；周报仅无金额context一节，旧发送和失败隔离不退化。
7. 两日历实测与移动/键盘手工验收记录明确；5位真人至少覆盖新手、小额定投者、2小时研究者、已有个股者、近期用款者，各能用自己的话说明下一步和「不是买卖指令」。模拟走查不能冒充真人验收。
8. 自动检查通过并列明未完成的生产SQL/真实日历/真人测试；任何一项未完成就写待验收，不以代码测试替代外部效果证明。

本规格的事实核对使用本地源码与书章；图谱查询返回empty/not_found，未据此推断依赖不存在，调用关系以实际import/聚合路由/脚本核对。本文没有运行测试、修改代码、执行SQL、访问私人本机计划或发送邮件；实施和发布证据由后续任务提供。
