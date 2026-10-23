# 行情层过期数据刷新（2026-10-23）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把站点四市场公司报价、指数、宏观、每日分析、国家队 ETF 报价推进到各市场实际最新交易日，并重算价格派生字段、产出 2026-10-23 盘点报告与台账。

**Architecture:** 复用仓库既有采集/规范化/应用流水线（`collect-market-refresh.mjs` → `collect-market-mcp.py` → `normalize-market-refresh.py` → `apply-companies`），与 GitHub Actions `company-refresh.yml` 同一口径、同一存档目录约定 `public/research/data-refresh-2026-10-23/`。manager 负责主执行与派生重算；Antigravity CLI（`agy`）经 Orca 派独立只读 Task 做证据复核与报告评审。

**Tech Stack:** Node 24、Python 3.12（`uvx` + `yfinance-mcp-server==1.0.4`）、Vitest、TypeScript、AkShare/Tencent/Yahoo 公开行情。

**设计文档：** `docs/superpowers/specs/2026-10-23-data-refresh-design.md`

## Global Constraints

- 行情日不得倒退；缺价保留缺失，不填 0，不造报价。
- 生成日 ≠ 行情日：每条记录保留真实报价时间/行情日与核验时间。
- 新报价不认证旧模型：财报期末、披露日、研究日期、情景假设、评级规则本轮不改。
- 受限证券 601059 / 601198 报价只作历史参考，不认证当日成交或可交易性。
- 派生顺序固定：源/输入 → 结构化索引与 JSON → 手工详情覆盖层 → 情景与赔率 → 报告网页/导出/统计元数据。
- 不触碰在途的 human3/life 改动（`src/features/human3/`、`src/components/life/`、`src/pages/{HumanLifePlan,PersonalLifeAnalysis}.tsx`、`src/content/human3-*`、`docs/human3-interview.md`、`scripts/encrypt-life-report.mjs`、`.impeccable/`）。
- 本轮日期常量统一为 `2026-10-23`；市场最新可得交易日为 US 2026-10-22、CN/HK 2026-10-23。
- 提交只 `git add` 本轮路径；推送前 `git pull --rebase`，数据文件冲突沿用工作流 `-X theirs` 策略，最多重试 3 次。

---

### Task 1: 隔离在途改动并同步远端

**Files:**
- Modify: 工作树状态（不产生提交内容）

**Interfaces:**
- Consumes: 远端 `origin/main`（本地落后 13 个提交）
- Produces: 干净工作树 + 与远端同步的 `main`，供后续采集基于最新代码运行

- [ ] **Step 1: 暂存全部在途改动（含未跟踪文件）**

```bash
git stash push -u -m "wip-human3-life-2026-10-23"
```

Expected: `Saved working directory and index state WIP on main: 074e670 ...`，`git status --short` 为空。

- [ ] **Step 2: 同步远端提交**

```bash
git pull --rebase
```

Expected: `Successfully rebased and updated refs/heads/main.`；`git rev-list --left-right --count main...origin/main` 输出 `0	0`。

- [ ] **Step 3: 确认基线干净**

```bash
git status --short && git log --oneline -3
```

Expected: 无输出（工作树干净），日志首条为远端的 `data(dcf): 预填库 2026-10-23` 一类提交。

---

### Task 2: 采集公司范围与证券清单

**Files:**
- Create: `public/research/data-refresh-2026-10-23/company-universe.json`
- Create: `public/research/data-refresh-2026-10-23/universe-symbols.json`

**Interfaces:**
- Consumes: `src/data/companies.ts` 的 `loadCompanies()`（us/cn/hk/adr/ndx）
- Produces: `universe-symbols.json`（Yahoo/腾讯可用代码清单），被 Task 4 的 `quotes` 模式消费

- [ ] **Step 1: 生成公司范围与证券清单**

```bash
node scripts/collect-market-refresh.mjs universe 2026-10-23
```

Expected: 输出 `{"kind":"universe","total":<约1540+ndx>,"markets":{...}}`；生成 `company-universe.json` 与 `universe-symbols.json` 两个文件。

