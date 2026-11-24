# 设计：市场雷达升级

契约的唯一来源是 `src/features/market-radar/types.ts`（Orchestrator 已写定，Implementer 不改）。本文说明每个字段怎么算、页面怎么用。

## 1. 数据：每项指标的新字段

在 `scripts/lib/market-radar/indicators.mjs` 的 `DEFINITIONS` 里为每项指标补元数据，由 `buildIndicators` 输出。

### 1.1 方向、频率、过期

- `direction`：原 `inverse: true` → `'cold'`（数值越高越冷），其余默认 `'hot'`；下列改为 `'none'`：`volume`、`volumeRatio`、`gex`、`equalWeight`、`skew`、`cftcLev`。
- `frequency`：`daily | weekly | monthly | quarterly | irregular`，按来源的真实发布频率写（家庭两项、巴菲特指标、对冲基金多空比、企业利润为 quarterly；美银三项为 irregular）。
- 过期上限（天）按频率定，个别指标可在定义里覆盖：daily 10、weekly 21、monthly 75、quarterly 200、irregular 60。覆盖：Ken French 行业类（`breadth`、`industry200`、`industryNetHighs`、`industryAdvDec`、`industryMomentum`、`industryHighs`）100；`epsYoy` 200；`finraDebtYoy`、`marginGdp` 75；`hfEquityLs` 300（Form PF 滞后数月）。
- `status`：定义里 `discontinued: true`（目前只有 `naaim`）→ `discontinued`；可用观测少于 3 个 → `sparse`；超过过期上限 → `stale`；否则 `fresh`。
- `ageDays`：生成日 − `observedOn`。

### 1.2 百分位与冷热

- 百分位定义不变（中位秩，含当前点，扩张窗口）。**样本**改为：frequency 为 daily 或 weekly 的序列，先按周（周一为起点）取每周最后一个观测，再加上最新观测；其余频率用原序列。`percentileBasis` 写成「每周最后一个观测」「月度样本」「季度样本」。金银比沿用现有的月度样本。
- 四项按百分位计分的指标（`erp`、`pe`、`equityShare`、`cashShare`）本来就是月度或季度样本，打分不受影响；实现后须用测试固定这一点。
- 历史不足 3 年不给百分位（不变）。
- `heatRank`：direction 为 hot → 百分位；cold → 100 − 百分位；none 或无百分位 → null。
- `heat`：status 为 stale / discontinued / sparse，或 heatRank 为 null → `'na'`；否则 ≥80 hot、≥60 warm、≤20 cold、≤40 cool、其余 neutral（阈值不变）。

### 1.3 数值、短读数、单位

- `value`：最新观测的数值。`unit`：见契约注释。`valueText`：数值 + 单位，小数位与 `display` 句子里一致；带正负含义的（变化、同比、差值）带正号；负号用「−」。读数暂缺时 `value: null`、`valueText: '—'`。

### 1.4 变化

`changes` 最多两项，比较最新观测与「不晚于（最新观测日 − N 天）」的最近一次观测；该观测距目标日超过 N 的一半则不给这一项。

| 频率 | 第一项 | 第二项 |
|---|---|---|
| daily、weekly | 较 1 个月前（30 天） | 较 3 个月前（91 天） |
| monthly | 较 3 个月前（91 天） | 较 1 年前（365 天） |
| quarterly | 较上一季（91 天） | 较 1 年前（365 天） |
| irregular | 不给 | 不给 |

`delta` = 当前 − 当时。`text`：单位为 `%` 的水平值（比例、占比、同比）写成百分点差（「+1.20 个百分点」）；其余沿用指标单位。`toward`：delta 为 0 或 direction 为 none → flat；否则按 direction 与 delta 的正负得出 hot / cold。

### 1.5 规则线

`thresholds`：

