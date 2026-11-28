# L-051 第二实现交叉核对（CROSSCHECK）

执行者：Claude（接手被停掉的 Cursor 任务，task_a2ba5a84279d）。日期：2026-11-28。
预注册：`PREREG.md`（冻结 be7deaa4）；口径裁定：`CLARIFY-1.md`；共同口径：`../results.schema.json` 的 `conventions` 段。

## 1. 独立性与纪律

- **没有读** `run_main.py`、`RESULTS.md`、`results.quick.json`、`events.quick.csv` 及主实现的任何中间产物。读过的只有：PREREG、CLARIFY-1、`results.schema.json`（结构 + conventions）、事件定义锚点 `count_h2.py` / `count_h2_filtered.py`（冻结前的计数脚本）、factorlab 源码。主实现的 `results.json` / `events.csv` 只在本实现第一次全量跑完之后才读取（由 `compare.py` 比较；定位 S5 差异时另读了主 `events.csv` 的逐事件 `cost_roundtrip` 列）。比较之后只改过一处计算口径（S5 仓位分母，理由与过程见 §6.2）；其余没有按主实现结果改代码。
- 前任（Cursor）的半成品 `run.py` 读过，问题很多（对照只取前 50 只、分档按混合样本切、S2 用事件和、安慰剂没有分层、spanning 和等权组合缺失、块自助 p 没有中心化等），已整体重写；只沿用了它照抄 `count_h2_filtered.py` 的事件扫描骨架。
- 没有 unseal。价格经 `store.load_panel(..., raw=False)` 默认截断（< 2023-11-01）；fin_pit 只经 `factorlab.sources.cn_fin.load_fin_pit()`（默认截掉 avail_date ≥ 2023-11-01）。验证层买回腿落在 2023-11-01 的，按 conventions 用面板最后一行代替，不读锁箱。
- 只写了 `replication/`：`run.py`、`compare.py`、`boundary_checks.py`、`results.json`、`events.csv`、`trials.jsonl`、`compare-report.json`、`boundary-checks.json`、本文件，以及 `results.schema.json`（前任自拟，保留不用，见 §3）。

## 2. 输入快照

`run.py` 开跑前逐个核对 PREREG 写明的 SHA-256，不一致就退出。本机四个文件全部一致：

| 文件 | sha256 |
|---|---|
| prices.parquet | dd61e3085b6346180b3427ffe27ff18bdfc36980a22216f70baaa2bf059bbd3e |
| fin_pit.parquet | da32cbced36ba631453e4959f627d8a5abfeadc530f72f0485ca30b6c380c6df |
| securities.parquet | 398590347a823de1a6dcf7a7b3b8d1ed61cc6cfda1d368181e3b59cc8562271d |
| st_pit.parquet | 4981bdcb711d6e04620e7101cd140be9768ecd166ffcdda07110239e840a2a0a |

## 3. 结构映射

主实现的 `results.schema.json` 先到，本实现直接对齐它的顶层与 `layerBlock` / `candidateCore` 字段名。前任自拟的 `replication/results.schema.json` 已作废（保留文件，不再使用）。与主 schema 的差异：

| 位置 | 本实现 | 说明 |
|---|---|---|
| `layers.*.C2`（顶层） | = 下界（bound_lo）的 inference / S1–S5 / diagnostics，`grade` = 上下界合并 | 按 conventions「C2 顶层取下界」 |
| `layers.*.report` | 按候选 `C1` / `C2_lo` / `C2_hi` 分块，键同 `candidateReport` | `delist_m100_upper` 另含事件层 mean_x60 |
| `S2.detail` | `top_year, mean_x60_ex_top_year, a_pass, year_means_ge50, frac_neg_ge50, b_pass` + `top_year_n, events_by_year` | |
| `S3.detail` | 按 schema 描述 + `mdd_improve` | |
| `S5.detail` | `avoid_net_mean, cost_mean, n, thr` + `n_legs_padded_to_100_shares` | |
| `variants` | 键 `变体|层|候选`；变体名 `triple_limit_down, bounce_05, bounce_15, cooldown_60, cooldown_180, avoid_window_20, avoid_window_120, hk_large` | 另有 `hk_large|skips` |
| `counts` | 按 schema，另加 `alt_prelisting_counted_as_suspension`、`terminate_events_in_st_pit`、`variant_skips` | |
| `verdict.C2.bounds` | 额外：各层上下界分级 | |
| 事件清单 | `replication/events.csv`（逐条：code、crash_start、crash_end、trough、signal、layer、c2_lo、c2_hi、终止日、对照数、事件超额 E_i） | 主 schema 没定义事件文件；compare.py 自动找 `../events.csv` |