- [ ] **Step 2: 校验清单规模**

```bash
node -e 'const s=require("./public/research/data-refresh-2026-10-23/universe-symbols.json");console.log(s.length, s.slice(0,3), s.filter(x=>x.endsWith(".SS")).length)'
```

Expected: 首个数字在 1200–2000 区间；存在 `.SS`/`.SZ`/`.HK` 后缀代码。

---

### Task 3: 采集宏观与指数

**Files:**
- Create: `public/research/data-refresh-2026-10-23/macro-collected.json`
- Create: `public/research/data-refresh-2026-10-23/indexes-collected.json`

**Interfaces:**
- Consumes: `server/macro.mjs` 的 `buildSnapshots()`、`server/indexes.mjs` 的 `buildIndexSnapshot()`
- Produces: 待 Task 4 应用层消费的宏观/指数新值（含每项 `latest.date` 与 `warnings`）

- [ ] **Step 1: 采集宏观**

```bash
node scripts/collect-market-refresh.mjs macro 2026-10-23
```

Expected: 输出 `{"kind":"macro","warnings":[...],"latest":{...}}`；日频项（dxy/gold/silver/wti）日期应为 2026-10-23，宏观 `warnings` 中失败项逐条可见。

- [ ] **Step 2: 采集指数**

```bash
node scripts/collect-market-refresh.mjs indexes 2026-10-23
```

Expected: 输出 `{"kind":"indexes","warnings":[...],"latest":{...}}`；US 五项（ndx/sox/spx/rsp/rut）应为 2026-10-22，A 股/港股五项应为 2026-10-23。

- [ ] **Step 3: 记录源失败项**

若 `warnings` 非空，逐条记入本轮报告的「采集失败/源无新观测」清单，不得用生成日期替代。

---

### Task 4: 采集 Yahoo、MCP 报价与 ETF 报价

**Files:**
- Create: `public/research/data-refresh-2026-10-23/yahoo-quote-batch.json`
- Create: `public/research/data-refresh-2026-10-23/tencent-quotes.json`
- Create: `public/research/data-refresh-2026-10-23/etf-quotes.json`

**Interfaces:**
- Consumes: `universe-symbols.json`（Task 2）、`../.agents/mcp/yfinance_server.py`
- Produces: 三份报价原始证据，被 Task 5 的 `normalize-market-refresh.py` 读取

- [ ] **Step 1: 预设根证书（uvx 的 Python 无系统根证书会导致腾讯行情全量失败）**

```bash
export SSL_CERT_FILE=$(uvx --python 3.12 --from yfinance-mcp-server==1.0.4 python -c "import certifi;print(certifi.where())")
echo "$SSL_CERT_FILE"
```

Expected: 打印一个 `.pem` 路径且非空。

- [ ] **Step 2: 探针确认 MCP 可用（2026-10-20 曾因启动器缺失无法运行）**

```bash
uvx --python 3.12 --from yfinance-mcp-server==1.0.4 python scripts/collect-market-mcp.py --date 2026-10-23 --mode probe
```

Expected: 打印 `{"server":"yfinance","tools":[...]}` 与 `{"server":"akshare","tools":[...]}`；无 `error` 字段。若报找不到 `../.agents/mcp/yfinance_server.py`，说明启动器路径仍缺失，改用 `--mode quotes` 单独验证并在报告中记录。

- [ ] **Step 3: 采集 Yahoo 匿名会话报价**

```bash
node scripts/collect-market-refresh.mjs yahoo-quotes 2026-10-23
```

Expected: `{"kind":"yahoo-quotes","requested":N,"quotes":M,"errors":K}`，M 接近 N、K 为 0 或少量。若报 `Yahoo anonymous session`，保留空文件并让腾讯/东财兜底（不把空返回当数据）。

- [ ] **Step 4: 采集腾讯/Yahoo 报价**

```bash
uvx --python 3.12 --from yfinance-mcp-server==1.0.4 python scripts/collect-market-mcp.py --date 2026-10-23 --mode quotes | tail -c 400
```