- 按数值计分的指标给扣分线与加分线：`baaChange`（+0.20 minus / −0.15 plus）、`finraDebtYoy`（+30 minus / −20 plus）、`breadth`（40 minus / 60 plus）、`epsYoy`（−10 minus / +10 plus）。
- 按百分位计分的四项给「当前第 20 百分位」「当前第 80 百分位」对应的数值（用当天可得的同一样本求分位数），kind 按该指标的加减方向。
- 只展示指标给参考线（reference）：`netLiquidity` ±2、`hy` 500、`naaim` 30 / 90、`vixTerm` 1.05、`volume` 1.10、`nfci` 0（长期平均）、`ofrCredit` 0、`vix` 20 / 30、`trend200` 0、`putCall` 1.0。其余为空数组。

### 1.6 历史

所有指标都带全部历史，抽样规则沿用现有 `chartRows`（月度及更稀原样保留；日频、周频跨度 ≤ 30 年按周取最后一个观测，更长按月取；始终保留最新观测），不再只保留最近 120 个。`hy` 这类不足 3 年的日频序列原样保留。

### 1.7 小组与核心

| 维度 | 小组 | 指标（★ = 核心，粗体 = 计分） |
|---|---|---|
| 流动性 | 央行与资金 | netLiquidity★、reserves（新） |
| | 信用与金融条件 | **baaChange**★、nfci（新）★、ofrCredit（新）★、hy★ |
| | 利率、美元与商品 | realYield（新）★、dollar（新）、goldSilver |
| 估值 | 盈利估值 | **pe**★、forwardPe★、cape★ |
| | 相对债券与股息 | **erp**★、dividendYield（新） |
| | 总量 | buffett（新）★ |
| 仓位与拥挤度 | 家庭与杠杆 | **equityShare**★、**cashShare**★、**finraDebtYoy**★、marginGdp（新） |
| | 机构仓位 | cftcAsset★、cftcNdxAsset、cftcLev（新）、hfEquityLs（新）、naaim、managerCash、managerUsOverweight、managerTechOverweight |
| | 情绪与期权 | aaiiSpread★、putCall（新）★、skew（新） |
| 交易结构 | 趋势与波动 | trend200（新）★、drawdown（新）★、vix（新）★、vixTerm★、realizedVol（新）、vvix（新）、impliedCorr、gex |
| | 宽度·行业（长历史） | **breadth**★、industry200、industryMomentum、industryHighs、industryNetHighs、industryAdvDec |
| | 宽度·成分股 | breadth200★、above50、sectorBreadth、netHighs、advDec、equalWeight |
| | 成交 | **volume**★、volumeRatio |
| 盈利 | 盈利 | **epsYoy**★、forwardEps★、profitGdp（新） |

输出顺序 = 上表顺序（维度 → 小组 → 指标）。

## 2. 数据：新增 18 项指标（全部只展示）

规则文字统一以「事后新增，只展示，不计分。」结尾，并写明来源、起点与口径。

