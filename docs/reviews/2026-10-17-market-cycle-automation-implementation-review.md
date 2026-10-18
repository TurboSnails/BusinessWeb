# 牛熊周期自动化实现只读审查报告

- **审查日期**：2026-10-17
- **审查范围**：
  - `src/features/market-cycle/automation.ts`
  - `src/features/market-cycle/engine.ts`
  - `src/features/market-cycle/storage.ts`
  - `src/features/market-cycle/MarketCycleView.tsx`
  - `scripts/market-cycle-report.mjs`
  - `scripts/market-cycle-update.mjs`
  - `.github/workflows/market-cycle.yml`
- **未检查项**：
  - Kimi 独占的 breadth 完整抓取脚本（尚未交付）。
  - Claude 独占的 auto collector 外部网络真实接口拉取（遵循无网络隔离要求）。
  - 全量 1122 单元测试与完整构建（遵循避免干扰要求；已运行 market-cycle 专项 22 个 node 测试及 vitest 8 个前端测试，均 100% 通过）。

---

## 一、审查结论摘要

未发现阻止发布或导致系统崩溃的 **P1 级阻塞缺陷**。  
发现 **1 项 P2 级逻辑缺陷**（节假日周 K 线日期间隔非严格 7 天导致影子连续确认意外清零），以及各项核心设计约束的核实结果。

---

## 二、核实要点清单

### 1. 资金代理不冒充比例（已核实 · 正常）
- `automation.ts` 中 `find('financing_buy')` 抓取东财融资买入原值后，明确输出 `available: false` 与 `signal: 'missing'`，并在明细中注明“未核定同覆盖成交额分母，不计算杠杆占比、不计票”。
- `summarize()` 在计票时严格过滤 `r.available && r.signal !== 'missing'`，融资原值绝对值不计入有效票数，也不参与牛熊信号打分。
- 港股资金维度无自动数据时保持缺省，不使用无关指标冒充。

### 2. 自动优先、人工覆盖与日志冻结（已核实 · 正常）
- `engine.ts` 的 `evaluate()` 实现了三层回退逻辑：
  1. 若该维度在 `manualOnly` 列表中，强制采用人工补录（带“人工覆盖 ·”前缀）；若人工数据无效则安全回退为 missing 不计票。
  2. 若未指定人工覆盖，且自动化证据有效（`collected?.available`），优先采用自动数据。
  3. 若自动数据缺失或不合格，但有人工有效补录，采用人工数据（带“人工补缺 ·”前缀）。
  4. 两者皆无时，显示自动采集给出的缺失原因或人工补缺说明。
- 复盘保存（`saveReview`）时，将当时的 `rows`、`budget`、`observations` 以及原始 `inputs`（含 `snapshot`、`cn`、`us`、`automatic`、`breadth`、`manualOnly`）完整保存在 `ReviewLog` 中；历史复盘详情直接从保存的快照渲染，后续行情更新不会改写历史记录。

### 3. 缺失与过期不计票（已核实 · 正常）
- `factUsable()` 严格根据数据频率控制保鲜期（日频 14 天、周频 21 天、月频 75 天），且禁止未来时间戳（`observationDate <= asOf`，`availableAt` 与 `firstSeenAt` 不得晚于基准日）。
- 宽度门禁（`qualified`）要求 `observed`、成分覆盖率 ≥ 95%、有效成分比 ≥ 95%、数据时效 ≤ 14 天，未达标直接标为 `missing` 且 `available: false`。
- `summarize()` 统计有效票数 `valid`，不足 4 维时直接锁定为“等待证据”，影子规则锁定为“暂停提高风险”。

### 4. 影子连续两份完整不同周无重复确认（已核实 · 存在 P2 边界缺陷）
- **同周重跑保护**：`buildReport` 依据 `weekEnding` 对历史进行去重与替换，同一周内无论重新运行多少次，只更新当前周记录，确认次数不递增。
- **未刷新保护**：`archivedShadow` 识别 `gap === 0`（即行情未产出新周 K），保持前周的确认数与趋势状态，不产生虚假递增；若转为 risk 则立即防守。
- **P2 缺陷发现**：详见第三节。

### 5. 周报来源哈希（已核实 · 正常）
- `buildReport` 收集 `{ price, automatic, breadth, cn, us }` 后，执行 `createHash('sha256').update(JSON.stringify(inputs)).digest('hex')`，生成 64 位 SHA-256 哈希，完全符合 `reportSchema` 校验规则。
- `writeReport` 在读取输入时经过 `parsePriceInput`、`parseMacroInput`、`parseAutomaticSnapshot`、`parseBreadthSnapshot` 四重契约检验，遇到损坏文件安全置 null 并推入 `issues`，不破坏输入哈希的可复现性。

