// 今天几星 · 今日星级：盘后计算本站自定的 A 股星级（1.0–5.9 星，越高越便宜）。
// 输入：中证全指滚动 PE（中证官网行情）、沪深市场 PB（中证官网「行业市盈率」板块口径）、10 年期国债收益率（东财 · 中债口径）。
// 只用带日期的公开源；数据日 = 三项当日都已发布的最后一个交易日。任何环节失败都不写文件（保留上一份）。
import fs from 'node:fs'
import { isTradingDay, prevTradingDay } from './market-mood-lib.mjs'
import { addDays, csiPerfUrl, emPaginate, emUrl } from './ths-market-lib.mjs'
import { MV_FROM, mvUrl, parsePerfSeries, parseMarketVal, treasuryMap, buildStarRows, pickAsOf, buildStarData } from './jixing-star-lib.mjs'

const OUT = 'public/data/jixing-star.json'
const RAW = 'data-raw/jixing-star'
const MV_FILE = `${RAW}/market-valuation.json`
const MV_CAP = 60 // 每次最多补抓的 PB 日数（日常 1–2 天；首次回补已离线完成并入库）
const UA = { 'user-agent': 'Mozilla/5.0', referer: 'https://www.csindex.com.cn/' }

async function get(url) {
  for (let i = 0; ; i++) {
    try {
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
  return { today, candidate: isTradingDay(today) && afterClose ? today : prevTradingDay(today) }
}

async function main() {
  const t0 = Date.now()
  const { today, candidate } = targetDate()
  const perf = parsePerfSeries(await get(csiPerfUrl('000985', '2011-01-01', candidate))).filter(r => r.date <= candidate)
  if (!perf.length) throw new Error('中证全指行情为空')

  // PB：本地累积的逐日板块估值，只补缺的日子（新的优先）；当日未发布的不记，旧日确实无数据的记 null 不再重抓
  const mv = fs.existsSync(MV_FILE) ? JSON.parse(fs.readFileSync(MV_FILE, 'utf8')) : {}
  const missing = perf.map(r => r.date).filter(d => d >= MV_FROM && !(d in mv)).reverse().slice(0, MV_CAP)
  let fetched = 0
  for (const d of missing) {
    const s = parseMarketVal(await get(mvUrl(d)), d)
    if (s.status === 'ok') { mv[d] = [s.pb, s.pe, s.dp]; fetched++ } else if (s.status === 'other-day' && d < addDays(candidate, -10)) mv[d] = null
  }
  const pb = Object.fromEntries(Object.entries(mv).map(([d, v]) => [d, v ? v[0] : null]))

  const y10 = treasuryMap(await emAll({ reportName: 'RPTA_WEB_TREASURYYIELD', columns: 'SOLAR_DATE,EMM00166466', filter: "(SOLAR_DATE>='2011-01-01')", sortColumns: 'SOLAR_DATE', sortTypes: '1' }))
  if (y10.size < 2000) throw new Error(`10 年国债历史过短（${y10.size}）`)

  const rows = buildStarRows({ perf, pb, y10 })
  const idx = pickAsOf(rows, candidate)
  fs.mkdirSync(RAW, { recursive: true })
  const sorted = Object.fromEntries(Object.entries(mv).sort(([a], [b]) => a.localeCompare(b)))
  // 一天一行，便于逐日 diff
  const mvText = `{\n${Object.entries(sorted).map(([d, v]) => `${JSON.stringify(d)}:${JSON.stringify(v)}`).join(',\n')}\n}\n`
  if (idx < 0) { fs.writeFileSync(MV_FILE, mvText); console.log(`${today}：三项输入没有共同的完整交易日，未更新`); return }
  const data = buildStarData(rows, idx)
  let prev = null
  try { prev = JSON.parse(fs.readFileSync(OUT, 'utf8')) } catch { /* 无旧文件 */ }
  fs.writeFileSync(MV_FILE, mvText)
  if (prev?.asOf && prev.asOf > data.asOf) { console.log(`已有更新的星级文件（${prev.asOf}），本次 ${data.asOf} 不覆盖`); return }
  if (data.asOf !== candidate) console.log(`${candidate} 的输入尚未全部发布（PE ${perf.at(-1).date} / PB ${Object.keys(sorted).filter(d => sorted[d]).at(-1)} / 国债 ${[...y10.keys()].sort().at(-1)}），数据日取 ${data.asOf}`)
  const out = {
    ...data, generatedAt: new Date().toISOString(),
    sources: [
      { label: '中证指数官网 · 中证全指行情（滚动市盈率）', url: csiPerfUrl('000985', addDays(data.asOf, -30), data.asOf) },
      { label: '中证指数官网 · 行业市盈率（板块：沪深市场 PB）', url: mvUrl(data.asOf) },
      { label: '东方财富 · 中美国债收益率（中债 10 年期）', url: emUrl({ reportName: 'RPTA_WEB_TREASURYYIELD', columns: 'SOLAR_DATE,EMM00166466' }) },
    ],
  }
  fs.writeFileSync(`${OUT}.tmp`, JSON.stringify(out) + '\n')
  fs.renameSync(`${OUT}.tmp`, OUT)
  console.log(JSON.stringify({ asOf: data.asOf, star: data.star, band: data.band, change: data.change, history: data.history.length, pbFetched: fetched, ms: Date.now() - t0 }))
}

main().catch(e => { console.error(`今日星级采集失败，未发布数据：${e.message}`); process.exitCode = 1 })
