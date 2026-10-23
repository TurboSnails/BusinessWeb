# 2026-10-23 行情层过期数据刷新设计

执行日期：2026-10-23（Asia/Yerevan，UTC+4；执行时北京时间 15:2x，A 股/港股已收盘，美股最新可得交易日为 10-22）
范围：行情层全量刷新 + 新一轮数据新鲜度盘点与台账更新。不重估基本面模型，不改研究结论。

## 1. 背景与问题

`docs/data-maintenance.csv` 的全部 30 行 `last_checked` 停在 2026-10-13，`next_review` 为 2026-10-14 / 2026-10-19，已全部过期。实测过期情况：

| 数据组 | 现状 | 应达 |
| --- | --- | --- |
| 美股公司报价（`public/data/us.json`，294 条） | `priceDate=2026-10-19` | 2026-10-22 |
| A 股公司报价（`public/data/cn.json`，811 条） | `priceDate=2026-10-20` | 2026-10-23 |
| 港股公司报价（`public/data/hk.json`，127 条） | `priceDate=2026-10-20` | 2026-10-23 |
| ADR 报价（`public/data/adr.json`，67 条） | `priceDate=2026-10-19` | 2026-10-22 |
| 美股指数（ndx/sox/spx/rsp/rut） | `2026-10-19` | 2026-10-22 |
| A 股/港股指数 | `2026-10-20` | 2026-10-23 |
| 每日分析归档 | 最新 `2026-10-21`（23 期） | 补 10-22、10-23 |
| 宏观日频（dxy/gold/silver/wti 等） | `2026-10-21` | 2026-10-23 |
| 国家队 ETF 报价 | `2026-10-19` | 2026-10-23 |

关键判断：不只是本地落后。`origin/main` 上四市场报价同样停在 10-19 / 10-20，每日分析最新也是 10-21，说明 GitHub Actions 的每日刷新（`company-refresh.yml` 18:40 北京时间、`daily-analysis-snapshot.yml` 15:35/17:10）自 10-19/20 起没有再产出可提交的新值。`gh` CLI 未登录，无法核实远端工作流运行状态，只能从仓库内容推断。因此本轮不能依赖远端 bot 补齐，必须本地手动全量刷新。

## 2. 目标

1. 把四市场公司报价、指数价格、宏观日频、每日分析、国家队 ETF 报价推进到各市场**实际最新交易日**。
2. 重算所有由价格派生的字段（PE/股息率/赔率/情景相对现价/估值初稿评级/信号台账），保持页面与数据文件一致。
3. 产出 2026-10-23 的新鲜度盘点报告与公司价格明细，重写 `docs/data-maintenance.csv` 的状态、`last_checked`、`latest_data_date`、`next_review`。
4. 不改研究模型、评级规则、财报期末与披露日；不编造缺失数据。

## 3. 非目标

- 不做逐公司基本面/财报/估值重估（属下一轮 `FINANCIAL-01` / `COMPANY-05` 的「模型待重估」项）。
- 不恢复已撤回的 PEP 盈利模型，不复活旧排序买点与胜率。
- 不重新出版书籍 PDF，不改 Notion 私人记录，不触碰 `src/features/human3/`、`src/components/life/`、`src/pages/{HumanLifePlan,PersonalLifeAnalysis}.tsx` 等未完成的在途改动。
- 不推送未经用户确认的第三方数据改动以外的内容；发布动作按项目既有流程（推送 main 触发 Pages 工作流）。

## 4. 执行方案

采用**方案 A：把 GitHub Actions 的每日流水线复刻到本地**，与线上自动化保持同一口径与同一目录约定：

```
universe → macro → indexes → yahoo-quotes → MCP quotes / quotes-etf
        → normalize-market-refresh.py → apply-companies → slim-refresh-evidence
        → 重跑 hk/adr 估值初稿评级 → signal-ledger → vitest src/data
```

另按台账入口补：每日分析（今日 + 10-22 补档）、国家队 ETF 报价、未来趋势/固态报价同步。

未选方案 B（只补最影响用户的四组）：会把国家队、未来趋势、固态、台账继续留在旧日期，下一轮仍要补。未选方案 C（等远端 bot）：已实证 bot 自 10-19/20 起无产出。

### 4.1 顺序与依赖

1. `git stash push -u` 保护在途的 human3/life 改动（远端 13 个提交未触碰这些文件，pop 无冲突风险）。
2. `git pull --rebase` 同步远端 13 个提交（远端含 10-22/10-23 的 DCF 预填、周期复盘、ETF 技术面）。
3. 采集（只写入 `public/research/data-refresh-2026-10-23/`）：
   - `node scripts/collect-market-refresh.mjs universe 2026-10-23` → 公司范围与证券清单
   - `node scripts/collect-market-refresh.mjs macro 2026-10-23`、`indexes 2026-10-23`
   - `node scripts/collect-market-refresh.mjs yahoo-quotes 2026-10-23`（Yahoo 匿名会话）
   - `uvx --python 3.12 --from yfinance-mcp-server==1.0.4 python scripts/collect-market-mcp.py --date 2026-10-23 --mode probe`（连通性与工具清单）
   - 同环境 `--mode quotes`（腾讯延迟行情 + Yahoo 报价）与 `--mode quotes-etf`（ETF 报价）
   - `npm run daily-analysis:update`（今日收盘归档）、`npm run daily-analysis:backfill`（10-22 补档）
   - `npm run national-team:etf`
4. 规范化与应用：
   - `python3 scripts/normalize-market-refresh.py --date 2026-10-23 --dry-run` 先看变更清单，再实跑
   - `node scripts/collect-market-refresh.mjs apply-companies 2026-10-23`
   - `node scripts/slim-refresh-evidence.mjs 2026-10-23`