| id | 名称 | 来源（站内已有的写文件与键） | 数值口径 | 频率 | 方向 |
|---|---|---|---|---|---|
| nfci | 金融条件指数（芝加哥联储 NFCI） | `macro-us.json` → `series.nfci.long` + `history` 最新 | 指数值；0 为 1971 年以来平均，正值偏紧 | weekly | cold |
| ofrCredit | 金融压力指数·信用分项（OFR） | **新接** `https://www.financialresearch.gov/financial-stress-index/data/fsi.csv`，取 `Credit` 列；读数句附 `OFR FSI` 总指数 | 指数值；正值代表压力高于平均 | daily | cold |
| realYield | 10 年期实际利率 | **新接** FRED `DFII10`（2003 起） | % | daily | cold |
| dollar | 美元指数 13 周变化 | **新接** FRED `DTWEXBGS`（2006 起）；读数句附指数水平 | 13 周（91 天）涨跌幅 % | daily | cold |
| reserves | 银行准备金 13 周变化 | `us-market-data.json` → `bankReserves` | 13 周涨跌幅 % | weekly | hot |
| buffett | 巴菲特指标（非金融企业股票市值 ÷ GDP） | `macro-us.json` → `series.buffett.long`；观测日按季末、可得日按季末后第 3 个月末 | % | quarterly | hot |
| dividendYield | 标普 500 股息率 | `us-market-data.json` → `spxDividendYield`（月度 + 最新） | % | monthly | cold |
| putCall | Put/Call 成交量比（Cboe 全产品） | `macro-us.json` → `series.putCall.long` + 最新 | 比值 | monthly（最新为日读数） | cold |
| skew | Cboe SKEW 尾部风险指数 | `us-market-data.json` → `skew` | 点 | daily | none |
| cftcLev | CFTC 杠杆基金标普期货净仓 | `us-market-data.json` → `cftcSpxLev` | 占未平仓合约 % | weekly | none |
| hfEquityLs | 对冲基金股票多空比（OFR，Form PF） | `macro-us.json` → `series.hfEquityLs.long` | 比值 | quarterly | hot |
| marginGdp | 融资余额 ÷ GDP | `macro-us.json` → `series.marginGdp.long` | % | monthly | hot |
| vix | VIX 水平 | `us-market-data.json` → `vixDaily` | 点 | daily | cold |
| trend200 | 标普相对 200 日均线 | `macro-posture-daily.json` → `rows`（1973 起日收盘） | 收盘 ÷ 200 日均线 − 1，% | daily | hot |
| drawdown | 标普距 52 周最高收盘 | 同上，252 个交易日窗口 | 收盘 ÷ 窗口最高收盘 − 1，%（≤ 0） | daily | hot |
| realizedVol | 标普 20 日已实现波动率 | 同上，20 个日对数收益的标准差 × √252 | % | daily | cold |
| vvix | VVIX（VIX 的波动率） | **新接** Cboe `VVIX_History.csv`（2006 起，同 COR1M 的取法） | 点 | daily | cold |
| profitGdp | 企业利润 ÷ GDP | `macro-masters-fred.json` → `series.profitGdp`；可得日按季末后第 3 个月末 | % | quarterly | hot |

实现约束：

- 新接的四个来源用 `refreshRadarSources` 里现成的 `refresh(id, url, parse)`（带缓存、失败沿用缓存、首次失败且无缓存时 `warn` 并返回空数组），缓存写到 `data-raw/market-radar/`。FRED 请求不加浏览器 User-Agent。
- 站内序列缺键或为空时该指标读数暂缺，不抛错。
- `scripts/market-radar.mjs` 增加 `--dry-run`：照常计算并打印摘要，但不写任何文件（`runRadar({ write: false })`）。

## 3. 数据：口径修正

- **A1 盈利时点**：`shillerEps` 只保留季末月（3、6、9、12 月）的值，按「季末后第 3 个月末可得」形成阶梯序列；`epsYoy`（同比 = 与 4 个季度前相比）和 `priceAdjustedPe`（用最近一个已可得季末的市盈率 × 当月月均价 ÷ 该季末月月均价）都用它。Multpl 补算的部分同样只取季末月。当前读数口径不变。披露里新增一条，写明修正日期、原因与对夏普、档位月数的影响（数字由脚本前后对比得出后写入）。
- **A2 净流动性**：`netLiquidity()` 里 2013-09-23 之前缺隔夜逆回购读数时按 0 计；之后仍要求 7 天内有读数。规则文字写明。同步改 `data-raw/market-radar/SOURCES.md`。
- **A3 / C3 方向**：见 1.1。
- **B4 / B5**：见 1.1、1.2。
- **C1 股债利差读数句**：写成「市盈率截至 X 月 X 日，10 年期美债用 X 月月均收益率 a%，相差 b 个百分点；按 X 月 X 日当日收益率 c% 计为 d 个百分点」，当日收益率取 `us-market-data.json` → `tenYearDaily`，缺失时省略后半句。打分与百分位口径不变。
- **C2 数据异常**：查明 `volumeRatio` 缺 2026 年 1 月的原因（`scripts/us-market-data.mjs` 约第 285 行附近）；能在雷达侧用 `volume` 序列补算就补算，否则记入回执。早年读数低于 0.3 的日子（1997-12-26、2003-12-26）并入现有的半日市与错值剔除规则。
- **`current.dimensions[].drivers`、`current.counts`**：按契约输出。
- **`current.caveats`**：(a) 两项家庭配置合并算一票时的拥挤度分与热度分，仅当它会改变冷热分类或今天热度恰在边界（|热度分 + 0.5| < 0.05 或 |热度分 − 0.5| < 0.05）时给出；(b) 有计分指标处于 stale 时逐项点名。

