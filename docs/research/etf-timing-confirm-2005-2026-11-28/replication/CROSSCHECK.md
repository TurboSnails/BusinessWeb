# L-056 两实现交叉核对（Node `run.mjs` vs Python `replication/run.py`）

日期：2026-11-28。按 `CLARIFY-1.md` 对齐后比对。

- 比对脚本：`replication/compare.py`（`python3 -I replication/compare.py`），差异清单写入 `replication/compare-diffs.json`。
- 比对对象：
  - 主实现：`results.json`（SHA-256 `e0bbc5e1…70f0`，generatedAt 2026-11-28T12:15:53Z），字段含义按 `results.schema.json`。
  - 第二实现：`replication/results.json`（SHA-256 `4e97aa2e…aadb`）。
- 独立性：第二实现没有读 `run.mjs` 源码，在比对前已独立算完（第一版结论同为「部分确认」）。比对阶段只读了 `results.json` 与 `results.schema.json`。

## 结论

**比对 6,369 个字段，差异 0 个。**

- 1,483 个字段要求完全相同：布尔、个数、等级、p 值、成交日列表、日期、SHA-256。
- 4,886 个字段按容差比：百分数 ≤ 1e-8，k ≤ 1e-10。
- 有 321 个字段两边都是 null，都是不足 1 年区间的 `annual`。
- 容差内的最大实际差：百分数 7.6e-12 个百分点，k 为 0。
- p 值全部逐位一致：p_C、p_A、p_X、指数级 p、C′ 的 p、择时滤网安慰剂 4 个 p、L-004 两种平移集合、E1。

**两实现一致的判定**：最终等级「部分确认」；主口径与 L-004 布局都是 #D 15、#A 5、#P 5、#X 13（年化腿 13 / 回撤腿 14）、#X′ 13，p_C = 1/1214。降级规则 1 未触发，两口径同级，E1 同级（不写依赖声明）；W 年化波动低于 M_i 的指数 0 个。

**自检**：把第二实现结果里的四处数值人为改动后重跑 `compare.py`，四处全部报出，所以「0 差异」不是映射漏比造成的。四处改动是：W 年化 +2e-8、p_C 改为 2/1214、一个卖出日改掉、k +1e-9；连带 `final.pC` 也报出，共 5 条。

> 两套实现一致只证明代码没写错，不证明结论可靠（LEDGER 规则 5）。

## 映射表（主实现字段 → 第二实现字段）