## 4. 口径（本实现如何落地；冲突时以 PREREG > CLARIFY-1 > conventions 为准）

**时间顺序（如实）**：本实现第一版（13:25–13:45）按 PREREG + CLARIFY-1 第一批自行定口径；13:32 收到 CLARIFY-1 第二批，13:50 前后看到主实现更新后的 `results.schema.json` conventions 段，随后把路径、NW、安慰剂抽样、S5 成本、字段名改成与之一致（第一版口径见本节末「已放弃的第一版口径」）。第一次与主实现比较后只改了一处计算口径（S5 仓位分母，见 §6.2），理由是 conventions 字面有两种读法、主实现的读法与组合路径「停牌日市值前推」一致；其余全部维持原样。

| 项 | 本实现落地方式 | 依据 |
|---|---|---|
| 面板 | `load_panel('cn', …, 2005-01-01, 2023-10-31, raw=False)`；valid = close_adj 有限且 > 0；停牌 = 无有效行情（`is_suspended` 全为 False） | PREREG、conventions |
| 底池 | `build_universe(…, 月末, 'cn', securities, UniverseSpec())`；U_le(s) = 最近 ≤ s 的月末池（事件过滤、对照、分档、安慰剂、S5 仓位）；组合成员 U_lt(t) = 最近 < t 的月末池 | PREREG、CLARIFY-1 二-1 |
| 事件扫描 | 逐股；冷却 = crash_end 行号 − 上次接受信号行号 < 120 则跳过；滚动最低从 crash_end 收盘起，20 行内首次 ≥ 1.10×最低且有行情；一字跌停 → 放弃本锚点（不占冷却）；找到信号后 i ← s+1 | PREREG 伪代码 |
| 第 9 条 | [crash_start, s] 内任一 no_limit_inferred；或含「长停牌复牌首日」（首个有效行之后、与上一有效行间缺 ≥ 60 行）；或 s 落在 st_pit delisting 区间（end 空 = 无穷）；终止上市子条款：st_pit 无「终止」事件 → 空操作。排除者不占冷却 | PREREG、CLARIFY-1 二-7 |
| 先检测后底池 | 接受信号即更新冷却，再看 s 是否在 U_le(s)；不在底池的也占冷却 | PREREG 要点 3 |
| 层 | s ≤ 2014-12-31 → explore（cross_2015 = 第 s+60 行 ≥ 2015-01-01）；s ≥ 2015 且第 s+60 行 ≤ 2023-10-31 → validate；否则 validate_truncated（不进判定） | PREREG |
| C2 | load_fin_pit；periodic 且 rule ∈ {declared, declared_same_report}；announce ∈ [crash_start, crash_end]；下界：最终退市股一律非 C2；上界：一律 C2；全窗口版 [crash_start, s] 只报告 | PREREG |
| 分档 | `quantile_labels(值, tie_keys, q)`，只在 U_le(s) ∩ valid(s) 全池上切（不分板块），再与同板块求交；mcap_float 三档、vol_60d 三档、dd_60 / rev_1m 五档 | CLARIFY-1 二-3 |
| 主对照 | 同板块 ∩ 同市值档 ∩ 同 vol 档 ∩ 非本股 ∩ 无 [s−29, s] 内 10 日跌 ≤ −25%；< 10 只则去掉 vol 档；仍 0 只 → 不进推断（验证层 31 个、探索层 1 个） | PREREG、conventions |
| 诊断对照 | 同板块 ∩ 同市值档 ∩ 同 dd_60 五档 ∩ 同 rev_1m 五档 ∩ 非本股 ∩ [s−60, s] 无接受信号（全市场、第 9 条之后、不论底池） | CLARIFY-1 二-2 |
| 事件路径 | 起点 ref = s+1 开盘（无则 s 收盘）；事件股每个有效行结束一段；对照日收益等权（首日 close/open，其后两日都有行情的 close/close，无可用股记 0），段内复利；段差记在段末日；终点 = s+60 行（停牌则复牌首个收盘；此后无行情则最后成交行） | PREREG「窗口终点」、conventions |
| 日历组合 | 每个交易日 = 当日所有段差等权均值（只取有段的日子）；mean_x60 = 均值 × 60 | PREREG |
| NW | Bartlett 1 − k/61，k ≤ 60，自协方差 / n；单边 p = Φ(t) | conventions |
| 块自助 | 去均值、块长 63、循环；`default_rng(20261128)`；每次 `integers(0, n, ceil(n/63))`；p = (1 + #{boot ≤ 观测}) / 10001 | CLARIFY-1 二-6 |
| 月聚类 t | 事件超额按信号月取均值，再算普通 t（只报告） | conventions |
| S2 | 按信号年剔除事件数最多的年（并列取最早年）后重算日历 mean_x60；事件数 ≥ 50 的信号年各自日历 mean_x60 的负值比例 | CLARIFY-1 二-4 |
| 集中度 | 日差按交易日所在年求和；总和 < 0 时份额 = 年和 / 总和，最大份额 > 0.5 → 最高部分成立 | CLARIFY-1 二-4 |
| S3 组合 | 毛收益、隔夜 / 日内两步、W = 前推流通市值[t−1] × U_lt(t)；回避股在 t ∈ [s+1, s+60] 不参与日内、t ∈ [s+2, s+61] 不参与隔夜，其余按权重归一；perf_stats（rf = 0）；层天数：explore 2005-02-01…2014-12-31、validate 2015-01-05…2023-10-31 | CLARIFY-1 二-1 |
| 安慰剂 | 事件按 (s, code) 排序；候选池 = U_le(s) ∩ valid(s) ∩ 同板块 ∩ 同市值档 ∩ 同 vol 档 ∩ s+1 行不在本候选任何事件窗内（含事件股本身），空则去 vol 档、再空只按板块；每次 `rng.integers(0, max(sizes,1))`；1000 次；p5 = `np.percentile(·, 5)` | 第一批(3)、conventions |
| S5 | −E_i − cost_i；两腿（s+1 行卖、s+61 行买，超出面板用最后一行）各 = max(0.025%×成交额, 5 元)/成交额 + 0.001% + 当日印花 + 滑点（该行之前 20 行 amount 中位数，≥10 个值，缺 → 0.4%）；成交额 = max(⌊V/(价×100)⌋×100, 100)×不复权开盘（无则最近不复权收盘）；V = 该股 s 日流通市值 / U_le(s) 前推流通市值和 × 1 亿 | CLARIFY-1 二-1、conventions |
| 分级 | 超额 ≥ 0 或 S1 / S2 失败 → 不支持；S3、S5 都过 → 支持，否则部分成立；集中度 / 诊断触发 → 封顶部分成立；C1 支持另须 C1∖C2 在上下界两种标注下都 ≤ 0；C2 合并：都支持 → 支持，都不支持 → 不支持，其余部分成立；C2 顶层取下界 | PREREG、CLARIFY-1 二-5 |
| Holm | 族 {C1, C2}，C2 分别用下界、上界 p 各算一次（C1|lo 等） | conventions |
| spanning（报告） | 因子腿 = 月末前 20%（注册方向、tie_keys）按 W 持有 − 满仓；价值 = `load_fin_pit` → `fundamentals_cn.core_fields/compute_fields` → `compute_strict(cn_ep_ttm)`，缺失股不进该因子前 20%；y = 回避毛路径 − 满仓；statsmodels HAC(60)。FM：每周最后交易日，y = close_ff[t+60]/open[t+1] − 1，Event = (上周末, t] 内的信号，NW(12) | 第一批(2)、conventions |
| 变体 | 只报日历 mean_x60、mean_xH、nw_t、事件数、信号月；C1 / C2_lo / C2_hi × 两层；三连跌停 crash_start = i−2；窗口 20/120 用主事件集；港股：hk 默认底池、同法、无 C2、只报告 | 第一批(1)、conventions |

**已放弃的第一版口径**（记录独立判断，供 manager 参考）：日收益用收盘到收盘（停牌日计 0）而非开盘起点分段；NW 用 statsmodels HAC；C2 顶层用实际标注、Holm C2 取上下界较大 p；C2 只有一边支持 → 部分成立、都不是支持时取较差；C1∖C2 只用实际标注；安慰剂排除看 s 日而非 s+1 日、用均匀浮点抽样；S5 只按费率不计最低佣金。第一版的分级与现版相同（探索 C1/C2 不支持，验证 C1 不支持、C2 部分成立），数值不同（探索 C1 mean_x60 −2.2% vs 现版 −6.4%，主要差在 s+1 隔夜跳空是否算进事件收益）。

## 5. 边界逐项核对（compute.md 列出的九项）

`boundary_checks.py` 不靠 run.py 的计数，直接在面板上逐条重新验证 `events.csv`，输出 `boundary-checks.json`。

| # | 边界 | 核对方法 | 结果 |
|---|---|---|---|
| 1 | 事件检测与重扫 | 逐条验证：crash_start = crash_end − 10 行、两端有行情、10 日跌 ≤ −25%；信号日有行情、非一字跌停、距 crash_end 1–20 行、≥ 1.10 × 滚动最低，且是首次触发 | 8174 条，违例 0。2593 条事件之前（上一信号 + 120 之后）存在满足跌幅条件但没有形成信号的锚点，说明逐日重扫确实在起作用 |
| 2 | 冷却期 | 同股相邻底池事件 crash_end − 上一信号 ≥ 120 行（必要条件；底池外的接受信号也占冷却，由 run.py 扫描保证） | 违例 0 |
| 3 | 停牌 = 无行情行 | `is_suspended` 全样本无 True；[crash_start, s] 内有缺行的事件 | 字段全 False；1187 条事件窗内有缺行（最多 16 行），按无行情处理 |
| 4 | 退市整理、长期停牌复牌排除 | 对每条事件重查 [crash_start, s]：no_limit_inferred、复牌首日（首个有效行之后缺 ≥ 60 行）、s 在 delisting 区间 | 违例 0。跳过计数：no_limit_inferred 224、长停牌复牌 246、退市整理 81、s 不在底池 6380；st_pit 无「终止」事件（空操作）。上市前空白也算停牌的旧计法（count_h2_filtered）：复牌 463、不在底池 6275，**事件清单逐条相同**（8174 条） |
| 5 | 层边界 s+60 | explore s ≤ 2014-12-31；validate s ≥ 2015-01-01 且第 s+60 行 ≤ 2023-10-31；其余 truncated | 违例 0；explore 2766 / validate 5376 / truncated 32，与 counts_h2_filtered.json 一致；最后一个验证信号 2023-07-31，第一个截断信号 2023-08-01；explore 跨入 2015 的 1 条 |
| 6 | 对照分档与放宽 | 严格格 ≥ 10 才不放宽 | 严格格 < 10 却没放宽的 0 条；放宽 vol 的 1658 条（探索 131、验证 1527）；无对照 32 条（探索 1、验证 31 → 不进推断）；对照数中位 61 |
| 7 | 日历组合 + NW(60) | 手写 Bartlett NW、run.py `nw_t`、factorlab `nw_tstat`（statsmodels HAC）三方对照 | 探索 t = −2.2025163584，验证 t = −2.0685238023，三者一致到 1e-15（statsmodels 默认不做 n/(n−1) 修正） |
| 8 | 安慰剂种子 | 同种子跑两次（验证层 C1、50 次） | 结果逐位相同（deterministic = true） |
| 9 | 退市按最后成交 | (s, s+60] 内退市的事件：终止日 = 最后成交日，无 −100% | 3 条（000540、601558、600472），终止日都等于最后成交日，最小段收益 −5.9% / −11.5% / −9.9%，无 −100%。−100% 只在报告项 `delist_m100_upper` 里加 |

## 6. 与主实现比较

`compare.py`：判定子树（层 meta、各候选 inference / S1 / S2 / S3 / S5 / gates / grade、C2 上下界、Holm、headline、verdict、变体四项）绝对容差 1e-8；其余共有数值叶子只列差异（相对 1e-6）；事件清单按 (code, signal) 逐条比，并比每条的事件超额与 S5 成本。

### 6.1 结果（最终一轮，两边都是全量：安慰剂 1000 次、自助 10000 次）

- **输入快照**：四个 sha256 相同。
- **事件清单**：主 8174 条 / 本实现 8174 条，**逐条一致**（crash_start、crash_end、trough、layer、c2_lo、c2_hi 全同）。逐事件超额 E_i 最大差 4.9e-12；逐事件 S5 成本最大差 5.0e-14。31 条只差在 validate_truncated 事件：主实现不算超额（空），本实现算了但不进判定。
- **判定数字**：比较 648 个判定叶子，**两边都有的数值全部在 1e-8 以内**，字符串和布尔全部相同。其余「差异」都是某一边独有的附加字段（本实现：`events_by_year`、`top_year_n`、`mdd_shallower_ge_1pct`、`n_legs_padded_to_100_shares`、`signal_first/last`、`pool_days`、`mde_*`、`verdict.C2.bounds`；主实现：安慰剂 `removed_weight_share_mean_*`），以及 `verdict.summary` 文案。
- **分级**：两边相同。探索 C1 不支持、C2 不支持；验证 C1 不支持、C2 部分成立（下界不支持、上界部分成立）；两候选都不具备晋级资格。
- **变体**：45 个键完全对上（含港股），220 个数值最大差 1.3e-14。
- **报告项**（716 个叶子，194 个差异，都不作判定）：
  - 组合路径（市值加权、等权、现金 Bc、净成本、−100%）、全窗口 C2、制度分段、70/30 切分、对照 / 诊断的跌破前低比例：一致。
  - S4 spanning 与 FM：方向和量级相同，数值不同。组合层回归天数探索 2091 vs 主 2052（因子腿可用日的处理不同）；α 的 t 探索 0.27 vs 0.53，两边都远离 2。FM γ 探索 −0.0314 / t −2.93 vs 主 −0.0311 / −2.94（周划分 / X 细节）。
  - 事件股 60 日波动 / MDD：本实现按段收益（停牌段合并）计，主实现口径不同，差 < 0.5pct。
  - 事件跌破前低比例：差 < 0.04pct（个别事件的分母处理）。
  - 申万子样本 `n_events`：主实现报的是有对照的事件数，本实现报全部当前上市事件数，另报 `n_used`。
  - `delist_within_60.share`：主实现分母 = 有对照的事件（2/5345），本实现 = 全部事件（2/5376）。
  - 试验数：本实现 48 条 / 有效 24，主实现 50 / 25（记账口径不同，不影响判定）。

### 6.2 比较后改过的地方（只有一处计算口径）

第一轮全量比较时，判定数字只有 S5 成本不一致（探索 C1 回避净收益 −0.0130299 vs 主 −0.0130313，差 1.4e-6；验证 1.1e-5；978 条事件各差约 1e-5，主实现一律略高）。对照逐事件成本定位到原因：conventions 写「V = 该股 s 日流通市值 / U_le(s) 流通市值和」，本实现分母原来只加 s 日有市值的成员；主实现把 s 日停牌的底池成员也按前推市值算进去。改成后者后，8142 条事件成本逐条一致（最大差 1e-16）。采用后者的理由：它与组合路径「停牌日市值前推」的权重定义一致，即仓位 = 该股在底池组合里的实际权重。这一处只改变 S5 数值，不改变任何 S5 通过与否或分级。另外两处只改了字段语义、没改计算：`meta.date_start/end` 改成层的起止（原为首末信号日，另存 `signal_first/last`）；`S3.mdd_shallower` 改成 MDD 改善量（原为布尔，另存 `mdd_shallower_ge_1pct`）。

### 6.3 结论

两实现的判定数字在 1e-8 以内一致，事件清单逐条一致。按 PREREG「判定数字一致（1e-8）才发布」，**满足发布条件**。

主要数字（本实现，与主实现一致）：

| 层 | 候选 | mean_x60 | NW t | 块自助 p | S1 | S2 | S3 | S5 | 分级 |
|---|---|---|---|---|---|---|---|---|---|
| 探索 | C1 | −6.40% | −2.20 | 0.029 | ✓ | ✗（(b) 0.50） | ✗（夏普过、波动比 0.987 > 0.98、MDD 未改善） | ✗（−1.30%） | 不支持 |
| 探索 | C2 下界 | −0.13% | −0.04 | 0.50 | ✗ | ✗ | ✗ | ✗ | 不支持 |
| 探索 | C2 上界 | −3.38% | −1.30 | 0.090 | ✗ | ✗ | ✗ | ✗ | 不支持 |
| 验证 | C1 | −3.20% | −2.07 | 0.017 | ✓ | ✗（(b) 0.556 < 0.60） | ✗（波动比 0.957，但夏普 0.201 < 0.233 − 0.02，MDD 深 2.3pct） | ✗（−1.04%） | 不支持 |
| 验证 | C2 下界 | −1.45% | −0.54 | 0.30 | ✗ | ✗ | ✗ | ✗ | 不支持 |
| 验证 | C2 上界 | −6.47% | −2.69 | 0.004 | ✓ | ✓ | ✗（波动比 0.998，安慰剂分位 0.45） | ✓（+1.92%） | 部分成立 |

结论口径第一句（验证层 C1，市值加权毛收益路径）：同等仓位下，剔除暴跌后反弹，全 A 底池年化波动 21.47%（满仓 22.43%），最大回撤 −50.64%（满仓 −48.36%，**更深**）；事件超额为负（−3.20%，反转没有占主导）；波动比 0.957 低于全部 1000 次低波安慰剂（分位 0.000，安慰剂 p5 = 1.022）。但夏普下降、回撤加深，S3 不过；S2(b) 年份一致性不足。这是全 A 股票池结论，不等于 ETF / 综合策略持仓结论。