### 6. CI 部分失败仍发布有效数据（已核实 · 正常）
- `market-cycle-update.mjs` 对 `market-cycle-snapshot.mjs`、`market-cycle-auto.mjs`、`market-cycle-breadth.mjs` 进行单独 try/catch 隔离调用，单个脚本退出失败不会中断后续脚本，且将错误信息汇总记录到周报的 `issues` 中。
- `market-cycle.yml` 中 `macro-snapshot.mjs` 配置了 `continue-on-error: true`。
- Git 提交流程使用 `git diff --cached --quiet` 守卫，有数据变更时才提交，并具备 3 次 fetch-rebase 重试保障。

### 7. 缓存计划合理性（已核实 · 正常）
- Actions Cache 采用 `key: market-cycle-breadth-v1-${{ github.run_id }}` 搭配 `restore-keys: market-cycle-breadth-v1-`，是典型的增量滚动缓存机制，既能读取最近一次有效缓存，又能在 post 阶段保存新缓存。
- 定时策略 `cron: '15 7,19 * * *'` 对应北京时间 15:15（A 股收盘后）和 03:15（美股收盘后），周六 15:15 刚好满足完整周 K 线闭合归档需求。
- 前端 fetch 配置了 `cache: 'no-cache'`，避免浏览器与 CDN 读取到陈旧周报数据。

---

## 三、发现的可复现缺陷与修复建议

### [P2] 节假日周 K 线日期间隔非严格 7 天导致影子连续确认意外清零

- **问题位置**：`scripts/market-cycle-report.mjs` 第 36–37 行：
  ```javascript
  const gap = date && previousDate ? (Date.parse(date) - Date.parse(previousDate)) / 86400000 : NaN
  const state = shadowState(rows, gap === 7 ? previous : undefined)
  ```
- **复现机理**：
  在 A 股和港股市场中，当周五遇法定假日（如元旦、五一、十一、清明、端午、中秋、香港受难节等），该周完整周 K 线的收盘日 `w.date` 为周四（甚至周三）。  
  当下周五正常开市时，两根真正相邻的周 K 线日期差为 8 天（如 2026-04-30 至 2026-05-08）；若前一周五正常、当周五放假，日期差为 6 天。  
  由于代码硬编码检查 `gap === 7`，任何包含节假日的相邻周都会导致 `gap === 7` 为 false，从而把 `previous` 丢弃（变为 `undefined`），使得 `confirmations` 重新从 1 开始，破坏了上行趋势连续确认。
- **复现验证**：
  运行如下小测试可稳定复现：
  ```javascript
  const rows1 = [{ id: 'technical', signal: 'positive', available: true, date: '2026-04-30 / 2026-04-30' }]
  const shadow1 = archivedShadow(rows1) // confirmations = 1
  const rows2 = [{ id: 'technical', signal: 'positive', available: true, date: '2026-05-08 / 2026-04-30' }]
  const shadow2 = archivedShadow(rows2, { rows: rows1, shadow: shadow1 })
  // 预期 confirmations = 2，实际输出 confirmations = 1，trendState 仍为 '修复待确认'
  ```
- **修复建议**：
  在 `buildReport` 中，`last` 已经通过 `(Date.parse(week) - Date.parse(r.weekEnding)) / 86400000 === 7` 保证了归档记录严格处于相邻日历周。  
  在 `archivedShadow` 中，应当允许节假日交易日波动，例如放宽至 `gap >= 5 && gap <= 9`，或者对比两根周 K 线的归属自然周末 `weekEnd(date)` 是否相差 7 天。

---

## 四、生产代码保全确认

本审查全流程保持只读，未对任何生产代码或配置文件进行任何修改。

## manager验收与修复

已按实际收盘日所属自然周末比较是否相邻，替代原始日期差严格7天；新增节假日8天间隔及同一日历周日期修订测试，两项均通过。未采用5～9天的经验宽限。

对上文调度时间作纠正：UTC19:15为北京时间次日03:15，夏令时美国常规收盘为UTC20:00，故该轮不宣称已含美股当日最终收盘。完整本周确认发生在周六UTC07:15；引擎仍按已完成周及实际已发布序列判断，CNH盘中原值不参与方向票。no-cache用于重新验证缓存，不能单独保证任何CDN永不陈旧，仍依赖原观测日期门禁。
