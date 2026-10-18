// Weekly/monthly snapshot for the long-cycle observation board. No trading/backtest claims.
import { readFile, writeFile, rename } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const FILE = fileURLToPath(new URL('../public/data/market-cycle.json', import.meta.url))
const SYMBOLS = { csi300: 'sh000300', hsi: 'hkHSI', hstech: 'hkHSTECH' }
export function parseBars(body, symbol, period) {
  const data = body?.data?.[symbol]
  const rows = data?.[period] ?? data?.[`qfq${period}`]
  if (!Array.isArray(rows) || !rows.length) throw new Error(`${symbol}/${period}: 无K线`)
  let previous = ''
  return rows.map(row => {
    const [date, , rawClose, , , rawVolume] = row
    const close = Number(rawClose), volume = Number(rawVolume)
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date || date <= previous
      || rawClose == null || rawClose === '' || !Number.isFinite(close) || close <= 0 || rawVolume == null || rawVolume === '' || !Number.isFinite(volume) || volume < 0) throw new Error(`${symbol}/${period}: 无效或重复K线`)
    previous = date
    return { date, close, volume }
  })
}
async function get(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}
export async function buildSnapshot(previous, fetchJson = get, now = new Date().toISOString()) {
  const result = { schemaVersion: 1, generatedAt: now, markets: {}, warnings: [] }
  const outcomes = await Promise.allSettled(Object.entries(SYMBOLS).map(async ([market, symbol]) => {
    const source = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${symbol}`
    const [week, month] = await Promise.all(['week', 'month'].map(async period => parseBars(await fetchJson(`${source},${period},,,800,qfq`), symbol, period)))
    if (week.length < 52 || month.length < 60) throw new Error('历史覆盖不足：需52周 / 60个月')
    if ([...week, ...month].some(b => b.date > now.slice(0, 10))) throw new Error('行情日期晚于抓取日期')
    return [market, { week, month, source: `${source},week,,,800,qfq`, fetchedAt: now }]
  }))
  outcomes.forEach((out, i) => {
    const market = Object.keys(SYMBOLS)[i]
    if (out.status === 'fulfilled') result.markets[out.value[0]] = out.value[1]
    else {
      if (previous?.markets?.[market]) result.markets[market] = previous.markets[market]
      result.warnings.push(`${market}: ${out.reason instanceof Error ? out.reason.message : '取数失败'}${previous?.markets?.[market] ? '，保留旧快照及原日期' : '，未提供该指数数据'}`)
    }
  })
  return result
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let previous = null
  try { previous = JSON.parse(await readFile(FILE, 'utf8')) } catch { /* first run */ }
  const result = await buildSnapshot(previous)
  if (!Object.keys(result.markets).length) throw new Error(`全部取数失败，未写入：${result.warnings.join('; ')}`)
  await writeFile(`${FILE}.tmp`, `${JSON.stringify(result)}\n`)
  await rename(`${FILE}.tmp`, FILE)
  for (const [market, d] of Object.entries(result.markets)) console.log(`${market}: ${d.week.length}周 / ${d.month.length}月，抓取于 ${d.fetchedAt}`)
  for (const w of result.warnings) console.warn(w)
  // Partial success is publishable. Per-market warnings and original dates expose failures.
}
