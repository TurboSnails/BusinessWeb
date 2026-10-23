# 项目数据刷新记录 · 2026-10-23

执行日期：2026-10-23（Asia/Yerevan，UTC+4；北京时间 15:19 起执行，A 股/港股已收盘，美股 10-23 盘未开）。
范围：行情层全量刷新 + 数据新鲜度盘点。不重估基本面模型，不改研究结论与评级规则。

## 更新结果

| 数据组 | 刷新前 | 刷新后 | 证据 |
| --- | --- | --- | --- |
| 美股公司报价（`public/data/us.json`，294 条） | 2026-10-19 | 2026-10-22 | `research/data-refresh-2026-10-23/tencent-quotes.json`、`yahoo-quote-batch.json` |
| A 股公司报价（`public/data/cn.json`，811 条） | 2026-10-20 | 2026-10-23 | 同上（腾讯延迟行情，marketTime 2026-10-23 15:00） |
| 港股公司报价（`public/data/hk.json`，127 条） | 2026-10-20 | 2026-10-23 | 同上 |
| ADR 报价（`public/data/adr.json`，67 条） | 2026-10-19 | 2026-10-22 | 同上（腾讯/Yahoo 美股最后报价） |
| 美股指数（ndx/sox/spx/rsp/rut） | 2026-10-19 | 2026-10-22 | `indexes-collected.json`，warnings 空 |
| A 股/港股指数（hsi/sse/csi300/csi500/chinext） | 2026-10-20 | 2026-10-23 | 同上，PE 汇总 agg 2026-10-23 |
| 宏观日频（dxy/gold/silver/wti/kre） | 2026-10-21 / 10-19 | 2026-10-23 | `macro-collected.json`，warnings 空 |
| 中国融资指标（marginGdp/marginMcap） | 2026-10-20 | 2026-10-22 | 同上（两融为 T+1 披露，10-23 数据尚未发布） |
| 港股回撤/12 个月（hsiDd/hsi12m） | 2026-10-18 | 已刷新 | 同上 |
| 每日分析归档 | 最新 2026-10-22 | 新增 2026-10-23（24 期） | `public/data/daily-analysis.json` |
| 国家队 ETF 报价（55 只） | 2026-10-19 | 2026-10-23 | `etf-quotes.json`（55/55 返回） |
| 未来趋势研究索引 | 2026-10-09 目录 + 10-12/13 价 | 625 条更新至 10-22/10-23 | `future-trends-2026-10-09/companies/*` |
| 固态电池上市报价 | 2026-10-12/13 | 68 条更新至 10-22/10-23 | `src/data/solidState/mcpSnapshot.json` |
| 林奇 PE（1,517 条） | 2026-10-12/13 | 随四市场报价更新 | `public/data/lynch.json` |

采集量：universe 1540 条页面记录（us 504 / cn 832 / hk 127 / adr 67 / ndx 10），证券清单 1872 个代码；Yahoo 匿名会话 1861/1872 返回、0 错误；MCP `quotes` 1824/1824、`quotes-etf` 55/55；规范化覆盖 1540/1540 条记录。

派生重算：港股估值初稿 127 家（回避 5 / 条件关注 18 / 观察 104）；ADR 估值初稿 66 家（回避 5 / 条件关注 8 / 观察 53）；信号台账 `public/data/signal-ledger-2026.json` 写入 2026-10-23 期（1553 证券、1540 有评级、雷达 79）。

### 报价时间、旧模型与特殊证券

- 每条记录保留真实报价时间与核验时间；本轮目录日期只作存档标识，不能替代行情日。
- 盈利输入仍冻结在 2026-10-20，情景价与评级按新价重算；新报价不认证旧模型。
- 未来趋势 26 个非独立上市/待核对象保留「旧目录价截至 2026-10-07；本次未取得可核实时点行情」，未造报价。
- 固态 68 条有效上市报价更新；旧北交所占位代码仍拒绝采用。
- 601059 / 601198 换股流程报价只作历史参考，不认证当日成交或可交易性。

## 自动化观察（阻塞项）

