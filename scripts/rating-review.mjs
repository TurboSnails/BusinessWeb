// 评级复盘：把信号台账（public/data/signal-ledger-YYYY.json，每周一期「评级 + 价格」）里的研究评级，
// 和之后若干周的价格变化对照，按评级档位、市场、持有期统计远期收益与相对指数的超额收益。
// 用法：node scripts/rating-review.mjs [--out public/data/rating-review.json]
//
// 为什么用 Node 而不是 Python + alphalens：评级是 4 档分类变量、每周一期快照，不是连续因子 + 日频价格；
// alphalens 的分位数分组、日频远期收益与换手分析在这里用不上，反而要引入 pandas 依赖。这里的统计只有均值、
// 中位数、胜率与档位差，几十行纯函数即可，与台账写入脚本同用 Node，测试走 node --test。
// 输出只由台账与指数周K决定（不读当前时间），重复运行结果一致。
import { readFile, readdir, writeFile, rename } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

/** 与 src/features/signals/ledger.ts 的 RATING_CODES 前四档同序（台账里存的是下标）；第 5 档「未估值」不参与。 */
export const BUCKETS = ['优先关注', '条件关注', '观察', '回避']
export const HORIZONS = [1, 2, 4, 13, 26]
export const MIN_N = 30
/** 起始期数少于此值时，即便样本数够也只算「早期读数」：同一周的几百只股票受同一市场风格影响，不是几百个独立样本。 */
export const MIN_PERIODS = 8
export const VENUES = ['cn', 'hk', 'us']
export const INDEX_OF = { cn: 'csi300', hk: 'hsi', us: 'spx' }
export const INDEX_LABEL = { cn: '沪深300', hk: '恒生指数', us: '标普500' }
export const SPREADS = [[0, 1], [1, 2], [2, 3], [0, 3]]
const DAY = 86400000
const round = (v, d = 4) => (v == null || !Number.isFinite(v) ? null : Number(v.toFixed(d)))
const mean = xs => xs.reduce((s, x) => s + x, 0) / xs.length
const median = xs => { const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
const days = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY)
/** 所在周的周六（周K按“周六收官”归周，雅虎周一标签与腾讯周五标签都落到同一周） */
export const weekEnd = d => { const t = new Date(`${d}T00:00:00Z`); return new Date(t.getTime() + ((6 - t.getUTCDay() + 7) % 7) * DAY).toISOString().slice(0, 10) }

/** 指数周收盘：键为周六日期。快照取所在周的周收盘（台账每周保留该周最后一次写入，即周五收盘价）。 */
export function indexCloses(marketCycle) {
  const out = {}
  for (const venue of VENUES) {
    const bars = marketCycle?.markets?.[INDEX_OF[venue]]?.week ?? []
    const map = new Map()
    for (const b of [...bars].sort((a, b) => a.date.localeCompare(b.date))) if (b.close > 0) map.set(weekEnd(b.date), b.close)
    out[venue] = map
  }
  return out
}

/** 起始期 d0 往后 h 周的配对快照：与 7h 天相差不超过 3 天的最近一期，没有则为 null。 */
export function pairFor(dates, d0, h) {
  let best = null
  for (const d of dates) {
    if (d <= d0) continue
    const gap = Math.abs(days(d0, d) - 7 * h)
    if (gap <= 3 && (best == null || gap < best.gap)) best = { d, gap }
  }
  return best?.d ?? null
}

/** 每条观测：起始期评级档位、个股收益、同市场指数同期收益与超额收益。 */
export function observations(ledger, closes, h) {
  const dates = Object.keys(ledger.snapshots).sort()
  const out = []
  for (const d0 of dates) {
    const d1 = pairFor(dates, d0, h)
    if (!d1) continue
    const s0 = ledger.snapshots[d0], s1 = ledger.snapshots[d1]
    for (const [key, row] of Object.entries(s0)) {
      const venue = key.split(':')[0], bucket = row?.[1]
      if (!VENUES.includes(venue) || !Number.isInteger(bucket) || bucket < 0 || bucket >= BUCKETS.length) continue
      const p0 = row[0], p1 = s1[key]?.[0]
      if (!(p0 > 0) || !(p1 > 0)) continue
      const i0 = closes[venue]?.get(weekEnd(d0)), i1 = closes[venue]?.get(weekEnd(d1))
      const ret = p1 / p0 - 1, index = i0 > 0 && i1 > 0 ? i1 / i0 - 1 : null
      out.push({ key, venue, bucket, from: d0, to: d1, ret, index, excess: index == null ? null : ret - index })
    }
  }
  return out
}

/** 一个格子：n < 30 只给样本数，不给数值；n 够但起始期少于 MIN_PERIODS 标为早期读数。 */
export function cell(rows, horizonReached) {
  const withExcess = rows.filter(r => r.excess != null)
  const periods = new Set(rows.map(r => r.from)).size
  const base = { n: rows.length, nExcess: withExcess.length, periods, securities: new Set(rows.map(r => r.key)).size }
  if (!horizonReached) return { ...base, status: 'pending' }
  if (withExcess.length < MIN_N) return { ...base, status: 'insufficient' }
  const ex = withExcess.map(r => r.excess)
  return { ...base, status: periods < MIN_PERIODS ? 'early' : 'ok',
    mean: round(mean(withExcess.map(r => r.ret))), median: round(median(withExcess.map(r => r.ret))),
    meanExcess: round(mean(ex)), medianExcess: round(median(ex)), hitRate: round(ex.filter(x => x > 0).length / ex.length, 3) }
}

