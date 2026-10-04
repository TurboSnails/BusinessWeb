# 估值财务数据适配说明

接口在2026-10-04验证。以实际字段期间和获取时间为准，缺失不填0。

|市场|数据源|本次实际响应|
|---|---|---|
|美股|SEC `data.sec.gov/api/xbrl/companyfacts/CIK….json`|AAPL年度营收、净利、EPS、权益、股本、现金、经营现金流、capex|
|A股|东方财富 NewFinanceAnalysis 年度三张报表|600519年报利润、股东权益、股本、现金、经营现金流、capex；债务缺失|
|港股|东方财富 RPT_HKF10_FN_MAININDICATOR + CASHFLOW_SUMMARY|00700年度营收、净利、EPS、股本、EBIT、经营现金流；现金/债务/权益/capex缺失|
|行情|腾讯 qt.gtimg.cn|AAPL、600519、00700价格及行情日期|
|汇率|Frankfurter latest|CNY/HKD；保留汇率日期与来源|

美股年度值筛选330–380天完整财年，排除财报发布时间晚于asOf的记录；点时字段独立保留日期，不把累计季度相加。SEC中不同XBRL标签缺失或外国发行人用IFRS时保留缺失。长期债务标签不能证明总有息债务完整，因此债务字段保留缺失，需补充并核对短期借款、商业票据等组件后再做企业价值桥接。

腾讯港股财务指标接口的CURRENCY可能与真实财报币种不同，所以必须使用财报摘要核对；00700验证为人民币。CASHFLOW_SUMMARY不接受columns=ALL，需要显式字段列，否则返回业务错误。

参考：[SEC官方API文档](https://www.sec.gov/search-filings/edgar-application-programming-interfaces)、[AKShare官方财报文档](https://akshare.akfamily.xyz/data/stock/stock.html)、[A股原始适配源码](https://github.com/akfamily/akshare/blob/main/akshare/stock_feature/stock_three_report_em.py)、[港股原始适配源码](https://github.com/akfamily/akshare/blob/main/akshare/stock_fundamental/stock_finance_hk_em.py)。
