// 今天几星 · 港股全球：抓取公开数据并生成 public/data/jixing-global.json（原始存档在 data-raw/jixing-global/）。
// 用法：node scripts/jixing-global.mjs
// 幂等：一天可跑多次；各来源更新时间不同，每行保留自己最新的数据日期；某个来源失败只影响它那几行（沿用上一份文件中的同一行并标注）。
// 历史重跑不会覆盖数据日更新的文件；同一数据日结果更不完整时不写。
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  HK_ROWS, HOM, MULTPL, SINA_GC, BLS_API, BLS_SERIES,
  hsiDirUrl, hsiCsvUrl, parseHsiDir, parseHsiCsv, parseRoundupTable, roundupCandidates, nextRoundupMonth,
  csiPerfUrl, parseCsiPerfPe, hkSamples, buildHkRow,
  parseMultplTable, parseHomForward, buildGlobalRow,
  parseSinaGc, lastClosedGcDate, treasuryRealUrl, parseTreasuryReal, parseBlsCpi, buildGold,
  carryRows, shouldWrite, asOfOf, validDate, THRESHOLDS, WINDOWS,
} from './jixing-global-lib.mjs'

const OUT = fileURLToPath(new URL('../public/data/jixing-global.json', import.meta.url))
const RAW = fileURLToPath(new URL('../data-raw/jixing-global/', import.meta.url))
const PDF_PY = fileURLToPath(new URL('./market-cycle-pdf-text.py', import.meta.url))
const PYTHON = process.env.MARKET_CYCLE_PYTHON || 'python3'
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
let requests = 0

async function get(url, { as = 'text', headers = {}, timeoutMs = 20000, retries = 2, method = 'GET', body, redirect = 'follow' } = {}) {
  let last
  for (let i = 0; i <= retries; i++) {
    requests++
    try {
      const res = await fetch(url, { method, body, redirect, headers: { 'user-agent': UA, ...headers }, signal: AbortSignal.timeout(timeoutMs) })
      if (res.status >= 300 && res.status < 400) return null // 恒生缺失文件 302 → 404 页
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      if (as === 'json') return await res.json()
      if (as === 'buffer') return Buffer.from(await res.arrayBuffer())
      return await res.text()
    } catch (e) {
      last = e
      if (i < retries) await new Promise(r => setTimeout(r, 800 * (i + 1)))
    }
  }
  throw new Error(`${url.slice(0, 100)}：${last instanceof Error ? last.message : String(last)}`)
}
const readJson = async (file, fallback) => { try { return JSON.parse(await readFile(file, 'utf8')) } catch { return fallback } }
async function writeAtomic(file, data) {
  const tmp = `${file}.tmp`
  await writeFile(tmp, JSON.stringify(data))
  await rename(tmp, file)
}
const msg = (e) => (e instanceof Error ? e.message : String(e))
const bjToday = (now) => new Date(Date.parse(now) + 8 * 3600e3).toISOString().slice(0, 10)

// ---------------------------------------------------------------------------
// 港股
// ---------------------------------------------------------------------------
async function updateHkDaily(store, today, warn) {
  for (const row of HK_ROWS.filter(r => r.daily)) {
    const series = row.daily
    try {
      const dates = parseHsiDir(await get(hsiDirUrl(series), { as: 'json' }), series, today)
      const have = new Map((store.series[series] ?? []).map(p => [p[0], p]))
      for (const date of dates) {
        if (have.has(date)) continue
        try {
          const buf = await get(hsiCsvUrl(series, date), { as: 'buffer' })
          if (!buf) continue
          const r = parseHsiCsv(buf, date, row.csvName)
          have.set(date, [date, r.close, r.pe, r.dy])
        } catch (e) { warn(`恒生日报 ${series} ${date}：${msg(e)}`) }
      }
      store.series[series] = [...have.values()].sort((a, b) => a[0].localeCompare(b[0]))
    } catch (e) { warn(`恒生日报目录 ${series}：${msg(e)}`) }
  }
}