Expected: 生成 `tencent-quotes.json`，`quotes` 覆盖 CN/HK 标的且各条含 `price`/`marketTime`；`missing` 列出未取到的代码。

- [ ] **Step 5: 采集 ETF 报价**

```bash
uvx --python 3.12 --from yfinance-mcp-server==1.0.4 python scripts/collect-market-mcp.py --date 2026-10-23 --mode quotes-etf | tail -c 400
```

Expected: 生成 `etf-quotes.json`，含国家队 55 只 ETF 及 ETF 列表报价与各自 `marketTime`。

- [ ] **Step 6: 核对行情日不倒退**

```bash
node -e '
const fs=require("fs");const d="public/research/data-refresh-2026-10-23";
const t=JSON.parse(fs.readFileSync(d+"/tencent-quotes.json"));
const dates={};for(const [k,v] of Object.entries(t.quotes??{})){const m=(v.marketTime??"").slice(0,10);dates[m]=(dates[m]??0)+1}
console.log("tencent dates",dates);console.log("missing",(t.missing??[]).length)'
```

Expected: 行情日集中在 2026-10-23（CN/HK）；`missing` 为 0 或仅限已知的停牌/受限标的。

---

### Task 5: 规范化并应用到公司 JSON

**Files:**
- Modify: `src/data/companyMarketSnapshot.json`
- Modify: `public/data/us.json`、`public/data/cn.json`、`public/data/hk.json`、`public/data/adr.json`、`public/data/lynch.json`
- Create: `public/research/data-refresh-2026-10-23/normalization-summary.json`
- Create: `public/research/data-refresh-2026-10-23/company-json-results.json`

**Interfaces:**
- Consumes: Task 2–4 的原始证据目录
- Produces: 带新 `priceDate`/`priceCheckedAt` 的四市场 JSON（页面与派生层的数据源）

- [ ] **Step 1: 干跑看变更清单**

```bash
python3 scripts/normalize-market-refresh.py --date 2026-10-23 --dry-run
```

Expected: 打印将要变更的字段与条数，不写任何文件。

- [ ] **Step 2: 实跑规范化**

```bash
python3 scripts/normalize-market-refresh.py --date 2026-10-23
```

Expected: 写出 `src/data/companyMarketSnapshot.json` 与 `public/data/lynch.json`，并打印变更摘要。

- [ ] **Step 3: 应用到四市场 JSON**

```bash
node scripts/collect-market-refresh.mjs apply-companies 2026-10-23
```

Expected: `{"kind":"apply-companies","results":{"us":{"total":294,"changed":N,...},"cn":{...},"hk":{...},"adr":{...}}}`；各市场 `quoteDates` 为单一新日期。

- [ ] **Step 4: 验证价格日期已推进且无倒退**

```bash
node -e '
const fs=require("fs");for(const m of ["us","cn","hk","adr"]){const r=JSON.parse(fs.readFileSync(`public/data/${m}.json`));const c={};for(const x of r){const d=x.marketRefresh?.priceDate??"none";c[d]=(c[d]??0)+1}console.log(m,r.length,JSON.stringify(c))}'
```

Expected: us/adr 为 `2026-10-22`，cn/hk 为 `2026-10-23`；不存在旧日期残留或 `none`。

- [ ] **Step 5: 精简证据目录**

```bash
node scripts/slim-refresh-evidence.mjs 2026-10-23
```

Expected: 证据目录体积下降，保留 `price`/`marketTime`/`retrievedAt` 等关键字段。

---

### Task 6: 重算价格派生字段（估值初稿评级 + 信号台账）

**Files:**
- Modify: `src/data/details/hkValuation.ts`、`src/data/details/adrValuation.ts`
- Create/Modify: `public/data/signal-ledger-*.json`
- Create: `public/research/hk-valuation-2026-10-20/…`、`public/research/adr-valuation-2026-10-20/…`（脚本自写）

**Interfaces:**
- Consumes: Task 5 生成的 `companyMarketSnapshot.json` 新价
- Produces: 按新价重算的港股/ADR 评级覆盖层与信号台账

- [ ] **Step 1: 重跑港股估值初稿（盈利冻结、价取新快照）**

