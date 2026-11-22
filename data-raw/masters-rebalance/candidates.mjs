// 候选组合稳健性比较：多区间、滚动起点、前后半段、剔除最大贡献者。
// 用法：node data-raw/masters-rebalance/candidates.mjs  → candidates.json
import { build } from 'esbuild'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = resolve(HERE, '../..'), DATA = join(ROOT, 'public/data/portfolio-prices')
const bundle = await build({ entryPoints: [join(ROOT, 'src/features/portfolio-rebalance/engine.ts')], bundle: true, format: 'esm', write: false, platform: 'node' })
const { runBacktest } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
const index = JSON.parse(await readFile(join(DATA, 'index.json'), 'utf8'))
const book = {}
for (const { symbol } of index.items) {
  const { dates, adjClose } = JSON.parse(await readFile(join(DATA, `${symbol}.json`), 'utf8'))
  const valid = dates.flatMap((day, i) => Number.isFinite(adjClose[i]) && adjClose[i] > 0 ? [[day, adjClose[i]]] : [])
  book[symbol] = { dates: valid.map(([day]) => day), adjClose: valid.map(([, price]) => price) }
}

const P = [
  { id: 'P0', name: '现组合', s: { AVGO: 25, META: 25, CB: 25, SOFI: 12.5, RKLB: 12.5 }, stable: 'CB' },
  { id: 'P1', name: 'Meta 换苹果', s: { AVGO: 25, AAPL: 25, CB: 25, SOFI: 12.5, RKLB: 12.5 }, stable: 'CB' },
  { id: 'P2', name: 'Meta 换 Visa', s: { AVGO: 25, V: 25, CB: 25, SOFI: 12.5, RKLB: 12.5 }, stable: 'CB' },
  { id: 'P3', name: '稳定股换伯克希尔', s: { AVGO: 25, META: 25, 'BRK-B': 25, SOFI: 12.5, RKLB: 12.5 }, stable: 'BRK-B' },
  { id: 'P4', name: '双稳定（安达+伯克希尔）', s: { AVGO: 20, META: 20, CB: 20, 'BRK-B': 20, SOFI: 10, RKLB: 10 }, stable: 'CB' },
  { id: 'P5', name: '核心卫星六只', s: { AVGO: 20, AAPL: 20, V: 20, CB: 20, SOFI: 10, RKLB: 10 }, stable: 'CB' },
  { id: 'P6', name: '弹性换拼多多（低相关）', s: { AVGO: 25, AAPL: 25, CB: 25, PDD: 12.5, RKLB: 12.5 }, stable: 'CB' },
  { id: 'P7', name: '大师低波 + 高波', s: { AAPL: 25, MA: 25, 'BRK-B': 25, SOFI: 12.5, RKLB: 12.5 }, stable: 'BRK-B' },
  { id: 'P8', name: '全大师（含高波大师股）', s: { AAPL: 25, MA: 25, 'BRK-B': 25, PDD: 12.5, KKR: 12.5 }, stable: 'BRK-B' },
  { id: 'P9', name: '大师第一大持仓六只', s: { AAPL: 1, GOOGL: 1, QSR: 1, MA: 1, WAT: 1, 'BRK-B': 1 }, stable: 'BRK-B' },
  { id: 'P10', name: '科技龙头等权（对照）', s: { AVGO: 1, META: 1, MSFT: 1, GOOGL: 1, AMZN: 1 }, stable: null },
]
for (const p of P) { const t = Object.values(p.s).reduce((a, b) => a + b, 0); p.symbols = Object.keys(p.s); p.weights = Object.values(p.s).map(v => v / t) }
const RULES = { hold: { kind: 'buyHold' }, rel40: { kind: 'relative', pct: 0.4 }, year: { kind: 'calendar', every: 'year' } }
const sw = st => ({ stable: st, entry: 0.2, gap: 0.05, step: 0.25, recover: 0.05, cap: 0.5 })
const RESEARCH_END = '2026-11-20'

function requireCoverage(symbol, end) {
  const series = book[symbol]
  const last = series?.dates.at(-1)
  if (!last || last < end) throw new Error(`${symbol} 数据仅到 ${last ?? '无有效交易日'}，未覆盖研究截止日 ${end}`)
  return series
}