| 区块（字段数，其中要求完全相同的） | 主实现 `results.json` | 第二实现 `replication/results.json` | 容差 |
|---|---|---|---|
| checks（10，10） | `checks.{strategiesSha256, inputsCleanSha256, l018InputsSha256, cashRatesSha256, rawCleanEqualsInputsClean, calendar.{bars,W,C,Wprime}, countResultsAgree}` | `checks.{strategiesMjsSha256, inputsCleanSha256, l018InputsSha256, cashRatesSha256, rawClean.identicalToInputsClean, barCounts.{calendar,W,C,Wp}}`、`countResultsCheck.allBuySellMatch` | 完全相同 |
| main / l004Layout（各 1,090，280） | `perIndex.<c>.{k, kPrime, eW0}` | `perIndex.<c>.{k, Wp.k, posAtWStartMinus1}` | k ≤ 1e-10 |
| | `perIndex.<c>.{W, C, Wprime}.{rule,hold,M}.{years,total,annual,dd}` | `perIndex.<c>.{W, C, Wp}.{rule,hold,M}.*` | ≤ 1e-8 |
| | `perIndex.<c>.W.vol.{rule,hold,M}` | `perIndex.<c>.W.{rule,hold,M}.vol` | ≤ 1e-8 |
| | `perIndex.<c>.{D,A,P,Xann,Xdd,X,volLowerThanM}`、`Wprime.{Xann,Xdd,X}` | `perIndex.<c>.{D,A,P,X_ann,X_dd,X,volLowerThanM}`、`Wp.{X_ann,X_dd,X}` | 完全相同 |
| | `perIndex.<c>.trades.{buys,sells}`（全序列成交日） | `perIndex.<c>.tradesAll.{buyDates,sellDates}` | 完全相同 |
| | `perIndex.<c>.Csse.{rule,hold,M,D,Xdd,X}` | `Csse.perIndex.<c>.{C.{rule,hold,M}, D, X_dd, X}` | 同上 |
| | `counts.{P,D,A,X,Xann,Xdd,Xprime,XprimeAnn,XprimeDd,volLowerThanM,Csse_D,Csse_X,Csse_Xdd}` | `counts.{P,D,A,X,X_ann,X_dd,Xp,Xp_ann,Xp_dd,volLowerThanM}`、`Csse.counts.{D,X,X_dd}` | 完全相同 |
| | `placebo.{nShifts, shiftRange, pC, pA, pX, perIndexP.<c>, pCsse}` | `placebo.{nShifts, shiftRange, p_C, p_A, p_X, indexLevel_C_dd.<c>.p_ge}`、`Csse.p_C` | 完全相同 |
| | `placebo.{DbarRule, AbarRule, DbarRuleCsse}`、`placebo.dist.{Dbar,Abar,X}.{p10,median,p90,mean}` | `placebo.{Dbar_rule, Abar_rule}`、`Csse.Dbar_rule`、`placebo.dist_mainConvention.*` | ≤ 1e-8 |
| | `gradeBeforeDowngrade, downgrade1Triggered, grade, subLabel, note, gradeCsseReportOnly` | `grade.{beforeRule1, rule1Triggered, afterRule1, subtag}`、`Csse.gradeBeforeRule1` | 完全相同 |
| l004LayoutAltShifts（13，13） | `{shiftRange, pC, grade, counts.*}` | `l004LayoutAltShifts.{shiftRange, p_C, grade, counts.*}` | 完全相同 |
| e1（1,025，230） | 同 main 的 perIndex / counts / Csse，另有 `placebo.{pC,pA,pX}`、`differsFromMain` | `E1.*`、`E1.grade.differsFromMain` | 同上 |
| final（10，9） | `{mainGrade, l004Grade, grade, sensitiveToSingleDataDay, subLabel, pC, likelihood.{pH1,pH0}, e1DependencyStatement}` | `final.*`、`main.placebo.p_C`、`final.likelihoodRatio.gradeWithSubtag[0..1]`、`E1.grade.differsFromMain` | 完全相同 |
| | `likelihood.ratio` | `final.likelihoodRatio.gradeWithSubtag[2]` | 0.05（见下文「表示口径」） |
| variants（534，159） | `cash.<c>.{W, C, D, A, P, MCash.{W,C}, XvsMCash}`、`cashCounts.*` | `cashInterest.perCalendarDay.perIndex.<c>.{W_rule, C_rule, D_cashRule, A_cash, P_cash, W_Mcash, C_Mcash, X_cashRule_vs_Mcash}`、`cashInterest.perCalendarDay.{A, D_cashRule, P, X_cashRule_vs_Mcash, crossesPge9Boundary}` | 百分数 ≤ 1e-8，其余完全相同 |
| | `nextDaySell.<c>.{k, W, C, D, A, P, X, trades}`、`nextDaySellCounts.*` | `sellNextDay.perIndex.<c>.{k, W_rule, C_rule, D, A, P, X, tradesAll}`、`sellNextDay.counts.*` | 同上 |
| macdOnly（150，30） | `<c>.{W, C, D, A}` | `macdOnly.perIndex.<c>.{W, C, D, A}` | 同上 |
| filterPlacebo（21，5） | `{nShifts, dist.{Dbar,Abar,D,X}, pDbar, pAbar, pD, pX}` | `timingFilterPlacebo.{nShifts, dist_mainConvention.*, Dbar.p_ge, Abar.p_ge, D.p_ge, X_ownK.p_ge}` | 分布 ≤ 1e-8，p 值完全相同 |
| reports（2,336，379） | `<c>.years.<y>.{from,to,rule,hold,M,buys,sells,heldShare}` | `byYear.<c>.<y>.{base,end,rule,hold,M,buys,sells,heldShareClose}` | 收益 ≤ 1e-8，heldShare ≤ 1e-10 |
| | `<c>.contributions.{bull,C,W}.{ruleMinusHold,ruleMinusM}` | `segmentContribution.<c>.{bull_…, C, W}.{ruleMinusHoldLog, ruleMinusMLog}` | ≤ 1e-8 |
| | `<c>.otherSegments[]`、`<c>.cSplit[]` | `otherDrawdowns.<from..to>.<c>`、`publishedVsBackfill.C_split.<from..to>.<c>` | ≤ 1e-8 |
| | `<c>.backfillSegment.{k,rule,hold,M}`、`<c>.published.{from,to,k,rule,hold,M}`（4 个指数以外为 null） | `publishedVsBackfill.backfillSegment.perIndex.<c>`、`publishedVsBackfill.publishedSubset_n4.<c>`（4 个以外不存在） | 同上 |
| groups（16，16）、l004Sets（6，4） | `groups.{bluechipDividend,smallCyclical,other}.{n,P,D,A,X}`、`patternReproduced`、`l004Sets.{passSet,failSet}.{P,notP,medianRuleMinusMAnnual}` | `groups.groups.{largeCapDividend,…}`、`L004PatternReproduced`、`twoByTwo_P`、`medianRuleMinusM_annual` | 中位数 ≤ 1e-8，其余完全相同 |
| nearTies（3，3） | `ratio[]`、`macd[].{code,date,tradeDayOrNext}` | `nearTies.ratio[].date`、`nearTies.macd.<c>[].date`、`summary.macdTiesThatCanDecideTrade` | 完全相同 |
| fourCrashes（20，20） | 2008 与三次功效大跌的 `{pC, X, Xdd, Xann, betterThanRandom}` | `fourCrashes.rows.*.{p_C / p_C_median, X…, X_ann…, pCle010 / betterThanRandom}` | 完全相同 |
| countCheck（45，45） | `<c>.{buys, sells, ok}` | `tradesAll` 计数、`countResultsCheck.perIndex.<c>.yearMismatches` 为空 | 完全相同 |