## 4. 数据：回测新增（`scripts/lib/market-radar/backtest.mjs`）

- `timeline[].score`、`timeline[].dims`：`buildMonthlySignals` 里已有 `scoresAt` 的结果，带出综合分与五个维度分（顺序同 `DIMENSIONS`）。信号对象新增字段不影响综合策略（它只读已有字段）。
- `curves`：四个策略按月复利的净值，回测首月之前为 1；保留 4 位小数。
- `tierStats` / `heatStats`：按信号月的雷达档位、冷热分组，用 `scripts/lib/combined-strategy/matrix.mjs` 的 `forward12` 计算之后 12 个月（信号月后第 2 至第 13 个月）的平均回报、为负比例、平均最大回撤；`all` 与 `since2000`（信号月 ≥ 2000-01）各一份。五个档位、三个冷热都要有行，没有样本的 `months: 0`、其余 null。
- `monthEndRows`：同一套信号，标普月回报改为「月末最后一个交易日收盘变化 + 同一口径的月股息」（收盘来自 `macro-posture-daily.json`，股息与现金沿用现有近似）；只算 `full` 与 `test`。不改 `scripts/lib/macro-posture/backtest.mjs` 里宏观攻守在用的函数，在雷达侧另写。
- `sharpeGaps`：雷达与 `static70`、`trend`、`buyhold` 的全样本夏普之差，按 12 个月不重叠起点的循环分块自助抽样 2,000 次，取 2.5% 与 97.5% 分位；随机数用固定种子的确定性生成器（如 mulberry32，种子写成常量），结果保留 3 位小数。
- `verdict`：对每个对照，区间包含 0 → 「与 X 的差异在抽样误差内」；整体在 0 之上 → 「高于」；之下 → 「低于」。句子里给出雷达夏普、对照夏普和最大回撤；末句保留「雷达只从股市自身看冷热，仓位怎么定见综合策略页」。删除 `SHARPE_NEAR`。
- 披露新增（数字由脚本生成）：月均价口径使波动偏低，并排给出月末收盘口径的夏普；两项家庭配置的月度打分相关系数与相同月份占比；A1、A2、B5 三条修正记录；新增 18 项指标只展示。

## 5. 页面

页内导航：结论 · 总览 · 指标 · 回测。`VerdictBar`、`TrioNav`、页头不动。

### 5.1 结论区（`ConclusionPanel.tsx`）

桌面两栏，手机单栏：

```
┌ 股市偏热 ─────────────────────┐ ┌ 五维雷达图 ────────────┐
│ 一句话结论                     │ │      流动性            │
│ 冷热不改变仓位 → 综合策略       │ │ 盈利  ╱╲  估值         │
│ 55 项指标：48 项最新 · 4 项滞后 │ │      ╲╱               │
│ · 1 项停更 · 2 项零星          │ │ 交易结构  拥挤度        │
│ 数据生成于 11 月 24 日 17:58   │ └───────────────────────┘
│ 口径提示（caveats，逐条）       │
└───────────────────────────────┘
雷达自身的回测档位：[防守][偏防守][■中性][偏进攻][进攻]  综合分 −0.03
上月末回测口径：中性（2026-10）   综合分近 10 年走势 ▁▂▃▂▁
┌流动性 0.00┐┌估值 −0.50┐┌拥挤度 −0.67┐┌交易结构 0.00┐┌盈利 +1.00┐
│驱动项列表 ││ pe −1    ││ …          ││ …           ││ epsYoy +1 │
│[看这一维] ││ erp 0    ││            ││             ││           │
└──────────┘└─────────┘└───────────┘└────────────┘└──────────┘
```