function pdfPages(buffer) {
  const p = spawnSync(PYTHON, ['-I', PDF_PY], { input: buffer, maxBuffer: 50e6, timeout: 60000 })
  if (p.status !== 0) throw new Error(`PDF 文本提取失败：${String(p.stderr).slice(0, 160)}`)
  return JSON.parse(String(p.stdout)).pages
}
const hasPypdf = () => spawnSync(PYTHON, ['-I', '-c', 'import pypdf'], { timeout: 20000 }).status === 0

/** 追加下一份月报（每天最多探测一次；运行环境没有 pypdf 时跳过并说明）。 */
async function updateRoundup(monthly, today, warn) {
  const rows = monthly.rows
  const next = nextRoundupMonth(rows.at(-1).month, today)
  if (!next) return
  if (monthly.checked?.month === next.reportMonth && monthly.checked?.date === today) return
  if (!hasPypdf()) { warn('运行环境没有 pypdf，跳过恒生月报（月度行沿用存档最新月份）'); return }
  monthly.checked = { month: next.reportMonth, date: today }
  for (const url of roundupCandidates(next.pubMonth, today)) {
    let buf
    try { buf = await get(url, { as: 'buffer', timeoutMs: 30000, retries: 0, redirect: 'manual' }) } catch { continue }
    if (!buf || buf.length < 1000 || buf.subarray(0, 4).toString() !== '%PDF') continue
    try {
      const r = parseRoundupTable(pdfPages(buf), url)
      if (r.month !== next.reportMonth) { warn(`月报 ${url.split('/').pop()} 报告月 ${r.month} 不是 ${next.reportMonth}`); continue }
      rows.push({ month: r.month, date: r.date, url: r.url, values: r.values })
      return
    } catch (e) { warn(`月报 ${url.split('/').pop()}：${msg(e)}`) }
  }
}

async function fetchCsi(today, warn) {
  const out = {}
  for (const row of HK_ROWS.filter(r => r.csi)) {
    try {
      const start = `${Number(today.slice(0, 4)) - WINDOWS.hk - 1}${today.slice(4)}`
      const body = await get(csiPerfUrl(row.csi, start, today), { as: 'json', headers: { referer: 'https://www.csindex.com.cn/' }, timeoutMs: 30000 })
      out[row.csi] = parseCsiPerfPe(body).filter(p => p.date <= today)
    } catch (e) { warn(`中证 ${row.csi}：${msg(e)}`) }
  }
  return out
}

// ---------------------------------------------------------------------------
// 全球
// ---------------------------------------------------------------------------
const GLOBAL_DEFS = [
  { key: 'spx_fwd', name: '标普500', hom: 'spx', freq: '周', peKind: 'Forward PE（未来 12 个月一致预期）', source: 'History of Market（CC BY 4.0）' },
  { key: 'ndx_fwd', name: '纳斯达克100', hom: 'ndx', freq: '周', peKind: 'Forward PE（未来 12 个月一致预期）', source: 'History of Market（CC BY 4.0）' },
  { key: 'spx_ttm', name: '标普500', multpl: 'pe', freq: '月', peKind: 'PE（TTM，月均价）', source: 'multpl.com' },
  { key: 'spx_cape', name: '标普500', multpl: 'cape', freq: '月', peKind: '席勒 PE（CAPE）', source: 'multpl.com' },
]