**没有比对的字段**：
- 主实现有、第二实现没有：`checks.rawFilesVerified`（73 个 raw 文件；第二实现只校验了用到的 36 个 perf 文件，SHA-256 全部相符）、`variants.selfCheckEqFromPosMaxRelDiff`（主实现内部自检）、`perIndex.name`（null）、`generatedAt` 等元数据。
- 第二实现有、主实现没有：现金计息的另两种读法、时机安慰剂的 k^s 版 p_X（见下文）、指数级 p 的分布分位、L-004 布局相对主口径的成交日差异与 W 前成交、`count-results.json` 逐年核对。

## 差异逐条原因

差异数为 0，没有需要解释的不一致。下面几项是**表示口径不同但已对齐**，以及 **CLARIFY 措辞需 manager 确认**之处：

1. **`final.likelihood.ratio`**：主实现 1.2553（= 0.059 / 0.047），第二实现 1.3（PREREG 功效表的一位小数）。不是计算差异；pH1、pH0 完全相同。结论写哪种由 manager 定，建议写「约 1.3」。
2. **`gradeCsseReportOnly`**：主实现 schema 没写明是在降级规则 1 之前还是之后。第二实现两者都给了，比对用规则 1 之前的值；本次两者相同（部分确认），不影响结果。
3. **现金计息版的 P**：第二实现 `P_cash` = 计息 A 且主口径 D，主实现可能用计息版 D。两种 D 在 15 个指数上都为真，结果相同。
4. **近似并列**：主实现标「是否成交日或其次日」，第二实现标「是否可能决定成交（不在预热期）」。唯一的并列都在第 0 根（2004-12-31，DIF = DEA = 0 初值），两种标法都为否。
5. **【交 manager 裁定】CLARIFY-1 第 3 条「择时安慰剂的 #X^s」指哪一个安慰剂**：
   - **第二实现的理解**：按「**择时滤网**安慰剂」实现，即每个平移用自己的 k 构造静态对照。这与主实现 `filterPlacebo.note`（引用 clarify-needed 第 3 条）一致，两边 pX = 0.1071，完全相同。
   - **另一种读法**：若该条本意是**时机安慰剂（循环平移）**的 #X^s，那么两套实现现在的 `placebo.pX` 都用规则的 M_i（与冻结的 `power.mjs` 相同），都需要改。第二实现已按 k^s 版另算了 `main.placebo.p_X_ownK_aux` = 0.00741（规则 M_i 版 0.00824），供参考。
   - **影响**：p_X 只报告，不进等级，所以两种读法都不改等级与结论。
6. **主实现结果的时效**：比对用的主实现 `results.json` 生成于 CLARIFY-1 之前，但它的口径已与 CLARIFY-1 第 1、2、3（按滤网安慰剂理解）、6 条一致：现金计息按日历日，H00300 W 年化 29.5268887540，与第二实现相同；安慰剂年化以 E(−1) = 1 为基，Ā^s 均值 10.9034988943，与第二实现相同。若主实现之后重跑，请再运行一次 `compare.py`。

## 对第二实现的修改（按 CLARIFY-1）

详见 `NOTES.md` 第〇节：
- 安慰剂年化改为以 E(−1) = 1 为基；
- 现金计息主读法改为逐日历日；
- 新增 L-004 {63..1276} 敏感性：p_C = 1/1215，等级不变；
- 新增三个口径各自的 C′ 评估、全序列成交日、schema 口径的分布。

判定数字与第一版相同。