- 雷达图：内联 SVG 五边形，半径把 −1…+1 线性映射到 0…R，画出 0 分参考圈；`role="img"` 加一句文字等价物；维度无分时该顶点落在 0 分圈并标「暂无」。
- 维度卡：分数、驱动项（指标名 + 打分，点指标名跳到该指标行并展开）、近 10 年维度分迷你走势（来自 `timeline[].dims`）、「看这一维」按钮（把指标区筛到该维度并滚动过去）。
- 综合分走势与「上月末回测口径」来自 `backtest.timeline` 末尾。

### 5.2 总览区（新增 `OverviewPanel.tsx`）

- 一行冷热计数条：偏热 n · 略热 n · 中性 n · 略冷 n · 偏冷 n · 不给冷热 n（按当前视图的指标集合统计）。
- 按维度分行的色块格：每格一项指标，显示短名与百分位数字，底色按冷热；计分指标带角标；stale / discontinued / sparse 用斜纹并在文字等价物里说明。点格子 → 指标区定位到该行并展开。键盘可达（按钮）。
- 图例一句话：「热 = 乐观、昂贵、拥挤或景气强；冷相反。冷热不等于加分扣分，带角标的九项才计分。」
- 跟随「核心 / 全部」视图。

### 5.3 指标区（`IndicatorsPanel.tsx` 拆出 `IndicatorTable.tsx`、`IndicatorRow.tsx`、`IndicatorDetail.tsx`、`useRadarView.ts`）

工具条：维度筛选（全部 + 五个维度，单选）· 视图（核心 / 全部）· 只看计分（开关）· 排序（默认 / 最热在前 / 最冷在前 / 最近更新）。状态写进网址参数：`dim`、`view=all`、`scored=1`、`sort`、`ind`（展开的指标 id）；默认值不写入；无效值忽略。用 `useSearchParams`，`replace: true`。

表格（桌面，列对齐；用 CSS grid 的行而不是每行各自 flex）：

| 指标 | 读数 | 变化 | 历史位置 | 冷热 | 走势 | 更新 |
|---|---|---|---|---|---|---|
| 名称 + 计分徽标（+1 / 0 / −1）或「只展示」小字 | `valueText` | 第一项变化的 `text`，按 `toward` 着色并带「变热 / 变冷」的文字等价物 | 中性灰轨道 + 20 / 80 刻度 + 圆点（位置 = 原始百分位），下方数字 | 冷热标签；direction 为 cold 时加小字「数值越高越冷」 | 近 3 年迷你折线（不足 24 个点时取最近 24 个） | 日期 + 状态点（最新 / 滞后 N 天 / 停更 / 零星） |

- 默认排序 = 数据文件顺序，并显示小组标题行；其他排序时不显示小组标题。
- 行是一个按钮语义的展开触发器（`aria-expanded`），展开内容渲染成行下方的全宽面板（不要把 `<details>` 放进格子）。同一时刻只展开一项，对应网址参数 `ind`。
- 展开面板（`IndicatorDetail`，展开时才挂载）：完整读数句；全部变化项；规则或只展示原因；备注；百分位窗口起点与样本口径；来源链接（新标签页打开）；历史图。
- 历史图：复用并扩展现有 `ZoomChart` 的绘图逻辑，做成行内版本：区间预设「近 1 年 / 近 5 年 / 近 10 年 / 全部」（默认近 5 年，历史不足时取全部）、规则线（`thresholds`，minus / plus / reference 三种线型并带文字标签）、悬停读数；「放大」仍打开现有对话框（带缩放、平移与叠加序列）。原 `MiniSparkline` 保留给行内迷你折线用（去掉交互，只画线与末点）。
- 手机（≤ 640px）：每项两行。第一行：名称 + 冷热标签；第二行：读数 · 变化 · 更新日期，右侧小号历史位置条。徽标保持自身宽度，不拉成整行。迷你折线在手机上不显示（展开后看图）。
- 空筛选：显示「没有符合条件的指标」和「清除筛选」按钮。