5. 派生重算：`python3 scripts/review-hk-valuation-2026-10-20.py`、`python3 scripts/review-adr-valuation-2026-10-20.py`（盈利冻结、价格取新快照、评级按规则重算）、`node scripts/signal-ledger.mjs 2026-10-23`。
6. 测试夹具同步：`adrResearch` / `hkResearch` / `solidState` 测试里锁定的价格锚点日期与样例价格按本轮真实值更新。
7. 验收：`npx vitest run src/data`、`npm run typecheck`、`npm run lint`，并抽查最终页面价格与日期。
8. 留痕：写 `docs/research/data-freshness-audit-2026-10-23.md`（盘点）、`docs/research/data-refresh-2026-10-23.md`（本轮结果、真实数据日期、剩余缺口），更新 `docs/data-maintenance.csv` 与 `docs/data-maintenance.md` 的索引与状态描述。
9. 提交与推送：只提交本轮数据/台账/报告/文档文件（绝不纳入 human3/life 在途改动），本地 commit 后同步远端并 push。

### 4.2 分工

| 角色 | 执行者 | 范围 |
| --- | --- | --- |
| manager / 主执行 | 当前会话（OpenCode MiniMax-M3） | 采集 → 规范化 → 应用 → 派生重算 → 验收 → 报告 |
| 独立交叉复核 | **Antigravity CLI（`agy` 1.4.2，经 Orca 派工）** | 只读复核原始证据与已应用结果的一致性；独立评审盘点报告与 CSV 台账 |
| 第二视角（可选） | Codex / Kimi | 抽样复核不同市场的报价日期与口径 |

写入范围不重叠：Antigravity 只写 `.dev-team/runs/<id>/reports/`，不改 `public/`、`src/`、`docs/` 正式文件。

## 5. 数据口径不变量

1. **行情日不得倒退**：新报价日期必须 ≥ 原值；源返回更早日期视为失败，保留旧值。
2. **生成日 ≠ 行情日**：每条记录保留真实报价时间/行情日与核验时间，目录日期只作存档标识。
3. **缺价保留缺失**：不填 0、不用旧值伪装新值、不给未上市/待核对象造报价。
4. **研究日期独立**：财报期末、披露日、研究日期、情景假设不因新报价被改写；新报价不认证旧模型。
5. **受限证券**：601059 / 601198 换股流程报价只作历史参考，不认证当日成交或可交易性。
6. **派生字段顺序**：源/输入 → 结构化索引与 JSON → 手工详情覆盖层 → 情景与赔率 → 报告网页/导出/统计元数据，逐层同步。
7. **规则不变**：评级跳变、股息率法等既有方法不因本轮改动；本轮只换价格输入。

## 6. 风险与兜底

| 风险 | 证据 | 兜底 |
| --- | --- | --- |
| uvx 的 Python 无系统根证书，腾讯行情全量 `CERTIFICATE_VERIFY_FAILED` | `docs/data-maintenance.md` 2026-10-20 经验 | 执行前设置 `SSL_CERT_FILE=$(uvx --python 3.12 --from yfinance-mcp-server==1.0.4 python -c "import certifi;print(certifi.where())")`；仍失败则用项目已有的 node 采集路径（东财/雅虎）取同一批报价写入兼容格式 |
| Yahoo 匿名会话偶发失败 | `company-refresh.yml` 注释 | 保留空文件并记录失败，让腾讯/东财兜底，不把空返回当数据 |
| 远端 bot 与本轮提交冲突 | 远端每天自动提交 DCF 预填/周期复盘 | 推送前 `git pull --rebase`（数据文件冲突沿用工作流的 `-X theirs` 策略），推送失败重试 3 次 |
| 刷新导致测试夹具断言失败 | 文档记载 `adrResearch`/`hkResearch`/`solidState` 锁定价格锚点 | 按本轮真实值更新夹具，不放宽断言 |
| `gh` 未登录，无法核实远端工作流状态 | `gh auth status` 无登录 | 报告里单列「未核验远端运行/部署状态」，不声称线上已更新 |
| 工作区存在在途的 human3/life 改动 | `git status` | 全程 `stash -u` 隔离，提交时只 `git add` 本轮路径，绝不混入 |

## 7. 验收标准

1. 四市场 `priceDate` 推进到各市场实际最新交易日，且不出现倒退或空值。
2. 每日分析新增 10-22、10-23 两期，`session=closed`，缺失字段仍标缺失。
3. 指数 10 项价格、宏观日频系列推进到最新观测日；源无新观测的保留原日期并写明原因。
4. 港股/ADR 估值初稿评级按新价重算，页面「相对现价」与现价一致。
5. `npx vitest run src/data`、`npm run typecheck`、`npm run lint` 全部通过。
6. 新增两份 2026-10-23 日期报告；`docs/data-maintenance.csv` 每行状态、`last_checked`、`latest_data_date`、`next_review` 与实际一致；`docs/data-maintenance.md` 的索引与状态描述同步更新。
7. 提交只含本轮范围文件；push 成功且远端 `main` 包含本轮提交。

## 8. 已知遗留（不在本轮范围）

- 远端自动刷新的失效根因未定位（本轮只能确认「自 10-19/20 起无新产出」）；需要 `gh` 登录后查看 Actions 运行记录。
- 国家队实名榜单仍停在 2025-12-31、林奇分类日期未知、PEP 之外的旧模型待重估等，按台账 P1/P2 留在后续轮次。
- `npm run test:functions` 存在既有 TS5096 配置冲突（与本轮无关），本轮只在必要时记录。
