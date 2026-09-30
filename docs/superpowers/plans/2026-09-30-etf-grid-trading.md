# ETF Grid Trading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the complete ETF grid simulation and record-management workflow into BusinessWeb while keeping it local by default and preventing any access to the friend's cloud service.

**Architecture:** Put the simulation, market adapter, versioned local repository, import/export, chart data, and optional sync client in a focused `src/features/grid-trading` module. Add three React routes for calculation, saved records, and record detail; all pages consume shared domain APIs. Cloud sync has no default endpoint or token and sends no request until the user explicitly configures and confirms a separate HTTPS service.

**Tech Stack:** React 18, TypeScript, React Router 6, Vite 5, lucide-react, browser localStorage, SVG charts, Vitest.

**Spec:** `docs/design/ETF_GRID_TRADING.md`

## Global Constraints

- “不连接、不读取、不写入 notes 项目朋友现有的 Cloudflare Worker、D1 数据库或同步 token。”
- “初始状态为本地模式，所有网格记录和设置只写入 BusinessWeb 自己的浏览器存储。”
- “继续使用无需登录的公开行情源：腾讯前复权日 K 线及实时行情。”
- “ETF 佣金 0.015%、单笔最低 ¥5；普通 A 股佣金按 0.015% 且不加最低佣金；A 股卖出印花税 0.05%，ETF 免印花税。”
- “同日买卖都触及时买入优先，每日最多一笔。”
- “参数变化写入历史阶段，只影响变更之后的模拟，不追溯重算旧成交。”
- “快照冻结其输入和结果，最多 20 个。”
- Do not add a chart dependency or connect the feature to the existing Pulse Gist sync.
- Keep unrelated working-tree changes, including the current `package-lock.json` edits, intact.

## Review Focus

- Same-day candle hits both grid sides: assert one buy is emitted and never a second trade that day; grid buys can make cash flow negative, while sells remain capped at current holdings (Task 2).
- Minimum commission and ETF/A-share stamp duty boundaries: assert exact fee amounts including the ¥5 floor (Task 2).
- Malformed, unsupported-version, duplicate-ID and quota-failed imports: assert existing records remain unchanged and the import reports the specific problem (Task 3).
- Tencent empty/partial/GBK responses and stale quote cache: assert errors or stale-data timestamps are explicit and no fabricated candles appear (Task 3).
- Cloud sync missing configuration or a cancelled domain confirmation: assert fetch is never called; confirmed config sends requests only to that exact HTTPS origin (Task 3).

---

