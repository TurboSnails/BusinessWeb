# 标普500公用事业、能源、通信服务复核 · 2026-10-05

## 01 结论卡

检查网站三个分类当前75条记录：公用事业31、能源21、通信服务23。全量检查历史情景算术；对重点财报、盈利质量和交易事件抽查一手公告。本轮确认18条记录需要修改（GOOG/GOOGL为同一发行人两类股）。不代表75条全部财务指标、当前指数成员资格或未来估值得到认证。

使用项目 stock-research-expert（盈利分析、模型更新）、tencent-stock-research-team（财报研究员、估值分析师）和 trading-analysis-team（基本面分析师）。三位独立代理并行审核，主持人复核原始字段、关键来源、合并数据和显示回填规则。

修改已持久写入 src/data/sectorFactReview.ts，并接入 companies.ts 的最终公司加载；不依赖会被生成脚本重写的 us.json 字段。12条记录撤回旧模型认证，其中PSKY/WBD原本就无EPS情景；其余10条旧三情景金额和假设以“上轮存档”保留，不再显示为有效情景。6条补充确认事实，不改原情景金额。AES/OMC的既有撤回继续生效。

价格锚点逐条保持，未刷新报价、未生成新目标价、未修改未来EPS/PE金额。并购签署、审批、HSR等待期届满与最终交割严格区分，未核实交割的保留待核状态。未部署线上，未修改外部Notion。

## 02 确认修改