function go(p, rule, { start, end = RESEARCH_END, symbols = p.symbols, weights = p.weights, withSwitch = false } = {}) {
  const switchRule = withSwitch && p.stable && symbols.includes(p.stable) ? sw(p.stable) : undefined
  for (const symbol of symbols) requireCoverage(symbol, end)
  if (switchRule) requireCoverage('QQQ', end)
  const r = runBacktest(book, { symbols, weights, rule: RULES[rule], switch: switchRule, start, end, cost: 0.001, initial: 1e6, signal: 'QQQ' })
  return { final: r.final, cagr: r.cagr, mdd: r.maxDrawdown.value, vol: r.vol, cer: r.cer, trades: r.tradeCount, start: r.start, end: r.end, finalWeights: r.finalWeights }
}
const variants = p => [['hold', 'hold', false], ['rel40', 'rel40', false], ['year', 'year', false], ...(p.stable ? [['switch', 'rel40', true]] : [])]
function qqq(start, end = RESEARCH_END) {
  const { dates, adjClose } = requireCoverage('QQQ', end)
  const first = dates.findIndex(day => day >= start)
  const last = dates.findLastIndex(day => day <= end)
  if (first < 0 || last <= first) throw new Error(`QQQ 在 ${start} 至 ${end} 的有效交易日不足`)
  let peak = 0
  let mdd = 0
  for (let i = first; i <= last; i++) {
    peak = Math.max(peak, adjClose[i])
    mdd = Math.min(mdd, adjClose[i] / peak - 1)
  }
  const final = adjClose[last] / adjClose[first]
  const years = (Date.parse(dates[last]) - Date.parse(dates[first])) / 864e5 / 365.25
  return { final, cagr: final ** (1 / years) - 1, mdd, end: dates[last] }
}
const median = xs => { const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
const W = '2021-08-25', MID_END = '2023-12-29', MID_START = '2024-01-02'
const starts = []; for (let y = 2021, m = 9; y < 2024 || (y === 2024 && m <= 11); m++) { if (m > 12) { m = 1; y++ } starts.push(`${y}-${String(m).padStart(2, '0')}-01`) }
const full = qqq(W)
const out = { dataAsOf: full.end, qqq: { full, h1: qqq(W, MID_END), h2: qqq(MID_START) }, rollingStarts: starts.length, portfolios: [] }
for (const p of P) {
  const row = { id: p.id, name: p.name, symbols: p.symbols, weights: p.weights, stable: p.stable, full: {}, h1: {}, h2: {}, rolling: {}, long: null, leaveOut: null }
  for (const [k, rule, s] of variants(p)) {
    row.full[k] = go(p, rule, { start: W, withSwitch: s })
    row.h1[k] = go(p, rule, { start: W, end: MID_END, withSwitch: s })
    row.h2[k] = go(p, rule, { start: MID_START, withSwitch: s })
    const runs = starts.map(st => ({ st, r: go(p, rule, { start: st, withSwitch: s }), q: qqq(st) }))
    row.rolling[k] = { medCagr: median(runs.map(x => x.r.cagr)), worstCagr: Math.min(...runs.map(x => x.r.cagr)), medMdd: median(runs.map(x => x.r.mdd)), worstMdd: Math.min(...runs.map(x => x.r.mdd)), beatQqq: runs.filter(x => x.r.cagr > x.q.cagr).length / runs.length, cagrs: runs.map(x => +x.r.cagr.toFixed(4)) }
  }
  for (const k of Object.keys(row.rolling)) if (k !== 'hold') row.rolling[k].beatHold = row.rolling[k].cagrs.filter((c, i) => c > row.rolling.hold.cagrs[i]).length / starts.length
  // 剔除期末贡献最大的一只（按不动期末权重最大者），其余按比例放大，看是否依赖单一赢家
  const fw = row.full.hold.finalWeights, top = Object.keys(fw).sort((a, b) => fw[b] - fw[a])[0]
  const keep = p.symbols.filter(x => x !== top); if (keep.length >= 2) { const ws = keep.map(x => p.weights[p.symbols.indexOf(x)]), t = ws.reduce((a, b) => a + b, 0)
    row.leaveOut = { dropped: top, hold: go(p, 'hold', { start: W, symbols: keep, weights: ws.map(x => x / t) }), rel40: go(p, 'rel40', { start: W, symbols: keep, weights: ws.map(x => x / t) }) } }
  // 长区间：组合里没有 2021 年才上市的股票时，从 2018-07-26 起算
  const firsts = p.symbols.map(x => book[x].dates[0]); if (firsts.every(d => d <= '2018-07-26')) { row.long = {}; for (const [k, rule, s] of variants(p)) row.long[k] = go(p, rule, { start: '2018-07-26', withSwitch: s }); out.qqq.long = qqq('2018-07-26') }
  out.portfolios.push(row)
}
await writeFile(join(HERE, 'candidates.json'), `${JSON.stringify(out, null, 1)}\n`)
console.log('ok', out.portfolios.length, 'portfolios,', starts.length, 'rolling starts')
