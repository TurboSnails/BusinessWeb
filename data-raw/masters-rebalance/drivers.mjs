// 再平衡多赚多少，与组合成员的"增速"（年化收益）和"稳定性"（波动、相关性）有什么关系。
// 网格同 run.mjs 的 B（2 成长 + 2 高波动 + 1 稳定，25/25/12.5/12.5/25，2021-08-25 起），只跑不动与相对 40%。
import { build } from 'esbuild'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = resolve(HERE, '../..'), DATA = join(ROOT, 'public/data/portfolio-prices')
const bundle = await build({ entryPoints: [join(ROOT, 'src/features/portfolio-rebalance/engine.ts')], bundle: true, format: 'esm', write: false, platform: 'node' })
const { runBacktest } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
const index = JSON.parse(await readFile(join(DATA, 'index.json'), 'utf8'))
const book = {}
for (const i of index.items) { const b = JSON.parse(await readFile(join(DATA, `${i.symbol}.json`), 'utf8')); book[i.symbol] = { dates: b.dates, adjClose: b.adjClose } }
const START = '2021-08-25'
const dates = book.RKLB.dates.filter(d => d >= START && index.items.filter(i => i.group !== 'benchmark').every(i => true))
const common = dates.filter(d => index.items.every(i => book[i.symbol].dates.includes(d)))
const pxMap = Object.fromEntries(index.items.map(i => [i.symbol, new Map(book[i.symbol].dates.map((d, k) => [d, book[i.symbol].adjClose[k]]))]))
const rets = {}, stat = {}
const years = (Date.parse(common.at(-1)) - Date.parse(common[0])) / 864e5 / 365.25
for (const i of index.items) {
  const m = pxMap[i.symbol]; const r = []
  for (let k = 1; k < common.length; k++) r.push(m.get(common[k]) / m.get(common[k - 1]) - 1)
  rets[i.symbol] = r
  const mean = r.reduce((a, b) => a + b, 0) / r.length, v = r.reduce((a, b) => a + (b - mean) ** 2, 0) / r.length
  stat[i.symbol] = { cagr: (m.get(common.at(-1)) / m.get(common[0])) ** (1 / years) - 1, vol: Math.sqrt(v * 252), mean, sd: Math.sqrt(v) }
}
const corr = (a, b) => { const ra = rets[a], rb = rets[b], sa = stat[a], sb = stat[b]; let c = 0; for (let k = 0; k < ra.length; k++) c += (ra[k] - sa.mean) * (rb[k] - sb.mean); return c / ra.length / sa.sd / sb.sd }
const G = index.items.filter(i => i.group === 'growth').map(i => i.symbol)
const H = index.items.filter(i => i.group === 'highVol' && i.symbol !== 'INTC').map(i => i.symbol)
const S = index.items.filter(i => i.group === 'stable').map(i => i.symbol).concat(['INTC'])
const pairs = a => { const o = []; for (let x = 0; x < a.length; x++) for (let y = x + 1; y < a.length; y++) o.push([a[x], a[y]]); return o }
const W = [0.25, 0.25, 0.125, 0.125, 0.25]
const rows = []
for (const g of pairs(G)) for (const h of pairs(H)) for (const s of S) {
  const syms = [...g, ...h, s]
  const hold = runBacktest(book, { symbols: syms, weights: W, rule: { kind: 'buyHold' }, start: START, cost: 0.001, initial: 1e6 })
  const reb = runBacktest(book, { symbols: syms, weights: W, rule: { kind: 'relative', pct: 0.4 }, start: START, cost: 0.001, initial: 1e6 })
  const cagrs = syms.map(x => stat[x].cagr), wavg = cagrs.reduce((a, c, k) => a + c * W[k], 0)
  const disp = Math.sqrt(cagrs.reduce((a, c, k) => a + W[k] * (c - wavg) ** 2, 0))
  const vols = syms.map(x => stat[x].vol), wvol = vols.reduce((a, v, k) => a + v * W[k], 0)
  const pc = pairs(syms).map(([a, b]) => corr(a, b)), avgCorr = pc.reduce((a, b) => a + b, 0) / pc.length
  rows.push({ syms, hold: hold.cagr, reb: reb.cagr, edge: reb.cagr - hold.cagr, holdMdd: hold.maxDrawdown.value, rebMdd: reb.maxDrawdown.value, wavgCagr: wavg, disp, wvol, avgCorr, stableCorr: syms.slice(0, 4).map(x => corr(x, s)).reduce((a, b) => a + b, 0) / 4, maxCagr: Math.max(...cagrs) })
}
await writeFile(join(HERE, 'drivers.json'), JSON.stringify({ start: common[0], end: common.at(-1), stat, rows }))
console.log('rows', rows.length, common[0], common.at(-1))