| 分类 / 公司 | 确认事实与修正 | 模型处理 | 来源 |
| --- | --- | --- | --- |
| 公用事业 / AWK | 2025-10-27 签署 AWK/WTRG 全股票合并协议：每股 WTRG 在交割时换取 0.305 股 AWK。2026-08-17 公告确认 HSR 等待期已于 8/14 届满，仅满足其中一项交割条件；不能据此认定已交割。 | 撤回认证；旧值存档 | [一手资料1](https://ir.amwater.com/news-and-events/financial-releases/financial-release-details/2025/American-Water-and-Essential-Utilities-to-Merge-as-a-Leading-Regulated-U-S--Water-and-Wastewater-Utility/default.aspx)、[一手资料2](https://ir.amwater.com/news-and-events/financial-releases/financial-release-details/2026/American-Water-and-Essential-Utilities-Announce-Expiration-of-Hart-Scott-Rodino-Waiting-Period-for-Proposed-Merger/default.aspx) |
| 公用事业 / CEG | 2026-01-07 已完成 Calpine 收购，业务包含天然气及地热。2026Q2 GAAP EPS $1.42、调整后经营 EPS $2.55；全年调整后经营 EPS 指引上调至 $11.50–12.50。Q2 营收 $7.504bn 与旧值一致，不能把该调整后指引直接替换为 GAAP TTM。 | 补事实；原情景金额保留 | [一手资料1](https://www.constellationenergy.com/news/2026/01/constellation-completes-calpine-transaction-powering-americas-clean-energy-future.html)、[一手资料2](https://investors.constellationenergy.com/node/10176/pdf) |
| 通信服务 / CHTR | 历史价格 $110.67，旧 Bear/Base/Bull 为 $154/$266/$327：悲观价仍高于价格，未构造下行损失，inf:1 不成立；$110.67 不在旧 $182–201 区间。2026Q2 归属股东净利 $1.292bn/收入约 $13.53bn，对应约 9.6%；集团净利 $1.524bn 对应 11.3%，旧页混用口径。 | 撤回认证；旧值存档 | [一手资料1](https://ir.charter.com/news-releases/news-release-details/charter-announces-second-quarter-2026-results) |
| 通信服务 / CMCSA | 2026Q2 Peacock 首次季度盈利，口径为调整后 EBITDA $189m，不能写成 GAAP 净利润；宽带客户流失和盈利持续性仍需跟踪。公司同时宣布拟分拆 NBCUniversal 与 Sky；上年 Q2 含出售 Hulu 权益收益，GAAP 同比受基数影响。 | 补事实；原情景金额保留 | [一手资料1](https://www.sec.gov/Archives/edgar/data/1166691/000162828026049274/ex991-6302026.htm) |
| 能源 / CVX | 2026Q2 GAAP 净利 $12.072bn、EPS $6.11；调整后约 $12.0bn、EPS $6.06。高盈利获公告支持；程序剔除整个季度得到 EPS 6.42/PE 31.9× 不等于公司调整后盈利，也未证明是正常化 TTM。 | 撤回认证；旧值存档 | [一手资料1](https://www.chevron.com/newsroom/2026/q3/chevron-reports-second-quarter-2026-results)、[一手资料2](https://www.sec.gov/Archives/edgar/data/93410/000009341026000167/cvx-20260630.htm) |
| 公用事业 / D | 2026-05-18 NEE/D 签署合并协议：每股 D 在交割时获得 0.8138 股 NEE，另按比例分配合计 $360m 现金。NEE 2026Q2 仍称拟议合并；该换股对价不等于固定现金收购价。 | 撤回认证；旧值存档 | [一手资料1](https://www.sec.gov/Archives/edgar/data/753308/000110465926063001/tm2614888d1_8k.htm)、[一手资料2](https://www.sec.gov/Archives/edgar/data/753308/000075330826000058/neeq22026exhibit99.htm) |
| 通信服务 / DIS | FY2026Q3 调整后 EPS $2.06，同比增长 28%；FY2025Q3 含 Hulu 非现金税收收益 $3.277bn（EPS 影响 $1.56），GAAP 同比不能直接解释为经营盈利同比崩塌。GAAP 与调整后 EPS 必须分列。 | 补事实；原情景金额保留 | [一手资料1](https://www.sec.gov/Archives/edgar/data/1744489/000174448926000056/fy2026_q3xerxex991.htm) |
| 公用事业 / ES | 2026Q2 GAAP 净利 $53.7m/EPS $0.14，non-GAAP recurring 净利 $329.1m/EPS $0.87。Aquarion 出售税后费用 $111.4m、海风或有负债税后费用 $164.0m，合计 $275.4m；不能把低 GAAP 利润全部解释为持续经营恶化。全年 recurring EPS 指引 $4.57–4.72，不等于 TTM。 | 补事实；原情景金额保留 | [一手资料1](https://investors.eversource.com/news-releases/news-release-details/eversource-energy-reports-second-quarter-2026-results) |
| 通信服务 / GOOG | 2026Q2 其他收益净额 $98.0bn，主要来自股权证券未实现收益；营业利润率 34%。GAAP 净利 $112.19bn 不是数据错误，但不能将含投资重估的 TTM EPS 19.91 标成可持续归一化 EPS。 | 撤回认证；旧值存档 | [一手资料1](https://www.sec.gov/Archives/edgar/data/1652044/000165204426000066/googexhibit991q22026.htm) |
| 通信服务 / GOOGL | 2026Q2 其他收益净额 $98.0bn，主要来自股权证券未实现收益；营业利润率 34%。GAAP 净利 $112.19bn 不是数据错误，但不能将含投资重估的 TTM EPS 19.91 标成可持续归一化 EPS。 | 撤回认证；旧值存档 | [一手资料1](https://www.sec.gov/Archives/edgar/data/1652044/000165204426000066/googexhibit991q22026.htm) |
| 通信服务 / META | 2026Q2 含 $2.4bn 法律诉讼费用；全年资本开支指引 $130–145bn。收入增长不等于利润同比增长；资本开支指引不等于当季支出或 FCF。 | 补事实；原情景金额保留 | [一手资料1](https://investor.atmeta.com/investor-news/press-release-details/2026/Meta-Reports-Second-Quarter-2026-Results/) |
| 公用事业 / NEE | 2026-05-18 NEE/D 签署合并协议：每股 D 在交割时获得 0.8138 股 NEE，另按比例分配合计 $360m 现金。NEE 2026Q2 仍称拟议合并；该换股对价不等于固定现金收购价。 | 撤回认证；旧值存档 | [一手资料1](https://www.sec.gov/Archives/edgar/data/753308/000110465926063001/tm2614888d1_8k.htm)、[一手资料2](https://www.sec.gov/Archives/edgar/data/753308/000075330826000058/neeq22026exhibit99.htm) |
| 通信服务 / NFLX | 2026Q1 官方股东信：收到 WBD 交易终止费 $2.8bn，计入利息及其他收益；推高季度 EPS 与经营现金流。旧 TTM EPS 不能未经桥接直接当作可持续归一化盈利，终止费现金流也不可逐年重复。 | 撤回认证；旧值存档 | [一手资料1](https://d18rn0p25nwr6d.cloudfront.net/CIK-0001065280/02e11080-ea38-41f8-ba90-f6f02f37ef12.pdf) |
| 公用事业 / NRG | 2026Q2 GAAP 净利 $506m、基本 EPS $2.32；调整后净利 $315m、基本 EPS $1.49（上年 $1.73）。LS Power 资产加入及非现金经济套保收益影响 GAAP；程序剔除整个季度的 EPS 1.96 不是公司调整后 TTM。 | 撤回认证；旧值存档 | [一手资料1](https://investors.nrg.com/news-releases/news-release-details/nrg-energy-reports-second-quarter-2026-results-and-reaffirms) |
| 能源 / OXY | OxyChem 已于 2026-01-02 售予伯克希尔；初公告现金价 $9.7bn，Q2 10-Q 披露调整后售价 $9.5bn，仍受后续交割调整影响。2026 上半年终止经营税后净利 $3.119bn，包含出售收益；旧 TTM 不能直接当归一化持续盈利，不以终止经营总额机械扣减普通股 EPS。 | 撤回认证；旧值存档 | [一手资料1](https://www.oxy.com/siteassets/documents/news-releases/pr-010226_occidental-completes-oxychem.pdf)、[一手资料2](https://www.oxy.com/siteassets/documents/investors/2025-annual-report.pdf)、[一手资料3](https://www.sec.gov/Archives/edgar/data/797468/000162828026053388/oxy-20260630.htm) |
| 通信服务 / PSKY | 2026-02-27 PSKY/WBD 签署协议：每股 WBD 现金对价 $31；若 9/30 尚未交割，每季度 $0.25/股 ticking fee 按日计算至交割。公告条款已核实，截至复核日最终交割状态 [MISSING]；现金对价不能视为保证兑现的市价。 | 撤回认证；旧值存档 | [一手资料1](https://ir.paramount.com/news-releases/news-release-details/paramount-acquire-warner-bros-discovery-form-next-generation) |
| 通信服务 / TMUS | 2026Q2 稀释 EPS $2.99，其中 UScellular 整合相关税后成本 $146m/每股 $0.14。旧页数据只到 Q2，却把下一季度财报写成 2027-02，日期错位；改为下一季度公告日期待确认。 | 补事实；原情景金额保留 | [一手资料1](https://www.t-mobile.com/news/business/t-mobile-q2-2026-earnings) |
| 通信服务 / WBD | 2026-02-27 PSKY/WBD 签署协议：每股 WBD 现金对价 $31；若 9/30 尚未交割，每季度 $0.25/股 ticking fee 按日计算至交割。公告条款已核实，截至复核日最终交割状态 [MISSING]；现金对价不能视为保证兑现的市价。 | 撤回认证；旧值存档 | [一手资料1](https://ir.paramount.com/news-releases/news-release-details/paramount-acquire-warner-bros-discovery-form-next-generation) |

## 03 独立专家结论

**估值分析师：** 75条里68条原有三情景；AES/OMC已撤回，ECHO、LYV、PSKY、TTWO、WBD原无EPS情景。未发现可确认的重大EPS×PE乘法错误。CHTR的旧悲观价值154高于历史价格110.67，不能认证inf:1；价格也不在182–201区间。旧数学门槛不能代替真实下行模型。PCG等差异可由整数情景舍入解释，没有按小额舍入重写价格。

**财报研究员：** XOM/CVX/COP的2026Q2高盈利获当期公告支持，不能因记忆中的往年数值低就改小。CVX和NRG程序平滑与公司调整后盈利不同；ES低GAAP季度利润与出售/海风费用有关。OXY已出售OxyChem且存在终止经营损益，不能将未经拆分的TTM当持续盈利。

**基本面分析师：** Alphabet巨额未实现投资收益不应直接外推；WBD/PSKY收购事件必须补录；META法律费用和资本支出、CMCSA的Peacock EBITDA盈利、TMUS整合成本与日历错位要标清。NFLX终止费经主持人补查官方股东信，确认属于非持续收益与现金流。Disney调整EPS与上年Hulu税收益分列，保留GAAP数据。

## 04 复核边界与待办

- 本轮修正的是已证实的事实遗漏、口径误导及明确内部矛盾。正常化EPS尚缺桥接的标待重建，不把新财报直接变成新的2027目标价。
- AWK/NEE/D/PSKY/WBD补入已签署交易，但最终交割状态仍需核对。HSR等待期届满只是其中一项条件；换股对价随买方股价变化。
- OXY初公告9.7bn现金价与Q2调整后售价9.5bn分列；上半年终止经营净利3.119bn包含出售收益，不等于纯出售收益，更不能直接从普通股TTM EPS扣除。
- CEG季度收入原7.50bn与官方7.504bn一致，只补Calpine并表及GAAP/调整盈利区别；ES的GAAP原54m为正确舍入，补费用而不删真实利润。
- CMCSA的Peacock季度盈利是调整后EBITDA口径，不能等同GAAP净利润；拟分拆仅记录已宣布事项，不声称完成。
- 股价、TTM EPS和完整现金流未逐家公司逐季重建；未新增指数成员。WTRG作为AWK交易对手研究，本网站该分类名单并无WTRG，不新增记录。
- 其余57条不作新的事实更改，其中AES/OMC保留已有处理；“保留”不是全部指标已获认证。金融、IT、消费分类已有修改以及其他并行工作的us.json变更均保留。

## 05 行业后续验证

| 分类 | 待验证 | 证伪条件 |
| --- | --- | --- |
| 公用事业 | 监管回报、资本开支融资、并购后股数、负债与利息桥接 | 审批失败、项目超支、融资摊薄超过盈利增量 |
| 能源 | 油气价格与产量、炼油价差、终止经营、套保与现金流 | 周期回落后利润不可持续、持续FCF不足覆盖投入和债务 |
| 通信服务 | 广告/订阅、内容与AI资本开支、投资损益、交易融资 | 核心利润不增长、自由现金流恶化、整合或监管条件失败 |

## 06 审计与验证

逐条修改前后记录：[JSON](../../public/research/utilities-energy-communication-audit-2026-10-05.json)，摘要[CSV](../../public/research/utilities-energy-communication-audit-2026-10-05.csv)。HTML报告位于 public/research/utilities-energy-communication-review-2026-10-05.html。

最终合并数据核对：75条范围一致，18条命中复核；全部历史价格锚点保持；57条未选记录最终字段与修改前快照一致；被撤回记录的Bear/Base/Bull指标以“上轮”开头，符合详情页排除存档回填的规则。旧情景未丢弃，可在审计和存档指标查询。构建验证：npx vite build 成功（2026-10-05）；保留现有大包体提示。本轮未新增或运行测试。

本报告仅供研究参考，不构成个人投资建议。