```bash
python3 scripts/review-hk-valuation-2026-10-20.py | tail -1
```

Expected: 末行输出统计摘要（如 `127` 家、评级分布）；`src/data/details/hkValuation.ts` 的 `rt:` 行随新价变化。

- [ ] **Step 2: 重跑 ADR 估值初稿**

```bash
python3 scripts/review-adr-valuation-2026-10-20.py | tail -1
```

Expected: 末行输出 66 家统计摘要；`src/data/details/adrValuation.ts` 更新。

- [ ] **Step 3: 写信号台账**

```bash
node scripts/signal-ledger.mjs 2026-10-23
```

Expected: 写出或覆盖 `public/data/signal-ledger-2026-10-19.json`（本周同一周内覆盖先前一期，符合文档「同一周以后写入的覆盖先前的」规则）。

- [ ] **Step 4: 数据层测试**

```bash
npx vitest run src/data
```

Expected: 全部通过；若 `hkValuation.test.ts` / `adrValuation.test.ts` 因价格断言失败，转 Task 8 处理。

---

### Task 7: 每日分析与国家队 ETF

**Files:**
- Modify: `public/data/daily-analysis.json`
- Modify: `public/data/national-team/etf.json`（若采集成功）

**Interfaces:**
- Consumes: 腾讯/东财/新浪公开接口
- Produces: 补齐 10-22、10-23 的每日分析归档；国家队 ETF 最新报价

- [ ] **Step 1: 归档今日（2026-10-23）收盘**

```bash
npm run daily-analysis:update
```

Expected: 追加一条 `dataDate=2026-10-23`、`session=closed` 的快照；若脚本报「未到收盘时间」或源未就绪，记录失败原因，不手工写入。

- [ ] **Step 2: 回补 10-22（及最近缺口）**

```bash
node scripts/daily-analysis-backfill.mjs 5
```

Expected: 输出 `{"added":["2026-10-22",...],"skipped":[...]}`；已存在日期不覆盖。若报「sh000001 日 K 线为空」，记录为源失败，不伪造快照。

- [ ] **Step 3: 校验归档连续性**

```bash
node -e 'const j=require("./public/data/daily-analysis.json");console.log(j.snapshots.length, j.snapshots.slice(0,4).map(s=>s.dataDate+" "+s.session).join(" | "))'
```

Expected: 期数由 23 增至 25 附近；最近两期为 `2026-10-23 closed` 与 `2026-10-22 closed`。

- [ ] **Step 4: 国家队 ETF 快照**

```bash
npm run national-team:etf
```

Expected: 更新 `public/data/national-team/etf.json` 报价日期。已知风险：2026-10-23 本机试跑出现「东方财富 ETF 清单 HTTP 502」并回退上交所/深交所后 `ECONNRESET`；若再次失败，保留原报价日期并在报告中记为采集失败，不手改日期。

---

### Task 8: 同步被价格变化影响的测试夹具

**Files:**
- Modify: `src/data/hkResearch.test.ts`、`src/data/adrResearch.test.ts`、`src/data/solidState/*.test.ts`（以实际失败项为准）
- Modify: `src/data/companyMarketRefresh.test.ts`（仅在断言锁定真实报价时）

**Interfaces:**
- Consumes: Task 5–6 生成的新价与新日期
- Produces: 与本轮真实值一致的夹具，断言不放宽

- [ ] **Step 1: 跑出失败清单**

```bash
npx vitest run src/data src/features/dcf 2>&1 | tail -40
```

Expected: 列出因价格/日期变化而失败的用例及期望值与实际值差异。

- [ ] **Step 2: 逐项把夹具改成本轮真实值**

规则：只更新「期望值」为 Task 5–6 产出的真实报价与真实日期；不改断言语义、不把 `stale` 断言放宽、不删除用例。

- [ ] **Step 3: 重跑确认通过**

```bash
npx vitest run src/data src/features/dcf
```

Expected: 全部通过。

---

### Task 9: 验收

**Files:**
- 无新增（验证）

**Interfaces:**
- Consumes: Task 2–8 的全部产物
- Produces: 可复核的验证证据

