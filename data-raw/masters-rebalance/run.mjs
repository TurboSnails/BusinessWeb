// 大师长期持仓再平衡重算（方案见 docs/research/masters-holdings-rebalance-2026-11-22/PLAN.md）
// 用网站同一个回测引擎（src/features/portfolio-rebalance/engine.ts，esbuild 临时打包），
// 读 public/data/portfolio-prices/ 的 Yahoo 复权价。输出 results.json。
// 用法：node data-raw/masters-rebalance/run.mjs [--quick]
import { build } from 'esbuild'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const DATA = join(ROOT, 'public/data/portfolio-prices')
const OUT = join(dirname(fileURLToPath(import.meta.url)), 'results.json')
const quick = process.argv.includes('--quick')

const bundle = await build({ entryPoints: [join(ROOT, 'src/features/portfolio-rebalance/engine.ts')], bundle: true, format: 'esm', write: false, platform: 'node' })
const { runBacktest } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)

const index = JSON.parse(await readFile(join(DATA, 'index.json'), 'utf8'))
const book = {}
for (const item of index.items) {
  const body = JSON.parse(await readFile(join(DATA, `${item.symbol}.json`), 'utf8'))
  book[item.symbol] = { dates: body.dates, adjClose: body.adjClose }
}
// --quick 只用于在新数据到位前调试流程：缺的代码临时借用 KO 的价格，结果没有意义
if (quick) for (const s of ['AAPL', 'MA', 'V', 'MCO', 'ROP', 'CSGP', 'WAT', 'SYK', 'BAC', 'BRK-B', 'CVX', 'QSR', 'KKR', 'PDD']) if (!book[s]) { book[s] = book.KO; index.items.push({ ...index.items.find(i => i.symbol === 'KO'), symbol: s, group: ['KKR', 'PDD'].includes(s) ? 'highVol' : ['BRK-B', 'CVX', 'QSR'].includes(s) ? 'stable' : 'growth' }) }
const group = Object.fromEntries(index.items.map(i => [i.symbol, i.group]))
const MASTERS = ['AAPL', 'MA', 'V', 'MCO', 'ROP', 'CSGP', 'WAT', 'SYK', 'BAC', 'GOOGL', 'AXP', 'KO', 'BRK-B', 'CVX', 'QSR', 'KKR', 'PDD']
const isMaster = s => MASTERS.includes(s)
const COMMON = { cost: 0.001, initial: 1_000_000, end: '2026-11-20' } // 固定研究截止日，价格刷新不改变结果
const REL40 = { kind: 'relative', pct: 0.4 }
const YEAR = { kind: 'calendar', every: 'year' }
const sw = stable => ({ stable, entry: 0.2, gap: 0.05, step: 0.25, recover: 0.05, cap: 0.5 })
const brief = r => ({ final: +r.final.toFixed(4), cagr: +r.cagr.toFixed(4), mdd: +r.maxDrawdown.value.toFixed(4), trades: r.tradeCount, start: r.start, end: r.end })
// 所有运行都把 QQQ 纳入日期对齐，保证三种做法用同一组交易日
const run = (symbols, weights, rule, stable, start) => brief(runBacktest(book, { symbols, weights, rule, ...(stable ? { switch: sw(stable) } : {}), start, ...COMMON, signal: 'QQQ' }))
const three = (symbols, weights, stable, start) => ({ symbols, weights, hold: run(symbols, weights, { kind: 'buyHold' }, null, start), rebalance: run(symbols, weights, REL40, null, start), switch: stable ? run(symbols, weights, REL40, stable, start) : null })
function combos(arr, k) { const out = []; const rec = (i, cur) => { if (cur.length === k) { out.push([...cur]); return } for (let j = i; j < arr.length; j++) { cur.push(arr[j]); rec(j + 1, cur); cur.pop() } }; rec(0, []); return out }
const median = xs => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))] }

