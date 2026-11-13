// S&P 500 / Nasdaq-100 valuation facts for the cycle board: latest weekly 12-month forward PE and its 5-year percentile.
// Reads the History of Market series already maintained in index-history.json (npm run index:update); no network.
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const INDEX_FILE = fileURLToPath(new URL('../public/data/index-history.json', import.meta.url))
const SOURCES = { spx: 'https://historyofmarket.com/api/sp500/forward-pe.json', ndx: 'https://historyofmarket.com/api/ndx/forward-pe.json' }
const NAMES = { spx: '标普500', ndx: '纳指100' }
const MIN_POINTS = 200 // ~4 years of weekly points inside the 5-year window

/** Percentile (share of window points ≤ latest) over the 5 years ending at the latest point. */
export function forwardPeFacts(market, points) {
  const clean = (Array.isArray(points) ? points : []).filter(p => Array.isArray(p) && /^\d{4}-\d{2}-\d{2}$/.test(p[0]) && Number.isFinite(p[1]) && p[1] > 0)
    .sort((a, b) => a[0].localeCompare(b[0]))
  const last = clean.at(-1)
  if (!last) throw new Error(`${market}: 无Forward PE`)
  const from = `${Number(last[0].slice(0, 4)) - 5}${last[0].slice(4)}`
  const window = clean.filter(p => p[0] > from)
  if (window.length < MIN_POINTS) throw new Error(`${market}: 近5年仅${window.length}个周度点`)
  const pct = Number((window.filter(p => p[1] <= last[1]).length / window.length * 100).toFixed(1))
  const common = { market, observationDate: last[0], source: SOURCES[market], kind: 'observed', frequency: 'weekly' }
  const description = `History of Market（CC BY 4.0）${NAMES[market]} 12个月一致预期Forward PE，周度；分位=近5年${window.length}个周度点中不高于最新值的占比（${window[0][0]}至${last[0]}）。`
  return [
    { ...common, metricId: 'fwd_pe', value: last[1], unit: '倍', description },
    { ...common, metricId: 'fwd_pe_5y_percentile', value: pct, unit: '%', description },
  ]
}

export async function collectUsForwardPe(ctx, file = INDEX_FILE) {
  const indexes = JSON.parse(await readFile(file, 'utf8')).indexes ?? {}
  const facts = []
  for (const market of ['spx', 'ndx']) {
    try { facts.push(...forwardPeFacts(market, indexes[market]?.ref?.points)) }
    catch (e) { ctx?.issue?.(`us-fwd-pe: ${e.message}`) }
  }
  return facts
}