- [ ] **Step 1: 数据层测试**

```bash
npx vitest run src/data
```

Expected: 通过。

- [ ] **Step 2: 类型检查**

```bash
npm run typecheck
```

Expected: 8 个 tsconfig 全部无错误。

- [ ] **Step 3: 代码规范检查**

```bash
npm run lint
```

Expected: 无 error。

- [ ] **Step 4: 抽查最终页面数据一致性**

```bash
node -e '
const fs=require("fs");
const us=JSON.parse(fs.readFileSync("public/data/us.json"));
const cn=JSON.parse(fs.readFileSync("public/data/cn.json"));
const sample=(r)=>r.filter(x=>x.marketRefresh?.priceDate).slice(0,3).map(x=>`${x.code} ${x.marketRefresh.price} ${x.marketRefresh.priceDate} ${x.marketRefresh.priceSource}`);
console.log("us:",sample(us).join(" | "));console.log("cn:",sample(cn).join(" | "))'
```

Expected: 抽查记录的 `priceDate` 与 Task 5 一致，`priceSource` 指向 `research/data-refresh-2026-10-23/...`。

---

### Task 10: 盘点报告与台账更新

**Files:**
- Create: `docs/research/data-freshness-audit-2026-10-23.md`
- Create: `docs/research/data-refresh-2026-10-23.md`
- Create: `docs/research/company-price-audit-2026-10-23.csv`
- Modify: `docs/data-maintenance.csv`
- Modify: `docs/data-maintenance.md`

**Interfaces:**
- Consumes: Task 2–9 的日期、变更数、失败清单
- Produces: 台账权威状态与可复核留痕

- [ ] **Step 1: 导出公司价格明细 CSV**

```bash
node -e '
const fs=require("fs");
const rows=[];
for(const m of ["us","cn","hk","adr"]){for(const c of JSON.parse(fs.readFileSync(`public/data/${m}.json`))){const q=c.marketRefresh??{};rows.push([m,c.code,c.name??"",q.price??"",q.priceDate??"",q.priceCheckedAt??"",q.priceSource??"",q.status??""].join(","))}}
fs.writeFileSync("docs/research/company-price-audit-2026-10-23.csv","market,code,name,price,priceDate,priceCheckedAt,priceSource,status\n"+rows.join("\n")+"\n")'
```

Expected: CSV 行数约 1299（294+811+127+67），首行含表头。

- [ ] **Step 2: 写盘点报告 `data-freshness-audit-2026-10-23.md`**

结构与 `docs/research/data-freshness-audit-2026-10-13.md` 对齐：按台账分组列出「已超期／待刷新／待核／等待披露／按计划维护／历史归档」清单，每项写明字段级数据日期、判断依据与本轮动作；明确列出未核验范围（远端 Actions 运行状态、Notion 原笔记、私人记录、PDF 出版物）。

- [ ] **Step 3: 写更新结果报告 `data-refresh-2026-10-23.md`**

内容：本轮真实行情日（US 10-22、CN/HK 10-23）、变更条数、派生重算结果、采集失败与源无新观测清单、剩余缺口（国家队实名榜单、林奇分类日期、PEP 之外旧模型等）、验证命令与输出摘要。

- [ ] **Step 4: 更新 `docs/data-maintenance.csv`**

逐行更新 `last_checked=2026-10-23`、`latest_data_date` 写本轮真实数据日期、`next_review` 按各组频率推进（每开市日组 → 2026-10-26，周频组 → 2026-10-26，月频组 → 2026-11-08，历史归档组不动）、`status` 写本轮真实状态。不得整表统一改日期。

- [ ] **Step 5: 更新 `docs/data-maintenance.md`**

顶部盘点日期改为 2026-10-23，索引指向两份新报告与新 CSV，保留 10-13/10-20 报告为历史证据；刷新「2026-10-13 刷新后状态」为「2026-10-23 刷新后状态」。

---

### Task 11: Antigravity 独立交叉复核（Orca 派工）

**Files:**
- Create: `.dev-team/runs/data-refresh-2026-10-23/reports/cross-review.md`（agy 写入）