`origin/main` 上四市场报价自 10-20（US/ADR 10-19）起停滞，而每日分析（10-21、10-22）、DCF 预填、周期复盘仍持续提交——即 `company-refresh.yml` 的行情步骤自 10-20 起没有产出可提交的新值。`gh` 未登录，无法查看远端工作流运行日志，根因待查。

工作流顺序为「应用行情 → 重算覆盖层 → 写信号台账 → `npx vitest run src/data` → 提交发布」，测试失败即不提交。本轮实测到 4 处与价格强耦合的断言会在价格漂移后让该验证步骤失败（港股股息率法用现价反查冻结供应商股息率、ADR 盈亏比用已四舍五入的展示价复算、估值刷新用例硬编码评级样本、研究笔记用例硬编码样本公司），已改为按规则与当前数据自适应；这些断言原先在 10-20 的价格上恰好通过，因此不排除它们正是自动刷新停滞的直接原因。

## 仍需跟踪的缺口

| 缺口 | 状态 | 下一入口 |
| --- | --- | --- |
| 远端 `company-refresh.yml` 行情步骤无产出 | 待核 | gh 登录后查看 10-21/10-22 运行日志；必要时给工作流补 `SSL_CERT_FILE` |
| 国家队 ETF 持有人报告期 | 采集失败 | `npm run national-team:etf` 本机失败：东方财富 ETF 清单 HTTP 502，回退上交所/深交所 ECONNRESET；价格已更新，持有人结构未重新核验 |
| 国家队实名榜单 | 仍停 2025-12-31 | 对照基金原件；匿名 2026H1 结构不能推算实名份额 |
| 逐公司一手财报与估值模型重估 | 未做 | 公司 IR/巨潮/港交所/SEC 取原件；不在本轮范围 |
| 林奇分类/增速/护城河证据日期 | 未知 | 补来源与可复现生成入口 |
| `public/data/company-valuations/*.json` 内置价格 | 口径不一致 | 文件 asOf 标 2026-10-22，内置价格仍是 10-19/10-20；页面已用行情快照新价覆盖，但记录内 `comparison` 未重算，需重跑 `scripts/build-company-valuations-*.py` |
| Notion 私人笔记、书籍 PDF、私人记录 | 未检查 | 范围外，需用户授权 |
| 远端部署状态 | 未核验 | gh 未登录，本轮只完成本地提交与推送 |

## 来源、明细与复用

- 原始证据：`public/research/data-refresh-2026-10-23/`（`tencent-quotes.json`、`yahoo-quote-batch.json`、`etf-quotes.json`、`normalization-summary.json`、`company-json-results.json`）。
- 公司价格明细：`docs/research/company-price-audit-2026-10-23.csv`，1299 条（us 294 / cn 811 / hk 127 / adr 67），含 `price`、`priceDate`、`priceCheckedAt`、`priceSource`、`quoteDateKind`、`tradability`。
- 盘点报告：`docs/research/data-freshness-audit-2026-10-23.md`。
- 2026-10-13 的盘点与价格明细保留为更新前证据，未覆盖。

## 验证

```
npx vitest run                      → 203 个文件、1311 个测试通过
npm run typecheck                   → 8 个 tsconfig 全部通过
npm run lint                        → 0 error（25 条既有 warning，与本轮无关）
```

抽查：`public/data/us.json` 中 `marketRefresh.priceDate` 全部为 2026-10-22，`cn.json`/`hk.json` 全部为 2026-10-23，`adr.json` 全部为 2026-10-22，无旧日期残留、无空值。

独立复核（Antigravity CLI，经 Orca 派工，报告见 `.dev-team/runs/data-refresh-2026-10-23/reports/cross-review.md`）：全量比对 1,299 条记录与原始证据，价格／行情日／核验时间零不一致；无价格日期倒退、无缺价填 0、研究日期与财报披露日 100% 冻结；601059／601198 仍为 `tradability=unverified`；未来趋势 26 个待核对象与固态旧占位代码均未造报价；快照层与四市场 JSON、港股／ADR 覆盖层 100% 一致；台账 32 个单元的 `last_checked`／`next_review`／`status` 自洽。复核提出的唯一缺陷（价格明细 CSV 导出取错属性名导致核验时间与来源两列为空）已按实际字段 `checkedAt`／`source` 重新导出，1,299 行全部补齐。