### Task 1: Establish a focused test runner

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json` (preserve existing unrelated changes)
- Modify: `vite.config.js`
- Create: `scripts/run-vitest.mjs`
- Create: `src/features/grid-trading/testSetup.ts`

**Interfaces:**
- Produces `npm test -- --run` for deterministic feature tests and `npm run typecheck` for strict TypeScript checking of the grid feature and its page files. (The existing app-wide typecheck currently has unrelated errors in `App.tsx`, `Investment2026AI.tsx`, and `monitor/Table.tsx`; the production build remains the whole-app integration check.)

- [ ] Add Vitest, `jsdom`, `@testing-library/react`, and `@testing-library/user-event` as dev dependencies; add `test` and `typecheck` scripts without replacing or reverting the current package manifest/lockfile changes. In `scripts/run-vitest.mjs`, disable Node 25's incomplete experimental global Web Storage for Vitest so jsdom supplies the browser `Storage` implementation.
- [ ] Configure Vitest to reuse the existing Vite React plugin, use `environment: 'jsdom'` for UI/storage tests, and include `src/**/*.test.ts` and `src/**/*.test.tsx`.
- [ ] Run `npm test -- --run` and `npm run typecheck`; confirm both commands execute before adding feature tests.

### Task 2: Implement the deterministic grid domain engine

**Files:**
- Create: `src/features/grid-trading/types.ts`
- Create: `src/features/grid-trading/fees.ts`
- Create: `src/features/grid-trading/simulation.ts`
- Create: `src/features/grid-trading/fees.test.ts`
- Create: `src/features/grid-trading/simulation.test.ts`

**Interfaces:**
- `Candle`: `{ date: string; close: number; high: number; low: number }`, matching notes' normalized daily candle shape.
- `GridParams`: `{ name: string; code: string; date: string; initialPrice: number; initialAmount: number; step: number; rebound: number; pullback: number; gridAmount: number }`, matching notes' saved `row` shape.
- Preserve notes-compatible `Trade`, `EquityPoint`, and `GridResult` fields (`range`, `current`, `lastTradeDate`, `lastTrade`, `nextBuy`, `nextSell`, `buyTrigger`, `sellTrigger`, `pnl`, `value`, `realized`, `maxCapital`, `buys`, `sells`, `trades`, `series`, `position`), plus `Overrides`, `ParamStage`, `ManualTrade`, `Adjustments`, `Backup`, and `SavedRecord`; add `schemaVersion` without renaming `row`, `result`, `priceOverrides`, `amountOverrides`, `sharesOverrides`, `paramHistory`, `manualTrades`, `removedTrades`, and `backups`.
- `calculateFee(code, side, turnover): number` and `calculateGrid(row, candles, adjustments): GridResult` are pure functions with no browser or network access.

- [ ] Write fee tests proving ETF commission is `max(turnover * 0.00015, 5)`, ordinary-stock commission is `turnover * 0.00015` without the floor, A-share sell tax is `turnover * 0.0005`, and ETF sell tax is zero.
- [ ] Write simulation tests for opening-day exclusion, buy/sell trigger formulas, same-day buy priority, one trade per day, negative cash flow after grid buys, sell quantity capped by holdings, ordered equity points, and stable output on repeated calls.
- [ ] Run the focused tests and confirm they fail because the exported functions do not exist yet.
- [ ] Implement typed domain records and fee calculation; keep the market-specific ETF detection in one helper and document its six-digit prefix rules from the source.
- [ ] Implement `calculateGrid` using the source's exact saved-row fields, adjusted daily close/high/low, 0.001 price tick, and trigger/fill assumptions; preserve its per-date overrides and parameter-history semantics, and surface malformed candles as warnings rather than silently inventing fills.
- [ ] Run `npm test -- --run src/features/grid-trading/fees.test.ts src/features/grid-trading/simulation.test.ts` and `npm run typecheck`; confirm exact fee and trigger assertions pass.

### Task 3: Add public market data, local records, safe JSON portability, and opt-in sync client

**Files:**
- Create: `src/features/grid-trading/marketData.ts`
- Create: `src/features/grid-trading/repository.ts`
- Create: `src/features/grid-trading/importExport.ts`
- Create: `src/features/grid-trading/cloudSync.ts`
- Create: `src/features/grid-trading/marketData.test.ts`
- Create: `src/features/grid-trading/repository.test.ts`
- Create: `src/features/grid-trading/importExport.test.ts`
- Create: `src/features/grid-trading/cloudSync.test.ts`

**Interfaces:**
- `getCandles(code, begin, options, fetchImpl = fetch): Promise<{ candles: Candle[]; fetchedOn: string; from: string }>` and `fetchQuotes(codes, fetchImpl = fetch): Promise<Map<string, Quote>>`.
- `readRecords(): SavedRecord[]`, `writeRecords(records): void`, `saveRecord(record): void`, and `removeRecords(ids): void` use only `businessweb.grid-trading.v1` and its own optional tombstone key.
- `exportGridRecords(records): string` and `parseGridImport(text): { records: SavedRecord[]; errors: string[] }` accept notes' raw `SavedRecord[]` as well as the versioned BusinessWeb envelope; include every backup, parameter stage, override, and manual trade, but no sync credentials.
- `loadSyncConfig(): SyncConfig | null` and `saveSyncConfig(config): void` use a separate BusinessWeb-only key; the sync panel may persist a user-entered endpoint/token only after explicit confirmation.
- `syncGridRecords(records, config, fetchImpl = fetch, confirmTarget): Promise<SyncResult>` rejects missing configuration and non-HTTPS targets before making requests; protocol reads `GET {records}` and writes `PUT {records}`, merges per ID by update timestamp, and retains delete tombstones for 180 days.

- [ ] Write adapter tests with injected `fetchImpl` for GBK Tencent quote decoding, 640-bar history segmentation, empty/malformed responses, HTTP errors, and request timeouts.
- [ ] Write repository tests for versioned storage, corrupt JSON recovery, missing storage, stable-ID updates, deletion, and quota errors that leave the last valid data readable.
- [ ] Write portability tests for full nested record round trips, direct import of the notes `SavedRecord[]` shape, unsupported schema versions, invalid fields, duplicate IDs, and merge/skip/replace decisions without mutating the repository during preview.
- [ ] Write sync tests asserting no configuration and cancelled target confirmation make zero calls; invalid HTTP URLs make zero calls; confirmed HTTPS config uses the exact configured origin, versioned payload, and never sends a request on startup.
- [ ] Run these focused tests and confirm the missing module/function failures before implementation.
- [ ] Implement Tencent daily adjusted candles and quote adapters with bounded 640-row history segments (up to 20 pages), GBK-safe quote decoding, 60-second quote cache, per-code daily candle cache, cache timestamps, timeout and explicit source/data freshness metadata.
- [ ] Implement the versioned local repository with atomic serialization behavior and a quota error that preserves existing stored data.
- [ ] Implement JSON export/import preview and explicit merge/skip/replace application; require a user-confirmed action before any records are written.
- [ ] Implement only an opt-in sync client/config contract: no URL or token default, no reference to the notes endpoint/database/token, explicit domain confirmation, versioned GET/PUT payload, timestamp conflict resolution, and 180-day delete tombstones. Do not deploy or configure any remote service in this task.
- [ ] Run the four focused test files and `npm run typecheck`; verify absent configuration and cancelled confirmation both produce zero network calls.

### Task 4: Build the calculator and saved-record list routes

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/Header.tsx`
- Create: `src/pages/GridCalculator.tsx`
- Create: `src/pages/GridRecords.tsx`
- Create: `src/features/grid-trading/RecordList.tsx`
- Create: `src/features/grid-trading/ImportExportPanel.tsx`
- Create: `src/features/grid-trading/CloudSyncPanel.tsx`
- Create: `src/features/grid-trading/gridTrading.css`
- Create: `src/pages/GridCalculator.test.tsx`
- Create: `src/pages/GridRecords.test.tsx`

