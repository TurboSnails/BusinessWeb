// 今天几星 · 今日星级。行业中性和中证全指口径各用各自最新已发布的交易日。
import fs from 'node:fs'
import { isTradingDay, prevTradingDay } from './market-mood-lib.mjs'
import { addDays, csiPerfUrl, emPaginate, emUrl } from './ths-market-lib.mjs'
import { industryPbUrl } from './jixing-table-lib.mjs'
import {
  MV_FROM, CHECKS, NEUTRAL_MIN_WEEKS, mvUrl, parsePerfSeries, parseMarketVal, treasuryMap, buildStarRows, pickAsOf, buildStarData,
  applyNeutralIndustry, planNeutralIndustryDates, buildNeutralData, staleStarMessage,
} from './jixing-star-lib.mjs'

const OUT = 'public/data/jixing-star.json'
const RAW = 'data-raw/jixing-star'
const MV_FILE = `${RAW}/market-valuation.json`
const INDUSTRY_FILE = `${RAW}/industry-valuation.json`
const MV_CAP = 60 // 首次回补已经入库，日常只补最近缺口。
const UA = { 'user-agent': 'Mozilla/5.0', referer: 'https://www.csindex.com.cn/' }
let requests = 0

async function get(url) {
  for (let i = 0; ; i++) {
    try {
      requests++
      const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30000) })
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url.slice(0, 80)}`)
      return await res.json()
    } catch (e) { if (i >= 2) throw e; await new Promise(r => setTimeout(r, 1500 * (i + 1))) }
  }
}
const emAll = (params) => emPaginate(page => get(emUrl({ ...params, pageNumber: String(page), pageSize: '500' })), params.reportName)

function targetDate(now = new Date()) {
  const bj = new Date(now.getTime() + 8 * 3600e3)
  const today = bj.toISOString().slice(0, 10)
  const afterClose = bj.getUTCHours() * 60 + bj.getUTCMinutes() >= 15 * 60 + 30
  return isTradingDay(today) && afterClose ? today : prevTradingDay(today)
}

function readJson(file, fallback) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback
}

function writeAtomic(file, content) {
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === content) return
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, content)
  fs.renameSync(tmp, file)
}

function writeDateStore(file, store) {
  const sorted = Object.entries(store).sort(([a], [b]) => a.localeCompare(b))
  writeAtomic(file, `{\n${sorted.map(([d, v]) => `${JSON.stringify(d)}:${JSON.stringify(v)}`).join(',\n')}\n}\n`)
}

async function fetchNeutral(mv, candidate, backfill) {
  const store = readJson(INDUSTRY_FILE, {})
  const days = new Set(Object.keys(mv).filter(d => mv[d]))
  // 近期交易日由交易日历补足，行业发布无需等待板块 PB。
  let day = candidate
  for (let i = 0; i < 10; i++) {
    day = prevTradingDay(day)
    days.add(day)
  }
  const missing = planNeutralIndustryDates(store, candidate, [...days].sort(), backfill)
  const pending = []
  let fetched = 0
  let cursor = 0
  const worker = async () => {
    while (cursor < missing.length) {
      const date = missing[cursor++]
      try {
        if (applyNeutralIndustry(store, date, await get(industryPbUrl(date)))) fetched++
        else pending.push(date)
      } catch (e) {
        pending.push(date)
        console.warn(`中证行业 ${date} 采集失败：${e.message}`)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(missing.length, backfill ? 12 : 6) }, worker))
  if (fetched) writeDateStore(INDUSTRY_FILE, store)
  const data = buildNeutralData(store, candidate, prevTradingDay)
  if (pending.length) console.warn(`中证行业响应未采用 ${pending.length} 日（未发布、采集失败或完整度低于库存）：${pending.sort().slice(-12).join('、')}`)
  const incomplete = planNeutralIndustryDates(store, candidate, [...days].sort())
  if (incomplete.length) console.warn(`中证行业 ${incomplete.length} 个近期交易日尚未齐备，下次重试：${incomplete.join('、')}`)
  return { data, fetched, planned: missing.length, pending: pending.length }
}

async function fetchLegacy(mv, candidate) {
  const perf = parsePerfSeries(await get(csiPerfUrl('000985', '2011-01-01', candidate))).filter(r => r.date <= candidate)
  if (!perf.length) throw new Error('中证全指行情为空')

  // 板块 PB 只补本地缺口，新的优先；当日未发布的不记。
  const missing = perf.map(r => r.date).filter(d => d >= MV_FROM && !(d in mv)).reverse().slice(0, MV_CAP)
  for (const date of missing) {
    const s = parseMarketVal(await get(mvUrl(date)), date)
    if (s.status === 'ok') mv[date] = [s.pb, s.pe, s.dp]
    else if (s.status === 'other-day' && date < addDays(candidate, -10)) mv[date] = null
  }
  writeDateStore(MV_FILE, mv)
  const pb = Object.fromEntries(Object.entries(mv).map(([d, v]) => [d, v ? v[0] : null]))
  const y10 = treasuryMap(await emAll({ reportName: 'RPTA_WEB_TREASURYYIELD', columns: 'SOLAR_DATE,EMM00166466', filter: "(SOLAR_DATE>='2011-01-01')", sortColumns: 'SOLAR_DATE', sortTypes: '1' }))
  if (y10.size < 2000) throw new Error(`10 年国债历史过短（${y10.size}）`)

  const rows = buildStarRows({ perf, pb, y10 })
  const idx = pickAsOf(rows, candidate)
  if (idx < 0) throw new Error('三项输入没有共同的完整交易日')
  const data = buildStarData(rows, idx)
  return {
    ...data,
    sources: [
      { label: '中证指数官网 · 中证全指行情（滚动市盈率）', url: csiPerfUrl('000985', addDays(data.asOf, -30), data.asOf) },
      { label: '中证指数官网 · 行业市盈率（板块：沪深市场 PB）', url: mvUrl(data.asOf) },
      { label: '东方财富 · 中美国债收益率（中债 10 年期）', url: emUrl({ reportName: 'RPTA_WEB_TREASURYYIELD', columns: 'SOLAR_DATE,EMM00166466' }) },
    ],
  }
}

async function main() {
  const t0 = Date.now()
  const candidate = targetDate()
  fs.mkdirSync(RAW, { recursive: true })
  const mv = readJson(MV_FILE, {})
  const previous = readJson(OUT, {})
  let legacyFailure = null
  const [industry, legacy] = await Promise.all([
    fetchNeutral(mv, candidate, process.argv.includes('--backfill-industry')),
    fetchLegacy(mv, candidate).catch(e => {
      legacyFailure = e.message
      console.warn(`中证全指口径使用最近已发布文件：${legacyFailure}`)
      return null
    }),
  ])

  const neutral = industry.data
  const priorNeutral = previous.neutral?.minWeeks === NEUTRAL_MIN_WEEKS ? previous.neutral : null
  const publishedNeutral = !neutral || priorNeutral?.asOf > neutral.asOf ||
    (priorNeutral?.asOf === neutral.asOf && priorNeutral.count > neutral.count) ? priorNeutral : neutral
  const publishedLegacy = legacy && !(previous.asOf > legacy.asOf) ? legacy : previous
  const stale = [
    staleStarMessage('中证全指口径', publishedLegacy.asOf, candidate, legacyFailure ?? '目标日三项输入尚未齐备'),
    staleStarMessage('行业中性口径', publishedNeutral?.asOf, candidate,
      industry.pending ? `${industry.pending} 个请求日的响应未发布、日期不符或采集不完整` : '目标日无满足样本门槛的行业数据'),
  ].filter(Boolean)
  if (stale.length) {
    stale.forEach(message => console.error(message))
    process.exitCode = 1
  }
  if (!publishedLegacy.asOf || !publishedNeutral) {
    console.log(JSON.stringify({ candidate, industryPlanned: industry.planned, industryFetched: industry.fetched, requests, ms: Date.now() - t0 }))
    console.log(`${candidate}：尚无可计算的行业中性星级，保留已有文件`)
    return
  }
  if (publishedNeutral.asOf !== candidate || publishedLegacy.asOf !== candidate) {
    console.log(`${candidate} 尚未齐备：行业中性取 ${publishedNeutral.asOf}，中证全指口径取 ${publishedLegacy.asOf}`)
  }
  // 老字段继续提供中证全指口径，包括由日报读取的 asOf/star/history。
  const { generatedAt, ...legacyData } = publishedLegacy
  const byDate = new Map(legacyData.checks.map(row => [row.date, row]))
  const stars = new Map(legacyData.history)
  const checks = CHECKS.map(c => ({
    star: stars.get(c.date) ?? null, band: null, pe: null, pb: mv[c.date]?.[0] ?? null, erp: null,
    ...byDate.get(c.date), ...c,
  }))
  const out = {
    ...legacyData, checks, neutral: publishedNeutral,
    sources: [
      ...legacyData.sources.filter(s => !s.url.endsWith('classType=2')),
      { label: '中证指数官网 · 中证行业分类一级行业（滚动 PE 与 PB）', url: industryPbUrl(publishedNeutral.asOf) },
    ],
  }
  const { generatedAt: previousTime, ...previousData } = previous
  const unchanged = JSON.stringify(out) === JSON.stringify(previousData)
  writeAtomic(OUT, JSON.stringify({ ...out, generatedAt: unchanged ? (previousTime ?? generatedAt) : new Date().toISOString() }) + '\n')
  console.log(JSON.stringify({
    candidate, asOf: publishedNeutral.asOf, neutralStar: publishedNeutral.star, industries: publishedNeutral.count,
    history: publishedNeutral.history.length, legacyAsOf: publishedLegacy.asOf, legacyStar: publishedLegacy.star,
    industryPlanned: industry.planned, industryFetched: industry.fetched, industryPending: industry.pending, requests, ms: Date.now() - t0,
  }))
}

main().catch(e => { console.error(`今日星级采集失败，未发布数据：${e.message}`); process.exitCode = 1 })
