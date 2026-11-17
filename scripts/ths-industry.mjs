// 同花顺 · 行业景气：盘后采集中证行业估值、东财业绩报表行业汇总、中证全指行业指数涨跌，以及四个宽基的成分股贡献点数。
// 只用带日期的公开源（中证指数官网、国证指数官网、东方财富数据中心与日 K）；任一环节失败整批放弃，保留上一份文件。
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { isTradingDay, prevTradingDay } from './market-mood-lib.mjs'
import { addDays, csiPerfUrl, emUrl, parseCsiPerf } from './ths-market-lib.mjs'
import {
  CICS_FROM, CONTRIB_INDICES, INDUSTRY_INDEX, PERIOD_COVERAGE, ROE_MIN_ABS, SCORE_ITEMS, SCORE_MIN_ITEMS,
  csiIndustryUrl, csiStockUrl, csiContribUrl, csiWeightUrl, cniWeightUrl, klineUrl,
  weekEnds, quarterEnds, periodLabel, lastYear, parseCsiIndustry, historyEntry, valuationPct, parseCsiStocks,
  parseCpd, industryFinance, periodReturn, scoreRows, parseDet, parseCsiWeights, parseCniSample, driftWeights,
  cniPrevWeights, contributions, summarize, crossCheck, parseKline, closePair,
} from './ths-industry-lib.mjs'

const OUT = 'public/data/ths-tab-industry.json'
const RAW = 'data-raw/ths-tab-industry'
const HIST = `${RAW}/valuation-history.json`
const XLS_PY = fileURLToPath(new URL('./ths-industry-xls.py', import.meta.url))
const UA = { 'user-agent': 'Mozilla/5.0', referer: 'https://data.eastmoney.com/' }