**Interfaces:**
- Consumes: `public/research/data-refresh-2026-10-23/` 原始证据、四市场 JSON、Task 10 的两份报告与 CSV 台账
- Produces: 独立复核结论与不一致清单

- [ ] **Step 1: 派工**

用 `dev-team` 的 Orca 流程创建 Run 与 Task，把 `agy`（Antigravity CLI 1.4.2）指派为只读复核者，任务说明写明：
- 只读比对 `public/research/data-refresh-2026-10-23/` 证据与 `public/data/{us,cn,hk,adr}.json` 的 `marketRefresh` 字段；
- 抽查至少 20 条记录（覆盖四市场各 5 条），核对 `price`、`priceDate`、`priceCheckedAt`、`priceSource`；
- 检查是否存在日期倒退、缺价填 0、研究日期被改写、受限证券被当作可交易；
- 独立评审 `docs/research/data-freshness-audit-2026-10-23.md`、`docs/research/data-refresh-2026-10-23.md` 与 `docs/data-maintenance.csv` 的状态描述是否与实际数据一致；
- 输出写入 `.dev-team/runs/data-refresh-2026-10-23/reports/cross-review.md`，不改 `public/`、`src/`、`docs/` 正式文件。

- [ ] **Step 2: 等待并接收结论**

用 `orchestration check --run <run_id> --wait --types "worker_done,escalation,question" --timeout-ms 30000 --json` 协调；回答 worker 的问题；超时只表示继续等待。

- [ ] **Step 3: 处理发现**

复核提出的每一项，按「真实问题／误报」分类：真实问题在本轮修正并重跑相关验证；误报在报告的复核结论里记录理由。

---

### Task 12: 提交并推送

**Files:**
- Commit: 本轮全部产物路径

**Interfaces:**
- Consumes: Task 2–11 的全部产物
- Produces: 远端 `main` 上的本轮提交

- [ ] **Step 1: 检查工作树范围**

```bash
git status --short
```

Expected: 只有本轮数据/台账/报告路径变化；不得出现 `src/features/human3/`、`src/components/life/`、`src/pages/HumanLifePlan.tsx` 等在途路径。

- [ ] **Step 2: 只暂存本轮路径**

```bash
git add public/data public/research src/data docs/data-maintenance.csv docs/data-maintenance.md docs/research .dev-team
git status --short
```

Expected: 暂存区仅含本轮文件。

- [ ] **Step 3: 提交**

```bash
git commit -m "data(refresh): 行情层过期数据刷新 2026-10-23"
```

- [ ] **Step 4: 同步远端并推送**

```bash
git pull --rebase -X theirs && git push
```

Expected: `git push` 成功；若因远端 bot 新提交而失败，重复 `git fetch origin main && git rebase -X theirs origin/main && git push`，最多 3 次。

- [ ] **Step 5: 确认远端已包含本轮提交**

```bash
git log --oneline -1 origin/main && git status -sb | head -2
```

Expected: `origin/main` 首条为本轮提交；本地分支与远端无落后。

- [ ] **Step 6: 恢复隔离的在途改动**

```bash
git stash pop
```

Expected: human3/life 改动回到工作区且保持未提交状态。

---

## Self-Review

1. **Spec 覆盖**：目标 1（行情推进）→ Task 2–5；目标 2（派生重算）→ Task 6；目标 3（盘点与台账）→ Task 10；目标 4（不改模型/不造数）→ Global Constraints + Task 10 报告；不变量 → Task 5 Step 4、Task 8 规则；风险兜底 → Task 4 Step 1/Step 3、Task 7 Step 4、Task 12 Step 4；验收 → Task 9；Antigravity → Task 11；提交推送 → Task 12。
2. **占位扫描**：无 TBD/TODO；每个步骤含确切命令与预期输出。
3. **命名一致**：`public/research/data-refresh-2026-10-23/`、`companyMarketSnapshot.json`、`marketRefresh.priceDate`、`data-freshness-audit-2026-10-23.md`、`data-refresh-2026-10-23.md` 在各任务间一致。