const qqqOver = (start, end) => {
  const s = book.QQQ, i0 = s.dates.findIndex(d => d >= start), i1 = s.dates.lastIndexOf(end)
  let peak = 0, mdd = 0
  for (let k = i0; k <= i1; k++) { peak = Math.max(peak, s.adjClose[k]); mdd = Math.min(mdd, s.adjClose[k] / peak - 1) }
  const final = s.adjClose[i1] / s.adjClose[i0], years = (Date.parse(end) - Date.parse(s.dates[i0])) / 864e5 / 365.25
  return { final: +final.toFixed(4), cagr: +(final ** (1 / years) - 1).toFixed(4), mdd: +mdd.toFixed(4), start: s.dates[i0], end }
}
const START_A = '2021-08-25', START_C = '2018-07-26'
const results = { generatedAt: new Date().toISOString(), dataAsOf: index.items.find(i => i.symbol === 'QQQ').asOf }

// 4. 分组复核：年化波动与对 QQQ 的贝塔（2021-08-25 起，日收益）
results.groupCheck = index.items.filter(i => i.group !== 'benchmark').map(i => {
  const qm = new Map(book.QQQ.dates.map((d, k) => [d, book.QQQ.adjClose[k]]))
  const s = book[i.symbol]; const ra = [], rb = []
  for (let k = 1; k < s.dates.length; k++) {
    const d = s.dates[k], p = s.dates[k - 1]
    if (d < START_A || !qm.has(d) || !qm.has(p)) continue
    ra.push(s.adjClose[k] / s.adjClose[k - 1] - 1); rb.push(qm.get(d) / qm.get(p) - 1)
  }
  const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length
  const ma = mean(ra), mb = mean(rb)
  const cov = ra.reduce((acc, x, k) => acc + (x - ma) * (rb[k] - mb), 0) / ra.length
  const vb = rb.reduce((acc, x) => acc + (x - mb) ** 2, 0) / rb.length
  const va = ra.reduce((acc, x) => acc + (x - ma) ** 2, 0) / ra.length
  return { symbol: i.symbol, group: i.group, master: isMaster(i.symbol), vol: +Math.sqrt(va * 252).toFixed(3), beta: +(cov / vb).toFixed(2), corr: +(cov / Math.sqrt(va * vb)).toFixed(2), first: s.dates[0] }
})

// A. 用户组合换大师股
const BASE = ['AVGO', 'META', 'CB', 'SOFI', 'RKLB'], BW = [0.25, 0.25, 0.25, 0.125, 0.125]
results.A = { qqq: null, base: three(BASE, BW, 'CB', START_A), stableSwap: [], growthSwap: [] }
for (const s of ['BRK-B', 'QSR', 'CVX', 'KO', 'AXP']) results.A.stableSwap.push(three(['AVGO', 'META', s, 'SOFI', 'RKLB'], BW, s, START_A))
for (const out of ['AVGO', 'META']) for (const s of ['AAPL', 'GOOGL', 'MA', 'V', 'MCO', 'ROP', 'CSGP', 'WAT', 'SYK', 'BAC']) {
  const syms = BASE.map(x => (x === out ? s : x)); results.A.growthSwap.push({ out, in: s, ...three(syms, BW, 'CB', START_A) })
}
results.A.qqq = qqqOver(results.A.base.hold.start, results.A.base.hold.end)

