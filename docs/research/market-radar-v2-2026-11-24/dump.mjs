import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const imp = p => import(resolve(ROOT, p))
const { collectCore } = await imp('scripts/macro-posture.mjs')
const { readJson } = await imp('scripts/lib/json-io.mjs')
const { makePanel, monthEnd, panelAt, valueAt, percentile } = await imp('scripts/lib/macro-posture/panel.mjs')
const { evaluate } = await imp('scripts/lib/macro-posture/model.mjs')
const { rankAt, scoreIndicator } = await imp('scripts/lib/market-radar/indicators.mjs')
const { buildRadarSeries, parseShillerEps, parseShillerPrice, refreshRadarSources } = await imp('scripts/lib/market-radar/sources.mjs')
const { backtestMonthEnds, monthlyReturns } = await imp('scripts/lib/macro-posture/backtest.mjs')
const { panelWithVintages } = await imp('scripts/lib/macro-posture/vintages.mjs')
const DATA = resolve(ROOT, 'public/data')
const today = new Date().toISOString().slice(0, 10)
const lastComplete = monthEnd(today, -1)
const readData = name => readJson(resolve(DATA, name + '.json'), null)
const local = readData('us-market-data').series
const macroUs = readData('macro-us').series
const universes = readData('us-market-breadth').breadth
const indexes = readData('index-history').indexes
const dailyRows = readData('macro-posture-daily').rows
const shillerCsv = readFileSync(resolve(ROOT, 'data-raw/sp500-backtest/shiller.csv'), 'utf8')
const shillerEps = parseShillerEps(shillerCsv)
const shillerPrice = parseShillerPrice(shillerCsv)
const vintages = Object.fromEntries(['PAYEMS', 'INDPRO', 'PCEPILFE', 'IC4WSA', 'AWHMAN'].map(id => [id, readJson(resolve(ROOT, 'data-raw/macro-posture-vintages', id + '.json'), {})]))
const marketCache = {
  breadth: readJson(resolve(ROOT, 'data-raw/macro-posture-market/industry-breadth.json'), []),
  volume: readJson(resolve(ROOT, 'data-raw/macro-posture-market/spx-monthly-volume.json'), []),
}
const offline = async () => { throw new Error('offline (research)') }
const [core, fetched] = await Promise.all([
  collectCore(today, fetch),
  refreshRadarSources({ cache: resolve(ROOT, 'data-raw/market-radar'), fetcher: offline, today, localVix: local.vixDaily?.history ?? [], shillerEps, warn: () => {} }),
])
const panel = makePanel(core)
const currentPanel = makePanel(core, { mode: 'current' })
const { historical } = buildRadarSeries({ local, macroUs, breadth: universes.spx, universes, indexes, marketCache, fetched, shillerEps, shillerPrice, panel, currentPanel, today, lastComplete, spxDaily: dailyRows.map(([d, c]) => [d, c]) })
const IDS = ['baaChange', 'erp', 'pe', 'cape', 'equityShare', 'cashShare', 'finraDebtYoy', 'breadth', 'volume', 'epsYoy']
const RANKED = ['erp', 'pe', 'cape', 'equityShare', 'cashShare']
const returns = monthlyReturns(panel, lastComplete)
const months = backtestMonthEnds(today).map(date => {
  const d = date.slice(0, 7)
  const ind = {}
  for (const id of IDS) {
    const rows = historical[id] ?? []
    const r = RANKED.includes(id) ? rankAt(rows, date) : null
    const point = r?.point ?? valueAt(rows, date)
    ind[id] = point ? { v: point.value, o: point.observedOn, p: r?.percentile ?? null, below: point.below ?? null } : null
  }
  const rev = panelAt(panel, date, null)
  const rt = panelAt(panelWithVintages(panel, vintages, date), date, null)
  const er = evaluate(rev), et = evaluate(rt)
  return { d, ind, below: rt.tactical.below, price: rt.tactical.price, sma10: rt.tactical.sma10,
    mastersRt: et.final.tier, mastersRev: er.final.tier, regimeRt: et.regime.tier, R: et.regime.score, pillars: et.pillars,
    ret: returns.get(d) ?? null }
})
const first = Object.fromEntries(Object.keys(historical).map(id => [id, [historical[id]?.[0]?.observedOn, historical[id]?.at(-1)?.observedOn, historical[id]?.length]]))
const pack = rows => (rows ?? []).map(p => [p.observedOn, p.availableOn, p.value])
const raw = { pe: pack(historical.pe), erp: pack(historical.erp), equityShare: pack(historical.equityShare), cashShare: pack(historical.cashShare), price: pack(panel.price), GS10: pack(panel.GS10) }
writeFileSync(new URL('./dump.json', import.meta.url), JSON.stringify({ today, months, first, raw }))
console.log(months.length, JSON.stringify(first, null, 0))
console.log(JSON.stringify(months.at(-1)))
