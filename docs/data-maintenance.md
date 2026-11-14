# 数据维护台账

最近盘点及数据刷新：**2026-10-23**，时区 Asia/Yerevan（UTC+4）。本文件是以后例行更新的入口；每次盘点保留一份日期报告，不覆盖历史证据。

- [本次盘点、数量及证据](research/data-freshness-audit-2026-10-23.md)
- [本轮更新结果、真实数据日期与剩余缺口](research/data-refresh-2026-10-23.md)
- [按数据组维护的 CSV 台账](data-maintenance.csv)：优先级、状态、文件、更新入口、周期及验收条件。
- [本轮四市场公司价格明细](research/company-price-audit-2026-10-23.csv)：1,299 条来源记录（us 294 / cn 811 / hk 127 / adr 67），含价格、行情日、核验时间、来源、行情日口径与可交易性标记。
- 历史证据保留：[2026-10-13 盘点](research/data-freshness-audit-2026-10-13.md)、[2026-10-13 更新结果](research/data-refresh-2026-10-13.md)、[2026-10-13 价格明细](research/company-price-audit-2026-10-13.csv)、[2026-10-20 刷新经验](#2026-10-20-刷新经验)。

## 如何判断过期

维护时分开记录 **研究日期、报价时间、报告期末、披露日、实际核验时间、下次检查日**。文件修改时间、Git 提交时间和 `generatedAt/asOf` 都不能代替字段本身的数据日期。

| 状态 | 含义 | 处理 |
| --- | --- | --- |
| 已超期 | 超过项目现有规则，或明确的事件检查日期已过 | 优先重新取数或核实事件结果 |
| 待刷新 | 带日期的有效快照，但不足以代表当前行情 | 使用现价、估值、赔率前刷新；历史研究仍保留 |
| 待核 | 缺核验日期、来源停更、版本或覆盖范围不一致 | 先查源及口径，不能靠改日期解除 |
| 等待披露 | 报告期较旧，但尚未确认有更新披露 | 保留原报表，轮询新公告；不编造新季度数据 |
| 按计划维护 | 尚在当前维护窗口内 | 到期检查，不因旧报告期自动重抓 |
| 历史归档／教学样例 | 固定案例、历史回测、假设输入或旧版留痕 | 不做日常刷新，纠错或新版本另建记录 |

现有量化规则：公司价格超过 **7 个自然日**才触发提示，见 [priceAnchor.ts](../src/features/dcf/priceAnchor.ts)；宏观使用 [quality.ts](../src/features/macro/quality.ts) 的逐指标阈值。提示未超期也不等于价格实时可用。月度指标日期通常代表统计月份，季度指标代表报告期间；阈值越界只表示需要查新，不证明源已经发布下一期。交易日判断以市场日历和接口实际行情日期为准，不按自然日机械补档。

## 2026-11-13 全量刷新与重新分类

执行日期：2026-11-13（Asia/Yerevan）。证据目录 `public/research/data-refresh-2026-11-13/`（手动全量，无 AUTO.txt）。

- **刷新**：本地复刻 `company-refresh.yml` 全流程，并加跑 MCP `collect` / `retry-info` / `retry-core` / `ak-financial` 与估值覆盖层重建（`build-company-valuations-*.py --as-of 2026-11-13`）。1,538 条公司记录行情日均为 2026-11-13；us/adr/ndx 为美股**盘中**供应商报价（带真实时间戳，非收盘），下一次定时任务会换成收盘价。138 条林奇 PE 供应商未返回、5 个代码公司资料重试失败，均保留原值与原日期。
- **板块口径**：板块在 `src/data/sectorTaxonomy.ts` 统一，经 `resolveMarket` 生效（JSON 同步写入，每日刷新不会回退）。A 股主题桶与「高盛增持」改为中证一级，原主题移到 `theme`；ADR 改为 GICS 一级，地域分组移到 `region`。两份估值脚本的 PB/SOTP 适用集合同步修正。GRMN→可选消费、SOFI→金融、02269/02359→药品及生物科技；BK 并入 BNY；QRVO（2026-10-06 被 Skyworks 并购）移出美股列表，详情存档保留。
- **林奇规则**（`scripts/lib/lynch-classify.mjs`、`lynch-industry.mjs`、`lynch-overrides.mjs`）：强周期优先于增速与困境反转，周期型不按 PEG 给关注度；困境反转 / 资产型在输入齐全时重判；PE 缺失时关注度为「待定」；重算只改变化条目，不再批量改写 `v` / `classificationAsOf` / `peg`。显式 `cyclical:false`：化学药 14 家、芯片设计 / IP / EDA 31 家；新和成保持周期。重算 147 条变化（类型 109、关注度 96），二次干跑 0 变化。`normalize-market-refresh.py` 不再清掉 `classificationAsOf` / `classificationNote`（已在隔离副本按 10-20 输入实跑验证）。
- **港股板块 HSICS 核对**（2026-11-13）：来源为港交所「證券價格 › 股本證券」报价页的「行業 …（恒生行業分類）」栏（恒生指数有限公司提供，`https://www.hkex.com.hk/Market-Data/Securities-Prices/Equities/Equities-Quote?sym=<代码>`），逐家读取 127 家：126 家业务类别与站点 sector 完全一致、**改动 0 处**（港铁＝非必需性消费 - 旅游及消闲设施 - 公共运输，京东物流＝工业 - 工用支援 - 采购及供应链管理，恒安＝必需性消费 - 消费者主要零售商 - 个人护理）；00823 领展为 REIT，港交所页不显示 HSICS，恒生官方「恒生综合行业指数－地产建筑业」前十大成份（2026-11-12）含领展，保留「房地产投资信托」。站点 hk 板块统一为 HSICS 第二层（业务类别），子业务类别存于证据 `data-raw/hk-hsics-2026-11-13/hsics.json`。板块未变，港股估值覆盖层无需重建。
- **林奇输入生成器**（同日补建，原生成脚本仍不在仓库）：`scripts/fetch-lynch-financials.py`（取原始表，见下表）→ `scripts/build-lynch-inputs.mjs`（公式在 `scripts/lib/lynch-inputs.mjs`、归一化在 `lynch-financials.mjs`，单测 `lynch-inputs.test.mjs`）重算 g / c / rg / ph / dy / pb / 六项护城河与证据文字 / w / f，再走 `rebuild-lynch-classification.mjs` 定 t / r。公式由现存证据文字反推：三窗＝三个 TTM（美股/ADR/A 股，滚动四季）或三个财年（港股、只有年报的发行人）；利润美股用稀释 EPS、其余用归母净利；g＝新/中−1，c＝(新/旧)^½−1，基数 ≤0 为空；定价权＝毛利率 ≥50% 或 ≥同行业中位+5pt 且 ≥25%（中位＝原数据 市场+板块 取值，<4 家退回全市场）；毛利稳定极差 ≤4pt；ROE 最新 ≥15% 且三期最低 ≥12%（美股为单季 ROE_AVG 四季合计，A 股/财年口径用年报 ROE）；盈利持续＝全正、新>旧、最小/最大 ≥0.7；财务稳健＝负债率 ≤60% 且流动比率 ≥1；宽护城河 s/n>0.8、窄 ≥0.6、可评 ≤3 项为数据不足。**校验**（`--validate --cutoff 2026-08-31`，与原数据同源的东方财富/新浪表，分层抽样 76 家可比 65 家）：g/c 98%、rg 100%、六项护城河各 100%、s/l 100%、原生成器类型 95%、f 可复现类别 95%；差异来自数据年份（BKNG 拆股后供应商部分重述 EPS、港股 3 家 PB 已变）与 1 家季度缺口；11 家金融/REIT 东方财富接口无数据未比（SEC 兜底与原数据一致率明显更低，只作兜底）。周期「波动」与「两年高增」标记原规则不可完全还原（全量回测误差约 2%）。
- **新增林奇条目（2026-11-13）**：us:BRK.B、hk:02269/02359/00823、adr:BHP/RIO/UL/DEO/BTI/ONC/SOFI、ndx:ALNY/ALAB/CCEP/CRWV/FER/HONA/MSTR/NBIS/RKLB/TRI 共 21 条（纳指页签按 `lynchKeysOf` 首选 `ndx:` 键，并与行情快照键一致），寒武纪按新财报重算（两年前 TTM 亏损，两年年化仍无定义，按原生成器口径以近一年增速归快速增长型）。每条带 `inputSource`（证据 `public/research/lynch-inputs-2026-11-13/`）、`inputRetrievedAt`、`inputWindows`、`financialPeriod`、`classificationAsOf`；BHP/RIO 加显式 `cyclical:true`（`lynch-overrides.mjs`）。HONA 只有 11 个连续单季（分拆前历史），判「数据不足」。干跑：新增条目类型/关注度 0 变化，仅 BHP/RIO 写入 `cyclical`；其余 1,516 条与 HEAD 逐字节一致。
- **遗留**：港铁、京东物流、恒安板块已于同日按港交所 HSICS 核实（见下条）；林奇原始生成脚本不在仓库内（现有 1,517 条输入未按生成器重写，只作校验）；FER、NBIS 因一次性处置收益触发「三窗波动」判周期型，属规则机械结果，待人工复核。

## 2026-10-23 刷新后状态

原盘点报告和1,299条价格明细保留为更新前证据。本轮在本地复刻 `company-refresh.yml` 的每日流水线跑完一整轮（采集 → 规范化 → 应用 → 覆盖层重算 → 信号台账 → 验收）：四市场1,540条页面记录均取得供应商报价，us/adr 294+67条更新至2026-10-22，cn/hk 811+127条更新至2026-10-23，无旧日期残留、无空值；601059／601198两条换股流程报价仍只作历史参考。未来趋势625家上市报价、固态68条有效上市报价、林奇1,517条PE、指数10项价格与5项PE汇总、宏观日频读数、国家队55只ETF报价同步更新（ETF价格10-23），26个未来趋势待核对象与固态旧占位代码继续不造报价。

每日分析新增2026-10-23（closed，情绪五项全ready），10-22已由远端任务归档，回补脚本新增0条确无缺口。港股127家与ADR66家估值初稿按新价重算评级（盈利输入仍冻结2026-10-20，评级规则未改），信号台账写入2026-10-23期。

宏观体检（2026-10-23）为美中 ok=31／stale=3／invalid=0／missing=0、港股5项全正常：储蓄率停在2026-08-01（83天）、制造业与非制造业PMI停在2026-09-01（52天，刚跨50天阈值）——统计月份未变，不等于10月读数已发布，不补造读数也不改观测日期。国家队ETF持有人报告期本轮采集失败（东方财富ETF清单HTTP 502后回退交易所ECONNRESET），实名榜单仍停2025-12-31。

新增待办：`public/data/company-valuations/*.json` 的 `asOf` 标2026-10-22但记录内置价格仍是10-19／10-20，页面已用行情快照新价覆盖、记录内 `comparison` 未重算（台账新增 VALUATION-01 行）。

**自动刷新链路观察**：远端 `origin/main` 的四市场报价自2026-10-20起停滞，而每日分析、DCF预填、周期复盘仍持续提交，即 `company-refresh.yml` 的行情步骤自当日起没有产出可提交的新值；`gh` 未登录，根因待查运行日志。工作流顺序为「应用行情 → 重算覆盖层 → 写信号台账 → `npx vitest run src/data` → 提交发布」，测试失败即不提交；本轮实测到4处与价格强耦合的断言（港股股息率法用现价反查冻结供应商股息率、ADR盈亏比用已四舍五入展示价复算、估值刷新用例硬编码评级样本、研究笔记用例硬编码样本公司）会在价格漂移后让该验证步骤失败，已改为按规则与当前数据自适应；是否即停滞根因仍需查运行日志。

PEP最新Q3、官方事件日历、8项ETF费用／规则及纳指QQQ持仓代理名单已核验。后续优先级以CSV的刷新后状态为准；以下顺序保留原盘点的工作分类，具体进展见更新报告。

## 优先处理顺序

1. **日历、价格及派生计算**：先核实已到期的 PEP 事件；刷新实际持有／候选／核心研究公司的价格，再重算涨跌空间、赔率、股息率、PE/PEG、阈值及相关文字。四份 JSON 的价格日期已在 2026-10-23 推进到各市场最近交易日，下一轮关注的是远端自动刷新链路能否自愈，以及价格漂移后与价格强耦合的断言是否仍然成立。
2. **宏观与指数**：宏观 4 项触发现有超期规则；日频／周频读数及指数最新价格应提高刷新频率。现有定时配置每月一次，不能持续覆盖这些指标。
3. **国家队 ETF 与无日期数据**：ETF 持有人最新期停在 2025-12-31，需核对基金原件／采集源；林奇分类 1,517 条记录缺日期，需先补来源与可复现生成入口。
4. **公司新财报与事件**：逐家查询新披露，更新盈利、现金、股本与情景；H1/Q2 旧期末不单独作为“已发布新报表”的证据。
5. **版本与慢变量**：未来趋势覆盖统计、名单、ETF 产品费率、政策／费用规则、Notion 导入和书籍 PDF 按各自周期维护。

## 例行维护节奏

以下是建议执行计划，**尚未修改或新增自动任务**。

| 周期 | 工作 | 完成条件 |
| --- | --- | --- |
| 每个开市日收盘后 | 每日分析归档；持仓／候选／核心研究报价；日频宏观与指数 | 校验实际行情日、收盘状态、缺失项；不能把抓取日期当行情日 |
| 每周一 | 全市场研究报价巡检、周频宏观、国家队、新公告、事件日历 | 输出超期／缺失清单；到期事件改为结果、延期或待确认 |
| 每月 8 日及其他指标实际发布后 | 宏观月度读数；林奇分类／护城河数值重算；指数名单差异 | 核对每项观测期与源；不能仅更新整文件日期 |
| 每次财报／重大公告后 | 正常化盈利、现金流、完全摊薄股本、共识、三情景、验证日历 | 数值与证据、情景、结论一致；不足保留 `[MISSING]` |
| 季度／指数调样时 | 研究池全量检查、产品成分、国家队成熟期切换 | 保留新旧比较；国家队覆盖满足项目成熟度条件 |
| 每半年及规则变更时 | ETF 费率／规则、交易费用、平台规则、税费说明 | 核对发行人／官方文件，记录核验日期；算例费率不冒充实际费率 |
| 书稿正式发布时 | 网页正文、HTML、PDF、数据索引和版本号 | 出版物版本一致；历史回测保留原样 |

## 已有更新入口

| 任务 | 入口 | 注意事项 |
| --- | --- | --- |
| 宏观三市场快照 | `npm run macro:update` | 对比各 `series.*.latest.date/value` 和 warnings；失败时可能沿用旧值 |
| 指数价格、估值与外部参考序列 | `npm run index:update` | 某个指数／参考源失败会保留旧字段；长历史外部序列可能自身停更 |
| 手动补指数 Forward PE | `npm run index:fpe -- <key> <value> <YYYY-MM>`；批量用 `index:fpe-import` | 先取得有日期有口径的源；空序列不都属于过期，部分指数本来没有免费序列 |
| 导入指数 PE 历史 | `npm run index:ref-import -- <key> <csv> "<来源>" [trailing]` | 区分滚动 PE 与 Forward PE，不混成同一历史序列 |
| 每日分析 | `npm run daily-analysis:update` | 北京时间 15:15 后且实际行情日为当天才落盘；历史补档见 [说明](daily-analysis.md) |
| 国家队个股与 ETF | `npm run national-team:update` | 个股可 `--rebuild` 离线重建；ETF `--deep` 扩大历史扫描，不能保证源会返回更新报告 |
| 未来趋势旧排序输入 | `FT_WORK=/private/tmp/businessweb-ft-YYYYMMDD npm run future-trends:picks` | 用新的空工作目录，避免海外 `us.json` 被永久复用；这不是当前研究索引的完整更新入口 |
| 未来趋势当前研究 | `scripts/fetch-future-trends-review.py` → 公司取证／模型复核 → `scripts/generate-future-trends-review.py` | 目前目录、研究日期及部分输入写死 10-09；先建立新日期目录并调整采集／生成配置。不能直接重跑后宣称全量已更新 |
| 固态电池 | 新采集 → `scripts/normalize-solid-state-mcp.py` → 核对各 review／research 层 | 脚本绑定 10-09 原始目录；注释所指采集脚本当前仓库缺失。10-10 材料需按实际消费关系核对 |
| A／港／ADR 公司复核 | `scripts/fetch-*-2026-10-07.py`、`review-*-2026-10-07.py`、`render-*-2026-10-07.mjs` 及手工详情 | 多个脚本绑定旧目录、检索截止日或缓存，必须先参数化／建立新轮次；重新渲染不是重新取证。ADR 重生成后须合入 SOFI，见 `src/data/details/sofi.ts` |
| 港股板块（恒生行业分类 HSICS） | `node scripts/hk-hsics-sync.mjs [--as-of YYYY-MM-DD] [--apply]`；重放证据 `--input <hsics.json>`。底层模块 `scripts/lib/hkex.mjs`（港交所报价页令牌缓存、403 刷新重试、并发≤2 节流、JSONP 解析，映射 HSICS 行业/业务类别/子业务类别与现价、PE、EPS、股息率、52 周高低、市值等），单测 `node --test scripts/lib/hkex.test.mjs scripts/hk-hsics-sync.test.mjs` | 站点 sector 取 HSICS 第二层（如 旅游及消闲设施）；`--apply` 把差异写进 `sectorTaxonomy.ts` 的 `SECTOR_FIXES` 并同步 `hk.json`，每日行情流水线不改 sector；REIT 报价页无 HSICS，只列出不改。港交所页声明转发 HSICS 资料须与恒生指数公司签使用权协议，仅作内部核对。板块变动若涉及 PB 适用集合，需按估值覆盖层流程重建 `company-valuations/hk.json` |
| 林奇输入（增速/护城河/说明标记） | 取数 `uvx --python 3.12 --with akshare --with yfinance python scripts/fetch-lynch-financials.py --out DIR --keys us:X,cn:Y [--source em-us\|em-us-y\|sina-cn\|em-hk\|sec\|yf] --sleep 1.2`（默认东方财富美股单季/新浪 A 股摘要/东方财富港股，失败再用 SEC XBRL、东方财富年报、yfinance）→ 校验 `node scripts/build-lynch-inputs.mjs --raw DIR --keys-file F --cutoff YYYY-MM-DD --validate --report out.json` → 生成 `--emit new.json --quotes <yahoo-quote-batch.json> --evidence research/<目录>` → 并入 `--merge new.json [--replace key] [--dry-run]`（默认只新增，覆盖须逐个列出）→ `rebuild-lynch-classification.mjs --dry-run` 后再写 | 多来源时取三窗完整且最新的一个；窗口早于截止日 400 天视为停更；窗口不全时增速/护城河留空并写「上市不足」。PB 只给 A 股/港股（与原数据一致，港股财报币种≠报价币种时留空）。不要对现有条目批量 `--replace`：会改写人工复核过的输入 |
| 公司行情、供应商摘要、林奇PE | 本轮新增 `collect-market-mcp.py`／`collect-market-refresh.mjs` → `normalize-market-refresh.py` → `apply-companies`，完整命令见下文 | 原分类／增速／护城河与估值仍需逐公司复核；不以新报价认证旧模型 |
| 数据新鲜度巡检（只读） | `node scripts/data-freshness-check.mjs [--md out.md] [--json out.json] [--now ISO] [--no-gh]`；单测 `node --test scripts/data-freshness-check.test.mjs`；每日 `data-freshness.yml` | 只读真实观测日期，不改数据；阈值与已知停更白名单（带原因、到期日、观测日锁定）写在脚本顶部 `THRESHOLDS`／`ALLOWLIST`。源恢复或白名单到期后会重新告警，不要靠延长到期日消警 |

已有 GitHub Actions：公司库行情工作日美股收盘后 **UTC 22:00**（`company-refresh.yml`，由 Vercel Cron 准点触发，见下文「Vercel Cron 准点触发」；只刷新行情，证据精简后保留 14 天，MCP 公司资料仍需手动全量刷新）；DCF 预填库每日两次（`dcf-prefill.yml`）；每日分析工作日北京时间 **16 点、18 点**（Vercel Cron；GitHub 排程 15:35、17:10 兜底）；国家队每周一 **10:30**；宏观＋指数每月 8 日 **14:00**。配置见 [.github/workflows](../.github/workflows)。本次 GitHub CLI 未登录，未核验远端最近运行／部署状态。任务存在不等于已经成功运行。

**数据新鲜度巡检**（2026-11-14 新增，`data-freshness.yml`，每日 UTC 23:20＋手动）：起因是 2026-11-12 `company-refresh.yml` 因价格耦合测试失败、`daily-analysis-snapshot.yml` 因排程迟到约 8.5 小时没拿到当日收盘快照而空跑，均无人察觉。巡检读各文件内的观测日期（公司 `价格锚点`、行情快照 `date`、林奇 `peAsOf`、估值覆盖层记录 `price.date`、每日分析 `dataDate`、宏观逐指标（直接调用 `quality.ts`）、周期事实 `observationDate`、指数、股债利差、ETF 技术面、国家队报告期、DCF `pxDate`／无风险利率），按市场交易日（`scripts/lib/trading-calendar.mjs`：A 股含上交所 2026 休市、美股含 NYSE 2026 假期、港股暂只排周末）推算「应已落地」的最近交易日。主要阈值：日频行情 >3 个交易日；每日分析落后 1 个交易日或近 10 个交易日有缺档；周期日频事实 >5 个交易日；周度 >10 天；月末 >45 天；国家队按披露截止日 +14 天。另用 `gh` 汇总各定时工作流最近结论与排程延迟（近 10 次中位／最大），最近完成的运行失败或工作流被停用也告警。有告警时创建／更新唯一的「数据新鲜度告警」issue（标签 `data-freshness`，告警项变化才追加评论），恢复后自动评论并关闭；不提交报告文件。

2026-10-23 观察：`company-refresh.yml` 的行情步骤自 2026-10-20 起没有产出可提交的新值（远端四市场报价停滞于 10-19／10-20），而每日分析、DCF 预填、周期复盘仍持续提交。工作流的发布步骤排在 `npx vitest run src/data` 之后，验证失败即不提交；本轮修复的 4 处价格强耦合断言原先会在价格漂移后让该步骤失败。根因需 `gh` 登录后查运行日志；若确认为采集步骤失败，可先给工作流补 `SSL_CERT_FILE=$(uvx --python 3.12 --from yfinance-mcp-server==1.0.4 python -c "import certifi;print(certifi.where())")` 再重跑。

## Vercel Cron 准点触发（2026-11-14 新增）

**为什么**：GitHub 的 `schedule` 实测迟到 6–10 小时（2026-11-14 统计近 10 次中位 5h44m–8h04m，最大 10h36m）。每日分析跑到北京时间次日凌晨，当天收盘快照已取不到；公司行情 cron 10:40 UTC 实际约 18:00 UTC 才跑，正值美股盘中，存进去的美股价是盘中价。

**怎么做**：`vercel.json` 的 `crons` 按 UTC 时刻调用 `/api/market-data/cron-dispatch?workflow=<file>.yml`（与行情接口共用 `api/market-data/[marketRoute].js`，不新增函数——Hobby 函数数量已近上限）。处理代码在 `server/functions/cron-dispatch.js`：校验 `Authorization: Bearer $CRON_SECRET`（Vercel 自动带）→ 只接受白名单工作流 → 用 `GITHUB_DISPATCH_TOKEN` 调 GitHub `POST /repos/TurboSnails/BusinessWeb/actions/workflows/{file}/dispatches`（`{"ref":"main"}`）。环境变量缺失时返回 503 并在 Vercel 日志打印 `[cron-dispatch] … 未配置`。单测 `node --test server/functions/cron-dispatch.test.mjs`（已并入 `npm run test:scripts`）。

| Vercel Cron（UTC） | 工作流 | 对应北京／纽约时间 | 理由 |
| --- | --- | --- | --- |
| `0 8 * * 1-5` | `daily-analysis-snapshot.yml` | 北京 16:00–16:59 | A 股 15:00 收盘后；脚本 15:15 后才落盘，所以不用 07 点档（Hobby 可能 07:00 就触发） |
| `0 10 * * 1-5` | `daily-analysis-snapshot.yml` | 北京 18:00–18:59 | 第二次核验，补晚发布的源；与第一档至少隔 1 小时 |
| `0 8 * * 1-5` | `etf-technical.yml` | 北京 16:00–16:59 | 收盘后技术面；晚间补净值仍由 GitHub 排程 13:30 负责 |
| `0 10 * * 1-5` | `spread-snapshot.yml` | 北京 18:00–18:59 | A 股收盘、中债收益率发布之后（需晚于 09:30 UTC） |
| `0 22 * * 1-5` | `company-refresh.yml` | 纽约 17:00（冬令时）／18:00（夏令时） | 美股 16:00 收盘后，三地市场当天都已收盘；冬令时收盘是 21:00 UTC，所以不用 21 点档 |

未纳入：`dcf-prefill`（基本面按周、价格不要求当日）、`market-cycle`（增量采集，每日两次，迟到不影响）、`macro-snapshot`（周六一次）、`national-team`（每周）、`data-freshness`（按实际运行时刻推算，迟到不误报）。

**Hobby 计划限制**（[官方](https://vercel.com/docs/cron-jobs/usage-and-pricing)）：每个 cron 每天最多一次（更频繁的表达式会让部署失败）；只保证在指定的**那个小时内**触发（`0 8` 可能是 08:00–08:59 任一时刻），所以上表按「整小时窗口都可接受」选档、分钟一律写 0。Pro 计划精确到分钟。每项目 100 个 cron，本项目用 7 个（5 个派发工作流 + 候选池每日提醒邮件 + 每周变化摘要）。Vercel 不重试失败的调用，也可能偶尔重复调用；cron 只在 Production 部署上运行。

**重复运行的处理**（GitHub `schedule` 保留为兜底，未删除）：

- 派发前查该工作流最近 10 次运行：已有排队／运行中的 → 跳过；`company-refresh`、`spread-snapshot`、`etf-technical` 6 小时内已有成功运行 → 跳过；`daily-analysis` 只看排队／运行中（一天两次核验，第二次不能因第一次成功跳过）。查询失败时照常派发（宁可重复不漏跑），响应里 `duplicateCheck` 写明原因。
- `daily-analysis-snapshot.yml`：幂等（只追加缺失日期、无变化不提交），迟到的兜底排程再跑一次也无害，还顺带回补。
- `spread-snapshot.yml`、`etf-technical.yml`：生成最新快照，无变化不提交；重复运行无害。
- `company-refresh.yml`：兜底排程改为与 Vercel 相同的 `0 22 * * 1-5`，并且 **schedule 事件下 20 小时内已有 `data(companies): 行情刷新` 提交就跳过**——否则迟到 6–10 小时的兜底会落在亚洲盘中，用盘中价覆盖刚存的收盘价。Vercel 未配置时兜底照常运行（届时港股/A 股为盘中价，次日准点运行会覆盖）。手动全量刷新目录（无 `AUTO.txt`）仍保护不被覆盖。
- `company-refresh.yml` 的日期变量 `D` 由 `TZ=Asia/Yerevan` 改为 `TZ=America/New_York`：22:00 UTC 时埃里温已是次日 02:00，周五收盘会被记成周六的目录／快照日期，手动目录检查也会对错日子；纽约日期在 22:00 UTC 正好等于刚收盘的交易日（也是 A/H 股当天）。`AUTO.txt` 标记与 14 天清理逻辑不变。

**巡检**：`scripts/data-freshness-check.mjs` 从 `vercel.json` 读出这些 cron，报告多一列「Vercel Cron 派发 · 近 10 次延迟」（`workflow_dispatch` 运行配对到它之前 2 小时内的触发时刻；Hobby 下含小时内抖动）；准点派发的运行也算「排程已执行」；最近一个触发前 6 小时到后 2 小时内没有任何运行时提示「Vercel Cron … 前后没有运行」。环境变量配好之前，这条提示会一直出现（只是提示，不开告警 issue）。

### 需要人工完成的一次性设置

1. **建 PAT**：GitHub → 右上头像 → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token。
   - Token name：`businessweb-vercel-cron`；Expiration：自选（到期前记得轮换，过期后派发返回 401，Vercel 日志可见）。
   - Resource owner：`TurboSnails`；Repository access：**Only select repositories** → `TurboSnails/BusinessWeb`。
   - Repository permissions：**Actions: Read and write**（Metadata: Read-only 会自动带上）。**不需要 Contents** 或其他权限。
   - 生成后复制 `github_pat_…`。
2. **生成 CRON_SECRET**：`openssl rand -hex 32`（只含字母数字，粘贴时别带空格或换行）。
3. **配置 Vercel 环境变量（Production）**，二选一：
   - 网页：Vercel → 项目 business-web → **Settings → Environment Variables** → Add：Key `CRON_SECRET`、Value 上一步的随机串、Environment 只勾 **Production**，建议勾 Sensitive → Save；再加 `GITHUB_DISPATCH_TOKEN` = PAT，同样只勾 Production。
   - 命令行（已 `vercel link` 的仓库目录）：
     ```bash
     vercel env add CRON_SECRET production          # 粘贴随机串
     vercel env add GITHUB_DISPATCH_TOKEN production # 粘贴 PAT
     ```
4. **重新部署 Production**：环境变量只对之后的部署生效。推送含本改动的提交到 `main`，或 Vercel → Deployments → 最新 Production → ⋯ → Redeploy。
5. **验证**：
   - Vercel → 项目 → **Schedules → Cron Jobs**（旧界面为 Settings → Cron Jobs）应列出 5 个 `/api/market-data/cron-dispatch?workflow=…`；对 `company-refresh.yml` 那条点 **Run**（盘中手动运行会取到盘中价，可以改选 `spread-snapshot.yml` 验证），再点 **View Logs**，应看到 200 和 `[cron-dispatch] … 已派发`，或 `跳过：…`。
   - GitHub → Actions → 对应工作流应出现一条 Event 为 **workflow_dispatch** 的运行（`gh run list --workflow spread-snapshot.yml --limit 3` 的 EVENT 列）。
   - 命令行自测：`curl -s -H "Authorization: Bearer $CRON_SECRET" "https://business-web-black.vercel.app/api/market-data/cron-dispatch?workflow=spread-snapshot.yml"`；不带头应返回 401。
   - 排错：401 = `CRON_SECRET` 不一致或部署早于设置（重新部署）；503 = 变量没配到 Production；502 + `HTTP 401/403/404` = PAT 过期、权限不足或没选中本仓库。

## 候选池每日提醒邮件（2026-11-14 新增）

**做什么**：每个工作日早上给本人发一封汇总邮件，列出候选池里**新出现**的事项：触及条件价（收盘价、行情日期、来源、条件价及其锚点来源）、到期复查、评级变化。措辞是「到了你设的价位，该复核一眼」，页脚「观察提醒，不是买卖指令；行情为收盘价，数据日期见各条」。没有新事项不发；每天最多一封；同一事项（价位提醒按「交易日 + 条件」，复查按检查日，评级按档位变化）只发一次。「进入买入区」「DCF 过期」依赖本机保存的 DCF，服务端看不到，只在站内显示。暂停（`snoozedUntil`）、关闭（`enabled`）、「已看过」（`lastSeenAt`）与站内同一口径。

**入口**：`vercel.json` 的 cron `/api/market-data/candidate-alerts-digest`，`0 23 * * 1-5`（UTC 23:00–23:59 = 北京周二至周六 07:00–07:59，排在 22:00 `company-refresh` 之后）。路由挂在 `api/market-data/[marketRoute].js`（不新增函数），代码 `server/candidate-alerts-digest.ts`；判断规则与站内共用 `src/features/candidates/alertRules.ts`、`priceAlert.ts`。数据：Supabase 候选池快照（与云同步同一张表，只读）＋站点自己的静态文件 `/data/dcf-auto.json`（自动 DCF 收盘价与日期）和 `/data/company-refs.json`（构建时由 `scripts/build-company-index.mjs` 生成：公司名称、研究评级、公司页价格锚点）。去重记录在 Supabase 表 `businessweb_candidate_alert_log`。

**环境变量（Vercel Production）**：`CRON_SECRET`（与派发共用）、`SUPABASE_URL`、`SUPABASE_SECRET_KEY`（与候选池云同步共用）、`GMAIL_USER`、`GMAIL_APP_PASSWORD`（Google 账号 → 安全性 → 两步验证 → 应用专用密码）、`ALERT_EMAIL_TO`。缺任一邮件变量时返回 503 并在 Vercel 日志打印缺哪个变量名；邮箱地址和密码不写进日志、响应或仓库。

**一次性设置**：

1. Supabase SQL Editor 执行 `supabase/migrations/202611140001_candidate_alert_log.sql`（幂等）。没执行时函数退回「当日保护」：只发最新收盘日触发的价位提醒和刚到期的复查、不发评级变化，日志提示执行迁移。
2. 补齐上面的环境变量，重新部署 Production。

**试运行**（不发信、不写去重表，同样需要 `CRON_SECRET`）：

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" "https://business-web-black.vercel.app/api/market-data/candidate-alerts-digest?dryRun=1"
```

返回 `items`（每条的类别、文案、数据日期、去重键、是否新）、`subject`、`text`（邮件正文）、`sentLog`（`ok` / `missing` = 表未建 / `error`）、`mailConfigured`、`wouldSend`、`warnings`（行情文件读不到等）。去掉 `?dryRun=1` 即真实发送；同一天重复调用会返回 `skipped: "nothing-new"` 或 `"already-sent-today"`。Vercel → Schedules → Cron Jobs 里对这条点 Run 也可以。

**排错**：401 = `CRON_SECRET` 不一致；503 = 环境变量没配到 Production 或部署早于设置；502 + `Gmail 登录失败` = 应用专用密码错误或两步验证未开；502 + `读取候选池失败` = Supabase 配置或候选池迁移问题；`sentLog: "error"` 时为避免重复，本次不发。

**关闭**：删掉 `vercel.json` 里这条 cron 并部署；或临时删除 Production 的 `GMAIL_APP_PASSWORD`（函数返回 503，不发信）。重新开启按相反步骤。单测：`npx vitest run src/features/candidates/digest.test.ts`。

## 每周变化摘要（站内「本周变化」+ 周邮件，2026-11-14 新增）

**做什么**：把上一个完整自然周（北京时间周一至周日）与再前一周相比的**可复核事实**列出来，不含 AI、不做预测；每条写明数据日期与来源，没有变化时写「本周没有需要复核的变化」。规则只有一份：`src/features/weekly/weeklySummary.ts`（纯函数，站内与服务端共用，单测 `weeklySummary.test.ts`）。

| 一节 | 内容 | 数据来源 |
| --- | --- | --- |
| 候选池 | 评级档位变化；本周触及条件价；本周新写的决策记录；下周到期的复查 | 信号台账两期快照；候选池记录（本机 / 云端快照）；收盘价观测与「今日待处理」同源（`dcf-auto.json` 收盘价 + 公司页价格锚点），邮件另并入本周每日提醒已发过的 `price-hit` 记录 |
| 公司库 | 评级档位变化总数；新进 / 跌出「优先关注」「条件关注」各最多 8 家 | `public/data/signal-ledger-YYYY.json`（本周一期 vs 本周之前最近一期；跨年读两个文件） |
| 牛熊周期 | 各市场总体状态、趋势、风险闸门、估值区域的变化 | `public/data/market-cycle-report.json`（weekEnding 落在本周 / 上周的记录） |
| 宏观温度 | 宏观阶段变化（六项风险信号按 `stages.ts` 规则，取各周日及之前最近的观测） | `public/data/macro-us.json` 的 history / latest；两周末可用信号项不同时不比较 |
| 下周财报（背景） | 摘要周下一周有财报的公司，只限候选池或站内评级「条件关注 / 优先关注」；候选池在前，最多 12 家，其余写「另有 N 家」 | `public/data/earnings-calendar.json`；**不计入标题项数，也不决定是否发信**（只有财报、没有变化时照样 `no-changes` 不发） |

未纳入：`lynch.json` 只有当前分类没有历史，`dcf-auto.json` 不留历史，无法做周比较。

**站内**：候选池「我的候选」页签，「今日待处理」上方的折叠区「本周变化 · N 项」（`src/components/WeeklyChanges.tsx`）。只读站点静态 JSON 与本机候选池，不需要服务端；某个文件读不到时，那一部分不比较并写明。

**周邮件**：同一路由加参数 `/api/market-data/candidate-alerts-digest?weekly=1`（代码 `server/weekly-digest.ts`，挂在每日提醒的处理函数里，不新增函数），复用 `CRON_SECRET` 鉴权、Gmail 环境变量和去重表。`vercel.json` cron `0 0 * * 1`：UTC 周一 00:00–00:59 = 北京周一 08:00–08:59。每日提醒是 `0 23 * * 1-5`（北京周二至周六早上），所以周一早上只有周邮件，两者不会在同一天早上都发。没有变化时不发信（`skipped: "no-changes"`）。

**去重**：每周一封，去重键 `weekly|YYYY-Www`（ISO 周，如 `weekly|2026-W46`）写入现有表 `businessweb_candidate_alert_log`，`kind = 'digest'`。表的检查约束本来就允许 `digest`，**不需要新迁移**；每日提醒的键是 `digest|YYYY-MM-DD`，逐项键是 `price-hit|…` 等，前缀不同互不影响。先认领再发信，发信失败删除认领、下次再发；同一周重复调用或周中补跑返回 `skipped: "already-sent-this-week"`。表不存在时退回「本实例同周只发一次」并在日志提示执行迁移；表读取出错时不发。

**试运行**（不发信、不写去重表）：

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" "https://business-web-black.vercel.app/api/market-data/candidate-alerts-digest?weekly=1&dryRun=1"
```

返回 `week`（周编号与起止日）、`sections`（各节条数）、`summary`（全部条目，含日期、来源、链接）、`notes`（数据缺口）、`subject` / `text`、`alreadySent`、`wouldSend`、`sentLog`。

**关闭**：删掉 `vercel.json` 里 `?weekly=1` 那条 cron 并部署。单测：`npx vitest run src/features/weekly src/components/WeeklyChanges.test.tsx`。

## 财报前瞻 earnings-calendar.json（2026-11-14 新增）

**做什么**：`/earnings` 页（`src/pages/Earnings.tsx`）、公司页「下次财报」徽章、候选池「财报临近」（未来 14 天）和每周摘要「下周财报」共用的数据。只收**公司库内**的公司，窗口为**今天 −14 天到 +42 天**；只整理事实（日期、时段、是否确认、一致预期、历史超预期、已公布结果）与站内研究摘要，不做预测。

**生成**：`node scripts/earnings-calendar.mjs`（约 12 分钟；需要 `uv`，yfinance 固定 `1.8.0`，由 `scripts/earnings-calendar-yf.py` 采集，可用 `EARNINGS_YF_CMD` 覆盖命令）。`--refresh-research` 只按当前公司库离线重建各条目的研究摘要（评级、情景带、验证事项），不重新抓取。单测：`node --test scripts/earnings-calendar.test.mjs`（fixtures 在 `scripts/fixtures/earnings/`）。

**节奏**：工作流 `.github/workflows/earnings-calendar.yml`，只提交这一个文件（`data(earnings): …`）。准点触发是 Vercel Cron 每天 **23:00 UTC**（北京 07:00，美股盘后财报已公布、A 股 / 港股开盘前）经 `cron-dispatch` 调 `workflow_dispatch`；GitHub schedule **23:40 UTC** 只作兜底，20 小时内已有 `data(earnings)` 提交就跳过（`cron-dispatch` 见到 6 小时内已成功的运行也不再派发）。数据新鲜度检查 `scripts/data-freshness-check.mjs` 的 `earnings.*` 按 `sources.yahoo / hkex / cnAppoint` 的 `fetchedAt` 日期判断，超过 3 个自然日算过期。

| 源（`sources` 键） | 提供什么 |
| --- | --- |
| Yahoo Finance（`yahoo`，yfinance） | 美股（标普 / 纳指 100 / ADR）与港股财报日、盘前 / 盘后（BMO / AMC）、是否确认、EPS 与营收一致预期、近 4 季超预期幅度、季度营收 |
| 港交所披露易董事会会议通告（`hkex`） | 港股官方董事会会议日期；与 Yahoo 冲突时**优先用港交所** |
| 东方财富（`cnAppoint` 预约披露、`cnForecast` 业绩预告、`cnExpress` 业绩快报、`cnReport` 业绩报表、`cnConsensus` 机构盈利预测） | A 股预约披露日与变更、业绩预告 / 快报 / 报表；盈利预测只有年度口径，**没有 A 股季度一致预期** |

**不使用 Nasdaq**：其条款禁止自动抓取与再分发。

**失败与空表**：每个源独立；某源失败时保留上次文件里该源的条目和**原来的日期**（条目标 `carried`，`sources[id].ok = false`、`fetchedAt` 保持上次成功时间，连续失败会在新鲜度检查里变成过期）。A 股非披露季（如 11–12 月）预约披露表为空属正常，不是故障。

## 一次更新如何验收与留痕

1. 从 CSV 选本轮条目，记录执行日期、操作者、数据源和计划覆盖范围；保留本轮开始前的原始证据或 Git 版本。
2. 先获取真实新输入，检查报价时间、报告期、披露日、币种、单位、复权、普通股／ADS、股本及合并／归母口径。没有新数据写“源无新披露”或“采集失败”，不算已完成刷新。
3. 按依赖顺序重算并同步：**源／输入 → 结构化索引与 JSON → 手工详情覆盖层 → 情景和赔率 → 报告网页／导出／统计元数据**。`loadCompanies` 的覆盖顺序见 [companyCore.ts](../src/data/companyCore.ts)，未来趋势实际消费见 [FutureTrends.tsx](../src/pages/FutureTrends.tsx)。
4. 对比更新前后字段和缺失数量；抽查最终页面、来源链接及研究结论。按修改范围运行已有检查，不因为只是例行取数而机械扩大测试范围。
5. 在 CSV 更新状态、`last_checked`、`next_review`；新增日期报告，附变更文件、源日期、采集失败项及验证结果。发布另按项目流程处理，未部署不能记录为线上已更新。

建议留痕模板：

```text
执行日期 / 操作者：
台账 ID / 覆盖对象：
原数据日期 → 新数据日期（价格、财报、披露日分别填写）：
源 / 原始证据位置：
派生字段与页面同步情况：
缺失 / 失败 / 仍待披露：
验证结果 / 提交或发布版本：
下次检查日：
```

现有 [书稿数字核对表](../public/first-book/数字核对表.md) 也规定行情随用随算、财务披露后复核、规则定期核对、教学假设无需例行更新，可与本台账配合。

## 本轮新增可复用工具

日期参数表示本轮存档目录；每一项内部仍保留真实报价日／观测期／披露日，不能用目录日期替代。

```bash
# 先生成当轮公司范围与证券列表，再采集；把日期换成实际执行日。
node scripts/collect-market-refresh.mjs universe YYYY-MM-DD
node scripts/collect-market-refresh.mjs macro YYYY-MM-DD
node scripts/collect-market-refresh.mjs indexes YYYY-MM-DD
node scripts/collect-market-refresh.mjs yahoo-quotes YYYY-MM-DD

# 用具备mcp/yfinance依赖的Python环境运行；共享启动器位于../.agents/mcp。
uvx --python 3.12 --from yfinance-mcp-server==1.0.4 python scripts/collect-market-mcp.py --date YYYY-MM-DD --mode probe
uvx --python 3.12 --from yfinance-mcp-server==1.0.4 python scripts/collect-market-mcp.py --date YYYY-MM-DD --mode retry-core
uvx --python 3.12 --from yfinance-mcp-server==1.0.4 python scripts/collect-market-mcp.py --date YYYY-MM-DD --mode collect
uvx --python 3.12 --from yfinance-mcp-server==1.0.4 python scripts/collect-market-mcp.py --date YYYY-MM-DD --mode quotes
uvx --python 3.12 --from yfinance-mcp-server==1.0.4 python scripts/collect-market-mcp.py --date YYYY-MM-DD --mode ak-financial
uvx --python 3.12 --from yfinance-mcp-server==1.0.4 python scripts/collect-market-mcp.py --date YYYY-MM-DD --mode quotes-etf

# 有限流时先冷却，再低频补采失败的完整公司资料。
uvx --python 3.12 --from yfinance-mcp-server==1.0.4 python scripts/collect-market-mcp.py --date YYYY-MM-DD --mode retry-info

# 检查原始证据后应用。生成companyMarketSnapshot并在最终覆盖层生效。
python3 scripts/normalize-market-refresh.py --date YYYY-MM-DD --dry-run
python3 scripts/normalize-market-refresh.py --date YYYY-MM-DD
node scripts/collect-market-refresh.mjs apply-companies YYYY-MM-DD
node scripts/collect-market-refresh.mjs universe-after YYYY-MM-DD
```

2026-10-20 刷新经验：`../.agents/mcp` 启动器目前缺失，`probe/collect/retry-*` 无法运行；`quotes`、`quotes-etf` 不依赖启动器，可单独运行。uvx 下载的 Python 没有系统根证书，腾讯行情会全部报 `CERTIFICATE_VERIFY_FAILED`、返回 0 条，需要先设置 `SSL_CERT_FILE=$(uvx --python 3.12 --from yfinance-mcp-server==1.0.4 python -c "import certifi;print(certifi.where())")`。刷新后 `adrResearch／hkResearch／solidState` 测试里锁定的价格锚点日期与样例价格需同步改为本轮值。

2026-10-23 刷新经验：`../.agents/mcp` 启动器已存在，`probe／quotes／quotes-etf` 三种模式全部可运行（本轮探针两服务 initialize／list_tools／call_tool 均成功，quotes 1824/1824、quotes-etf 55/55）；本机实测 uvx 环境不设 `SSL_CERT_FILE` 也能取到腾讯行情，该变量只作为兜底而非必需。`universe` 提取时 `public/data/company-valuations/*.json` 的网络请求被本地 fetch 桩拦下并只记警告，不影响公司范围（1540 条）与后续应用，但估值覆盖层 JSON 的内置价格不会因此刷新（见台账 VALUATION-01）。手动全量刷新的目录**不要**留 `AUTO.txt`：留了会被远端 bot 当成自动目录继续覆盖当天数据。`npm run daily-analysis:backfill` 在无缺口时新增 0 条（`added: []`），不代表回补失效。

MCP入口会实际initialize／list_tools／call_tool，不直接冒充MCP调用。当前注册配置有迁移前旧绝对路径，本轮使用工作区父目录中已存在的启动器，未改外部配置。独立迁移项目时需要一并配置可用启动器和其依赖；缺失时先修正环境，不把空返回当数据。

`normalize-market-refresh.py`只应用已保留的有效输入：行情不能倒退，旧北交所代码占位报价不能成为现价，空报表不能覆盖原件。旧研究／模型日期独立保留，已撤回的PEP盈利模型不会因新价格恢复赔率。它不会代替公司一手取证、完整估值、私人记录同步或PDF重新出版，也没有新增定时任务。

## 估值初稿覆盖层与信号台账

**港股 / ADR 估值初稿覆盖层（2026-10-20）**：10-07 事实复核撤回了未经验证的估值，评级几乎全为「观察」。覆盖层在事实复核之上补估值初稿与评级分档，合并顺序在 `src/data/companyDetails.ts`：港股 `extra → manual → hk → hkValuation`，ADR `extra → manual → adr → sofi → adrValuation`（SOFI 保留完整研究，不在覆盖层内）。

```bash
python3 scripts/review-hk-valuation-2026-10-20.py    # → src/data/details/hkValuation.ts、public/research/hk-valuation-2026-10-20/
python3 scripts/review-adr-valuation-2026-10-20.py   # → src/data/details/adrValuation.ts、public/research/adr-valuation-2026-10-20/
npx vitest run src/data                              # hkValuation／adrValuation 逐家重算 ratio 与评级
```

- 脚本可复现：连续运行两次输出字节一致；价格取 `companyMarketSnapshot.json`，盈利来自 10-07 的 `input.json`／`models.json` 与 Yahoo 快照（供应商口径，非公司指引）。倍数是行业类别研究假设，未校准历史分位；概率不赋值。
- 评级沿用 A 股 `review-cn-itucd-2026-10-07.py` 的规则：单一估值方法最高「条件关注」；ratio>8、周期行业、经营现金流为负封顶「观察」；「回避」只给 10-07 复核为「等待证据」的公司，供应商 EPS 为负而原件复核为观察者保持观察并标待核读。
- 刷新价格后**不会**自动重算覆盖层：价格进入情景价的 ratio，需要重新运行脚本并提交；`companyMarketSnapshot.json` 更新后若只改价格不重跑，页面显示的「相对现价」会与现价脱节。
- 独立审查与返工记录见 `.dev-team/runs/hk-adr-valuation/`（`reports/review.md`）。审查留下、尚未处理的项：ADR 封顶原因统计写法有重复计数隐患（不影响评级）。

**已知限制：评级对价格有阈值跳变**（2026-10-20 差距分析，`.dev-team/runs/hk-adr-valuation/reports/framework-gap.md`）。盈利冻结、价格每天变，评级由「ratio 阶梯 + ratio>8／悲观价失效封顶」决定，封顶是分段跳变的：把全部价格上下波动 5% 做模拟，港股 17/127（13.4%）、ADR 6/66（9.1%）会变档，且方向可能反直觉（价格上涨反而升到条件关注、下跌反而降档）。这是价格贴近悲观价时 ratio 飙升触发封顶造成的阈值噪声，不是基本面信号。含义：信号台账里评级的变化有一部分是噪声；今日待办的「评级变化」只比较你写过决策记录的公司，范围小。**不要据此改规则**：模拟是上限情形，真实每日波动多数小于 5%，且无回测前不宜引入缓冲带。

观察期做法：每日重算会让 `src/data/details/hkValuation.ts`／`adrValuation.ts` 的 `rt:` 行逐日提交，git 历史就是真实翻转记录。积累约两周后量化真实频率：

```bash
# 近 N 次提交中，每家公司评级改变了几次（港股；ADR 把文件名换成 adrValuation.ts、前缀换成 @adr:）
python3 - <<'PY'
import subprocess, re, collections
f = 'src/data/details/hkValuation.ts'
shas = subprocess.check_output(['git', 'log', '--format=%h', '-30', '--', f]).decode().split()[::-1]
prev, flips = {}, collections.Counter()
for sha in shas:
    t = subprocess.check_output(['git', 'show', f'{sha}:{f}']).decode()
    cur = {m.group(1): m.group(2) for m in re.finditer(r'^@hk:(\S+)\nrt: (.+)$', t, re.M)}
    for k, v in cur.items():
        if prev.get(k) not in (None, v): flips[k] += 1
    prev = cur
print(len(shas), '期；有翻转的公司', len(flips), '；翻转≥2 次的', sum(1 for n in flips.values() if n >= 2))
PY
```

注意：2026-10-20 当天的几次提交是手动改方法（倍数映射、金融股股息率法等）造成的变档，不是价格波动，统计时应从每日自动刷新开始的提交算起，否则会把方法改动误当作价格噪声。

若多数翻转来自少数几家贴近阈值的公司，再考虑对这几类（ratio>8、悲观价≥现价）加「连续确认」缓冲；先做回测再改规则，不要凭模拟直接改。

**信号台账**：`scripts/signal-ledger.mjs` 在工作日行情刷新后（`company-refresh.yml` 的 `Record signal ledger` 步骤）写入 `public/data/signal-ledger-YYYY.json`，每周保留一期：当时的研究评级、价格、自动 DCF 与机会雷达信号。机会雷达页「信号复盘」在积累满 28 天后按市场比较各信号组的事后收益；只看价格变动，不含分红与汇率，样本少于 5 家的组不下结论。手动补一期：`node scripts/signal-ledger.mjs YYYY-MM-DD`（同一周以后写入的覆盖先前的）。台账行的最后一列是雷达信号，含义随雷达规则版本变化，版本记在台账顶层的 `radarRule`（快照日期 → 版本，没有记录的快照按第 1 版）：第 1 版为加分信号数 0–2，第 2 版为所在主线（1 价值回归、2 快速增长），−1 都表示不在雷达。复盘按起始快照的版本拆分组，两版不混比。

**机会雷达（`/radar`，规则第 2 版，2026-11-14 起）**：`src/features/dcf/radar.ts` 的 `buildRadar` 在浏览器里用 `public/data/dcf-prefill.json`（价格、自动 DCF、近 5 年 FCF 收益率分位 `fyh`）与 `public/data/lynch.json`（林奇类型、增速、PE、盈利位置、护城河六项检查）现算，不另存数据文件；范围是预填库（沪深300、恒指、恒生科技、纳指100、研究公司）。方法按《正念投资》第19—24章：先分类，再按类型检查。
- 价值回归线（第20章，稳健型/缓慢增长型）：必要条件依次为非强周期（`cyclical` 布尔优先，否则看「行业属强周期」「所属行业有周期属性」标记）、盈利位置不是「盈利高位/盈利下行」、利润未大起大落、护城河检查「盈利持续」通过（三个 TTM 窗口利润全正、未萎缩、回撤 ≤30%）、自动 DCF 可用且可信度不为低、现价 ≤ 买入参考价。计分：FCF 收益率高于近 5 年 60% 的月份 +1。
- 快速增长线（第21章，快速增长型）：近一年与两年年化增速都有且有效增速 ≥20%、营收 ≥10%（与 `scripts/lib/lynch-classify.mjs` 同门槛），非金融业、非强周期、近一年未「明显放缓」，PE ≤ (1+g)³ ÷ 1.10³ × 15（第21章 21.7 压力算式：增速维持 3 年、PE 回到 15 倍时年化仍有 10%；g 按 50% 封顶）。计分：营收增速 ≥ 有效增速一半 +1、有效增速 ≤50% +1（>80% 标低基数待核）、股本 5 季变动 >25% −1。
- 巴菲特加减分（两条线都有）：宽护城河迹象 +1、窄 +0.5；财务稳健通过 +0.5、未通过 −1。能力圈因人而异，书和站内没有统一行业清单，雷达不评。同分按数据可信度（DCF 可信度高 / 增速按新财报重算）再按价格余量排序。
- 周期型、困境反转型、资产型与未分类不进主线，页面折叠列出数量与原因；周期型中「盈利低位」的公司列为选读观察、不排名。
- 门槛改动要同时改 `RADAR_RULES`、`radar.test.ts` 与页面说明；规则含义变了要升 `RADAR_VERSION`，信号台账靠它区分历史快照。

## 方法复盘：评级复盘与趋势规则回测（2026-11-14 新增）

两份输出都由每周工作流 `rating-review.yml`（Weekly method review）生成：周六 UTC 09:30 运行、周日同一时间兜底，并发组 `market-data-publish`（与行情、周期工作流串行），只提交 `public/data/rating-review.json` 与 `public/data/market-cycle-backtest.json`，有变化才触发 Pages 部署。两个脚本只由输入决定、不读当前时间，输入没变就不会产生提交。数据新鲜度巡检把信号台账最新一期、评级复盘 `asOf`、回测最后完整周都按周度（>10 天）检查，评级复盘落后于台账时提示。

| 输出 | 入口 | 输入 | 页面 |
| --- | --- | --- | --- |
| 评级复盘 | `node scripts/rating-review.mjs [--out FILE]`；单测 `node --test scripts/rating-review.test.mjs` | 全部 `signal-ledger-YYYY.json` + `market-cycle.json` 指数周K | 公司研究 → 研究方法 →「评级复盘」 |
| 趋势规则回测 | `node scripts/cycle-backtest.mjs [--in FILE] [--out FILE]`；单测 `node --test scripts/cycle-backtest.test.mjs` | `market-cycle.json` 周K（复用 `engine.ts` 的 `completedBars`／`technicalSeries`／`trendBroken`） | 监控 → 牛熊周期 →「规则回测」 |

**评级复盘口径**：以每期快照的起点评级（优先关注／条件关注／观察／回避；未估值不参与）分组，取约 1／2／4／13／26 周后的那一期快照（相差 ≤3 天）算个股涨跌，减去同市场指数同期涨跌（A 股沪深300、港股恒指、美股含 ADR 对标普500，指数取快照所在周的周收盘）得超额收益；统计均值、中位数、超额均值／中位数、胜率（超额>0 占比）、样本数与起始期数，以及档位差（高档超额均值 − 低档）。可比样本 <30 标「样本不足」不给数值；持有期未走完标「待积累」；样本够但起始期 <8 标「早期读数」（同一周几百只股票受同一风格影响，不是独立样本）。只看价格，不含分红与汇率；起始期重叠会放大表面样本量。选 Node 而非 Python + alphalens：评级是 4 档分类、周频快照，alphalens 的分位分组与日频远期收益用不上，统计只需几十行纯函数，且不引入新依赖。台账自 2026-10-23 起记录，至少数月后才可能说明问题；评级是观察状态，不是交易信号。

**趋势规则回测口径**：规则 = 连续两根完整周K收于20周线下 → 趋势防守，任一周收回即解除；从第 52 根完整周K起给信号（与面板门槛一致），月 RSI／MACD 不影响防守、回测不用。主口径信号周六确认、下一周收盘成交（滞后一周）；敏感性为周一开盘成交（用信号周收盘近似）。防守期持现金按 0% 计，不加杠杆、不做空；切换成本 0／0.1%／0.3% 每次。统计年化、最大回撤、波动（周收益 ×√52）、空仓时间、切换次数、打脸（买回价不低于卖出价）、短防守（≤4 周），以及进入防守后 4／13／26 周的指数涨跌分布与样本内全部周对照。局限：样本内、单一规则（另五维与组合状态未回测）、指数不可直接投资、价格指数不含分红、样本期仅约 6–15 年。

2026-11-14 首次结果（数据至 2026-11-13，0 成本、滞后一周；以 JSON 为准，每周会随新数据变化）：五个指数的防守变体最大回撤都更小（沪深300 −46%→−40%、恒指 −55%→−46%、恒科 −58%→−27%、标普500 −32%→−25%、纳指100 −35%→−31%）；年化收益只有恒生科技（样本期整体下跌，−10.3%→−1.9%）高于买入持有，沪深300 基本持平（3.1%→3.0%），恒指（1.3%→0.6%）、标普500（12.7%→6.5%）、纳指100（18.0%→13.1%）落后，计入每次 0.1% 成本后再降。打脸比例高（沪深300 19/31、恒指 22/38、美股 11/12 与 10/11）；进入防守后 4／13／26 周的指数涨跌分布与样本内全部周差别不大，美股甚至更好（防守后常是反弹）。结论：这条规则在样本内主要是「用收益换回撤」，在长期上涨的美股代价明显，不能当作择时增益的证据；它适合作为复核风险预算的提示，而不是自动减仓指令。

## 下次盘点的可复用任务

> 按 `docs/data-maintenance.md` 和 `docs/data-maintenance.csv` 做本轮数据新鲜度盘点。以当天 Asia/Yerevan 日期和各市场实际交易日为基准，逐字段检查数据日期，不用生成日替代。先输出超期、待刷新、缺失、等待披露及历史归档清单，保存新的日期报告和公司价格明细；若本轮同时授权更新，再按台账入口取新输入、更新派生结果并验收。旧原件、回测和书籍案例保留。无法访问的私有／远端数据单列，不能声称已经全部检查。

> 2026-10-23 轮次的延续项：一是 `gh` 登录后核查 `company-refresh.yml` 自 10-21 起的运行日志，确认行情步骤停滞的根因（采集失败或验证失败），必要时补 `SSL_CERT_FILE` 后重跑；二是核对 `public/data/company-valuations/*.json` 的内置价格与 `comparison` 是否已随行情重算（台账 VALUATION-01）；三是国家队 ETF 持有人报告期源恢复后补采。

## 深交所数据本机刷新（2026-11-14）

深交所（szse.cn）拒绝境外机房 IP，GitHub Actions 取不到两市融资占比（cn-funding）与 A 股 52 周成交额基准（cn-turnover）的深市部分；本机家用网络可以。另：腾讯日 K 在本机偶发 WAF 501，交易日历已加雅虎日线兜底（仍做沪深双日历交叉核验）。

- 采集：`node scripts/market-cycle-local-szse.mjs`（只跑上述两个源，合并进 `market-cycle-auto.json` 并重算周报）
- 定时：`scripts/szse-local-refresh.sh` 复制为 `~/.businessweb-szse/run.sh`，由 launchd `~/Library/LaunchAgents/com.businessweb.szse-refresh.plist` 在工作日本地 14:30（UTC+4，即北京 18:30）运行；独立仓库副本 `~/.businessweb-szse/repo`，只提交牛熊周期两个数据文件；日志 `~/Library/Logs/businessweb-szse.log`。电脑睡眠错过时唤醒后补跑；北京时间周末自动跳过（`SZSE_FORCE=1` 可强制）。
- 手动触发：`launchctl kickstart gui/$(id -u)/com.businessweb.szse-refresh`
- 卸载：`launchctl bootout gui/$(id -u)/com.businessweb.szse-refresh && rm ~/Library/LaunchAgents/com.businessweb.szse-refresh.plist && rm -rf ~/.businessweb-szse`
- 两融数据 T+1 早上公布，周五数据下周一才有；成交额基准只认已完整结束的一周（周日之后）。
