# 沪深融资买入占比分母核定

核验日：2026-10-19。观测日：2026-10-16。以下原始接口均已实际请求，并交由新增生产解析器处理；没有将沪深300指数成交额当作沪深全市场成交额。

## 已核定结果

融资买入额 121,857,375,394 元，除以同日沪深 **A股与全部上市基金**成交额 21,618.24 亿元，乘100，结果为 **5.636785%**。金额统一为人民币；东财分子元÷1e8，交易所分类分母本身为亿元。

| 交易所 | 分类 | 成交额，亿元人民币 |
| --- | --- | ---: |
| 上海 | 主板A | 5,250.21 |
| 上海 | 科创板 | 2,118.93 |
| 上海 | 基金 | 4,417.26 |
| 深圳 | 主板A股 | 4,271.74 |
| 深圳 | 创业板A股 | 3,965.52 |
| 深圳 | 基金 | 1,594.58 |
| 合计 | A股与全部上市基金 | 21,618.24 |

这里是“融资买入额占股票及基金市场总成交额”的广口径；分母包含不属于融资标的的A股和基金，不能解释成融资标的内部的融资买入占比，也不能解释成沪深300成分股专属资金。市场基金包括股票ETF、债券ETF、货币ETF、LOF、REITs等交易所归入基金类别的上市基金；直接债券、B股、优先股、回购、期权不在分母中。债券ETF仍是基金，不能因名称有“债券”就剔除。

## 真实来源及单位

- [东财沪深两融汇总](https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPTA_RZRQ_LSHJ&columns=DIM_DATE%2CRZMRE&pageSize=5&sortColumns=DIM_DATE&sortTypes=-1)：`DIM_DATE=2026-10-16 00:00:00`，`RZMRE=121857375394`。同一接口也返回10月12～15日历史。该值作为转载原值使用，非交易所直连分子。
- [上交所分类市场总貌](https://query.sse.com.cn/commonQuery.do?sqlId=COMMON_SSE_SJ_SCGM_C&isPagination=false&TRADE_DATE=2026-10-16)：`PRODUCT_NAME` 直接提供主板A、科创板、基金、主板B、债券等名称，`TOTAL_TRADE_AMT` 为成交额。`TRADE_DATE` 每行是 `20261016`。请求带 `Referer: https://www.sse.com.cn/`。
- [上交所市场总貌页面](https://www.sse.com.cn/market/view/) 当前加载的 [官方查询脚本](https://www.sse.com.cn/xhtml/home/2021public/querySearch/search_marketGeneralPicture.js) 使用上述 `COMMON_SSE_SJ_SCGM_C`，表头明确写出“成交额(亿元)”，并按 `PRODUCT_NAME` 名称逐项渲染。
- [深交所证券类别统计](https://www.szse.cn/api/report/ShowReport/data?SHOWTYPE=JSON&CATALOGID=1803_sczm&TABKEY=tab1&txtQueryDate=2026-10-16)：`metadata.subname=2026-10-16`，`metadata.cols.cjje=成交金额<br>(亿元)`，`lbmc` 明示主板A股、创业板A股、基金、主板B股、债券等分类。`cjje` 为带千位逗号的亿元数值。该端点来自 [深交所市场总貌页面](https://www.szse.cn/market/overview/index.html) 的 `data-s-catalog-id="1803_sczm"`。

上交所 `TRADE_DATE=20261016` 与 `TRADE_DATE=2026-10-16` 两种参数均实际成功；生产使用官网脚本的日期格式。深交所旧 `CATALOGID=1803` 仅给股票总量，缺基金分类；不能单用它当完整分母。

## 重要纠错：上交所03是科创板

此前候选接口 `COMMON_SSE_SJ_GPSJ_CJGK_MRGK_C` 的 `PRODUCT_CODE=03` **是科创板，不是基金**。2026-10-16该行证券数618，金额2118.93亿元；新带名称的市场总貌接口清楚对应“科创板”。旧接口01为主板A，02为主板B，17为股票合计。

所以5250.21+1.26+2118.93=7370.40只是股票合计，不是股票加基金；把03误称基金会遗漏上海4417.26亿元的真实基金成交额。这修正了此前缺口研究中的未核定分类，不据旧误读补造占比。

## 融资证券覆盖的核验

- [上交所融资买入标的列表](https://www.sse.com.cn/services/tradingservice/margin/info/againstmargin/) 加载 [data_961.js](https://www.sse.com.cn/services/tradingservice/margin/info/againstmargin/data_961.js)。本次实际文件完整列出2017只：1679个6开头股票/存托凭证，338个5开头基金；未出现直接债券代码。文件静态更新时间为2026-10-19，故它用作当前证券类别交叉核验，不将其冒充10月16日历史成分归档。
- [深交所10月16日融资标的接口](https://www.szse.cn/api/report/ShowReport/data?SHOWTYPE=JSON&CATALOGID=1834_xxpl&TABKEY=tab1&txtDate=2026-10-16) 的证券类别筛选元数据只有股票 `GP` 和基金 `SS`。同日 `zqlb=SS` 查询实际返回253只基金的计数与基金行。
- [上交所2026年第二季度标的调整通知](https://www.sse.com.cn/lawandrules/sselawsrules2025/trade/specific/margin/c/c_20260710_10825136.shtml) 明确区分股票与交易型开放式指数基金；[上交所融资明细页面](https://www.sse.com.cn/market/othersdata/margin/detail/) 的融资买入额单位为元。
- 规则允许的证券大类并不等于当期实际标的；此次没有仅凭规则中“可以包含债券”的条款把全市场债券加入分母。

## 实现与验收

`scripts/market-cycle-cn-funding.mjs`：

- `cnTurnoverUrls(date)` 返回以上真实成功的两所分类URL；`parseSseTurnover` / `parseSzseTurnover` 返回 `{date, amountYi}`，供53周成交额序列共用。
- `collectCnFunding(ctx)` 先取最新融资交易日，再按同一日期请求两所分类。最新融资记录为未来或超过14天、任一必需分类缺失/重复/金额非法、深交所元数据日期或单位不符，均不输出新事实；不会跨日相除，也不会把缺失值转换成0。
- 输出 `financing_buy_ratio_pct`（5.636785%，market=csi300）和审计用 `cn_turnover_yi`（21618.24亿元，同市场）。两项均为真实观测计算值，描述列出分子、分母、六个分类分项、资产范围和三个来源链接。
- 融资占比只是资金维度的一个输入；完整资金维度还需要相同市场口径的完整周/前52周成交额，不用孤立占比替代这一条件。

测试先因模块缺失失败，再实现后通过。`node --test scripts/market-cycle-cn-funding.test.mjs` 通过4项测试：真实数值、错日/错单位、缺基金/重复分类/非法金额，以及采集器时效。随后用真实下载的三份原始响应调用生产 `collectCnFunding`，得到两项事实且issues为空，ratio精确等于5.636785。

原始响应及官方脚本存于本机忽略目录 `.local/cn-financing-denominator-2026-10-19/`，未作为生产数据提交。关键响应 SHA-256：

- margin：`2f9ab7c13639e46d5147b7ef75b23cb3d67cb839b2adfbd5150ce3b64ae3d2eb`
- SSE：`7f747e39f627679d1dd19d01310f6fa476099dbf8a5f0d6cfb5b7d6fd56d4e34`
- SZSE：`f81371294939b47e718d2c4f39528d60225db52525144d5f3e73876fbf0a54f9`

以上是本次实际观测证据；不声明接口未来恒定可用。源失败时的旧事实保留、首次采集时间及整体发布由主采集器处理。