// 中证官网短时间请求过多会返回 403：同站请求至少间隔 700ms，403 时长退避。
let lastCsi = 0
async function get(url, type = 'json', headers = {}) {
  const csi = url.includes('csindex.com.cn')
  for (let i = 0; ; i++) {
    if (csi) {
      const wait = lastCsi + 700 - Date.now()
      if (wait > 0) await new Promise(r => setTimeout(r, wait))
      lastCsi = Date.now()
    }
    try {
      const res = await fetch(url, { headers: { ...UA, ...(csi ? { referer: 'https://www.csindex.com.cn/' } : {}), ...headers }, signal: AbortSignal.timeout(45000) })
      if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status} ${url.slice(0, 90)}`), { status: res.status })
      if (type === 'buf') return Buffer.from(await res.arrayBuffer())
      return type === 'json' ? await res.json() : await res.text()
    } catch (e) {
      if (i >= 3) throw e
      await new Promise(r => setTimeout(r, e.status === 403 ? 30000 * (i + 1) : 1500 * (i + 1)))
    }
  }
}
async function emAll(params, maxPages = 30) {
  const out = []
  for (let page = 1; page <= maxPages; page++) {
    const body = await get(emUrl({ ...params, pageNumber: String(page), pageSize: '500' }))
    if (body?.code === 9201 || (body?.success === false && /数据/.test(body?.message ?? ''))) return out
    if (!body?.success || !Array.isArray(body?.result?.data)) throw new Error(`东财 ${params.reportName} 返回异常：${body?.message}`)
    out.push(...body.result.data)
    if (page >= body.result.pages) return out
  }
  throw new Error(`东财 ${params.reportName} 页数超过上限`)
}
async function xls(url, headers) {
  const buf = await get(url, 'buf', headers)
  if (buf.length < 1000 || buf.readUInt32BE(0) !== 0xd0cf11e0) throw new Error(`不是 xls 文件：${url.slice(0, 90)}`)
  return JSON.parse(execFileSync('python3', ['-I', XLS_PY], { input: buf, maxBuffer: 32 << 20 }).toString('utf8'))
}
const det = async (date) => parseDet(await emAll({ reportName: 'RPT_VALUEANALYSIS_DET', columns: 'SECURITY_CODE,SECURITY_NAME_ABBR,TRADE_DATE,CLOSE_PRICE,CHANGE_RATE,NOTLIMITED_MARKETCAP_A', filter: `(TRADE_DATE='${date}')`, sortColumns: 'SECURITY_CODE', sortTypes: '1' }), date)
const cpd = async (period) => parseCpd(await emAll({ reportName: 'RPT_LICO_FN_CPD', columns: 'SECURITY_CODE,SECURITY_TYPE_CODE,REPORTDATE,NOTICE_DATE,PARENT_NETPROFIT,TOTAL_OPERATE_INCOME,WEIGHTAVG_ROE', filter: `(REPORTDATE='${period}')`, sortColumns: 'SECURITY_CODE', sortTypes: '1' }), period)
const cpdCount = async (period) => (await get(emUrl({ reportName: 'RPT_LICO_FN_CPD', columns: 'SECURITY_CODE', filter: `(REPORTDATE='${period}')`, pageSize: '1', pageNumber: '1' })))?.result?.count ?? 0

function targetDate(now = new Date()) {
  const bj = new Date(now.getTime() + 8 * 3600e3)
  const today = bj.toISOString().slice(0, 10)
  const afterClose = bj.getUTCHours() * 60 + bj.getUTCMinutes() >= 15 * 60 + 30
  return { today, date: isTradingDay(today) && afterClose ? today : prevTradingDay(today) }
}

/** 估值历史：首次运行按周回填 2021-12-17 起的中证行业估值（种子），之后每天追加当日。 */
async function loadHistory(date, todayRows) {
  const hist = fs.existsSync(HIST) ? JSON.parse(fs.readFileSync(HIST, 'utf8')) : { seededAt: null, dates: {} }
  if (!hist.seededAt) {
    for (const end of weekEnds(CICS_FROM, prevTradingDay(date))) {
      // 本地节假日表未覆盖的休市日官网会回退到别的日期：最多往前试 4 个工作日
      let d = end
      for (let k = 0; k < 5; k++, d = prevTradingDay(d)) {
        if (hist.dates[d]) break
        try { hist.dates[d] = historyEntry(parseCsiIndustry(await get(csiIndustryUrl(d)), d)); break } catch (e) { if (k === 4) console.log(`回填 ${end} 所在周跳过：${e.message}`) }
      }
    }
    hist.seededAt = date
    // 种子只是原始历史（不对外发布），先落盘，避免后续环节失败时重复回填
    fs.mkdirSync(RAW, { recursive: true })
    fs.writeFileSync(HIST, JSON.stringify(hist) + '\n')
  }
  hist.dates[date] = historyEntry(todayRows)
  hist.dates = Object.fromEntries(Object.entries(hist.dates).sort(([a], [b]) => a.localeCompare(b)))
  return hist
}

async function industrySection(date, stocks) {
  const rows = parseCsiIndustry(await get(csiIndustryUrl(date)), date)
  const hist = await loadHistory(date, rows)
  // 最新一期：披露家数 ≥ 样本数 × 85% 的最近季度
  let period = null
  for (const q of quarterEnds(date, 4)) if (await cpdCount(q) >= stocks.size * PERIOD_COVERAGE) { period = q; break }
  if (!period) throw new Error('找不到披露充分的报告期')
  const fin = industryFinance(await cpd(period), await cpd(lastYear(period)), stocks)
  const start = addDays(date, -140)
  const out = []
  for (const r of rows) {
    const map = INDUSTRY_INDEX[r.code]
    let ret20 = null, ret60 = null
    if (map) {
      const s = parseCsiPerf(await get(csiPerfUrl(map[0], start, date)), date)
      ret20 = periodReturn(s, 20); ret60 = periodReturn(s, 60)
    }
    const f = fin.get(r.code) ?? { npYoy: null, revYoy: null, roe: null, finCount: 0, yoyCount: 0, roeCount: 0 }
    out.push({
      ...r, peP5: valuationPct(hist.dates, r.code, date, 5), peP10: null, pbP5: valuationPct(hist.dates, r.code, date, 5, 1),
      ...f, ret20, ret60, indexCode: map?.[0] ?? null, indexName: map?.[1] ?? null,
    })
  }
  if (out.filter(r => r.ret60 !== null).length < out.length - 2) throw new Error('行业指数涨跌缺失过多')
  const samples = Object.keys(hist.dates).filter(d => d >= CICS_FROM)
  return { hist, data: { period, periodLabel: periodLabel(period), priorPeriod: lastYear(period), historyFrom: samples[0], historySamples: samples.length, rows: scoreRows(out) } }
}

async function contributionSection(date, stocks) {
  const prev = prevTradingDay(date)
  const dayCache = new Map()
  const day = async (d) => { if (!dayCache.has(d)) dayCache.set(d, await det(d)); return dayCache.get(d) }
  const today = await day(date), prevDay = await day(prev)
  const official = await get(csiContribUrl)
  const offMap = official?.data?.updateDate === date.replaceAll('-', '') ? official.data.contributionPointMap ?? {} : {}
  const out = []
  for (const idx of CONTRIB_INDICES) {
    const series = idx.code.startsWith('399')
      ? parseKline(await get(klineUrl(`0.${idx.code}`, date), 'json', { referer: 'https://quote.eastmoney.com/' }), date)
      : parseCsiPerf(await get(csiPerfUrl(idx.code, addDays(date, -14), date)), date)
    const level = closePair(series, date)
    let weights, weightDate, weightNote
    if (idx.weight === 'csi') {
      const w = parseCsiWeights(await xls(csiWeightUrl(idx.code)), idx.code)
      if (w.date > prev) throw new Error(`${idx.name} 权重文件日期 ${w.date} 晚于前一交易日`)
      weightDate = w.date
      weights = driftWeights(w.list, w.date === prev ? null : await day(w.date), prevDay)
      weightNote = `中证指数官网收盘权重（${w.date}），按成分股价格漂移到 ${prev}`
    } else {
      const s = parseCniSample(await xls(cniWeightUrl(idx.code, date), { referer: 'https://www.cnindex.com.cn/' }))
      if (s.date !== date) throw new Error(`${idx.name} 样本文件日期 ${s.date} 不是 ${date}`)
      weightDate = s.date
      weights = cniPrevWeights(s.list, today, prevDay)
      weightNote = `国证指数官网前 ${s.list.filter(r => r.weight !== null).length} 大权重（${s.date} 收盘）还原到 ${prev}，其余成分按 ${prev} 流通市值分配剩余权重`
    }
    const rows = contributions({ weights, today, prevClose: level.prevClose, stocks })
    const sum = summarize(rows, level.change)
    if (sum.missing > rows.length * 0.1) throw new Error(`${idx.name} 缺少当日涨跌的成分过多`)
    out.push({ code: idx.code, name: idx.name, date, ...level, weightSource: idx.weight, weightDate, weightNote, constituents: rows.length, ...sum, check: crossCheck(offMap[idx.code], rows) })
  }
  return out
}

async function main() {
  const { today, date } = targetDate()
  let stocks
  try { stocks = parseCsiStocks(await get(csiStockUrl(date)), date) } catch (e) { console.log(`${today}：${e.message}，数据未就绪，跳过`); return }
  const { hist, data: industry } = await industrySection(date, stocks)
  const contribution = await contributionSection(date, stocks)
  const data = {
    version: 1, asOf: date, generatedAt: new Date().toISOString(),
    method: { scoreItems: SCORE_ITEMS.map(i => i.label), scoreMin: SCORE_MIN_ITEMS, roeMinAbs: ROE_MIN_ABS, coverage: PERIOD_COVERAGE },
    industry, contribution,
    sources: [
      { label: '中证指数官网 · 行业市盈率（中证行业）', url: csiIndustryUrl(date) },
      { label: '中证指数官网 · 个股行业分类与市盈率', url: csiStockUrl(date) },
      { label: '中证指数官网 · 指数行情（行业指数、宽基）', url: csiPerfUrl('932139', addDays(date, -30), date) },
      { label: '中证指数官网 · 收盘权重文件（沪深300）', url: csiWeightUrl('000300') },
      { label: '中证指数官网 · 指数贡献（核对用）', url: csiContribUrl },
      { label: '国证指数官网 · 创业板指样本与权重', url: cniWeightUrl('399006', date) },
      { label: '东方财富 · 业绩报表', url: emUrl({ reportName: 'RPT_LICO_FN_CPD' }) },
      { label: '东方财富 · 个股估值（收盘价、涨跌幅、流通市值）', url: emUrl({ reportName: 'RPT_VALUEANALYSIS_DET' }) },
      { label: '东方财富 · 创业板指日 K', url: klineUrl('0.399006', date) },
    ],
  }
  fs.mkdirSync(RAW, { recursive: true })
  fs.writeFileSync(HIST, JSON.stringify(hist) + '\n')
  fs.writeFileSync(`${OUT}.tmp`, JSON.stringify(data) + '\n')
  fs.renameSync(`${OUT}.tmp`, OUT)
  console.log(`行业景气页数据已更新：${date}（${industry.periodLabel}，估值历史 ${industry.historySamples} 个采样）`)
}

main().catch(e => { console.error(`行业景气页采集失败，未发布数据：${e.message}`); process.exitCode = 1 })
