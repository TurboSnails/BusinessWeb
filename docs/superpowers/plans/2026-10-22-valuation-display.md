# 估值展示与情景筛选 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task. Coordination uses Orca with disjoint owned files.

**Goal:** 落实用户已批准的方向+区间展示、可用筛选、具体待核提示，更新本地。
**Architecture:** 纯函数统一计算用于展示的方向、区间与证据提示；React组件消费该结果。保留既有compareValuation的币种、价格日期守卫，位置筛选共用该比较，不重做估值、不修改原始公司数据。
**Tech Stack:** TypeScript, React, Vitest, CSS.
**Spec:** docs/reviews/2026-10-22-valuation-display-decision.md（用户已批准继续实施）

## Global Constraints

- 先写有意义的失败测试，证明失败后实施；不新增依赖，不提交/推送，不改原始公司估值或Skill。
- undated首行“情景偏低/偏高 XX% · 区间内/低于区间/高于区间”；present可“低估/高估”。低估折价分母为base，不混用空间分母current。
- future显示明确目标日期和相对现价空间，不称今日低估，不进below/within/above筛选。
- 区间内弱色，区间外强色；有具体待核项不自动代表财务错误，不能按缺项数量评分或默认排序。
- 百分比异常大的偏高允许改为明确“现价 N×基准”；不能输出Infinity/NaN。收益阈值不用于投资评级。
- 保留基准、现价、币种、报价日期；无数值/缺价/零base不伪造判断。

## Review Focus

- 恰等low/high属于区间内；base四舍五入精度内零值接近基准。
- 刷新价必须同币种、非旧报价，tradability=unverified不能绕过守卫。
- future独立筛选，不被主文案/aria当今日高低估。
- 缺少标记不等于证据已认证；真实缺项全文通过title/详情可见。
- 375px和大字号下标签可换行，颜色之外有明确文字。

## Shared Interface (fixed)

Create `src/features/company-valuation/presentation.ts` exporting:

```ts
export interface ValuationPresentation {
 headline: string
 positionLabel: string | null
 tone: 'under' | 'over' | 'fair' | 'waiting'
 emphasis: 'strong' | 'muted'
 current: number | null
 priceDate: string | null
 basisLabel: string
 timingLabel: string
 evidenceNote: string | null
}
export function getValuationPresentation(record: CompanyValuation, refreshed?: Company['marketRefresh']): ValuationPresentation
```

不存在记录由组件自行处理。对insufficient/value=null，headline=等待证据；缺price时headline=缺少现价；base0不可作除数。证据摘要必须来自实际missing、主方法reason/inputs，最多一条；优先实质币种/股份桥接、明确盈利冲突/极端盈利输入待核、倍数待核、预测年/情景期限。不能把普遍“未逐家重读”机械显示成重大数据错误。

### Task 1: Comparison and presentation (Claude owns)

Files: model.ts, model.test.ts, NEW presentation.ts, presentation.test.ts. Do not edit UI/CSS/page/tests owned by others.
- [x] Add failing tests covering semantics, bounds, future, quote guards, missing/zero base, evidence note and no fake verified status.
- [x] Implement shared interface and relabel/reduce filters to all/below/within/above/future/waiting; keep numeric/undated IDs compatible if needed but may omit from visible buttons. below/within/above accept present and undated, future excluded.
- [x] Verify frozen data counts: 264 below, 561 within (exclude SOFI future), 142 above, 1 future, 572 waiting across1540.
- [x] Run focused tests/typecheck, report commands/results and changed files.

### Task 2: Compact UI (Antigravity owns)

Files: CompanyValuation.tsx, CompanyValuation.test.tsx, company-valuation.css. Use above shared helper; do not edit its model/helper or ResearchNotes.
- [x] Add failing render tests for undated direction+position, future explicit date, insufficient concrete reason, unknown price and corrected denominator.
- [x] Replace duplicated cell calculations with helper, show headline+position on first line, base/current second; method/date and at most one evidence note in compact line(s). Keep full reasons/detail link, no chart or scoring/sorting. Detail footnote describes denominators and situation correctly.
- [x] CSS class tone is-under/is-over/is-fair/is-waiting; emphasis class is-muted/is-strong. Within and future muted; outside may strong. Text remains meaningful without color. Mobile wraps safely.
- [x] Run focused tests; if helper pending wait/read mail instead of writing conflicting substitute.

### Task 3: Integration and review (Coordinator owns)

Files: ResearchNotes.tsx hint only, new integration test/docs as needed; corrections after owners settled.
- [x] Update hint to describe situation-dependent color strength and model limitation.
- [x] Independently inspect actual changes and concrete inputs/cases; ask peer review if substantive unresolved concerns.
- [x] Run company valuation tests, ResearchNotes tests, typecheck, lint, batch validator and production build. Broaden full tests once after final integrated changes.
- [x] Verify local browser example MSFT=情景偏低22.4%/区间内, future dated, filter returns expected entries, insufficient visible; check small viewport if supported.
- [x] Record final evidence, release workers, leave local service available.

## Execution evidence

Claude实现比较/helper并完成真实撤回模型与异常价差的验收修正，Antigravity实现组件/CSS与渲染测试，协调者收紧布局和完成独立集成验收。最终全文见 `docs/reviews/2026-10-22-valuation-display-implementation.md`。
