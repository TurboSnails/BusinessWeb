# 朋友项目近期更新：可借鉴内容评估（2026-11-16）

## 结论与范围

核查对象：[danielmoorelumestory/BusinessWeb](https://github.com/danielmoorelumestory/BusinessWeb)，在线确认默认分支为 main，随后克隆源码到临时目录。评估固定在提交 [`dca7e74`](https://github.com/danielmoorelumestory/BusinessWeb/commit/dca7e74d00d6b1359de2ce05246e7872a9be93c8)。重点查看 11 月 10—16 日更新，尤其是上次 ETF 策略研究之后的 11 月 15—16 日增量。本项目基线为 `d47cc4fa`，本次只新增评估文档。

按用户可感知的功能归并为 **12 项：6 项值得近期完善，3 项作为验证候选，3 项暂不采纳**。这是工作项计数，不代表可直接搬用的代码比例。网格模拟、ETF 自选复盘、指数估值、股债息差和牛熊周期在本站已有，不能算作整套新增功能。

最大价值是补上「指数比较 → 找到真正跟踪的 ETF → 加入复盘 → 查看行情/网格」的连续流程。收益优选榜、策略信号和数据抓取需单独核实，不能随着页面一起认定有效。

## 12 项对照

| # | 朋友近期更新与源码证据 | 本站现状 | 处理建议 |
|---|---|---|---|
| 1 | 指数全景：分类、搜索、收藏、1/3/5/10 年比较、最多 8 条走势叠加、PE/PB/股息率等指标；[home.js](https://github.com/danielmoorelumestory/BusinessWeb/blob/dca7e74/tools/index-panorama/home.js)、[detail.js](https://github.com/danielmoorelumestory/BusinessWeb/blob/dca7e74/tools/index-panorama/detail.js) | `src/features/macro/ValuationView.tsx` 已有指数价格、PE 历史位置；并非没有估值面板 | **近期做**：扩展现有估值页的行业覆盖和横向比较，先保留现有可靠数据，不另建第二套估值系统 |
| 2 | 指数 → ETF 官方映射；63 只指数中 56 只有直接跟踪产品，340 条直接关系、7 条相关主题；[映射报告](https://github.com/danielmoorelumestory/BusinessWeb/blob/dca7e74/tools/index-panorama/reports/etf-mapping.md) | `src/data/broadEtf.*`、`industryEtf.*` 是分类清单，缺统一的逐产品官方关系证据目录 | **近期做，最高优先**：记录指数代码、基金代码、直接跟踪/相关主题、证据 URL、核验日期；指数页可进 ETF 复盘或网格工具 |
| 3 | 网格详情日 K：拖拽缩放、成交量、MA10/20、MACD 副图、时间区间；[detail.astro](https://github.com/danielmoorelumestory/BusinessWeb/blob/dca7e74/notes-site/src/pages/lab/grid-trading/detail.astro) | `src/features/grid-trading/GridChart.tsx`、`chart.ts` 已有账户/网格曲线，尚缺上述行情观察组合 | **近期做**：补行情图层与移动端交互；复用本站已有图表依赖。账户结果和实际成交仍以原模拟器为准 |
| 4 | ETF 日/周/月 MACD 金叉、死叉筛选；[ETF 复盘页](https://github.com/danielmoorelumestory/BusinessWeb/blob/dca7e74/notes-site/src/pages/lab/etf-review/index.astro) | `src/components/EtfTechCell.tsx` 已展示多周期技术状态，`IndustryEtf.tsx` 已解释计算口径；`EtfReview.tsx` 仍以手工笔记和分组为主 | **近期做**：把已有技术数据接入复盘筛选，不重复造指标；区分交叉事件与持续偏多状态，周/月未完成数据单独标识 |
| 5 | 全景关联 ETF 直接进网格详情；主升浪列表可一键加入复盘、多选分组；[最新提交](https://github.com/danielmoorelumestory/BusinessWeb/commit/dca7e74)、[uptrend 页面](https://github.com/danielmoorelumestory/BusinessWeb/blob/dca7e74/notes-site/src/pages/lab/etf-uptrend.astro) | `src/pages/EtfReview.tsx` 已支持分组、JSON 导入导出、跳网格；数据结构仍为单分组 | **近期做**：先连通现有列表，保留代码/名称上下文及已有笔记；多分组须升级 schema、兼容旧备份，不能直接替换存储结构 |
| 6 | 每字段来源/频率/样本数/实际日期，整列选源、发布退化检查、隔离刷新；[README](https://github.com/danielmoorelumestory/BusinessWeb/blob/dca7e74/tools/index-panorama/README.md)、[发布脚本](https://github.com/danielmoorelumestory/BusinessWeb/blob/dca7e74/scripts/index-panorama-sync.mjs) | 本站牛熊周期已做质量门禁、有效产物发布与留档；不同页面解释一致性仍可提升 | **近期做**：将字段级来源与缺失原因统一展示到指数/ETF 页；补历史覆盖退化比较和上游修订提示，复用现有刷新框架 |
| 7 | ETF 全 A/宽基资金净流入：份额差 × 市价、累计曲线叠指数；[计算库](https://github.com/danielmoorelumestory/BusinessWeb/blob/dca7e74/scripts/lib/etf-flow.mjs)、[快照](https://github.com/danielmoorelumestory/BusinessWeb/blob/dca7e74/scripts/etf-flow-snapshot.mjs) | 本站国家队 ETF 是披露持仓，周期面板 ETF 份额覆盖也有限，均不等于全市场日净申赎 | **候选**：用我们自己的采集与归档补资金观察；先修同日重跑、逐市场日期和覆盖率，足够真实日样本后再上线 |
| 8 | ETF 主升浪实验页：历史快照、较上次新进、分类交集、区间/原因信息；[采集脚本](https://github.com/danielmoorelumestory/BusinessWeb/blob/dca7e74/scripts/etf_uptrend.py)、[纯函数](https://github.com/danielmoorelumestory/BusinessWeb/blob/dca7e74/notes-site/src/lib/etf-uptrend.ts) | 本站有手工自选/复盘，缺自动候选池的逐日变动记录 | **候选**：借鉴可回放的名单变动与加入复盘流程；来源为同花顺主升浪接口，不能当自有透明模型，稳定性和使用条件需先核实 |
| 9 | 创业板/沪深300择时信号、持仓色带、逐笔涨跌标注；[MACD](https://github.com/danielmoorelumestory/BusinessWeb/blob/dca7e74/notes-site/src/lib/macd-signals.ts)、[KD10](https://github.com/danielmoorelumestory/BusinessWeb/blob/dca7e74/notes-site/src/lib/kd10-signals.ts) | 本站已有牛熊观察与规则回测，ETF 择时已有独立研究和影子运行任务 | **候选，沿用已有门禁**：先继续研究，只在合格后作为观察层接入；不因新增箭头或色带就输出交易指令 |
| 10 | MACD 优秀、沪深300择时优选、10 只等权择时组合；[组合说明](https://github.com/danielmoorelumestory/BusinessWeb/blob/dca7e74/src/data/etfTimingPortfolio.json) | 昨日研究已否定优选名单有明确样本外预测力 | **暂不采纳名单与收益宣传**；组合分散/相关性控制可作为研究假设，不能照搬精选标的或历史高年化 |
| 11 | 指数 EPS 从李神奇数据网页面抓取；[provider](https://github.com/danielmoorelumestory/BusinessWeb/blob/dca7e74/tools/index-panorama/providers/original_eps.py) 自称「计算口径未核实」 | 本站研究强调原始口径、可追溯和历史可得性 | **暂不接入该数据源**；可借鉴盈利/估值并列展示，待来源、定义和可得时间核实再补数据 |
| 12 | 删除 AI 实验室/自由空间、只保留 Cloudflare 发布线；[删栏目](https://github.com/danielmoorelumestory/BusinessWeb/commit/bca09eb)、[单发布线](https://github.com/danielmoorelumestory/BusinessWeb/commit/898daf9) | 本站还承载 AI 技能、估值服务、知识中心与现有部署流程 | **暂不跟随**：这是朋友自己的产品收缩与部署选择，目前没有证据说明适合本站 |

## 核验中发现的限制

### 资金流：思路有价值，当前版本不能直接移植

固定提交的 `public/data/etf-flow.json` 为 `sample: true`、`series: []`，说明仓库尚未提供可核查的真实累计序列；不能仅凭页面和 CI 文件认为已稳定产出 60 日数据。

`scripts/etf-flow-snapshot.mjs:64–89` 以 `shares-latest.json` 为基准，运行结束即更新为当日份额。同日再跑时，份额差变成 0，并替换掉原日序列。临时目录注入复现：前日份额 1 亿、当日 1.1 亿、市价 10 元，首次净流入 **1 亿元**，同日相同输入重跑变成 **0 亿元**。既有幂等测试只查日期不重复，未查金额不变。

此外，首次无前值仍落 0；沪市缺失会整体跳过，但深市缺失时仍可发布，合并保留旧份额又缺逐标的日期校验，恢复日可能把跨日变化记为单日。引入前应存逐日原始份额、按实际交易日配对、展示覆盖率，缺失不补 0；用拆并份额事件处理，避免把固定跳变阈值当完整校正。

这些是可复现实现问题与源码推断，不代表已经观察到线上用户受影响。资金流数据应标「净申赎估算」，不能解释成国家队买入或二级市场主力资金。

### 全景：展示可以学，数据门槛需要更严

源码比 README 的旧覆盖表更新：官方映射报告已经是 63 只指数。实际发布 `data-bundle.js` 约 **21 MiB**，不能按说明中的约 13 MB 估算当前体积。本站适合按需加载，避免让普通估值页首次打开就下载全部历史。

`detail.js:110` 的 `MIN_HIST = 2` 只排除了单个观测；两个观测仍可产生分位与冷热。我们应同时要求足够时间跨度、样本覆盖与一致频率，不能把「非单期」当作长期分位充分条件。单期美股 PE、短期港股数据以及未核实 EPS 应各自显示真实范围，不能统一包装成十年可比估值。

指数与基金关系应区分「直接跟踪」和「相关主题」：朋友已专门说明全指通信 000994 并不等于通信设备 931160 或 5G 通信 931079。该防误配设计比单纯加几个基金链接更有价值。

### 策略：新组合没有推翻既有研究结论

朋友新增组合的文字说明已经承认，样本外规则挑选与全部等权、随机抽 10 只互有胜负，稳定性主要来自择时和分散。该说明本身不是可独立复跑的完整验证材料。图上的逐笔 `ret` 是价格涨跌，不能当费用后账户收益；同日收盘信号/成交也要处理执行可得性。

继续沿用本站 [ETF 样本外研究](../research/2026-11-15-friend-etf-strategies-oos.md) 与 [既定验证任务](../TODO-投资工具优化.md)：固定名单与规则、长历史、费用后、简单基准、影子运行。本站最新的 [标普估值预测力研究](../research/sp500-valuation-predict-results-v2-2026-11-15.md) 也不支持因为估值展示更完整就直接生成仓位建议。

## 建议实施顺序与验收

1. **先连通现有流程（#2、#5）**：从现有核心宽基与行业 ETF 起步建立带证据的映射，指数 → ETF → 复盘/网格一路保留上下文。验收：同名不同指数不误配、主题关系不冒充直接跟踪、无产品有明确空态、不会因看行情自动创建/覆盖交易记录，多分组兼容旧导入数据。
2. **再补观察体验（#3、#4）**：行情 K 线/成交量/均线/可选 MACD，已有技术状态用于复盘筛选。验收：复权口径一致、完成周/月可区分、窄屏可操作、图表观察不改变网格账户计算、缺数不画成 0。
3. **扩展指数比较与质量解释（#1、#6）**：接在现有 Monitor 估值模块，先扩我们能稳定维护的指数。验收：展示各字段实际日期/频率/来源，长期分位有跨度门槛，历史退化拒绝静默发布，历史数据按需加载。
4. **研究候选（#7—#9）**：资金流先修数据和重跑；主升浪先确认来源与透明度；择时沿已有研究管线验证。通过后再定义上线范围。

本次未发现朋友仓库的根目录通用 LICENSE，局部第三方资产有自己的许可证；因此以上优先借鉴产品设计、数据契约与验证方法，直接复制代码前需明确授权与第三方资产范围。未访问朋友的 Worker、数据库或同步服务。

## 本次验证记录

- GitHub connector 在线确认仓库及 main；源码只读克隆到 `/tmp/businessweb-friend-review-20261116`，核对提交、数据产物及相关实现。
- 在朋友临时 checkout 执行资金流、指数发布/ETF 映射、稀疏展示和光标相关的 6 组测试文件：**63 项，60 通过、3 跳过、0 失败**。这不是整库测试或浏览器验收。
- 额外用临时目录与注入数据复现资金流同日重跑金额被清零，未改朋友源码、未请求真实行情服务。
- 本地功能由源码独立盘点；代码关系图工具返回空图，本次未使用图谱推断调用关系。TODO 有过期条目（融资分母、港股五年 PE 等），以 `MarketCycleView.tsx` 当前实现为依据，未把这些重复列为缺口。
