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

## 目录

- `anchor.py`：短窗口与 2016 年以来的复现锚点（manager 独立实现）。
- `work/<任务键>/`：各执行者的独立回测程序与汇总结果（逐组合明细与交易日志未提交，可重跑生成）。
