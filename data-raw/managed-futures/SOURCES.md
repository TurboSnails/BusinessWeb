# 管理期货立项评估：原始数据来源

用途：`docs/research/managed-futures-2026-11-28/SCOPE.md`（只做立项评估，没有计算任何候选的收益、夏普或回撤）。

文件在本机 `raw/`，保留服务端响应的原始字节，没有补值、去重或重排。SHA-256 针对原始字节。时间为 UTC。`.headers` / `.time` 是本机的元数据。**`raw/` 只留本机，不入库**：AQR 网站使用条款（`aqr-terms-of-use.html`，As of December 2023）不允许未经书面同意转载或再分发网站上的信息；Yahoo chart 是非官方接口。提交前需要在 `.gitignore` 加 `data-raw/managed-futures/raw/`（本次没有改 `.gitignore`）。

行数口径：AQR xlsx 为数据表里带日期的月度行数；Yahoo 为 `timestamp` 条数（日线）；HTML 不计行数。起止为数据里第一个和最后一个日期。

## 数据文件

| 本机文件 | 公开 URL | 下载时间 UTC | HTTP | 行数 | 最早 → 最晚 | 费前 / 费后 | SHA-256 |
|---|---|---|---:|---:|---|---|---|
| `aqr-Time-Series-Momentum-Factors-Monthly.xlsx` | <https://www.aqr.com/-/media/AQR/Documents/Insights/Data-Sets/Time-Series-Momentum-Factors-Monthly.xlsx> | 2026-11-28T07:53:28Z | 200 | 497 | 1985-01-31 → 2026-05-29 | **费前、未扣交易成本**；多空自融资超额收益（不含抵押品利息）；5 列 TSMOM、TSMOM^CM、TSMOM^EQ、TSMOM^FI、TSMOM^FX | `33470930e2269c0d97be4732ec2d9c27ddbc69ac8133b059a263e27400263eeb` |
| `aqr-Time-Series-Momentum-Original-Paper-Data.xlsx` | <https://www.aqr.com/-/media/AQR/Documents/Insights/Data-Sets/Time-Series-Momentum-Original-Paper-Data.xlsx> | 2026-11-28T07:53:30Z | 200 | 300 | 1985-01-31 → 2009-12-31 | 同上（原文静态版） | `91bdbae6366ccb0693581b690236dc14862562a98ee83052c4f440f8b6ae0db8` |
| `aqr-Century-of-Factor-Premia-Monthly.xlsx` | <https://www.aqr.com/-/media/AQR/Documents/Insights/Data-Sets/Century-of-Factor-Premia-Monthly.xlsx> | 2026-11-28T07:53:34Z | 200 | 1196 | 1926-07-30 → 2026-02-27 | **费前、未扣交易成本**（Definition 页原话：gross of trading costs and fees）；横截面价值 / 动量 / 利差 / 防守因子 + 「Market」列（股指、固收、商品、宏观合计），**不含时间序列动量** | `0bf8ba978e64964282ead98a6a25691218d4517d07c98c89e2716706f6f0a127` |
| `yahoo-DBMF-1d.json` | <https://query1.finance.yahoo.com/v8/finance/chart/DBMF?period1=0&period2=1795852811&interval=1d&events=div%7Csplit&includeAdjustedClose=true> | 2026-11-28T08:00:59Z | 200 | 1901 | 2019-05-08 → 2026-11-27 | **费后**（ETF 市价；adjclose 含分红再投资），不是 NAV | `0ba573751fec3d7413e4f7907a76d55ce574ac06851aa0027157350b0cfbeefa` |
| `yahoo-KMLM-1d.json` | 同上，代码 KMLM | 2026-11-28T08:01:02Z | 200 | 1504 | 2020-12-02 → 2026-11-27 | 费后（ETF 市价） | `e006e5cbf3f6bba6934338541c656e76eff0dd6f9ff00f8392942f83fb58b2cb` |
| `yahoo-CTA-1d.json` | 同上，代码 CTA | 2026-11-28T08:01:05Z | 200 | 1187 | 2022-03-08 → 2026-11-27 | 费后（ETF 市价） | `25ca7b163cf19405b6936758c7dcc1e202c298dee54ba4195e448be8265e54ff` |
| `yahoo-AQMIX-1d.json` | 同上，代码 AQMIX | 2026-11-28T08:01:08Z | 200 | 4251 | 2010-01-05 → 2026-11-27 | 费后（共同基金 NAV，adjclose 含分配） | `8be589aee984d748f7a1f377ef8d1b6aec1f1fd4f22f2c0230dde22f866979a3` |
| `yahoo-ASFYX-1d.json` | 同上，代码 ASFYX | 2026-11-28T08:01:11Z | 200 | 4106 | 2010-08-03 → 2026-11-27 | 费后（共同基金 NAV） | `915af141c8b5be2c5aaded03c984d62bb1a467d685a49e0ce0b96672d2fc0303` |
| `yahoo-PQTIX-1d.json` | 同上，代码 PQTIX | 2026-11-28T08:01:14Z | 200 | 3244 | 2014-01-06 → 2026-11-27 | 费后（共同基金 NAV）；Yahoo 只从 2014-01 起，基金实际成立更早（未核） | `e3bc6fe588b2eee295de0f8cbcb0faa7f1ee6ed32b337e8d482c1ee81eed8544` |
| `yahoo-WTMF-1d.json` | 同上，代码 WTMF | 2026-11-28T08:01:17Z | 200 | 3998 | 2011-01-05 → 2026-11-27 | 费后（ETF 市价） | `ba69e7b1577ded33431b7312872321812ee486354598b7d94f491c43ca0239e1` |
| `yahoo-FMF-1d.json` | 同上，代码 FMF | 2026-11-28T08:01:21Z | 200 | 3351 | 2013-08-02 → 2026-11-27 | 费后（ETF 市价） | `a6a13e069bd4113ef1526518189589c360e6197eb586d1a6f655c50b4bb68248` |
| `yahoo-RYMFX-1d.json` | 同上，代码 RYMFX | 2026-11-28T08:01:34Z | 200 | 4974 | 2007-02-22 → 2026-11-27 | 费后（共同基金 NAV） | `105b15ac9fbfce89f6593c10d1a699b0b2d3827593bd26e37c134ac6b7c5ca53` |

