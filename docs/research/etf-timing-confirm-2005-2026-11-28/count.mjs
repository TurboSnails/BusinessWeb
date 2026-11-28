// L-056 数事件与数据校验（预注册前允许的工作）。
// 纪律：本脚本不计算、不输出任何指数或策略的收益、回撤、波动、夏普；只数行数、日期、缺口、信号事件与持仓天数。
// 持仓状态用「只依赖信号、不碰价格水平」的状态机复刻 timingGold 的 pos（并与 timingGold 的 pos 逐日核对；其 eq 不读取）。
// 用法：node docs/research/etf-timing-confirm-2005-2026-11-28/count.mjs [raw 目录]
import fs from 'node:fs'
import { macdCross, ratioTiming, timingGold } from '../../../scripts/research/etf-strategy-oos/strategies.mjs'

const RAW = process.argv[2] || 'data-raw/etf-timing-confirm/raw'
const HERE = new URL('.', import.meta.url).pathname
const TARGETS = ['H00300', 'H00905', 'H00852', 'H00016', 'H00922', 'H00986', 'H00987', 'H00988', 'H00989', 'H00990', 'H00991', 'H00992', 'H00993', 'H00994', 'H00995']
const YEARS = [2005, 2006, 2007, 2008, 2009, 2010]
const BASE = '2004-12-31', FROM = '2005-01-01', TO = '2010-12-31'
const iso = (d) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`
const man = JSON.parse(fs.readFileSync(`${RAW}/manifest.json`, 'utf8'))
const files = (code) => man.filter((m) => m.file.startsWith(`perf-${code}-`) && !m.file.includes('-20080101-'))
const info = (code) => { const p = `${RAW}/info-${code}.json`; return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')).data : null }

/** 读入并清洗：剔除「查询起始日假行」（tradeDate = 查询 startDate），截到 2010-12-31；返回 bars 与清洗记录 */
function load(code) {
  const rows = new Map(); const fake = []; let dup = 0
  for (const m of files(code)) {
    const start = m.url.match(/startDate=(\d{8})/)[1]
    for (const r of JSON.parse(fs.readFileSync(`${RAW}/${m.file}`, 'utf8')).data || []) {
      if (!(r.close > 0)) continue
      if (r.tradeDate === start) { fake.push(iso(r.tradeDate)); continue }
      if (rows.has(r.tradeDate)) { dup++; if (rows.get(r.tradeDate).close !== r.close) throw new Error(`${code} ${r.tradeDate} 两段收盘不一致`); continue }
      rows.set(r.tradeDate, { date: iso(r.tradeDate), close: r.close, name: r.indexNameCn })
    }
  }
  const all = [...rows.values()].sort((a, b) => a.date.localeCompare(b.date))
  // 统一从共同基日 2004-12-31 起（H00016 基日 2003-12-31、000300 价格版也带 2004 年数据），使 15 个指数的预热期完全相同
  const bars = all.filter((b) => b.date >= BASE && b.date <= TO).map(({ date, close }) => ({ date, open: close, high: close, low: close, close }))
  return { name: all.at(-1)?.name ?? code, bars, fake, dup, droppedBefore: all.filter((b) => b.date < BASE).length, droppedAfter: all.filter((b) => b.date > TO).length }
}

const years = (d) => (Date.parse(d[1]) - Date.parse(d[0])) / (365.25 * 864e5)
const byYear = (dates, flags) => Object.fromEntries(YEARS.map((y) => [y, dates.reduce((s, d, i) => s + (d.startsWith(String(y)) && flags[i] ? 1 : 0), 0)]))
const inWin = (d) => d >= FROM && d <= TO

// ---------- 1. 数据：行数、日期、缺口、基日 / 发布日、回填占比 ----------
const series = {}
for (const c of ['000300', '000922', '000015', ...TARGETS]) { if (files(c).length) series[c] = load(c) }
const cal = series.H00300.bars.map((b) => b.date).filter(inWin) // 交易日历以 H00300 为准
const data = {}
for (const [code, s] of Object.entries(series)) {
  const d = s.bars.map((b) => b.date); const w = d.filter(inWin); const set = new Set(d)
  const missing = cal.filter((x) => !set.has(x)); const extra = w.filter((x) => !cal.includes(x))
  let maxGap = 0, gapAt = null
  for (let i = 1; i < w.length; i++) { const g = (Date.parse(w[i]) - Date.parse(w[i - 1])) / 864e5; if (g > maxGap) { maxGap = g; gapAt = `${w[i - 1]}→${w[i]}` } }
  const inf = info(code); const pub = inf?.publishDate ?? null; const base = inf?.basicDate ?? null
  const pre = pub ? w.filter((x) => x < pub).length : null
  data[code] = {
    name: s.name, fullName: inf?.indexFullNameCn ?? null, basicDate: base, publishDate: pub,
    firstBar: d[0], lastBar: d.at(-1), barsTotal: d.length,
    bars2005_2010: w.length, missingVsH00300: missing.length, missingDates: missing.slice(0, 10), extraVsH00300: extra.length,
    maxCalendarGapDays: maxGap, maxGapAt: gapAt, fakeRowsDropped: s.fake, duplicateRowsMerged: s.dup, rowsBeforeBaseDropped: s.droppedBefore, rowsAfter2010Dropped: s.droppedAfter,
    backfillDays: pre, backfillShare: pre == null ? null : +(pre / w.length).toFixed(4),
    backfillYears: pub ? +Math.max(0, Math.min(years([FROM, pub]), years([FROM, '2011-01-01']))).toFixed(2) : null,
  }
}

// ---------- 2. 与另两份独立取数核对收盘（只数不一致的天数，不算收益） ----------
const xcheck = {}
const vol = JSON.parse(fs.readFileSync(`${HERE}/../etf-volume-2026-11-25/inputs.json`, 'utf8'))
const volRows = (code) => (vol.targets[code] ?? vol.timing[code])?.rows ?? []
for (const code of [...TARGETS, '000300', '000922']) {
  if (!series[code]) continue
  const mine = new Map(series[code].bars.map((b) => [b.date, b.close]))
  let common = 0, diff = 0, maxRel = 0; const examples = []
  for (const r of volRows(code)) {
    const [date, close] = r; if (!inWin(date) || !mine.has(date)) continue
    common++; const rel = Math.abs(mine.get(date) / close - 1)
    if (rel > 1e-6) { diff++; if (examples.length < 3) examples.push(date) }
    maxRel = Math.max(maxRel, rel)
  }
  xcheck[code] = { vsEtfVolume20261125: { commonDays: common, daysDiffer: diff, maxRelDiff: maxRel, examples } }
}
for (const code of ['000300', '000922']) {
  const p = `data-raw/lowvol-core-cn/raw/em-1.${code}.json`; if (!fs.existsSync(p) || !series[code]) continue
  const mine = new Map(series[code].bars.map((b) => [b.date, b.close]))
  let common = 0, diff = 0, maxRel = 0, first = null
  for (const k of JSON.parse(fs.readFileSync(p, 'utf8')).data.klines) {
    const [date, c] = k.split(','); if (!inWin(date) || !mine.has(date)) continue
    first ??= date; common++; const rel = Math.abs(mine.get(date) / +c - 1); if (rel > 5e-5) diff++; maxRel = Math.max(maxRel, rel)
  }
  xcheck[code].vsEastmoney = { firstCommon: first, commonDays: common, daysDifferOver5e5: diff, maxRelDiff: maxRel }
}

// ---------- 3. 择时状态（沪深300÷中证红利 价格比值 > 20 日均线） ----------
function timingStats(t) {
  const ds = [...t.keys()]; const v = [...t.values()]
  const sw = v.map((x, i) => i > 0 && x !== v[i - 1]); const toBull = v.map((x, i) => i > 0 && x && !v[i - 1]); const toBear = v.map((x, i) => i > 0 && !x && v[i - 1])
  const perYear = Object.fromEntries(YEARS.map((y) => {
    const idx = ds.map((d, i) => (d.startsWith(String(y)) ? i : -1)).filter((i) => i >= 0)
    const bull = idx.filter((i) => v[i]).length
    return [y, { days: idx.length, bullDays: bull, bullShare: idx.length ? +(bull / idx.length).toFixed(3) : null, switches: idx.filter((i) => sw[i]).length, toBull: idx.filter((i) => toBull[i]).length, toBear: idx.filter((i) => toBear[i]).length }]
  }))
  // 状态连续段长度（交易日）
  const runs = []; let len = 0
  for (let i = 0; i < v.length; i++) { if (!inWin(ds[i])) continue; if (i > 0 && v[i] !== v[i - 1] && len) { runs.push(len); len = 0 } len++ }
  if (len) runs.push(len)
  runs.sort((a, b) => a - b)
  return { firstDefined: ds[0], perYear, runsMedian: runs[Math.floor(runs.length / 2)], runsMin: runs[0], runsMax: runs.at(-1), runs: runs.length }
}
const tHs = ratioTiming(series['000300'].bars, series['000922'].bars)
const timing = { main: timingStats(tHs) }
if (series['000015']) {
  const t15 = ratioTiming(series['000300'].bars, series['000015'].bars)
  const common = [...tHs.keys()].filter((d) => t15.has(d) && inWin(d)); const same = common.filter((d) => t15.get(d) === tHs.get(d)).length
  timing.explore_000015 = { ...timingStats(t15), agreementWithMain: +(same / common.length).toFixed(3), commonDays: common.length }
}
// 中证红利发布（2008-05-26）前后，主择时比值的「回填」天数
const pubDiv = data['000922'].publishDate
timing.main.daysDefined2005_2010 = [...tHs.keys()].filter(inWin).length
timing.main.daysBefore000922Publish = [...tHs.keys()].filter((d) => inWin(d) && d < pubDiv).length

// ---------- 4. 每个指数：金叉 / 死叉、按规则的买卖次数与持仓天数（不碰价格水平） ----------
const WARMUP = 120
/** 复刻 timingGold 的持仓状态（只用 gold/dead/bull，不读价格）：返回逐日 pos 与买卖成交日 */
function positions(bars, bull) {
  const { gold, dead } = macdCross(bars); const pos = []; const buys = [], sells = []
  let held = false, pend, buyIdx = -1, lastBull
  for (let i = 0; i < bars.length; i++) {
    const t = bull.get(bars[i].date); if (t !== undefined) lastBull = t; const isBull = lastBull !== false
    if (pend === 'buy') { held = true; buyIdx = i; buys.push(i) } else if (pend === 'sell') { held = false; sells.push(i) }
    pend = undefined
    if (i >= WARMUP) {
      if (!held && gold[i] && isBull) pend = 'buy'
      else if (held && dead[i]) { if (buyIdx === i) pend = 'sell'; else { held = false; sells.push(i) } }
    }
    pos.push(held ? 1 : 0)
  }
  return { gold, dead, pos, buys, sells }
}
const events = {}
for (const code of TARGETS) {
  const bars = series[code].bars; const ds = bars.map((b) => b.date)
  const p = positions(bars, tHs)
  const ref = timingGold(bars, tHs, { fill: 'close' }).pos // 只取 pos 核对
  const mismatch = ref.reduce((s, x, i) => s + (x !== p.pos[i] ? 1 : 0), 0)
  const bullOn = ds.map((d) => tHs.get(d))
  const goldBull = p.gold.map((g, i) => g && bullOn[i] !== false)
  const flag = (idxs) => { const f = new Array(ds.length).fill(false); for (const i of idxs) f[i] = true; return f }
  const inPos = p.pos.map((x) => x === 1)
  const perYear = Object.fromEntries(YEARS.map((y) => {
    const n = ds.filter((d) => d.startsWith(String(y))).length
    const held = ds.reduce((s, d, i) => s + (d.startsWith(String(y)) && inPos[i] ? 1 : 0), 0)
    return [y, { days: n, gold: byYear(ds, p.gold)[y], dead: byYear(ds, p.dead)[y], goldInBull: byYear(ds, goldBull)[y], buys: byYear(ds, flag(p.buys))[y], sells: byYear(ds, flag(p.sells))[y], heldDays: held, heldShare: n ? +(held / n).toFixed(3) : null }]
  }))
  const tradable = ds[WARMUP]
  const tot = (k) => YEARS.reduce((s, y) => s + perYear[y][k], 0)
  // W 内口径（REVIEW-1 必改 5、8）：wHeldShare = W 内收盘持仓天数占比；k = W 内 t = 2..1338 的 pos(t−1) 均值（实际承担当日收益的暴露）
  const iW0 = ds.indexOf('2005-07-06'); const wPos = p.pos.slice(iW0)
  const wHeldShare = +(wPos.reduce((s, x) => s + x, 0) / wPos.length).toFixed(4)
  const k = wPos.slice(0, -1).reduce((s, x) => s + x, 0) / (wPos.length - 1)
  events[code] = { name: series[code].name, firstBar: ds[0], warmupEndDate: tradable, posMismatchVsTimingGold: mismatch, wDays: wPos.length, wHeldShare, k: +k.toFixed(6), perYear, totals: { gold: tot('gold'), dead: tot('dead'), goldInBull: tot('goldInBull'), buys: tot('buys'), sells: tot('sells'), heldShare: +(tot('heldDays') / tot('days')).toFixed(3) } }
}

// ---------- 5. L-004 取数布局敏感性（v2，按 REVIEW-1 必改 1）：只数信号 / 成交日 / 持仓状态差异，不算收益 ----------
// 直接用 L-018 的 inputs.json（2026-11-25 取数，与 bt-index.mjs 同一分段布局：含 2004-01-01、2008-01-01 假行，
// H00016 与 000300 含 2004 年真实数据），截到 2010-12-31，调用方式与 bt-index.mjs 相同：
// timingGold(bars, ratioTiming(000300, 000922), { fill: 'close' })，从各序列第一根起跑。
const fake2008 = JSON.parse(fs.readFileSync(`${RAW}/${man.find((m) => m.file.includes('H00300-20080101-')).file}`, 'utf8')).data.filter((r) => r.close > 0).map((r) => r.tradeDate).sort()
const W0 = '2005-07-06'
const inW = (d) => d >= W0 && d <= TO
const l004Bars = (code) => volRows(code).filter((r) => r[0] <= TO).map(([date, close]) => ({ date, open: close, high: close, low: close, close }))
const tL = ratioTiming(l004Bars('000300'), l004Bars('000922'))
const tDiff = [...tHs.keys()].filter((d) => inW(d) && tL.has(d) && tL.get(d) !== tHs.get(d))
const layout = { timingStateDiffDaysInW: tDiff.length, timingStateDiffDates: tDiff.slice(0, 40), timingHasFake20080101: tL.has('2008-01-01'), perIndex: {} }
for (const code of TARGETS) {
  const clean = series[code].bars, l004 = l004Bars(code)
  const a = positions(clean, tHs), b = positions(l004, tL)
  const refB = timingGold(l004, tL, { fill: 'close' }).pos // 只取 pos 核对状态机
  const mis = refB.reduce((s, x, i) => s + (x !== b.pos[i] ? 1 : 0), 0)
  const setOf = (bars, x, key) => new Set(x[key].map((v, i) => (v === true && inW(bars[i].date) ? bars[i].date : null)).filter(Boolean))
  const symDiff = (s1, s2) => [...s1].filter((d) => !s2.has(d)).length + [...s2].filter((d) => !s1.has(d)).length
  const trades = (bars, x) => new Set([...x.buys.map((i) => 'B' + bars[i].date), ...x.sells.map((i) => 'S' + bars[i].date)].filter((k) => inW(k.slice(1))))
  const posMap = (bars, x) => new Map(bars.map((bb, i) => [bb.date, x.pos[i]]))
  const pa = posMap(clean, a), pb = posMap(l004, b)
  const wDates = clean.map((bb) => bb.date).filter(inW)
  const tA = trades(clean, a), tB = trades(l004, b)
  const onlyA = [...tA].filter((k) => !tB.has(k)), onlyB = [...tB].filter((k) => !tA.has(k))
  layout.perIndex[code] = {
    barsL004: l004.length, firstBarL004: l004[0].date, warmupEndL004: l004[WARMUP].date, posMismatchVsTimingGold: mis,
    heldAtW0_clean: pa.get(W0), heldAtW0_l004: pb.get(W0), heldDayBeforeW0_l004: pb.get(clean[clean.findIndex((bb) => bb.date === W0) - 1].date),
    tradesBeforeW0_l004: b.buys.filter((i) => l004[i].date < W0).length,
    goldDateDiffsW: symDiff(setOf(clean, a, 'gold'), setOf(l004, b, 'gold')), deadDateDiffsW: symDiff(setOf(clean, a, 'dead'), setOf(l004, b, 'dead')),
    tradeDateDiffsW: onlyA.length + onlyB.length, tradesOnlyClean: onlyA, tradesOnlyL004: onlyB,
    posDiffDaysW: wDates.filter((d) => pa.get(d) !== pb.get(d)).length,
    posDiffDaysC: wDates.filter((d) => d >= '2007-10-16' && d <= '2008-11-04' && pa.get(d) !== pb.get(d)).length,
  }
}

// ---------- 6. 2008 年下跌段（H00300：2008 年内最低收盘日；其前的历史最高收盘日）——只输出日期 ----------
const h = series.H00300.bars
let lo = -1; h.forEach((b, i) => { if (b.date.startsWith('2008') && (lo < 0 || b.close < h[lo].close)) lo = i })
let hi = 0; for (let i = 0; i <= lo; i++) if (h[i].close > h[hi].close) hi = i
const crash2008 = { peak: h[hi].date, trough: h[lo].date, tradingDays: lo - hi, note: '只记日期；跌幅不在本阶段计算' }
// 段内每个指数的择时切换 / 金叉死叉 / 买卖次数
for (const code of TARGETS) {
  const bars = series[code].bars; const p = positions(bars, tHs); const ds = bars.map((b) => b.date)
  const inSeg = (i) => ds[i] >= crash2008.peak && ds[i] <= crash2008.trough
  events[code].crash2008 = { gold: p.gold.filter((g, i) => g && inSeg(i)).length, dead: p.dead.filter((g, i) => g && inSeg(i)).length, buys: p.buys.filter(inSeg).length, sells: p.sells.filter(inSeg).length, heldShare: +(ds.filter((_, i) => inSeg(i) && p.pos[i]).length / ds.filter((_, i) => inSeg(i)).length).toFixed(3), heldAtPeak: p.pos[ds.indexOf(crash2008.peak)] ?? null }
}
const segDs = [...tHs.keys()].filter((d) => d >= crash2008.peak && d <= crash2008.trough)
crash2008.timingSwitches = segDs.filter((d, i) => i > 0 && tHs.get(d) !== tHs.get(segDs[i - 1])).length
crash2008.timingBullShare = +(segDs.filter((d) => tHs.get(d)).length / segDs.length).toFixed(3)

// ---------- 7. 冻结清洗后的输入（REVIEW-1 必改 10）：inputs-clean.json，按代码排序，每行 [date, close]，2004-12-31 至 2010-12-31 ----------
// 内容只由原始文件决定（不含时间戳），SHA-256 写入 PREREG；L-018 inputs.json 早已含同样的数据，提交不带来新泄露。
const clean = { source: 'csindex index-perf, fetched 2026-11-28; cleaned by count.mjs (fake start-date rows removed, 2004-12-31..2010-12-31)', series: {} }
for (const c of Object.keys(series).sort()) clean.series[c] = series[c].bars.map((b) => [b.date, b.close])
for (const [c, rows] of Object.entries(clean.series)) if (rows.length !== 1458 || rows[0][0] !== BASE || rows.at(-1)[0] !== TO) throw new Error(`${c} 清洗后行数 / 起止不符`)
const cleanBuf = Buffer.from(JSON.stringify(clean))
fs.writeFileSync(`${HERE}/inputs-clean.json`, cleanBuf)
const inputsCleanSha256 = (await import('node:crypto')).createHash('sha256').update(cleanBuf).digest('hex')

const out = { generatedAt: new Date().toISOString(), discipline: '不含任何收益 / 回撤 / 波动 / 夏普；只含数据校验、日期与事件计数', window: [FROM, TO], warmup: WARMUP, inputsCleanSha256, data, xcheck, timing, crash2008, events, l004Layout: { fake2008Rows: fake2008.slice(0, 2), source: 'docs/research/etf-volume-2026-11-25/inputs.json', ...layout } }
fs.writeFileSync(`${HERE}/count-results.json`, JSON.stringify(out, null, 1))

// ---------- 打印 markdown 摘要 ----------
const L = []
L.push('### 数据', '', '| 代码 | 名称 | 基日 | 发布日 | 2005–2010 行数 | 相对 H00300 缺 / 多 | 最长日历间隔 | 回填天数（占比） | 假行剔除 |', '|---|---|---|---|---:|---|---|---|---|')
for (const [c, d] of Object.entries(data)) L.push(`| ${c} | ${d.name} | ${d.basicDate} | ${d.publishDate} | ${d.bars2005_2010} | ${d.missingVsH00300} / ${d.extraVsH00300} | ${d.maxCalendarGapDays} 天（${d.maxGapAt}） | ${d.backfillDays}（${(d.backfillShare * 100).toFixed(1)}%） | ${d.fakeRowsDropped.join('、') || '—'} |`)
L.push('', '### 核对', '', '| 代码 | 对 etf-volume 11-25 取数：共同天数 / 不一致天数 / 最大相对差 | 对东财价格版 |', '|---|---|---|')
for (const [c, x] of Object.entries(xcheck)) { const v = x.vsEtfVolume20261125; const e = x.vsEastmoney; L.push(`| ${c} | ${v.commonDays} / ${v.daysDiffer} / ${v.maxRelDiff.toExponential(1)}${v.examples.length ? '（' + v.examples.join('、') + '）' : ''} | ${e ? `${e.firstCommon} 起 ${e.commonDays} 天，>0.005% 的 ${e.daysDifferOver5e5} 天，最大 ${e.maxRelDiff.toExponential(1)}` : '—'} |`) }
L.push('', '### 择时（000300÷000922）', '', `首个有定义日 ${timing.main.firstDefined}；2005–2010 有定义 ${timing.main.daysDefined2005_2010} 天，其中中证红利发布前 ${timing.main.daysBefore000922Publish} 天。状态连续段 ${timing.main.runs} 段，长度中位 ${timing.main.runsMedian}（${timing.main.runsMin}–${timing.main.runsMax}）交易日。`, '', '| 年 | 交易日 | 牛市天数（占比） | 切换次数（转牛 / 转熊） |' + (timing.explore_000015 ? ' 探索：÷上证红利 牛市占比 / 切换 |' : ''), '|---|---:|---|---|' + (timing.explore_000015 ? '---|' : ''))
for (const y of YEARS) { const r = timing.main.perYear[y]; const e = timing.explore_000015?.perYear[y]; L.push(`| ${y} | ${r.days} | ${r.bullDays}（${(r.bullShare * 100).toFixed(0)}%） | ${r.switches}（${r.toBull} / ${r.toBear}） |` + (e ? ` ${(e.bullShare * 100).toFixed(0)}% / ${e.switches} |` : '')) }
if (timing.explore_000015) L.push('', `探索口径（÷上证红利 000015）与主口径同状态的天数占比 ${(timing.explore_000015.agreementWithMain * 100).toFixed(1)}%（${timing.explore_000015.commonDays} 天）。`)
L.push('', `### 2008 年下跌段（H00300）：${crash2008.peak} → ${crash2008.trough}，${crash2008.tradingDays} 个交易日；段内择时切换 ${crash2008.timingSwitches} 次，牛市状态占 ${(crash2008.timingBullShare * 100).toFixed(0)}%`)
L.push('', '### 每个指数（2005–2010 合计；括号内为 2008 下跌段）', '', '| 代码 | 名称 | 可交易起 | 金叉 | 死叉 | 牛市中的金叉 | 买入 | 卖出 | 持仓天数占比 | W 内持仓占比 / k | 峰值日持仓 | pos 核对 | L-004 布局（W 内）：金叉 / 死叉 / 成交日 / 持仓日差异，W 起点持仓 |', '|---|---|---|---:|---:|---:|---:|---:|---|---|---|---|---|')
for (const [c, e] of Object.entries(events)) { const t = e.totals, k = e.crash2008, l = layout.perIndex[c]; L.push(`| ${c} | ${e.name} | ${e.warmupEndDate} | ${t.gold}（${k.gold}） | ${t.dead}（${k.dead}） | ${t.goldInBull} | ${t.buys}（${k.buys}） | ${t.sells}（${k.sells}） | ${(t.heldShare * 100).toFixed(0)}%（${(k.heldShare * 100).toFixed(0)}%） | ${(e.wHeldShare * 100).toFixed(1)}% / ${e.k.toFixed(3)} | ${k.heldAtPeak ? '是' : '否'} | ${e.posMismatchVsTimingGold === 0 ? '一致' : '差 ' + e.posMismatchVsTimingGold} | ${l.goldDateDiffsW} / ${l.deadDateDiffsW} / ${l.tradeDateDiffsW} / ${l.posDiffDaysW}，${l.heldAtW0_l004 ? '持仓' : '空仓'} |`) }
L.push('', '### 每个指数按年买入次数（持仓天数占比）', '', '| 代码 | ' + YEARS.join(' | ') + ' |', '|---|' + YEARS.map(() => '---').join('|') + '|')
for (const [c, e] of Object.entries(events)) L.push(`| ${c} | ` + YEARS.map((y) => `${e.perYear[y].buys}（${(e.perYear[y].heldShare * 100).toFixed(0)}%）`).join(' | ') + ' |')
L.push('', '### 每个指数按年金叉 / 死叉', '', '| 代码 | ' + YEARS.join(' | ') + ' |', '|---|' + YEARS.map(() => '---').join('|') + '|')
for (const [c, e] of Object.entries(events)) L.push(`| ${c} | ` + YEARS.map((y) => `${e.perYear[y].gold} / ${e.perYear[y].dead}`).join(' | ') + ' |')
fs.writeFileSync(`${HERE}/count.md`, L.join('\n') + '\n')
console.log(L.join('\n'))
