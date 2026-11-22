// 再平衡多赚多少，与组合成员的"增速"（年化收益）和"稳定性"（波动、相关性）有什么关系。
// 网格同 run.mjs 的 B（2 成长 + 2 高波动 + 1 稳定，25/25/12.5/12.5/25，2021-08-25 起），只跑不动与相对 40%。
import { build } from 'esbuild'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = resolve(HERE, '../..'), DATA = join(ROOT, 'public/data/portfolio-prices')
const bundle = await build({ entryPoints: [join(ROOT, 'src/features/portfolio-rebalance/engine.ts')], bundle: true, format: 'esm', write: false, platform: 'node' })
const { runBacktest } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
const START = '2021-08-25'
const END = '2026-11-20'
// 固定研究时的成分、分组和顺序，INTC 归入稳定组。
const G = ['AVGO','META','MSFT','NVDA','AMZN','GOOGL','AAPL','MA','V','MCO','ROP','CSGP','WAT','SYK','BAC']
const H = ['RKLB','SOFI','PLTR','TSLA','COIN','HOOD','KKR','PDD']
const S = ['CB','KO','PG','JNJ','WMT','COST','GLD','AXP','BRK-B','CVX','QSR','INTC']
const research = [...G, ...H, ...S]
const book = {}
for (const symbol of research) {
  const { dates, adjClose } = JSON.parse(await readFile(join(DATA, `${symbol}.json`), 'utf8'))
  book[symbol] = { dates, adjClose }
}
const pxMap = Object.fromEntries(research.map(symbol => [
  symbol, new Map(book[symbol].dates.map((day, i) => [day, book[symbol].adjClose[i]])),
]))
const common = book.RKLB.dates.filter(day => day >= START && day <= END
  && research.every(symbol => pxMap[symbol].has(day)))
const rets = {}, stat = {}
const years = (Date.parse(common.at(-1)) - Date.parse(common[0])) / 864e5 / 365.25
for (const symbol of research) {
  const m = pxMap[symbol]; const r = []
  for (let k = 1; k < common.length; k++) r.push(m.get(common[k]) / m.get(common[k - 1]) - 1)
  rets[symbol] = r
  const mean = r.reduce((a, b) => a + b, 0) / r.length, v = r.reduce((a, b) => a + (b - mean) ** 2, 0) / r.length
  stat[symbol] = { cagr: (m.get(common.at(-1)) / m.get(common[0])) ** (1 / years) - 1, vol: Math.sqrt(v * 252), mean, sd: Math.sqrt(v) }
}
const corr = (a, b) => { const ra = rets[a], rb = rets[b], sa = stat[a], sb = stat[b]; let c = 0; for (let k = 0; k < ra.length; k++) c += (ra[k] - sa.mean) * (rb[k] - sb.mean); return c / ra.length / sa.sd / sb.sd }
const pairs = a => { const o = []; for (let x = 0; x < a.length; x++) for (let y = x + 1; y < a.length; y++) o.push([a[x], a[y]]); return o }
const W = [0.25, 0.25, 0.125, 0.125, 0.25]
const rows = []
for (const g of pairs(G)) for (const h of pairs(H)) for (const s of S) {
  const syms = [...g, ...h, s]
  const hold = runBacktest(book, { symbols: syms, weights: W, rule: { kind: 'buyHold' }, start: START, end: END, cost: 0.001, initial: 1e6 })
  const reb = runBacktest(book, { symbols: syms, weights: W, rule: { kind: 'relative', pct: 0.4 }, start: START, end: END, cost: 0.001, initial: 1e6 })
  const cagrs = syms.map(x => stat[x].cagr), wavg = cagrs.reduce((a, c, k) => a + c * W[k], 0)
  const disp = Math.sqrt(cagrs.reduce((a, c, k) => a + W[k] * (c - wavg) ** 2, 0))
  const vols = syms.map(x => stat[x].vol), wvol = vols.reduce((a, v, k) => a + v * W[k], 0)
  const pc = pairs(syms).map(([a, b]) => corr(a, b)), avgCorr = pc.reduce((a, b) => a + b, 0) / pc.length
  rows.push({ syms, hold: hold.cagr, reb: reb.cagr, edge: reb.cagr - hold.cagr, holdMdd: hold.maxDrawdown.value, rebMdd: reb.maxDrawdown.value, wavgCagr: wavg, disp, wvol, avgCorr, stableCorr: syms.slice(0, 4).map(x => corr(x, s)).reduce((a, b) => a + b, 0) / 4, maxCagr: Math.max(...cagrs) })
}
await writeFile(join(HERE, 'drivers.json'), JSON.stringify({ start: common[0], end: common.at(-1), stat, rows }))
console.log('rows', rows.length, common[0], common.at(-1))