async function buildGlobal(today, warn) {
  const rows = []
  const tables = {}
  for (const k of ['pe', 'cape', 'dy']) {
    try { tables[k] = parseMultplTable(await get(MULTPL[k]), today) } catch (e) { warn(`multpl ${k}：${msg(e)}`) }
  }
  // 股息率表的月度日期是月末、市盈率表是月初：按自然月对齐（各取当月最后一个点）
  const dyMap = new Map((tables.dy ?? []).map(p => [p.date.slice(0, 7), p.value]))
  for (const def of GLOBAL_DEFS) {
    try {
      if (def.hom) {
        const h = parseHomForward(await get(HOM[def.hom], { as: 'json' }))
        rows.push(buildGlobalRow(def, h.points.map(p => ({ date: p.date, pe: p.value, dy: null })), { spliceDate: h.spliceDate }))
      } else {
        const t = tables[def.multpl]
        if (!t) throw new Error('表格未取到')
        const pts = t.map(p => ({ date: p.date, pe: p.value, dy: def.multpl === 'pe' ? dyMap.get(p.date.slice(0, 7)) ?? null : null, est: p.est }))
        const ends = []
        for (const p of pts) { if (ends.length && ends.at(-1).date.slice(0, 7) === p.date.slice(0, 7)) ends[ends.length - 1] = p; else ends.push(p) }
        rows.push(buildGlobalRow(def, ends, { estimated: !!ends.at(-1)?.est }))
      }
    } catch (e) {
      warn(`${def.key}：${msg(e)}`)
      rows.push(buildGlobalRow(def, []))
    }
  }
  return rows
}

// ---------------------------------------------------------------------------
// 黄金
// ---------------------------------------------------------------------------
async function buildGoldSection(now, today, warn) {
  const year = Number(today.slice(0, 4))
  // 实际收益率：缓存 + 当年（1 月时连同上一年）
  const realStore = await readJson(`${RAW}real-yield.json`, { version: 1, rows: [] })
  const have = new Map(realStore.rows.map(r => [r[0], r[1]]))
  const years = have.size ? [year - (today.slice(5, 7) === '01' ? 1 : 0), year] : Array.from({ length: WINDOWS.gold + 1 }, (_, i) => year - WINDOWS.gold + i)
  for (const y of [...new Set(years)]) {
    try { for (const p of parseTreasuryReal(await get(treasuryRealUrl(y), { timeoutMs: 30000 }))) have.set(p.date, p.y10) } catch (e) { warn(`财政部实际收益率 ${y}：${msg(e)}`) }
  }
  realStore.rows = [...have.entries()].filter(([d]) => d <= today).sort((a, b) => a[0].localeCompare(b[0]))
  await writeAtomic(`${RAW}real-yield.json`, realStore)

  // CPI：每天最多问一次 BLS（v1 无需密钥，单次最多 10 年）
  const cpiStore = await readJson(`${RAW}cpi.json`, { version: 1, series: BLS_SERIES, checkedAt: null, cpi: {} })
  if (cpiStore.checkedAt !== today) {
    const spans = Object.keys(cpiStore.cpi).length ? [[year - 1, year]] : [[year - 19, year - 10], [year - 9, year]]
    let ok = false
    for (const [a, b] of spans) {
      try {
        const body = await get(BLS_API, { as: 'json', method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ seriesid: [BLS_SERIES], startyear: String(a), endyear: String(b) }), timeoutMs: 30000 })
        Object.assign(cpiStore.cpi, parseBlsCpi(body)); ok = true
      } catch (e) { warn(`BLS CPI ${a}-${b}：${msg(e)}`) }
    }
    if (ok) cpiStore.checkedAt = today
    cpiStore.cpi = Object.fromEntries(Object.entries(cpiStore.cpi).sort((x, y) => x[0].localeCompare(y[0])))
    await writeAtomic(`${RAW}cpi.json`, cpiStore)
  }

  const cut = lastClosedGcDate(now)
  const gc = parseSinaGc(await get(SINA_GC, { headers: { referer: 'https://finance.sina.com.cn/' }, timeoutMs: 30000 })).filter(p => p.date < cut)
  const real = realStore.rows.map(([date, y10]) => ({ date, y10 }))
  return buildGold(gc, real, cpiStore.cpi)
}