**Interfaces:**
- Routes: `/grid-trading`, `/grid-trading/records`, `/grid-trading/records/:recordId`.
- Calculator consumes `getCandles`, `calculateGrid`, and repository functions; it does not contain fee or fill algorithms.
- List consumes `SavedRecord[]`; actions call domain repository/import/export APIs and link to record details.

- [ ] Write route-level tests for visible navigation, calculator validation, loading/error/success states, saved simulation, and list reload from localStorage.
- [ ] Run these tests and confirm the routes/pages are currently absent.
- [ ] Add three routes in `App.tsx` and a “网格交易” item in `Header.tsx` while preserving existing route basename behavior.
- [ ] Build a responsive calculator form for code, start date, opening price/amount, per-grid amount, step, rebound and pullback; show detected market, quote/data timestamp, assumption notice and simulation warnings.
- [ ] Render key result metrics and a provisional SVG equity view; save complete reproducibility inputs/results through the repository and navigate to its detail route.
- [ ] Build the record list with search, the required sorts (updated, last trade/buy, capital, PnL), quote refresh, parameter editing that appends a stage, single/bulk delete confirmations, and JSON import/export preview.
- [ ] Show cloud status as “未配置” with sync disabled until a separate endpoint and token have been configured and confirmed; do not silently use the existing Pulse Gist integration.
- [ ] Add explicit endpoint/token setup and a test action; show the endpoint domain and record count in a confirmation step before syncing, with a cancel path that performs no request.
- [ ] Run the route tests, `npm run typecheck`, and `npm run build`; confirm all three routes load and the production base path remains `/BusinessWeb/`.

