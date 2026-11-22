# 组合再平衡探索的数据来源

原始下载文件只留在本机（见仓库 `.gitignore`），这里记录来源、下载时间与校验值，便于复现时重新下载核对。

## 个股日线（短窗口与 2016 年以来）

- 来源：腾讯 `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=us<代码><后缀>,day,<起>,<止>,2000,`（不复权日线；纳斯达克后缀 `.OQ`、纽交所 `.N`、NYSE Arca `.AM`），2026-11-21 下载，按 2015–2019、2020–2024、2025–2026-11-21 三段拼接。
- 处理：按开盘价跳变自动识别拆股，并与已知拆股逐一核对（NVDA 2021-07-20 一拆四、2024-06-10 一拆十；TSLA 2020-08-31 一拆五、2022-08-25 一拆三；AMZN 2022-06-06 与 GOOGL 2022-07-18 一拆二十；AVGO 2024-07-15 一拆十；WMT 2024-02-26 一拆三），向前调整。RKLB 只用 2021-08-25 起、SOFI 只用 2021-06-03 起的数据（之前为借壳空壳价格）。**不含分红**。
- 交叉核对：AVGO、MSFT、META、SOFI、RKLB、QQQ、QQEW、INTC、CB、AXP 的 2021-07 以来收盘价与另一来源逐日比对，全部在 0.2% 以内。
- 产物：`prices-adjusted.json`（已提交），sha256 `8ce7693a3e87470def8b1199b01d222d15965887d56eeabb48c225ac5bcc5b27`。

## 长期压力测试（1986 年以来）

- 行业组合日收益：Ken French 数据库 `49_Industry_Portfolios_daily_CSV.zip`（CRSP 202609 版，含分红），`https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/49_Industry_Portfolios_daily_CSV.zip`，2026-11-22 下载。
- 纳斯达克 100 与综合指数：FRED `https://fred.stlouisfed.org/data/NASDAQ100`、`https://fred.stlouisfed.org/data/NASDAQCOM`，2026-11-22 下载，用 `scripts/us-market-data.mjs` 的 `parseFred` 解析为 `longrun/NASDAQ100.json`、`longrun/NASDAQCOM.json`。
- 复现锚点程序：`longrun/anchor_longrun.py`（已提交）。

| 文件 | sha256 |
|---|---|
| `longrun/49_Industry_Portfolios_Daily.csv` | `a17d6a29387651d009fe56057dbf241f2e676fef4f671de028c1e35b34d8b3a4` |
| `longrun/49_Industry_Portfolios_daily_CSV.zip` | `b9d36d571e968d71f7b03207e7fed6398554f953719b8c1bf3ee3ad8d00e7520` |
| `longrun/NASDAQ100.json` | `a78c67241e750c32b6c85d82e3ccfe3a3ac0ba2117ecf5924a4dbe8d5098031a` |
| `longrun/NASDAQ100.txt` | `6db572f2f22ff1e6314e53aef792a16f7d6eeacffe00f7e60bfa04839925e19d` |
| `longrun/NASDAQCOM.json` | `8ec7a8c993506f4e878530ee9232d533b2ad035c0f48278752356e0dcf99f13d` |
| `longrun/NASDAQCOM.txt` | `54264ddf6e4f6517a4b8cfe78f99e71f9b64ce2684a6fc32d9d9c9da26149ad8` |

## 标普 500 信号（2026-11-22）

- 来源：Yahoo chart 接口 `https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?period1=473385600&period2=1795305600&interval=1d`，manager 于 2026-11-22 下载，1985-01-02 至 2026-11-20，价格指数。
- 处理：UTC 时间戳减 5 小时后取纽约日期，保留非空收盘，解析为与 `NASDAQ100.json` 相同的 `{"history": [["YYYY-MM-DD", 收盘], ...]}` 格式；共 10,554 行，无空收盘。原始与派生文件均只留本机。
- 交叉核对：执行者 2026-11-22 对 FRED `https://fred.stlouisfed.org/data/SP500` 的一次请求未返回可解析的日度观测。manager 同日改用腾讯指数日线 `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=us.INX,day,2019-01-01,2026-11-21,2000,`（响应 sha256 `594ed0d92f76d10f63c638fda5674e9fba14c4c29f1b3dd5045ae9d48d96c03f`，只留本机）逐日核对：2019-01-02 至 2026-11-20 共 1,984 个交易日，日期完全重合，收盘相对偏差超过 0.01% 的有 2 天，最大为 2021-08-11 的 0.119%。2019 年以前只人工核对了 1987-10-19 为 224.84、2009-03-09 为 676.53、2020-03-23 为 2237.40，三项均一致。
- 复现锚点程序：`longrun/anchor_spx.py`（manager 独立实现，已提交）；执行者的独立程序在 `work/spx-signal/run.py`。

| 文件 | sha256 |
|---|---|
| `longrun/GSPC-yahoo-chart.json` | `9ea2369531ae88aff4600cb83a75cc8509ef6b5a40e4175d92f98b0d994d299c` |
| `longrun/GSPC.json` | `9dd16bec4c740fc2b2882be41ac969f38a9b4843b1576fc83bfe789f0536741b` |

## 目录

- `anchor.py`：短窗口与 2016 年以来的复现锚点（manager 独立实现）。
- `work/<任务键>/`：各执行者的独立回测程序与汇总结果（逐组合明细与交易日志未提交，可重跑生成）。