// ---------------------------------------------------------------------------
export async function main({ now = new Date().toISOString() } = {}) {
  const t0 = Date.now()
  const today = bjToday(now)
  const warnings = []
  const warn = (s) => { warnings.push(s); console.warn(`! ${s}`) }
  await mkdir(RAW, { recursive: true })
  const prev = await readJson(OUT, null)

  // 港股
  const monthly = await readJson(`${RAW}hk-monthly.json`, null)
  if (!monthly?.rows?.length) throw new Error('缺少恒生月报存档 data-raw/jixing-global/hk-monthly.json')
  const daily = await readJson(`${RAW}hk-daily.json`, { version: 1, series: {} })
  await updateHkDaily(daily, today, warn)
  await writeAtomic(`${RAW}hk-daily.json`, daily)
  try { await updateRoundup(monthly, today, warn) } catch (e) { warn(`恒生月报：${msg(e)}`) }
  await writeAtomic(`${RAW}hk-monthly.json`, monthly)
  const csi = await fetchCsi(today, warn)
  const hkRows = carryRows(HK_ROWS.map(r => buildHkRow(r, hkSamples(r, monthly.rows, daily.series, csi))), prev?.hk?.rows)
  const idx = (ym) => Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1
  const have = new Set(monthly.rows.map(r => r.month))
  const missing = []
  for (let i = idx(monthly.rows[0].month); i <= idx(monthly.rows.at(-1).month); i++) { const m = `${Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, '0')}`; if (!have.has(m)) missing.push(m) }

  // 全球
  const globalRows = carryRows(await buildGlobal(today, warn), prev?.global?.rows)

  // 黄金
  let gold = null, goldError = null
  try { gold = await buildGoldSection(now, today, warn) } catch (e) { goldError = msg(e); warn(`黄金：${goldError}`) }
  if (!gold && prev?.gold) gold = { ...prev.gold, carried: true }
  else if (gold && prev?.gold && validDate(prev.gold.date) && prev.gold.date > gold.date) gold = { ...prev.gold, carried: true }

  const out = {
    version: 1,
    generatedAt: now,
    asOf: null,
    thresholds: THRESHOLDS,
    windows: WINDOWS,
    hk: { rows: hkRows, roundupLatest: monthly.rows.at(-1).month, roundupMissing: missing },
    global: { rows: globalRows },
    gold, goldError: gold ? null : goldError,
    sources: [
      { label: '恒生指数公司每日指数报表', url: 'https://www.hsi.com.hk/en-hk/index-resources/index-reports/' },
      { label: '恒生指数公司 Monthly Roundup', url: 'https://www.hsi.com.hk/en-hk/index-resources/monthly-roundup/' },
      { label: '中证指数官网', url: 'https://www.csindex.com.cn/' },
      { label: 'multpl.com', url: 'https://www.multpl.com/' },
      { label: 'History of Market（CC BY 4.0）', url: 'https://historyofmarket.com/' },
      { label: '新浪财经 COMEX 黄金', url: 'https://finance.sina.com.cn/futures/quotes/GC.shtml' },
      { label: '美国财政部实际收益率曲线', url: 'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/TextView?type=daily_treasury_real_yield_curve' },
      { label: '美国劳工统计局 CPI-U', url: 'https://www.bls.gov/cpi/' },
    ],
  }
  out.asOf = asOfOf(out)
  const decision = shouldWrite(prev, out)
  if (decision.write) await writeAtomic(OUT, out)
  console.log(`jixing-global：${decision.write ? '已写入' : '未写入'}（${decision.reason}）；数据日 ${out.asOf}；港股 ${hkRows.filter(r => r.pe !== null || r.dy !== null).length}/${hkRows.length} 行，全球 ${globalRows.filter(r => r.pe !== null).length}/${globalRows.length} 行，黄金 ${gold ? gold.date : '无'}；请求 ${requests} 次，用时 ${((Date.now() - t0) / 1000).toFixed(1)} 秒；警告 ${warnings.length} 条`)
  return { out, decision, warnings }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error(e); process.exit(1) })
}