### Task 5: Complete record detail, adjustments, snapshots, and interactive chart

**Files:**
- Create: `src/pages/GridRecordDetail.tsx`
- Create: `src/features/grid-trading/recordMutations.ts`
- Create: `src/features/grid-trading/chart.ts`
- Create: `src/features/grid-trading/recordMutations.test.ts`
- Create: `src/features/grid-trading/chart.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/features/grid-trading/gridTrading.css`

**Interfaces:**
- `withParamChange(record, patch): SavedRecord`.
- `updateTradeOverride(record, date, { price?, amount?, shares? }): SavedRecord`.
- `addManualTrade(record, trade): SavedRecord`, `removeManualTrade(record, tradeId): SavedRecord`, `setGridTradeDeleted(record, date, deleted): SavedRecord`.
- `createBackup(record, now): Backup` and `replayBackup(backup, candles): GridResult`; `MAX_BACKUPS = 20`.
- `buildChartSeries(record, result): ChartSeries[]` returns position market value, capital, total PnL, close, next buy/sell levels, and trade markers.

- [ ] Write mutation tests proving parameter stages do not rewrite prior trades; override amount/shares are mutually exclusive; manual trades do not mutate generated grid trades; opening trades cannot be deleted; deleted grid trades can be restored; and backup-local fill overrides never alter the parent record while backup parameter/manual/delete controls remain read-only.
- [ ] Write snapshot tests for the 20-item cap, frozen input/result, grid-only replay from its anchor, and comparison of saved/pure-grid/current-adjusted outcomes.
- [ ] Write chart tests for every series, date alignment, missing candle handling, nearest-point hover lookup, and small datasets.
- [ ] Run the focused tests and confirm failures before implementing mutations and chart-series mapping.
- [ ] Implement immutable record mutations and persist them through `saveGridRecords`; preserve source behavior for historical parameter stages, overrides, manual trades and delete/restore operations.
- [ ] Implement backup creation/replay/comparison with a hard cap of 20 and isolated backup state.
- [ ] Build the detail page with eight key metrics, parameter history, complete editable trade table, manual trade form, backup controls and comparison results; in backup view allow fill price/amount/share overrides only, and keep parameter/manual/deletion controls read-only.
- [ ] Render responsive SVG series for price, position value, capital, total PnL and next levels; add hover crosshair and value/date tooltip without adding a chart dependency.
- [ ] Run mutation/chart tests and `npm run typecheck`; confirm an edit in backup view cannot change the saved parent record.

### Task 6: End-to-end review and production verification

**Files:**
- Modify as needed: feature files from Tasks 2–5
- Modify: `docs/design/ETF_GRID_TRADING.md` only if implementation reveals a spec correction; document any approved deviation.

**Interfaces:**
- No new public API; verifies the complete calculator → saved record → detail → export/import flow.

- [ ] Add one integration test that runs a fixed-candle simulation, saves it, reloads it, exports/imports all nested fields, opens the detail record and verifies totals remain identical.
- [ ] Add a privacy regression test that confirms a fresh app with no sync configuration does not call the sync client and that the feature contains no default remote endpoint/token configuration.
- [ ] Run `npm test -- --run`, `npm run typecheck`, and `npm run build`.
- [ ] Inspect `git diff --check` and the final feature diff; confirm the pre-existing changes to `package-lock.json`, `src/data/details/itCore.ts`, and untracked `.DS_Store`/`.agents` files are preserved and unrelated.
- [ ] Report any live Tencent CORS limitation separately; do not claim live data is working unless a real browser request succeeds.
