# 朋友对照实验页（入口分开）

对照 [danielmoorelumestory/BusinessWeb](https://github.com/danielmoorelumestory/BusinessWeb) 与研究分支 [`gupiaoWS` · `T1326467/douyin-bruce-trading-system`](https://github.com/danielmoorelumestory/gupiaoWS/tree/T1326467/douyin-bruce-trading-system)。本站按现有架构重写，**入口彼此独立**，不并入开盘啦 / 同花顺主页签，也不自动写入 ETF 复盘分组。

## 入口

| 路径 | 内容 | 更新 |
|---|---|---|
| `/lab/etf-flow` | 全 A / 宽基 ETF 申购净流入 + 上证叠加 | `npm run etf-flow:update` |
| `/lab/etf-uptrend` | 主升浪完整存档（区间 / AI 原因 / 倒推历史） | `npm run etf-uptrend:update`；倒推 `etf-uptrend:reconstruct` |
| `/lab/etf-watch-pool` | 行业观察池 | `public/data/etf-watch-pool.json` |
| `/lab/etf-macd-good` | 创业板择时优选名单 | `public/data/etf-macd-good.json` |
| `/lab/etf-hs300-timing` | 沪深300择时优选名单 | `public/data/etf-hs300-timing.json` |
| `/lab/etf-signal-plans` | 单票三方案研究回测（后复权） | 浏览器拉腾讯 hfq 日线现场算 |
| `/lab/etf-timing` | 既有择时＋只认金叉影子实验 | 既有流水线 |
| `/etf-review` | 自选复盘、择时持仓、持有中筛选、清单分组改名 | 浏览器按清单方案现场计算，保留最近一次结果 |

投资栏目「实验观察」组可点进；页内顶栏可互跳。

另：工具与参考 › [`/invest/blogger-views`](/invest/blogger-views)「博主观点整理」（`src/content/blogger-views/*.md`，noindex）。

## 明确不做

- **不接**朋友 Cloudflare Worker（本站用 Vercel Cron）；Telegram 已改为本站择时影子邮件的可选附加通道，口径仍是本站的，见 `docs/data-maintenance.md`
- **不**默认把优选或观察名单写入 ETF 复盘。「预填复盘」与「加入清单分组」均由用户确认。
- **不**把三方案卡并入 `/grid-trading` 主流程（独立 `/lab/etf-signal-plans`）
- 不复制朋友私有部署配置

## 口径注意

- 三方案页日线 / 择时比值已改腾讯**后复权**（`adjust=hfq`）；网格主流程仍默认前复权。
- 主升浪完整管线已接（`scripts/etf_uptrend.py`）；未接朋友 Cloudflare 实时补拉 `/api/etf-uptrend-live`（以定时存档为准）。轻量名单脚本仍可用：`npm run etf-uptrend:light`。
- 观察池已同步朋友最新（去 `517520`、方案按全历史卡玛选）；择时组合入口已删除（旧 URL 重定向到观察池）。
- ETF 复盘功能已同步到朋友的 [`2cca9886`（2026-11-18）](https://github.com/danielmoorelumestory/BusinessWeb/commit/2cca9886)。本站在浏览器现场算择时持仓，盘中用最新报价，收盘后用日线。计算使用本站清单，复盘页无 Telegram 集成。
