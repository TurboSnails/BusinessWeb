# spx-qqq-tilt 原始数据来源（L-049）

- 下载时间 (UTC): 2026-11-28T08:01:49Z
- 下载方: api worker（orca task_2c72db7421fd）
- 目录: data-raw/spx-qqq-tilt/raw/（仅本机，不提交）
- Ken French 标注: 202609 CRSP database

## F-F_Research_Data_Factors_daily_CSV.zip
- URL: https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/F-F_Research_Data_Factors_daily_CSV.zip
- 参数: CSV zip, daily FF3
- 下载时间: 2026-11-28T08:01:49Z
- 字节: 178326
- sha256: 96c23b88e651cbfff3740a53f8225e59ee39893371e96385a1d8125ec2cd9c89
- 行数: 26338
- 首末: 1926-07-01 → 2026-09-30

## F-F_Research_Data_Factors_CSV.zip
- URL: https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/F-F_Research_Data_Factors_CSV.zip
- 参数: CSV zip, monthly FF3 (first block monthly; annual block ignored)
- 下载时间: 2026-11-28T08:01:49Z
- 字节: 13078
- sha256: b03d39e4bb253dda0f14893db3b78e64b40b8d6549a0fc0fd4111dae84c98618
- 行数: 1203
- 首末: 192607 → 202609

## 6_Portfolios_2x3_daily_CSV.zip
- URL: https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/6_Portfolios_2x3_daily_CSV.zip
- 参数: CSV zip; first block Average Value Weighted Returns -- Daily; BIG LoBM column
- 下载时间: 2026-11-28T08:01:49Z
- 字节: 1135151
- sha256: 2fb5a5ceaea02ea074cddaad15ec178eff0f4f198e506058900047a5d5bfdf20
- 行数: 26338
- 首末: 1926-07-01 → 2026-09-30
- 说明: BIG LoBM 日度最早 1926-07-01（与文件首日相同）

## 6_Portfolios_2x3_CSV.zip
- URL: https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/6_Portfolios_2x3_CSV.zip
- 参数: CSV zip; first value-weighted monthly block
- 下载时间: 2026-11-28T08:01:49Z
- 字节: 149549
- sha256: 28d382168866a2f424bf32da868b08895c31c954cbad948f88606cd4ef73db58
- 行数: 1203
- 首末: 192607 → 202609

## yahoo_SPY_daily.csv
- URL: https://query1.finance.yahoo.com/v8/finance/chart/SPY?period1=0&period2=9999999999&interval=1d&events=div,split
- 参数: interval=1d, period1=0 (max)
- 下载时间: 2026-11-28T08:01:49Z
- 字节: 381313
- sha256: 184ccbbaacac10f4e54fef9e7a652f32169a01d62040d3d3aab4cdafd4f82133
- 行数: 8516
- 首末: 1993-01-29 → 2026-11-27
- 说明: 复权用 adjclose

## yahoo_SPY_chart.json
- URL: https://query1.finance.yahoo.com/v8/finance/chart/SPY?period1=0&period2=9999999999&interval=1d&events=div,split
- 参数: raw chart JSON
- 下载时间: 2026-11-28T08:01:49Z
- 字节: 861455
- sha256: ba4b73b52f95e7c3973908321897adedd0ffdaa38dcf1c294a00425f6516c4cb
- 说明: upstream blob

## yahoo_QQQ_daily.csv
- URL: https://query1.finance.yahoo.com/v8/finance/chart/QQQ?period1=0&period2=9999999999&interval=1d&events=div,split
- 参数: interval=1d, period1=0 (max)
- 下载时间: 2026-11-28T08:01:49Z
- 字节: 322655
- sha256: b66b57ec68b805b9c1262af7d14343751d4c30a698f3b995aed7ed0105c91aeb
- 行数: 6974
- 首末: 1999-03-10 → 2026-11-27
- 说明: 复权用 adjclose

## yahoo_QQQ_chart.json
- URL: https://query1.finance.yahoo.com/v8/finance/chart/QQQ?period1=0&period2=9999999999&interval=1d&events=div,split
- 参数: raw chart JSON
- 下载时间: 2026-11-28T08:01:49Z
- 字节: 747713
- sha256: 87638a43389e1e5ab8aa64fcd05fa222b0b28b1f3943b78bb235babf49f1a8f2
- 说明: upstream blob

## yahoo_GSPC_daily.csv
- URL: https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?period1=0&period2=9999999999&interval=1d&events=div,split
- 参数: interval=1d, period1=0 (max)
- 下载时间: 2026-11-28T08:01:49Z
- 字节: 660225
- sha256: fa449632f59cf62c049937d8f97c4581b786cba066f1d58af1e7b5f15d7498e5
- 行数: 14349
- 首末: 1970-01-02 → 2026-11-27
- 说明: Yahoo chart 公开接口实际最早约 1970-01-02，非 1927；1927–1969 主判定用 KF 市场腿

## yahoo_GSPC_chart.json
- URL: https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?period1=0&period2=9999999999&interval=1d&events=div,split
- 参数: raw chart JSON
- 下载时间: 2026-11-28T08:01:49Z
- 字节: 1550902
- sha256: 7358c7c53d5e9349623b3f1e8399364066224766eb269bb5c298acc46427a1e4
- 说明: upstream blob

## yahoo_NDX_daily.csv
- URL: https://query1.finance.yahoo.com/v8/finance/chart/%5ENDX?period1=0&period2=9999999999&interval=1d&events=div,split
- 参数: interval=1d, period1=0 (max)
- 下载时间: 2026-11-28T08:01:49Z
- 字节: 466560
- sha256: ab9c7ea95f5919090258c3b4231fdffe58db26fc88abc3184114be55bb80a909
- 行数: 10370
- 首末: 1985-10-01 → 2026-11-27
- 说明: 约 1985-10-01 起

## yahoo_NDX_chart.json
- URL: https://query1.finance.yahoo.com/v8/finance/chart/%5ENDX?period1=0&period2=9999999999&interval=1d&events=div,split
- 参数: raw chart JSON
- 下载时间: 2026-11-28T08:01:49Z
- 字节: 1102465
- sha256: 4c35967822580c78fe1ec802731c4702c89ce2970b916deafca135b48e5290c5
- 说明: upstream blob

## shiller.csv
- URL: reuse: data-raw/sp500-backtest/shiller.csv（源自 Shiller ie_data.xls，见 data-raw/sp500-backtest/SOURCES.md）
- 参数: columns date,P,D,E,CPI,GS10；D=月度股息
- 下载时间: 2026-11-28T08:01:49Z
- 字节: 86226
- sha256: b2f1189b5185e898f81c98297d32b56db109d8b85a85723f244099d6daca5452
- 行数: 1870
- 首末: 1871-01 → 2026-10
- 说明: 本目录为副本；未重新下载 xls

## FRED_DTB3.csv
- URL: https://fred.stlouisfed.org/graph/fredgraph.csv?id=DTB3
- 状态: **缺失 / 跳过**
- 说明: 本机多次 curl/urllib 超时（0 bytes）；未使用 API key。跳过。现金在 KF 截止后的衔接需另机下载或改用已有 TB3MS 月度（非本任务 DTB3）。
