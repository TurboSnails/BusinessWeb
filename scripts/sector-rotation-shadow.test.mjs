import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  SECTOR_ETFS, SYMBOLS, buildShadow, frozenViolations, momentumFor, picksFor, rowFor,
} from './lib/sector-rotation-shadow.mjs'

const close = (a, b) => Math.abs(a - b) < 1e-9
const month = (y, m) => `${y}-${String(m).padStart(2, '0')}`

// 每只 ETF 每个月末一个收盘（28 日），价格按固定月增长率复利；增长率按代码顺序递增，使 XLY > XLV > XLU ...
function makePrices(growth = {}, through = '2027-01-05', extra = {}) {
  const out = {}
  SYMBOLS.forEach((s, i) => {
    const g = growth[s] ?? 0.001 * (i + 1)
    const rows = []
    let p = 100
    for (let y = 2025; y <= 2027; y += 1) {
      for (let m = 1; m <= 12; m += 1) {
        const d = `${month(y, m)}-28`
        if (d > through) break
        rows.push([d, p])
        p *= 1 + g
      }
    }
    if (through.slice(8) !== '28' && through > rows.at(-1)[0]) rows.push([through, p])
    out[s] = [...rows, ...(extra[s] ?? [])]
  })
  return out
}

test('动量：S1 跳过最近一个月，S2 为 3、6、12 个月平均', () => {
  const p = makePrices()
  const rows = p.XLB // 月增长 0.1%
  const g = 0.001
  assert.ok(close(momentumFor(rows, '2026-12', 'S1'), (1 + g) ** 11 - 1))
  const s2 = ((1 + g) ** 3 - 1 + (1 + g) ** 6 - 1 + (1 + g) ** 12 - 1) / 3
  assert.ok(close(momentumFor(rows, '2026-12', 'S2'), s2))
})

test('入选：动量最高的 3 只；数据不足返回 null', () => {
  const p = makePrices()
  assert.deepEqual(picksFor(p, '2026-12', 'S1'), ['XLY', 'XLV', 'XLU'])
  const short = makePrices({}, '2026-06-28')
  assert.equal(picksFor(short, '2026-12', 'S1'), null)
})

test('并列时按代码顺序取前者', () => {
  const growth = Object.fromEntries(SECTOR_ETFS.map(s => [s, 0.002]))
  assert.deepEqual(picksFor(makePrices(growth), '2026-12', 'S2'), ['XLB', 'XLE', 'XLF'])
})

test('一行：篮子收益为入选 ETF 当月收益的平均；对照 9 只等权与 SPY', () => {
  const p = makePrices()
  const r = rowFor('2026-12', p)
  assert.deepEqual(r.missing, [])
  const g = s => 0.001 * (SYMBOLS.indexOf(s) + 1)
  assert.ok(close(r.ret.S1, (g('XLY') + g('XLV') + g('XLU')) / 3))
  assert.ok(close(r.ret.EW9, SECTOR_ETFS.reduce((a, s) => a + g(s), 0) / 9))
  assert.ok(close(r.ret.SPY, g('SPY')))
})

test('影子：只冻结完整月份；影子期前给出首月入选；冻结行不可改写', () => {
  const before = buildShadow({ previous: null, prices: makePrices({}, '2026-11-28'), today: '2026-11-30', generatedAt: 'x' })
  assert.equal(before.rows.length, 0)
  assert.equal(before.current, null)
  assert.equal(before.upcoming.month, '2026-12')
  // S1 只用到 10 月底，已经确定；S2 要用 11 月底收盘，还没有 12 月交易日确认，暂缺
  assert.deepEqual(before.upcoming.picks.S1, ['XLY', 'XLV', 'XLU'])
  assert.equal(before.upcoming.picks.S2, null)

  const jan = buildShadow({ previous: null, prices: makePrices({}, '2027-01-05'), today: '2027-01-05', generatedAt: 'x' })
  assert.deepEqual(jan.rows.map(r => r.month), ['2026-12'])
  assert.equal(jan.rows[0].frozenAt, '2027-01-05')
  assert.equal(jan.current.month, '2027-01')
  assert.equal(jan.current.estimate, true)
  assert.equal(jan.summary.months, 1)

  const again = buildShadow({ previous: jan, prices: makePrices({ XLK: 0.05 }, '2027-01-06'), today: '2027-01-06', generatedAt: 'y' })
  assert.deepEqual(frozenViolations(jan, again), [])
  assert.deepEqual(again.rows[0], jan.rows[0])
  const tampered = { ...again, rows: [{ ...again.rows[0], ret: { ...again.rows[0].ret, S1: 0 } }] }
  assert.deepEqual(frozenViolations(jan, tampered), ['2026-12'])
})
