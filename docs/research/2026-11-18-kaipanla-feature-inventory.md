# 开盘啦 (Kaipanla) v6.3.20.2 — 功能清单与差距分析

日期：2026-11-17 · 方法：只做静态分析（AndroidManifest、res/layout、strings.xml、arrays.xml、assets/*DynamicQuota 列定义 JSON）。没有安装或运行 APK。

**来源说明**
- `classes.dex` 只有 13 KB，是 Tinker/加固外壳。真正的代码在 `assets/payload.bin`（13.9 MB，头部为 `KPLA`，已加密），所以 dex 字符串和 jadx 都拿不到有用内容。下面的清单完全来自资源文件。
- 资源文件的信息量很大，尤其是 `assets/*DynamicQuota`（共 63 个文件）。每个文件就是一张列表的完整列定义（列名、排序、颜色规则），等于直接给出了每个页面展示哪些数据。
- 共 306 个 activity，去掉 SDK 桩之后约 250 个；layout 文件 1322 个。去掉账户、社交、支付等不相关部分后，与行情数据相关的页面约 **150 个**，可归为 **19 个产品区域**。
- 底部导航（`activity_index_new`）：首页 / 行情（看盘 readtab）/ 自选股 / 龙虎榜 / 打板 / 推荐（订阅）/ 文章 / 交易。

---

## 1. 产品区域地图

### A. 市场情绪（`MarketMoodActivity`, `fragment_markets_mood`, `fragment_market_mood`, `layout_mood_*`, `layout_lianbanqiangdu`, `layout_kuiqianxiaoying`, `layout_shichangliangneng`, `layout_rongzi`, `dialog_market_capacity_more`, `dialog_statistics_more`, `IncreaseStatisticsActivity`, `MakeMoneyEffectActivity`）
- 顶部：沪深京全A、预测量能、市场情绪（活跃/不活跃）、连板强度、大幅回撤数、综合强度、盘面点评。
- 涨跌统计 11 档（`RiseFallStatistics`）＋实际涨跌停（过滤 ST）。另有带日期选择的 12 档分布 `IncreaseStatistics`：涨停 / 涨8~10% / … / 跌停。
- 涨停表现：一板至四板、高度板连板率；今日涨停破板率；昨日涨停、昨日连板、昨日破板的今日表现。
- 今昨对比 `layout_mood_plate`：涨停板、跌停板、封板率。
- 市场量能 `dialog_market_capacity_more`：可切换沪深京 / 沪深 / 上证 / 北证 / 创业板 / 科创板；1 万亿虚线；柱色红绿代表放量或缩量；含历史量能。
- 活跃股走势（5 日 / 当日；涨幅 >2% 算活跃，<-1% 算冰点）。
- 连板强度 / 短线情绪 `layout_lianbanqiangdu`：市场高标、连板天梯、平均涨幅、一进二 / 二进三 / 三进四 / 高度板，可叠加亏钱效应。
- **亏钱效应** `layout_kuiqianxiaoying`：分 历史 / 分时，可叠加连板强度；绿柱越高亏钱效应越强；含大幅回撤表。
- 风向标、权重表现（`WeightPerformanceListActivity`：涨幅、涨速、成交额）、融资余额（含占流通市值比，叠加上证指数）、北向资金（已停）。
- **赚钱效应** `MakeMoneyEffectActivity`、`layout_making_effect_list_head`、`item_making_effect_child`：逐日给出 **打板成功率、打板盈利率**；另有“昨日非一字涨停的 N 只股票今日开盘涨幅分布”（MakingDeclineView / MakingCircleView）。
- 分享卡片：涨跌统计、实际涨跌停、沪深预测量能。

### B. 打板 / 盯盘（`activity_stare_plate`, `fragment_pattern`, `fragment_history_pattern`, `PatternTabs`, `PatternHisTabs`, `PatternDynamicQuota`, `ZhangTingDynamicQuota`, `ZhangTingYesterdayDynamicQuota`, `PlateAnalysisDynamicQuota`, `TapeAnalysisActivity`, `JRZTPBQuotaActivity`, `BiddingZTQuotaActivity`, `ZhangTingExpressionActivity`, `MaximumRetreatActivity`）
- 打板页签：竞价 / **即将涨停** / 风向标 / 涨停 / 炸板 / 跌停 / 新股 / 自然涨停 / 曾跌停。历史模式没有“即将涨停”和“风向标”。
- 列（PatternDynamicQuota）：价格、涨幅、涨停时间、开板时间、状态、涨速、涨停原因、**涨停委买额**、竞价涨幅、板块、竞价净额、竞价成交额、竞价换手、封单、主力净额、成交额、实际换手、实际流通、最大封单、最后涨停时间、振幅、换手率、量比、总市值、流通市值、竞价涨幅连板、涨停数。
- 涨停表（ZhangTing）：涨停时间、涨停原因、封单、**最大封单**、主力净额 / 买入 / 卖出、实际流通、实际换手、几天几板、涨停数。
- **盘面分析** `TapeAnalysisActivity`（`TapeAnalysisItems`：涨停 / 跌停 / 自然涨停 / 曾跌停 / 破板率 / 炸板）：这几项数量的**日内曲线**，附明细数据。
- 今日涨停破板 `activity_jrztpb`：破板数量、破板率、LimitUpChart、逐股列表。
- 板块分析 `PlateAnalysisActivity`：按板块统计涨停 / 炸板 / 跌停 / 自然涨停 / 曾跌停。
- 大幅回撤 `MaximumRetreatActivity`（价格、最大回撤、涨幅；只统计昨日涨停 / 大涨和今日曾涨停 / 大涨的股票）。
- 个股溢价基因：近 200 交易日的涨停次数、溢价5%次数、次日红盘率、首板封板率、首板破板率、连板率（`StockPremiumReason`）。
- 过滤参数 `fragment_filter_condition`：实际流通市值 <100 / 300 / 500 / 1000 亿；可过滤次新、停牌、庄股、ST、科创板、北交所。

### C. 竞价 / 尾盘（`MorningBiddingActivity`, `fragment_morning_bidding`, `MorningBiddingDynamicQuota`, `MorningBiddingBuffDynamicQuota`, `CallAuctionActivity`/`CallAuctionTitleText`, `PlateBiddingActivity`, `PlateBiddingDynamicQuota`, `PlateBidDynamicQuota`, `BiddingChangeActivity`, `fragment_plate_bidding_change`, `PlateBiddingChangeDynamicQuota`, `item_plate_fun*`, `FinalQuotaActivity`, `FinalQuotaDynamicQuota`, `FinalQuotaChartDynamicQuota`, `SelectedStockBidDynamicQuota`）
- 早盘竞价头部：今日 / 昨日的**竞价金额**、**预测总成交**、涨跌家数；可叠加条件选股。
- 竞价列表：涨停委买额、20 分后涨停委买、竞价涨幅、实时涨幅、板块、竞价净额、竞价成交额、竞价换手、实际流通、状态；BUFF 版另有撮合成交和连板数。
- 集合竞价表：竞价涨跌、实时涨跌、大单净额、竞价大单买 / 卖、竞价成交、大单买占比、实际流通、风口概念。
- **板块竞价**：可按竞价金额筛选（>100 / 300 / 800 万），列为竞价量比、竞价金额、竞价涨幅、实时涨幅、所属板块、竞价净额、竞价换手、连板天数。
- **竞价异动** `item_plate_bidding_change_head`：今日新增竞价异动、板块名称、竞价爆量（倍数）、异动金额、主力净额、昨日强度。
- 首页功能卡：竞价涨停委买（09:15 开始计算）、竞价爆量板块、竞价异动个股。
- **尾盘抢筹**（14:57 开始，只统计深市）：抢筹金额、撮合成交、抢筹幅度、抢筹占比、涨跌幅、板块、主力净额 / 买 / 卖、成交额、实际流通、连板天数；图表含时间、抢筹价格、抢筹金额、抢筹幅度、成交状态。
- 自选股竞价：竞价涨幅、量比、价格、竞额。

### D. 市场雷达 / 大盘直播 / 异动（`MarketRadarActivity`, `item_pattern_header1`「市场雷达」, `MarketLiveActivity`, `item_market_live_*`, `fragment_ranking_rose_bottom`, `GlobalWwydActivity`）
- 市场雷达：盘中异动事件流（打开涨停、封涨停、快速拉升等），首页 `TextViewFlipper` 会滚动显示，例如“10:03:02 荣华股份 打开涨停”。
- 大盘直播（AI）：时间轴形式，含市场情绪、上涨 / 涨停 / 下跌 / 跌停家数、板块异动（点击可进板块）、个股成对异动、AI 解读、早盘集合竞价异动、分时图；底部注明“AI 生成”。
- 涨速榜：5 分钟 / 30 分钟 / 当天。
- 外围异动 wwyd：名称、异动时间、价格、涨幅。

### E. 异常波动 / 监管 / 避雷（`AbnormalAlertActivity`, `DeviationValueActivity`, `DeviationManyChangeActivity`, `fragment_severe_abnormal`, `fragment_hot_stock_deviation`, `item_deviation_list`, `item_deviation_many_change`, `MonitorAndInquiryActivity`, `fragment_key_monitor`, `item_inquiry_list_content`, `fragment_lightning_protection*`, `dialog_lp_risk_warning_setting`, `guide_severe_abnormal_ydtx`）
- **偏离值**：N 日涨幅偏离值、今日、已停牌、规则、复牌提醒、新增重点监控、新增问询个股；可筛选“只看严重异动”。
- **近期严重异动**：分 明日 / 今日 两段，可筛选 全部 / 触发严重异动 / 被停牌。提示文案为“预估数据：假设今日按最新价收盘，该股明天再涨多少会触发异动”。
- **多次异动** `DeviationManyChangeActivity`：异动停牌后复牌 10 日内的个股，列为 3 日偏离值、预计停牌价格、当前价格、第 7 日；分沪深主板和创业 / 科创板（`ManyChangeStockTab`）。收盘后显示次日预测。
- **重点监控 / 问询**：监管期证券（监控开始日期 / 结束日期）、历史监管证券；问询函列表含股票、函件类型、日期、文件、详情。
- **避雷**：最新预警、ST 预警、退市预警，可下载表格；在个股列表显示“潜在风险”标签。自定义风险项包括：ST 预警、净资产为负、营收利润不达标、营收或净利润减值较大、信息披露违规、年报审计风险、退市预警、价格风险退市、市值风险退市、*ST 次年净资产为负、*ST 次年营收利润不达标。时间线 `zxyj` 显示新加入预警和新移除预警。

### F. 龙虎榜（`fragment_charts`, `fragment_new_charts`, `fragment_charts_stock/agency/sale`, `ChartsStock/Agency/CapitalDynamicQuota`, `popup_charts_agency_statistic`, `RealTimeChartsActivity`, `LhbWillItGoUpActivity` + Detail + `LhbWillDynamicQuota`, `item_lhb_will_name`, `item_lhb_concept_*`, `item_discoveryrecom_longhubzb`, `FloatingCapitalPositionActivity`, `ChartsAuthenticationActivity`）
- 个股榜：风口概念、涨幅、净买入、**关联数**（关联游资数）、成交额、市值、振幅、换手；带“六连榜”标签。
- **机构榜**：机构净买、涨幅、**出榜次数**、板块、**机构数**、最后出榜日期；可统计三日 / 五日 / 十日 / 二十日流入。
- **游资榜**（营业部）：涨幅、风口概念、净买入、买入金额、卖出金额；有“一线游资关注概念”。游资标签（温州帮、游资、北向、精选、利空）挂在股票名旁。
- **实时龙虎榜**：盘中按主力净额排序，含人气值、排名变化、几天几板等（列见 LhbWill quota）。
- **会不会上龙虎榜**：预测上榜数，可按榜单或按股票查看，可过滤落榜股票；详情说明“盘中曾符合下方龙虎榜上榜条件”（列出交易所规则，例如“深圳主板：日换手率达到 20% 的前 5 只证券”）。
- 龙虎榜中榜（文章）、游资仓位（拐点曲线，FloatingCapitalLineChart）、席位认证（UGC）。

### G. 板块 / 题材（`fragment_plate`, `PlateQuotationActivity`, `fragment_plate_quotation1`, `PlateQuotationTabs` 精选 / 行业 / 地区, `MainIndex*`/`PlateList*`/`PlateRange*` 标题数组, `MainIndexPlateDynamicQuota`, `IndexQuotationActivity`, `fragment_index_quota_tline`, `IndexQuotaRangeActivity`, `IndexRangeStatisticsActivity`, `PlateSuperposeActivity`, `RelevantPlateActivity`, `PlateWeightStockActivity`, `PlateEtfDetailActivity`, `OutbreakReasonActivity`, `HotPlateListActivity`, `PlateBriefDynamicQuota`, `item_recycler_index_wp_detail_content`, `StockPoolPlateActivity`）
- 板块列表：强度、涨幅、主力净额、涨速、主力买 / 卖、区间涨幅、成交额、量比、流通市值。
- **多日区间**：区间强度、区间涨幅、区间净额、区间成交、主力买入 / 卖出、**净流入天数**；可用 ChipTimeView 选时段，可切换单日 / 多日统计。
- 板块详情：涨停数、涨停封单、大单封单、所属主板块、上涨 / 下跌 / 平盘家数、“最正宗”标的筛选、板块简介、机构纪要；**股票池变动**（新增股票池 / 剔除股票池）。
- **板块叠加**：最多叠加 3 个板块的分时进行对比。
- 关联板块（排名、股票、涨幅、状态）、板块权重个股（首板标记）、**板块关联 ETF**（今日 ETF 平均涨幅、成交）、关联港股板块（强度）。
- **爆发原因时间线** `OutbreakReasonActivity`：按年份滚动，每条含日期、时间、“爆”标记、当日强度、领涨股、原因文字。
- 板块简报（PlateBrief）：现价、涨跌幅、**领涨次数**、流通市值。
- 高级工具（卫星导航等）、历史统计。

### H. 百日新高（`NewHighActivity`, `PlateNewHighActivity`, `PlateNewHighSettingActivity`, `NewHighDynamicQuota`, `dialog_newhigh_trend`, `layout_newhigh_head`, `kline_new_high_format`）
- 可按板块或按个股查看。新高数量的口径是“近 5 日内创百日新高、并且没有大幅回落”；另有当日新增数和趋势图。
- 板块解析：新高数量变化趋势、关联板块。
- 参数：实际流通市值；可过滤次新、庄股、游资股、基金股。
- 个股列：价格、涨幅、板块、成交额、主力净额 / 买 / 卖、实际换手、实际流通、总市值。
- 指数 K 线有副图“百日新高”（全市场新高数量、当日新增）。

### I. 复盘（`ReplayLaActivity`, `fragment_market_combing`, `fragment_picture_replay`, `PMLDLabelSearchActivity`, `LimitReplayActivity`, `NewLimitReplayHistoryActivity`, `SearchLimitReplayActivity`, `LimitReplayDynamicQuota`, `item_recycler_list_limitreplay_*`, `item_dafuhuiche_layout`）
- 复盘页顶部：涨停数和跌停数。
- **盘面亮点**：按标签分类的当日个股，标签分正面和负面。提示文案为“标签已分类，点击可追踪近期同类个股的成功率”，支持标签搜索和日期区间。
- 亏钱效应：大面股数量、大幅回撤、连续回撤。
- **图解复盘**：板块核心 / 市场梯队 / 涨停天梯 / 龙虎榜动向。
- 涨停复盘：精选板块→涨停股，列为涨停时间、状态、涨停原因、实际流通、板块、开板、封单、主力净额、成交额、实际换手。另有盘口对比（涨跌对比、昨日涨停表现、涨跌停对比、破板率）、历史数据，以及按板块或涨停关键字搜索。

### J. 资金 / 北向 / 南向 / 机构（`NorthwardCapital*`, `HSGTNorthwardCapital*`, `NorthboundFundsHisActivity`, `SouthwardCapital*`, `InstitutionalManger/PositionsDetailActivity`, `Institutional*Quota`, `INCStockDetailsDynamicQuota`, `MainIndexDynamicQuota`, `MainStockDynamicQuota`, `StockRangeStatisticDynamicQuota`, `StockRangeRankActivity`, `RangeStatisticsActivity`, `MainLockWareHouseActivity`）
- 北向系统：个股、板块、机构（席位）榜单与订阅；字段有北向净额、增仓占比、北向总持仓、持仓占比、净买入天数；机构字段有持仓市值、增仓市值、盈亏金额 / 比例、建仓日期、上榜次数、成功率；另有 5 / 10 / 30 日净买入历史和预设筛选“赚钱最多 / 快进快出 / 龙虎榜常客”。
- 南向：净额、持仓、持仓占比、增仓占比、净买入天数。数据为 T+2。
- 基金持仓（季度）：增仓金额、持仓金额、占净值比、新进、基金经理、“多少只基金合计”。
- **区间排行榜 / 区间统计**：区间涨幅、板块、区间净额、主力买入 / 卖出、区间成交、实际流通、实际换手、净流入天数。可转债版另有剩余规模、溢价率、正股。
- 主力锁仓：自有算法，收录“放量介入后锁仓”的标的，可按题材分组。

### K. 人气 / 热度（`StockPopularityListActivity`, `fragment_stock_popularity_list`, `fragment_intraday_popularity_list`, `IntradayPopularityDynamicQuota`, `dialog_explain_popularity`, `item_popularity_list`, `HotSearchRankActivity`）
- 开盘啦人气榜：盘中榜（9:00–15:00）和复盘榜（非交易时段）；字段为热度排名、排名飙升、热度飙升、排名变化；标签有“连续上榜”（连续 7 日前 10）和“人气激增”。
- 互动易关键词热度榜。

### L. ETF（`ETFQuotationActivity`, `fragment_etf_quotation`, `etf_*`, 10 个 ETF*Quota, `item_quotation_etf_*`, `item_quotation_stock_etf_through`, `BKETF*`）
- ETF 申赎：前一日或区间的申赎金额、申赎份额、申赎比例、规模、费率、折溢价率、一周 / 一月 / 三月 / 半年 / 今年以来收益。
- **方向**（主题分组）：平均涨幅、申赎金额、申赎比例；方向详情有同方向 ETF 对比、关联指数、申赎趋势。
- **趋势**：持续天数、区间涨幅、区间申赎金额。
- 涨幅榜、我的关注、板块 ETF（跟踪误差）。
- ETF 详情：成立日、类型、份额、规模、净值、IOPV、折溢价、今日净申购、持仓明细（资产占比、本期增持）。
- **个股的 ETF 穿透**：持有该股的 ETF 分布、ETF 持仓变动趋势（剔除股价波动）、占实际流通比例、跟踪指数和成分权重。

### M. 业绩披露（`PerformanceDisclosureActivity`, `fragment_performance_disclosure_*`, `PerformanceDisclosure*Quota`, `dialog_performance_disclosure`, `popup_kline_earnings_forecast`, `dialog_stock_yj_detail`）
- 我的：已披露数量，按正式公告 / 快报 / 预告分段显示进度。
- **日历**：预约披露日期、剩余天数、实际披露日期、二次变更；可按板块显示披露日历。
- **最新披露**和**超预期**：净利润及同比、公告日期、公告次日涨幅、公告后 5 日涨幅、公告至今涨幅、机构预测净利润和预测同比、营收及同比、扣非及同比、热度。
- 热门、选择板块；筛选维度为市场（沪深主板 / 创业 / 科创）和日期（今日 / 近 5 日 / 近 10 日）。
- K 线弹窗：业绩预测（净利润、同比、机构预测全年、预测机构家数）；“业绩大超预期”标签。

### N. 个股详情（`StockQuotationActivity`/Land, `StockDetailsActivity`, `fragment_quotation_*`, `header_fragment_quotation_*`, `StockDetailPanKou`, `KLineMenuItems`, `dialog_chart_setting`, `ReadTabMenu`, `fragment_stock_info_stare_tape_new`, `StockDaDanLandActivity`, `WeiTuoDetailsActivity`, `dialog_turnover_range_*`, `popup_stock_kline_section_statistic_bottom`, `ShareholderChangeActivity`, `item_quotation_f10*`, `F10CPBDDividendPlanDynamicQuota`, `fragment_f10_cwfx_financials_report`, `dialog_stock_quota_report_agency`, `item_quotation_hsgt`, `item_quotation_institutional_position`）
- 盘口：涨跌停价、均价、振幅、量比、内外盘、委比、盘后量 / 额、实际流通值、PE（动 / TTM / 静）、PB、质押比、是否盈利、同股同权、VIE、注册制、溢价基因。
- 分时：大单净额（>30 万）、主力净 / 买 / 卖、对倒金额、压单 / 托单、总买总卖委差、委托趋势；大单明细（按成交量或金额筛选）；大额委托（≥30 万，含撤单）；成交区间 / 资金档位；集合竞价；盘后固定价格；历史分时回放（可 60 倍速）。
- K 线：日 / 周 / 月 / 年 / 60 / 30 / 15 / 5 分；副图有竞价成交量（占昨日比）、北向持股、融资净买、主力活跃度、主力净额、百日新高、板块强度；涨停日高亮并显示涨停原因；跳空缺口；**筹码分布**（收盘获利、平均成本、90% / 70% 筹码区间、集中度）；“严重异动预警线”；**区间统计**（拖动选区：区间涨幅、最高价 / 最低价、换手率、主力净额、融资净买、平均成本、ETF 持仓变化）。
- K 线菜单：区间统计 / 龙虎榜 / 大宗交易 / 权息变动 / **机构调研**。
- 主力监控（买卖行为，金额阈值可调）。
- F10：概念题材（最相关）、题材要点、公司资料、主营（按产品 / 行业 / 地区）、业绩预告、利润分析、主要指标、财务报表（单季 / 报告期）、估值分析（PE TTM 与行业均值的 1 / 3 / 5 年对比）、股东人数（较上期、连续三期、筹码集中）、十大流通股东（新进 / 退出 / 增减，含社保、牛散标签）、机构持仓（季度）、机构评级（近 6 个月）、分红方案、北向持股变化（当日 / 5 日 / 10 日）。
- 公告分类：全部、业绩、增减持、分红送转、风险提示、股权转让、并购重组、中标合作、调研、其他。另有互动平台问答（AI 提炼、过滤无效）、新闻 / 快讯、龙虎榜标签、风险提示、关联商品。

### O. 股东 / 大宗（`ShareholderChangeActivity`, `layout_shareholder_*`, `TrackRetailActivity`, `fragment_track_retail`, `fragment_track_stock`, `BulkTradeActivity`, `item_bulk_main_force_*`, `BulkMainForceMenu`, `BulkStockMenu`）
- **股东人数变化**：可选时间区间，可只看连降，变化维度为两期至六期；按股票或按操作查看。
- **牛散追踪器**：输入股东名查持股，也可输入股票查股东（可只看个人股东、选持股时间），附本季推荐股东和今日热搜股东。
- **大宗交易**：今日上榜数，可按成交额 / 涨跌幅 / 溢价率排序；“主力”分组（例如游资名→股票、成交天数、总成交额），可选当日 / 5 / 10 / 20 日；支持大宗搜索。

### P. 题材库 / 挖掘 / 互动易（`ThemeExcavate*`, `ThemeSubscribe*`, `ThemeAdd*`, `HotTalk*`, `ExcavatorTabName` 板块分类 / 题材挖掘 / 互动精灵 / 股权拍卖, `InteractEasy*`, `fragment_interact_*`, `ModuleStockActivity`, `ConceptListActivity`/`ConceptFeedback`）
- 题材库：题材→分类→个股，附个股说明；显示题材当日涨停数；小表格和个股行情两种视图（股票数量、上涨、下跌、平均涨幅）。列为价格、涨幅、涨速、主力、板块、成交额、市值、换手、量比。
- 股票挖掘机：股权司法拍卖（拍卖状态、报名人数、出价次数、成交性质、卖方）、实控人变更、互动精灵（新检测到的问答）。
- **互动易 AI**：分 AI 提炼 / 问答原文两种模式；按全部、自选、订阅查看；分类为涉及业务 / 澄清否认 / 常规披露 / 风险披露 / 过滤无效；有关键词热度榜和公司合集（N 家公司涉及“X”业务，含业务相关数和业务澄清数）。数据源为上证 e 互动和深交所互动易。
- 热议话题和投票（明天看涨 / 看跌）。

### Q. 全球 / 港股 / 可转债 / 商品（`Global*Activity`, `item_global_*`, `fragment_hk*`, `popup_index_trend_hk`, `layout_ah_stock_tips`, `HKHY*/HKTC*` 数组, `DefaultKZZ*Quota`, `StockKZZHandicapNewName`, `GoodsXianHuo*`, `GoodsStatisticActivity`, `GoodsRangeStatisticsTabs`）
- 全球：常用外围指数、知名美股 / 中概股 / 知名港股、美股个股→关联 A 股板块、外围异动。
- 港股：题材 / 行业 / 个股三个页签（强度、成交额、市值、区间）；恒生、国企、恒生科技、**AH 股溢价**；港股通标记；过滤低成交额股。
- 可转债：价格、涨幅、涨速、板块、成交额、剩余规模、溢价率、到期时间、正股及其涨幅；盘口有转股价值、强赎 / 回售触发价等。
- 商品现货：分类平均涨幅、领涨商品；5 / 10 / 20 / 60 日涨幅；关联个股；可订阅推送。

### R. 资讯 / 内容（`FlashNews*`, `item_flash_detail_ai_*`, `ArticleCentre*`, `discovery.*`, `Summary*`（机构纪要）, `NoticeCenterActivity`）
- 快讯（头条、AI 精炼）。快讯的 AI 解读卡片包括：立案调查解析（次日跌停概率、平均次日 / 五日涨幅、同类案件处罚分布）、CPI（资产类别公布后首日收涨概率）、沪深量能、相关板块历史走势、关联美股。
- 文章、栏目、订阅、机构纪要（UGC 与审核）、公告中心。

### S. 自选 / 工具 / 账户 / 交易
- 看盘（readtab）、自选、分组、笔记、预警、AI 识图导入、页面管理、搜索、交易开户、积分 / VIP、设置、反馈、登录。

---

## 2. 差距表

图例：**有**＝我们已经有；**部分**＝有一部分；**无**＝没有。可行性按公开数据源判断（东财 push2 / push2his / push2ex / datacenter、新浪、腾讯 qt、交易所披露）。价值和工作量是我的估计。

| # | 功能 | 在 App 中的位置 | 我们的状态 | 公开数据可行性（数据源思路） | 价值 | 工作量 |
|---|---|---|---|---|---|---|
| 1 | 异常波动偏离值：3 日 / 10 日 / 30 日累计偏离；明天再涨多少触发异动（预估价）；严重异动；“只看严重异动” | E `item_deviation_list`, `fragment_severe_abnormal`, `guide_severe_abnormal_ydtx` | 无 | **能**：push2his 个股日 K＋对应指数日 K（主板对上证 / 深成指，创业对创业板指，科创对科创50），按沪深交易规则计算阈值 | 高 | M |
| 2 | 异动停牌后复牌 10 日内的个股：3 日偏离值、预计停牌价 | E `item_deviation_many_change` | 无 | **能**：同 #1，加上停复牌数据（datacenter `RPT_CUSTOM_SUSPEND_DATA_INTERFACE`） | 中高 | S（在 #1 基础上） |
| 3 | 会不会上龙虎榜：按交易所上榜规则（偏离 ±7%、换手 20%、振幅 15%、连续 3 日偏离 20%）预测，并标记“已符合条件” | F `LhbWillItGoUp*`, `fragment_lhb_will_go_up_dialog` | 无 | **能**：用全市场收盘快照（clist）＋指数，按规则逐条计算；盘后可与实际上榜对照算命中率；还能前瞻“明日 3 日偏离会达到 20% 的股票” | 中高 | S–M |
| 4 | 市场雷达 / 盘中异动事件：封涨停、打开涨停、火箭发射、大笔买入等 | D `MarketRadarActivity`, `item_pattern_header1`, 首页 flipper | 无 | **能**：push2ex `getAllStockChanges?type=...`（东财盘口异动）收盘后仍可取当日全部事件；输出每类事件计数和时间轴 | 高 | S–M |
| 5 | 板块异动 / 爆发时间线：时间、板块、强度、领涨股 | G `OutbreakReasonActivity`, `item_recycler_outbreakreason_content`, D 大盘直播板块条目 | 无 | **部分**：push2ex `getAllBKChanges`（板块异动事件和领涨股）**能**；“爆发原因”文字需要新闻，**不能**，可改用涨停股的概念归类作为原因 | 中高 | S |
| 6 | 赚钱效应：逐日打板成功率 / 盈利率；昨日非一字涨停今日开盘分布 | A `MakeMoneyEffectActivity`, `item_making_effect_child` | 部分（已有昨日涨停今表现均值） | **能**：昨日涨停池（push2ex `getYesterdayZTPool`）＋今日开盘 / 收盘；按日落盘；分布直方图 | 高 | S |
| 7 | 盘面亮点标签：地天板、天地板、反包、断板、一字、T 字、换手板、首板、大面等，可按标签追踪近期同类股成功率 | I `fragment_market_combing`, `PMLDLabelSearchActivity`, `guide_tip_replay_pmld*` | 无 | **能**：全市场当日 OHLC＋涨跌停池＋昨日状态，按规则打标签；成功率用 N 日后涨幅回看 | 高 | M |
| 8 | 亏钱效应：大面股数量（最大回撤 / 跌幅 >X%）和历史柱 | A `layout_kuiqianxiaoying`, I 大面股 | 部分（已有大幅回撤表） | **能**：在已有回撤数据上加历史序列和大面股计数 | 中 | S |
| 9 | 百日新高：数量（近 5 日创百日新高且未大幅回落）、当日新增、趋势；按板块 / 个股；过滤次新 | H `NewHighActivity`, `PlateNewHighActivity`, `dialog_newhigh_trend` | 无 | **能**：先用 push2his 回补全市场 120 日日 K，之后每日 clist 快照滚动维护 high/close；板块归属用东财行业 / 概念成分 | 高 | M |
| 10 | 盘面分析：涨停 / 炸板 / 跌停家数的日内曲线 | B `TapeAnalysisActivity`, `TapeAnalysisItems` | 无 | **能**：涨停池字段 `fbt`（首次封板时间）、`lbt`（最后封板时间）、`zbc`（炸板次数），炸板池和跌停池同理，可还原逐分钟的近似累计曲线 | 中 | S |
| 11 | 板块的涨停 / 炸板 / 跌停 / 自然涨停 / 曾跌停分布 | B `PlateAnalysisActivity`, `PlateAnalysisDynamicQuota` | 部分（已有题材涨停分布） | **能**：用已有各股池按申万二级或概念聚合，加炸板、跌停、曾跌停列 | 中 | S |
| 12 | 人气榜：排名、排名变化、飙升、连续上榜、人气激增 | K `StockPopularityListActivity`, `fragment_intraday_popularity_list`, `dialog_explain_popularity` | 无 | **能**：东财人气榜 `emappdata.eastmoney.com/stockrank/getAllCurrentList`、`getAllHisRcList`，每日收盘后落盘自算排名变化和连续上榜（口径是东财股吧人气，不是开盘啦人气） | 高 | S |
| 13 | 区间排行榜：个股 / 板块 5 / 10 / 20 / 60 日区间涨幅、区间主力净额、**净流入天数** | J `StockRangeRankActivity`, `MainStock/MainIndexPlate/StockRangeStatisticQuota` | 部分（资金页只有当日） | **能**：clist 字段 f109 / f160 等（5 / 10 / 20 日涨幅）、f164 / f174（5 / 10 日主力净额）；板块用 push2his `fflow/daykline`；净流入天数从自存历史计算 | 中高 | S–M |
| 14 | 地区板块 | G `PlateQuotationTabs` 地区 | 无 | **能**：clist `fs=m:90+t:1` | 低 | S |
| 15 | 板块多日统计：区间强度、净流入天数 | G `PlateListSelectManyDaysRangeTitleText` | 部分（已有近 N 日走势） | **能**：同 #13 | 中 | S |
| 16 | 板块叠加：最多 3 个板块分时对比 | G `PlateSuperposeActivity` | 无 | **能**：push2his `trends2`，板块代码 BKxxxx；可做成前端选择、盘后预存 Top 板块分时 | 低中 | M |
| 17 | 板块关联 ETF：今日 ETF 平均涨幅、成交 | G `PlateEtfDetailActivity` | 无 | **部分**：ETF 名称和跟踪指数匹配东财行业 / 概念（需要人工映射表），行情用 clist `fs=b:MK0021...` | 中 | M |
| 18 | 早盘竞价复盘：竞价涨幅、竞价成交额、竞价换手、竞价量比；昨日涨停和高标的竞价；全市场竞价金额 vs 昨日 | C `MorningBidding*`, `CallAuction*` | 部分（打板“竞价”只有开盘表现） | **部分**：push2his `trends2/get?iscr=1` 含 9:15–9:25 集合竞价（需先验证盘后还能取到），逐股请求，范围限定为昨日涨停＋前 N 成交额股票；**涨停委买额、竞价未成交委托不能拿到** | 高 | M–L |
| 19 | 板块竞价 / 竞价爆量板块 / 竞价异动 | C `PlateBidding*`, `fragment_plate_bidding_change` | 无 | **部分**：依赖 #18 的逐股竞价数据，按板块聚合（竞价金额 >100 / 300 / 800 万，竞价量比） | 中 | M |
| 20 | 尾盘抢筹（深市 14:57–15:00 收盘集合竞价）：抢筹金额、幅度、占比 | C `FinalQuota*` | 无 | **能（需验证）**：1 分钟 K 线（push2his `kline klt=1`）最后一根 15:00 的成交额减 14:57 时价格；先只覆盖深市成交额前 N 的股票；沪市其实也有收盘集合竞价，可一并纳入 | 中 | M |
| 21 | 涨停委买额、最大封单、封单变化曲线 | B Pattern 列 | 部分（已有封板资金 fbje） | **不能**：最大封单和委买需要 L2 盘中快照；只能用收盘封单 | 中 | — |
| 22 | 涨停原因文字 | B / I 涨停原因列, `format_zt_reason` | 部分（已有按概念归类） | **部分**：东财 F10 核心题材（`emweb.securities.eastmoney.com` CoreConception）可作“题材要点”；没有逐日原因文字的公开 API | 高 | M |
| 23 | 图解复盘：板块核心 / 市场梯队 / 涨停天梯 / 龙虎榜动向，一屏汇总 | I `fragment_picture_replay` | 部分（各模块分散在各页签） | **能**：复用现有数据做一个汇总视图 | 中 | S |
| 24 | 机构榜多日：机构净买、出榜次数、机构数，3 / 5 / 10 / 20 日流入 | F `ChartsAgencyDynamicQuota`, `popup_charts_agency_statistic` | 部分（只有当日机构专用） | **能**：datacenter `RPT_ORGANIZATION_TRADE_DETAILS`（机构买卖每日统计），按区间聚合 | 中高 | S |
| 25 | 游资名称标签（温州帮、章盟主等）和游资榜“关联数” | F `item_lhb_will_name`, `ChartsStock` 关联数 | 部分（活跃营业部） | **部分**：需要自建“营业部→游资名”映射表（公开资料整理）；关联数＝席位中被映射的游资数 | 中高 | M |
| 26 | 实时龙虎榜（盘中主力净额排行＋人气值） | F `RealTimeChartsActivity`, `LhbWillDynamicQuota` | 部分（资金 Top30 为盘后） | **部分**：盘后等价物就是已有资金排行加人气列（来自 #12） | 低 | S |
| 27 | 游资仓位指数（拐点曲线） | F `FloatingCapitalPositionActivity` | 无 | **部分**：自有指标；可用“游资席位龙虎榜净买累计”自造近似指标 | 低 | M |
| 28 | 重点监控 / 问询函 / 监管函列表 | E `fragment_key_monitor`, `item_inquiry_list_content` | 无 | **部分**：深交所监管信息公开（`szse.cn/api/report/ShowReport/data?CATALOGID=main_wxhj` 问询函、监管函）**能**；上交所监管问询（`sse.com.cn` 公开查询）**能**；“重点监控股票”名单交易所不公开发布，**不能** | 中 | M |
| 29 | 避雷：ST / 退市风险预警（新规：净资产为负、营收 <3 亿且亏损、市值退市、面值退市 1 元 20 日、审计意见），含新加入和移除 | E `fragment_lightning_protection*`, `dialog_lp_risk_warning_setting` | 无 | **能**：datacenter 业绩报表 `RPT_LICO_FN_CPD`（营收、净利、每股净资产）＋每日收盘价和市值（clist）＋连续低于 1 元天数；审计意见用 `RPT_F10_...` 或年报公告标题 | 中高 | M–L |
| 30 | 业绩披露：预约披露日历、最新披露、超预期（vs 机构预测）、公告次日 / 5 日 / 至今涨幅、披露进度 | M 全部 | 部分（/earnings 只覆盖研究过的公司） | **能**：datacenter `RPT_PUBLIC_BS_APPOIN`（预约披露）、`RPT_LICO_FN_CPD`（业绩报表）、`RPT_PUBLIC_OP_NEWPREDICT`（业绩预告）、`RPT_FCI_PERFORMANCEE`（快报）、`RPT_WEB_RESPREDICT`（机构预测）；涨幅用 push2his | 高（财报季） | M |
| 31 | 股东人数变化：连降、两期至六期、筹码集中 | O `ShareholderChangeActivity`, F10 股东人数 | 无 | **能**：datacenter `RPT_HOLDERNUMLATEST`、`RPT_HOLDERNUM_DET` | 中 | S |
| 32 | 牛散追踪：按股东名查持股、按股票查股东 | O `TrackRetailActivity` | 无 | **能**：datacenter 十大流通股东 `RPT_F10_EH_FREEHOLDERS`（可按 HOLDER_NAME 过滤）；预生成热门牛散持股表，前端静态检索 | 中 | M |
| 33 | 大宗交易：每日明细（溢价率）、营业部 / 主力 5 / 10 / 20 日汇总 | O `BulkTradeActivity`, `item_bulk_main_force_*` | 无 | **能**：datacenter `RPT_DATA_BLOCKTRADE`（明细）、`RPT_BLOCKTRADE_OPERATEDEPT`（营业部统计） | 中 | S |
| 34 | 机构调研 | N `KLineMenuItems` 机构调研 | 无 | **能**：datacenter `RPT_ORG_SURVEYNEW`；可做每日调研榜（接待机构数） | 中 | S |
| 35 | 筹码分布：平均成本、90% / 70% 区间、集中度、获利比例 | N `fragment_quotation_kline` | 无 | **能**：用日 K＋换手率跑 CYQ 算法（与东财算法同类），按需对候选股计算 | 中 | M |
| 36 | 区间统计（K 线拖动选区）：区间涨幅、换手、主力净额、融资净买 | N `popup_stock_kline_section_statistic_bottom`, `RangeStatisticsActivity` | 无 | **能**：push2his kline＋`fflow/daykline`；需要通用个股页 | 低中 | M |
| 37 | 个股分时大单、对倒、压单托单、大额委托、逐笔成交区间 | N `StockDaDanLand`, `WeiTuoDetails`, `ReadTabMenu` | 无 | **不能**：需要 L2 和逐笔数据 | — | — |
| 38 | F10 全套（概念、要点、主营、股东、机构持仓、评级、分红、财报、估值分位） | N `item_quotation_f10*` | 部分（公司研究页只覆盖研究过的公司） | **能**：东财 F10 和 datacenter 接口，但这是个 L 级项目，更适合放进公司研究模块 | 中 | L |
| 39 | ETF 申赎（份额变化）、方向 / 主题聚合、持续申购天数、涨幅榜 | L 全部 | 部分（ETF 清单 / 复盘没有申赎） | **能**：东财 ETF 份额（datacenter `RPT_ETF_SHARE...`，或交易所每日基金份额：上交所 `query.sse.com.cn` ETF 规模、深交所基金列表）；申赎金额≈份额变化×净值 | 中高 | M |
| 40 | 个股 ETF 穿透（被哪些 ETF 持有、持仓变化） | L `item_quotation_stock_etf_through` | 无 | **部分**：ETF 季度持仓（datacenter 基金持仓）＋指数成分权重；日度变化只能按“份额×权重”估算 | 低中 | L |
| 41 | 北向个股 / 板块 / 机构日度持仓与净买 | J `NorthwardCapital*` | 有（只有说明） | **不能**：港交所自 2024 年 5 月起停止披露实时北向资金，8 月起停止披露日度持股，只剩季度数据 | — | — |
| 42 | 南向资金（每日净买、港股通持仓个股） | J `SouthwardCapital*` | 无 | **能**：datacenter `RPT_MUTUAL_DEAL_HISTORY`（南向）和港股通持股统计（T+2） | 低中 | S |
| 43 | 基金季度持仓（增仓、新进、基金经理） | J `Institutional*` | 部分（国家队持仓） | **能**：datacenter `RPT_MAIN_ORGHOLD` 等（季度） | 低 | M |
| 44 | 融资融券个股排行（融资净买） | N K 线副图, A 融资余额 | 部分（只有市场合计） | **能**：datacenter `RPTA_WEB_RZRQ_GGMX` | 中 | S |
| 45 | 港股题材 / 行业 / 个股、AH 溢价 | Q `fragment_hk*`, `layout_ah_stock_tips` | 部分（全球行情有指数） | **能**：clist 港股 `fs=m:116...`，AH 比价 `fs=b:DLMK0101` | 低中 | S |
| 46 | 可转债列表（溢价率、剩余规模、正股涨幅） | Q `DefaultKZZ*Quota` | 无 | **能**：clist `fs=b:MK0354`＋datacenter `RPT_BOND_CB_LIST` | 中 | S |
| 47 | 商品现货（分类涨幅、领涨商品、关联个股） | Q `GoodsXianHuo*` | 无 | **部分**：现货数据（生意社）不在允许的源里；可用新浪期货主力合约做替代，再人工映射到 A 股板块 | 中 | M |
| 48 | 外围：美股 / 中概 / 港股名单、美股→A 股板块映射、外围异动 | Q `Global*` | 部分（Pulse 全球行情） | **部分**：行情能拿到（新浪 / 腾讯美股）；映射表需人工维护 | 低中 | M |
| 49 | 题材库 / 股票挖掘机（策划过的题材→个股及说明） | P `ThemeExcavate*` | 部分（概念排行、涨停板块） | **部分**：东财概念成分＋F10 核心题材原文；说明文字没有对应公开数据 | 中 | M |
| 50 | 互动易 AI：关键词检索、热度、公司合集、分类（业务 / 澄清 / 风险） | P `InteractEasy*`, `HotSearchRankActivity` | 无 | **部分 / 能**：深交所互动易（`irm.cninfo.com.cn`）和上证 e 互动（`sns.sseinfo.com`）都是交易所的公开问答平台，可每日抓当日问答；分类可先用关键词规则，以后再接 LLM | 中高 | L |
| 51 | 股权司法拍卖、实控人变更 | P `ExcavatorTabName` | 无 | 拍卖**不能**（第三方平台）；实控人变更是**部分**（巨潮公告标题检索） | 低 | M |
| 52 | 大盘直播（AI 时间线） | D `MarketLiveActivity` | 无 | **部分**：盘后可用 #4 和 #5 的事件＋涨停池首封时间生成“当日盘面时间线”（非实时） | 中 | M |
| 53 | 涨速榜（5 / 30 分钟） | D `fragment_ranking_rose_bottom` | 无 | **不能（盘后无意义）** | — | — |
| 54 | 即将涨停页签 | B `PatternTabs` | 无 | **不能（盘中专用）** | — | — |
| 55 | 主力锁仓 | J `MainLockWareHouseActivity` | 无 | **不能**：自有算法和人工收录 | — | — |
| 56 | 板块股票池变动（新增 / 剔除成分） | G `item_recycler_index_wp_detail_content` | 无 | **能**：每日存概念成分快照并做差异比对 | 低中 | S |
| 57 | 板块领涨次数 | G `PlateBriefDynamicQuota` | 无 | **能**：从已有每日板块排行累计 | 低 | S |
| 58 | 涨停历史检索（按关键字 / 板块） | I `SearchLimitReplayActivity` | 部分 | **能**：给已有涨停历史 JSON 做前端搜索 | 中 | S |
| 59 | 指数 K 线副图：全市场新高数、量能、涨跌家数 | N/G `kline_new_high_format`, `popup_index_trend` | 部分 | **能**：依赖 #9；涨跌家数历史已有 | 低 | S |

---

## 3. 建议的实施批次

五个包各自独立：每个包新增自己的页签路由、脚本和数据文件；共享文件只在路由和页签导航上各加一行。

### 包 1 —— 「异动监管」新页签 `/market-mood/abnormal`（#1 #2 #3 #4 #28）
- 脚本 `scripts/kpl/abnormal.*`：
  - 拉全市场收盘快照（clist）和 4 个基准指数日 K。
  - 对候选集（近 10 日涨幅前 N、昨日涨停、近期停复牌股票）补 push2his 30 日日 K。
  - 计算 3 日 / 10 日 / 30 日累计偏离值，以及距离阈值的“明日触发价 / 需再涨幅”。主板阈值为 3 日 ±20%；创业 / 科创为 3 日 ±30%；严重异常为 10 日 +100% 或 30 日 +200% 等，具体按最新沪深交易规则写成常量表。
- 页面区块：
  - 今日已触发异动和严重异动。
  - 明日可能触发（预估价）。
  - 异动停牌复牌 10 日内个股（#2）。
  - 会不会上龙虎榜：按规则列出今日符合条件的股票并对照实际上榜（命中 ✓ / ✗），再列明日可能因 3 日累计偏离上榜的股票（#3）。
  - 盘中异动雷达：push2ex `getAllStockChanges` 当日事件，按类型计数，给出封涨停、打开涨停、大笔买入 Top 股票时间轴（#4）。
  - 问询函 / 监管函：深交所和上交所当日及近 5 日列表（#28，可作为可选子任务）。

### 包 2 —— 「复盘标签 & 新高」新页签 `/market-mood/review`（#6 #7 #8 #9 #10 #23）
- 基础设施（本包独占）：全市场日线快照仓 `public/data/kpl/daily-snapshot/`，每日由 clist 一次分页拉取写入；首次用 push2his 回补 120 日。
- 内容：
  - 赚钱效应：逐日打板成功率、盈利率，以及昨日非一字涨停今开分布直方图（#6）。
  - 盘面亮点标签：一字、T 字、换手板、首板、反包、断板、地天、天地、大面；每类附股票清单，并回看“同标签近 20 日次日胜率”（#7）。
  - 亏钱效应历史柱和大面股计数（#8）。
  - 百日新高：数量、当日新增、趋势，按申万二级或概念聚合，可过滤次新（#9）。
  - 盘中涨停 / 炸板 / 跌停累计曲线：由 `fbt`、`lbt`、`zbc` 还原（#10）。
  - 图解复盘一屏汇总（#23）。

### 包 3 —— 「人气 & 区间排行」新页签 `/market-mood/rank`（#12 #13 #14 #15 #24 #57）
- 人气榜：东财人气 Top100，含排名变化、飙升榜、“连续上榜（7 日前 10）”和“人气激增”标签；自存历史（#12）。
- 区间排行：个股 5 / 10 / 20 / 60 日区间涨幅、区间主力净额、净流入天数；板块同口径的多日区间强度；加地区板块（#13–#15）。
- 机构榜多日：3 / 5 / 10 / 20 日机构净买、出榜次数、机构数（#24）。
- 板块领涨次数（#57）。

### 包 4 —— 「竞价 & 尾盘」新页签 `/market-mood/auction`（#18 #19 #20）
- **先做一个 1 小时的验证任务**：确认 push2his `trends2`（`iscr=1`）和 1 分钟 K 线在盘后（GitHub Actions 运行时）能否拿到 9:15–9:25 竞价和 14:57–15:00 收盘集合竞价。不行就降级为只用开盘价 / 开盘成交估算。
- 早盘竞价：对昨日涨停、连板、高标以及成交额前 500 的股票，给出竞价涨幅、竞价成交额、竞价换手、竞价量比（竞价额 / 昨日同期）；全市场竞价金额 vs 昨日。
- 板块竞价：按板块聚合竞价金额（>100 / 300 / 800 万的家数）、竞价爆量倍数。
- 尾盘抢筹：深沪成交额前 N 的股票，计算 14:57→15:00 撮合金额、抢筹幅度、占全天成交比例。

### 包 5 —— 「财报 · 避雷 · 筹码」新页签 `/market-mood/disclosure`（#29 #30 #31 #33 #34，可选 #32 #44）
- 业绩披露：预约披露日历（未来 10 个交易日）、最新披露（净利、同比、vs 机构预测→超预期标签、公告次日 / 5 日 / 至今涨幅）、披露进度（正式 / 快报 / 预告）（#30）。
- 避雷：按新规计算 ST 风险和退市风险（净资产为负、营收 <3 亿且亏损、市值退市、面值退市连续天数），加“新加入 / 新移除”差异（#29）。
- 股东人数：最新一期连降 3 期以上、降幅榜（#31）。
- 大宗交易：当日明细（溢价率）和营业部 5 / 10 / 20 日汇总（#33）。
- 机构调研：当日和近 5 日调研榜（#34）。
- 可选：融资净买个股榜（#44）、牛散追踪（#32）。

后续可考虑（不在本轮）：ETF 申赎和主题聚合（#39，可并入现有 ETF 页）、可转债列表（#46）、互动易每日问答与关键词（#50，L）、游资名称映射（#25）、板块关联 ETF（#17）、通用个股页（筹码分布 #35、区间统计 #36、F10 #38）。

---

## 4. 不在范围内

| 项目 | 原因 |
|---|---|
| 登录、注册、账户、绑定手机、积分、VIP、兑换码、任务中心、头像、设置、主题、反馈、诊断、Debug（`kaipanh.login.*`、`user.*`、`test.*`） | 账户和运营功能；我们没有用户体系 |
| 交易开户、券商、委托下单（`trade.*`、`WeiTuoSetting`、`dialog_trade_*`） | 交易业务 |
| 支付、订阅付费、解锁弹窗（`H5PayWeb`、`dialog_function_exchange` 等） | 商业化功能 |
| 社区：评论、话题投票、热议、文章栏目、个人文章、机构纪要上传、题材 / 概念 UGC 提交（`discovery.*`、`HotTalk*`、`Summary*`、`ThemeAdd`、`ConceptFeedback`） | UGC 内容，需要用户和审核 |
| 快讯流、AI 快讯解读、推送中心、消息订阅（`FlashNews*`、`notice.*`） | 实时资讯流；无合规公开源；没有推送 |
| 自选股、分组、笔记、预警、看盘设置、AI 识图导入、页面管理（`readtab.*`、`group.*`、`StockNote*`、`ImportStock`） | 依赖用户状态 |
| 个股 L2 级数据：大单明细、对倒、压单托单、大额委托、逐笔成交区间、主力监控、历史分时回放 | 需要 L2 和逐笔数据，没有公开源 |
| 盘中专用：即将涨停、涨速榜、实时龙虎榜的盘中刷新、竞价涨停委买 / 20 分后委买、最大封单曲线 | 只能盘后批处理，没有盘中快照 |
| 北向日度个股 / 板块 / 机构持仓与净买 | 港交所已停止披露（2024 年） |
| 主力锁仓、游资仓位指数、开盘啦人气值本身 | 开盘啦自有算法或私有数据（人气榜改用东财人气榜替代） |
| 股权司法拍卖 | 第三方拍卖平台，不属于行情公开源 |
| 视频、PDF、二维码、分享、语音输入 | 工具类功能 |