// B. 扩大后的网格
const G = index.items.filter(i => i.group === 'growth').map(i => i.symbol)
const H = index.items.filter(i => i.group === 'highVol').map(i => i.symbol)
const S = index.items.filter(i => i.group === 'stable').map(i => i.symbol)
let grid = []
for (const g of combos(G, 2)) for (const h of combos(H, 2)) for (const s of S) grid.push([...g, ...h, s])
if (quick) grid = grid.filter((_, k) => k % 50 === 0)
const BWB = [0.25, 0.25, 0.125, 0.125, 0.25]
const rowsB = grid.map(syms => { const r = three(syms, BWB, syms[4], START_A); return { syms, masters: syms.filter(isMaster).length, h: r.hold, r: r.rebalance, s: r.switch } })
const summarize = rows => rows.length ? ({
  n: rows.length,
  rebWinShare: +(rows.filter(x => x.r.cagr > x.h.cagr).length / rows.length).toFixed(3),
  medCagrHold: +median(rows.map(x => x.h.cagr)).toFixed(4),
  medCagrReb: +median(rows.map(x => x.r.cagr)).toFixed(4),
  medRebMinusHold: +median(rows.map(x => x.r.cagr - x.h.cagr)).toFixed(4),
  medMddHold: +median(rows.map(x => x.h.mdd)).toFixed(4),
  medMddReb: +median(rows.map(x => x.r.mdd)).toFixed(4),
  medSwitchMinusReb: +median(rows.map(x => x.s.cagr - x.r.cagr)).toFixed(4),
  medSwitchMddMinusReb: +median(rows.map(x => x.s.mdd - x.r.mdd)).toFixed(4),
  switchWinShare: +(rows.filter(x => x.s.cagr > x.r.cagr).length / rows.length).toFixed(3),
}) : null
results.B = {
  groups: { growth: G, highVol: H, stable: S }, weights: BWB, all: summarize(rowsB),
  byMasterCount: Object.fromEntries([0, 1, 2, 3, 4, 5].map(n => [n, summarize(rowsB.filter(x => x.masters === n))])),
  byStable: Object.fromEntries(S.map(s => [s, summarize(rowsB.filter(x => x.syms[4] === s))])),
  sample: rowsB.filter((_, k) => k % Math.max(1, Math.floor(rowsB.length / 20)) === 0).slice(0, 20),
}

// C. 只用大师股
let poolC = combos(MASTERS, 5)
if (quick) poolC = poolC.filter((_, k) => k % 50 === 0)
const rowsC = poolC.map(syms => { const w = syms.map(() => 0.2); return { syms, h: run(syms, w, { kind: 'buyHold' }, null, START_C), r: run(syms, w, REL40, null, START_C), y: run(syms, w, YEAR, null, START_C) } })
const dist = xs => ({ p10: +q(xs, 0.1).toFixed(4), p50: +q(xs, 0.5).toFixed(4), p90: +q(xs, 0.9).toFixed(4) })
const qqqC = qqqOver(rowsC[0].h.start, rowsC[0].h.end)
results.C1 = {
  n: rowsC.length, start: rowsC[0]?.h.start, end: rowsC[0]?.h.end,
  cagr: { hold: dist(rowsC.map(x => x.h.cagr)), rebalance: dist(rowsC.map(x => x.r.cagr)), yearly: dist(rowsC.map(x => x.y.cagr)) },
  mdd: { hold: dist(rowsC.map(x => x.h.mdd)), rebalance: dist(rowsC.map(x => x.r.mdd)), yearly: dist(rowsC.map(x => x.y.mdd)) },
  rebWinShare: +(rowsC.filter(x => x.r.cagr > x.h.cagr).length / rowsC.length).toFixed(3),
  yearlyWinShare: +(rowsC.filter(x => x.y.cagr > x.h.cagr).length / rowsC.length).toFixed(3),
  medRebMinusHold: +median(rowsC.map(x => x.r.cagr - x.h.cagr)).toFixed(4),
  medRebMddMinusHold: +median(rowsC.map(x => x.r.mdd - x.h.mdd)).toFixed(4),
  beatQqqShareHold: +(rowsC.filter(x => x.h.cagr > qqqC.cagr).length / rowsC.length).toFixed(3),
  beatQqqShareReb: +(rowsC.filter(x => x.r.cagr > qqqC.cagr).length / rowsC.length).toFixed(3),
  qqq: qqqC,
  sample: rowsC.filter((_, k) => k % Math.max(1, Math.floor(rowsC.length / 20)) === 0).slice(0, 20),
}
const C2 = ['AAPL', 'GOOGL', 'QSR', 'MA', 'WAT', 'BRK-B'], C2W = C2.map(() => 1 / 6)
results.C2 = { ...three(C2, C2W, 'BRK-B', START_C), yearly: run(C2, C2W, YEAR, null, START_C), qqq: qqqC }

await writeFile(OUT, `${JSON.stringify(results, null, 1)}\n`)
console.log(`done: B ${rowsB.length} 组合，C1 ${rowsC.length} 组合 → ${OUT}`)