export function spread(cells) {
  return SPREADS.map(([hi, lo]) => {
    const a = cells[BUCKETS[hi]], b = cells[BUCKETS[lo]]
    const usable = c => c && (c.status === 'ok' || c.status === 'early')
    const id = `${BUCKETS[hi]}−${BUCKETS[lo]}`
    if (!usable(a) || !usable(b)) return { id, status: a?.status === 'pending' ? 'pending' : 'insufficient', nHigh: a?.nExcess ?? 0, nLow: b?.nExcess ?? 0 }
    return { id, status: a.status === 'ok' && b.status === 'ok' ? 'ok' : 'early', nHigh: a.nExcess, nLow: b.nExcess, meanExcess: round(a.meanExcess - b.meanExcess) }
  })
}

export function mergeLedgers(ledgers) {
  const snapshots = {}
  for (const l of ledgers) if (l?.schemaVersion === 1 && l.snapshots) Object.assign(snapshots, l.snapshots)
  return { schemaVersion: 1, snapshots: Object.fromEntries(Object.entries(snapshots).sort(([a], [b]) => a.localeCompare(b))) }
}

export const METHOD = [
  '数据：信号台账每周留存一期，每家公司当时的研究评级（归为优先关注 / 条件关注 / 观察 / 回避四档；未估值不参与）与价格。',
  '远期收益：以某期快照为起点，取约 h 周后的那一期快照（相差不超过 3 天）计算个股价格涨跌；所有可配对的起始期合并统计。',
  '超额收益：个股涨跌减去同市场指数同期涨跌（A股对沪深300、港股对恒生指数、美股含中概 ADR 对标普500），指数取快照所在周的周收盘。胜率 = 超额收益 > 0 的占比。',
  '档位差：较高档位的平均超额收益减较低档位，两档都需样本足够才计算。',
  `样本门槛：可计算超额收益的样本少于 ${MIN_N} 个的格子标为「样本不足」，不给数值；持有期还没走完的标为「待积累」；样本够但起始期少于 ${MIN_PERIODS} 期的标为「早期读数」——同一周几百只股票受同一市场风格影响，并不是几百个独立样本。`,
  '口径：只看价格，不含分红与汇率；评级在持有期内可能变化，这里只按起点评级归组；起始期重叠（如每周起算的 4 周收益）会放大表面样本量。',
]
export const CAVEATS = [
  '台账自 2026-10-23 起记录，复盘需要至少数月、最好跨越不同市场环境后才可能说明问题；现阶段的数字只是记录进度，不是业绩。',
  '评级是研究观察状态（是否值得继续研究、等什么条件），不是买卖信号；即使将来档位差为正，也不代表按评级交易能获得同样结果。',
  '「优先关注」「回避」档样本很少，大多数格子会长期处于样本不足。',
]

export function buildReview(ledger, marketCycle) {
  const dates = Object.keys(ledger.snapshots).sort()
  if (!dates.length) throw new Error('Signal ledger has no snapshots')
  const closes = indexCloses(marketCycle)
  const first = dates[0], latest = dates.at(-1)
  const horizons = HORIZONS.map(h => {
    const obs = observations(ledger, closes, h)
    const reached = days(first, latest) >= 7 * h - 3
    const markets = {}
    for (const venue of [...VENUES, 'all']) {
      const scoped = venue === 'all' ? obs : obs.filter(o => o.venue === venue)
      const cells = Object.fromEntries(BUCKETS.map((b, i) => [b, cell(scoped.filter(o => o.bucket === i), reached)]))
      markets[venue] = { cells, spreads: spread(cells), missingIndex: scoped.filter(o => o.excess == null).length }
    }
    return { weeks: h, reached, pairs: new Set(obs.map(o => `${o.from}→${o.to}`)).size, observations: obs.length, markets }
  })
  const lastRated = ledger.snapshots[latest]
  const coverage = Object.fromEntries(VENUES.map(v => [v, Object.fromEntries(BUCKETS.map((b, i) => [b, Object.entries(lastRated).filter(([k, r]) => k.startsWith(`${v}:`) && r?.[1] === i).length]))]))
  return { schemaVersion: 1, asOf: latest, firstSnapshot: first, snapshots: dates.length, minSample: MIN_N, minPeriods: MIN_PERIODS,
    buckets: BUCKETS, benchmarks: INDEX_LABEL, coverage, method: METHOD, caveats: CAVEATS, horizons }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('..', import.meta.url))
  const i = process.argv.indexOf('--out')
  const output = i > 0 ? process.argv[i + 1] : `${root}public/data/rating-review.json`
  const files = (await readdir(`${root}public/data`)).filter(f => /^signal-ledger-\d{4}\.json$/.test(f)).sort()
  const ledger = mergeLedgers(await Promise.all(files.map(async f => JSON.parse(await readFile(`${root}public/data/${f}`, 'utf8')))))
  const marketCycle = JSON.parse(await readFile(`${root}public/data/market-cycle.json`, 'utf8'))
  const review = buildReview(ledger, marketCycle)
  await writeFile(`${output}.tmp`, JSON.stringify(review) + '\n')
  await rename(`${output}.tmp`, output)
  for (const h of review.horizons) {
    const all = h.markets.all.cells
    console.log(`${h.weeks}w ${h.reached ? `${h.pairs} 期配对 ${h.observations} 条` : '待积累'} | ${BUCKETS.map(b => `${b} n=${all[b].nExcess} ${all[b].status}${all[b].meanExcess != null ? ` 超额 ${(all[b].meanExcess * 100).toFixed(2)}%` : ''}`).join(' | ')}`)
  }
}