### 5.4 回测区（`BacktestPanel.tsx` + 新增 `EquityCurves.tsx`、`ForwardStats.tsx`，样式放 `src/features/market-radar/backtest-panel.css`）

顺序：区间说明 → 结论句 → 时段切换（验证期 / 训练期 / 全样本，默认验证期，用 `Segmented`）→ 指标表 → 稳健性小表 → 净值曲线 → 分组表现 → 雷达月度档位时间线（现有）→ 披露。

- 指标表：方案、年化、波动、最大回撤、夏普、平均仓位、年均调仓次数。一次只显示一个时段，390 宽下在自身容器内可横向滚动，首列固定。
- 稳健性：两列并排「月均价口径 / 月末收盘口径」的全样本夏普与最大回撤（四个方案），加一句由 `sharpeGaps` 生成的区间说明。
- 净值曲线：四条线，对数纵轴，区间预设（全部 / 2000 年以来 / 近 10 年），图例可点选隐藏，悬停显示各方案净值；下方可切换显示「回撤」视图（由净值算出）。线型与颜色之外，图例文字直接标在线末端附近或图例里，色盲可辨。
- 分组表现：两张小表（按雷达档位、按冷热），列：月数、之后 12 个月平均回报、为负比例、平均最大回撤，全样本与 2000 年以来并排；样本少于 30 个月的行标「样本少」。表上方一句说明信号月之后第 2 至第 13 个月的口径。
- 披露：改为可展开的小节（默认收起），标题「方法与披露（n 条）」；`<summary>` 自带展开指示。

### 5.5 加载与校验（`load.ts`）

`isRadar` 增加对新字段的检查（`current.counts`、`backtest.curves`、指标的 `valueText` / `status`）；不符合时抛出「数据版本过旧，请稍后刷新」。

### 5.6 样式约定

沿用站内约定：新文件不用内联样式（有棘轮测试，按数值定位用 SVG 属性）；非图表文字不小于 12px；点击目标桌面不小于 32px、触屏 44px；不用省略号截断日期、名称、数值；涨跌与冷热不混用颜色（冷热用现有 `mr-pct__heat--*` 的冷暖色系）；支持深色主题。

## 6. 架构审查（Orchestrator 自审，标准模式）

- **契约**：`types.ts` 先行写定，数据侧与页面侧各自对着它开发；页面侧用 `fixture.ts` 测试。字段只增不删（`history` 变长、`inverse` 概念改名为 `direction` 仅在脚本内部）。综合策略只读 `signals` 的既有字段与 `radar.current.heat / heatScore`，不受影响；A1 会让它的九格统计小幅变化，属预期。
- **数据**：体积估算——55 项指标全历史约 4 万个点，加 646 行时间线与净值，约 1.1 MB，压缩后约 300 KB，低于 1.5 MB 上限。新缓存文件在 `data-raw/market-radar/`，现有工作流的 `git add` 已覆盖该目录，不需要改工作流。
- **兼容与回滚**：全部改动在一次提交内；回滚 = `git revert` 该提交后重跑 `node scripts/market-radar.mjs`。线上定时任务在推送前仍用旧脚本生成旧结构，与旧页面匹配；推送后新脚本与新页面同时生效，中间不会出现新页面读旧数据（数据文件随同一次提交更新）。
- **风险点**：A1 改动触及回测主结果，必须由非实现者独立复算（Orchestrator 用审计留下的离线脚本核对夏普与档位变化月数）。

审查结论：有条件通过。条件：(1) A1 前后对比数字写进回执并由 Orchestrator 复算；(2) 页面改动后跑全量测试（导航与共用组件的测试不在局部范围内）；(3) 窄屏截图由 Orchestrator 逐张看过。三条均已列入 tasks.md。
