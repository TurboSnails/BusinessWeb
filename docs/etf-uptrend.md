# ETF 主升浪

页面：`/lab/etf-uptrend`（投资 › 实验观察）。

完整管线对齐朋友仓库：`scripts/etf_uptrend.py` → `data-raw/etf-uptrend/` → `public/data/etf-uptrend/`。

## 数据

同花顺「ETF 主升浪」公开接口（无需登录）：

- 名单：`POST …/fund_pool/v2/query`，`businessKey=etfUpTrend`（全量池 + 回踩 / 新入池 / T+0 / 行业 / 宽基 / 同类去重）
- 历史上涨区间：`GET …/etf_rank/etf/uptrend/v1/period/etf/{market}/{code}`
- AI 上涨原因：`GET …/ai/insights/{market}/{code}/{start_day}`

今日涨幅等需登录指标不采集。

## 命令

```sh
npm run etf-uptrend:test
npm run etf-uptrend:update          # run + export
npm run etf-uptrend:reconstruct     # 倒推历史（约 12 分钟）+ export
npm run etf-uptrend:export
npm run etf-uptrend:light           # 仅名单+标签的 JS 轻量脚本（应急）
```

GitHub Actions：`.github/workflows/etf-uptrend.yml`（BJ 23:30 / 07:00；周六重建倒推）。

## 与朋友的差异

- **未接** Cloudflare `/api/etf-uptrend-live` 实时补拉；页面以定时存档为准。
- 入口在 SPA `/lab/etf-uptrend`，不是 `/note/lab/etf-uptrend`。
- 「预填复盘」走本站 `/etf-review?code=&name=`，不做朋友那种本机分组对话框。

## 存储

- `data-raw/etf-uptrend/`：snapshots、cache、raw、status（见目录内 `.gitignore`）
- `public/data/etf-uptrend/`：`index.json`、`detail.json`、`days/*.json`、`reconstructed.json`