Yahoo 下载第一轮（浏览器 UA、query2 主机）全部返回 429，约 20 秒后改用 `User-Agent: Mozilla/5.0`、query1 主机重下成功（与 `scripts/defensive-tilt-shadow.mjs` 相同的 UA）。9 个文件 adjclose 无空值；分红事件 4–32 次，无拆股。

## 页面快照（核对数据集名称、说明与条款）

| 本机文件 | URL | 下载时间 UTC | HTTP | 说明 | SHA-256 |
|---|---|---|---:|---|---|
| `aqr-datasets-index.html` | <https://www.aqr.com/Insights/Datasets> | 2026-11-28T07:48:26Z | 200 | 数据库首页（只列出第一页 10 个数据集） | `35d89cacfbff76fabe705639e60fbd986a5b557f293a6601cc6b5c395b06ad37` |
| `aqr-tsmom-factors-page.html` | <https://www.aqr.com/Insights/Datasets/Time-Series-Momentum-Factors-Monthly> | 2026-11-28T07:48:28Z | 200 | 页面日期 May 29, 2026；58 个期货与远期合约；12 个月回看、1 个月持有 | `f078a9c3c9f3f808d857b5e89da5cf195c9cb094bfae44d0bfc33f29f6514a64` |
| `aqr-tsmom-original-page.html` | <https://www.aqr.com/Insights/Datasets/Time-Series-Momentum-Original-Paper-Data> | 2026-11-28T07:53:36Z | 200 | 原文数据 1985–2009 | `95d700067261c70124032d5d7e73dd2d0c6edd2cc613fadcd11ad23a43789c54` |
| `aqr-century-premia-page.html` | <https://www.aqr.com/Insights/Datasets/Century-of-Factor-Premia-Monthly> | 2026-11-28T07:53:38Z | 200 | Ilmanen 等「百年因子溢价」 | `1b7c09f622bfab6b74295bdc0b97a39c1288829a7fd11fd9e40de257bdbbd026` |
| `aqr-about-data-library.html` | <https://www.aqr.com/Insights/Datasets/About-the-AQR-Data-Library> | 2026-11-28T07:59:40Z | 200 | 全部为论文中的假设组合；每次更新重算全部历史；请注明「AQR Capital Management, LLC.」 | `64291ee28b21541bfb318717f7806a73b5a39057ddffe0b2cd842fdb758a570d` |
| `aqr-terms-of-use.html` | <https://www.aqr.com/Terms-of-Use> | 2026-11-28T07:59:31Z | 200 | 不得未经书面同意转载、分发、发布网站信息 | `d59238564fbd3d9adab5409a39ae273ca10692e573fa308eb03f5bff6e3111c0` |
| `barclay-cta-index-page.html` | <https://www.barclayhedge.com/barclay-cta-indices/barclay-cta-index/> | 2026-11-28T07:59:59Z | 200 | 跳转到 BarclayHedge 首页（订阅 / 注册入口），没有公开数据表 | `2a3c58eefe50ce1306256a2a4ec92f9b922834389b2bc9d2d765ae3c223a4517` |
| `sg-trend-index-barclayhedge-page.html` | <https://www.barclayhedge.com/sg-prime-services-indices/sg-trend-index/> | 2026-11-28T08:00:00Z | 200 | 同样跳转到首页（字节与上一行相同） | `2a3c58eefe50ce1306256a2a4ec92f9b922834389b2bc9d2d765ae3c223a4517` |
| `sg-prime-services-indices-page.html` | <https://wholesale.banking.societegenerale.com/en/prime-services-indices/> | 2026-11-28T08:00:02Z | 200 | SG CTA / SG Trend 指数：费后、不可投资、等权、年度调整；页面读数停在 2015-04-23；完整日度数据需联系 Capital Consulting 或经 SG Markets 授权 | `9b1ab788410c07923a972f051fc574083c12c7c1a3001068edacf2f06ebe084b` |

试过但不存在的地址（AQR 返回「页面不存在」的 200 软 404，50,617 字节）：`/Insights/Datasets/A-Century-of-Evidence-on-Trend-Following-Investing`、`/Insights/Datasets/Trend-Following-A-Century-of-Evidence`、`/-/media/.../A-Century-of-Evidence-on-Trend-Following-Investing.xlsx`。

## 看过什么（如实披露）

为确认表头位置，结构检查脚本两次把数据表开头几行原样打印了出来：TSMOM 因子更新版 1985-01 至 1985-07 的 7 个月 5 列数值；百年因子溢价 1926-07 至 1927-09 约 15 个月的全部列数值。之后改成只输出列名、起止日期和行数。除此之外没有读取、汇总或计算任何收益序列的统计量。
