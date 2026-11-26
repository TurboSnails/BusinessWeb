import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  SYMBOLS, buildShadow, etfMonthReturn, frozenViolations, lowVolMembers, mergeAdjusted, researchP1, researchP2, rowFor, summarize,
} from './lib/defensive-tilt-shadow.mjs'
import { INDUSTRIES } from './lib/late-cycle-shadow.mjs'

const close = (a, b) => Math.abs(a - b) < 1e-9

// 构造：每只 ETF 在 11 月末、12 月末、1 月初各有收盘
function makePrices(dec = {}, extra = []) {
  const base = { SPY: 100, XLP: 50, XLV: 80, XLU: 40, USMV: 90, SPLV: 70 }
  const decR = { SPY: 0.02, XLP: -0.01, XLV: 0.03, XLU: 0.01, USMV: 0.005, SPLV: -0.002, ...dec }
  return Object.fromEntries(SYMBOLS.map(s => [s, [
    ['2026-11-27', base[s] * 0.99], ['2026-11-30', base[s]],
    ['2026-12-15', base[s] * 1.5], ['2026-12-31', base[s] * (1 + decR[s])],
    ...extra.map(([d, k]) => [d, base[s] * k]),
  ]]))
}
// 构造行业数据：每个行业每月收益 = 行业序号 × 振幅（%），振幅随月份交替，使波动与序号成正比
function makeIndustry(throughMonth, decValues) {
  const m = new Map()
  for (let y = 2023; y <= 2026; y += 1) {
    for (let mo = 1; mo <= 12; mo += 1) {
      const key = `${y}-${String(mo).padStart(2, '0')}`
      if (key > throughMonth) break
      m.set(key, INDUSTRIES.map((_, i) => (mo % 2 ? 1 : -1) * (i + 1) * 0.1))
    }
  }
  if (decValues) m.set('2026-12', decValues)
  return m
}
const decIndustry = INDUSTRIES.map((_, i) => i) // 12 月行业 i 收益 = i%

test('ETF 月收益：按月末复权收盘；完整月份需要已出现下月交易日', () => {
  const p = makePrices()
  assert.equal(etfMonthReturn(p.SPY, '2026-12'), null) // 还没有 1 月数据
  const x = etfMonthReturn(p.SPY, '2026-12', { partial: true })
  assert.ok(close(x.r, 0.02))
  assert.deepEqual([x.from, x.to], ['2026-11-30', '2026-12-31'])
  const withJan = makePrices({}, [['2027-01-04', 1.05]])
  assert.ok(close(etfMonthReturn(withJan.XLV, '2026-12').r, 0.03))
})

test('篮子与倾斜组合：P1 = 三只等权，S1/S2/S2b = 70% SPY + 30% 防守腿', () => {
  const prices = makePrices({}, [['2027-01-04', 1]])
  const r = rowFor('2026-12', { prices, industry: makeIndustry('2026-11', decIndustry) })
  const p1 = (-0.01 + 0.03 + 0.01) / 3
  assert.ok(Math.abs(r.p1Etf - p1) < 1e-6)
  assert.ok(Math.abs(r.S1 - (0.7 * 0.02 + 0.3 * p1)) < 1e-6)
  assert.ok(Math.abs(r.S2 - (0.7 * 0.02 + 0.3 * 0.005)) < 1e-6)
  assert.ok(Math.abs(r.S2b - (0.7 * 0.02 + 0.3 * -0.002)) < 1e-6)
  // 研究 P1：防守九行业的序号收益（%）等权
  const defIdx = ['Food', 'Soda', 'Beer', 'Smoke', 'Hshld', 'Hlth', 'MedEq', 'Drugs', 'Util'].map(n => INDUSTRIES.indexOf(n))
  const rp1 = defIdx.reduce((s, i) => s + i, 0) / 9 / 100
  assert.ok(Math.abs(r.research.p1 - rp1) < 1e-6)
  // 研究 P2：波动与序号成正比，最低 10 个就是前 10 个行业，12 月收益 0..9%
  assert.deepEqual(r.research.p2Members, INDUSTRIES.slice(0, 10))
  assert.ok(Math.abs(r.research.p2 - 0.045) < 1e-6)
  assert.ok(Math.abs(r.tracking.p1 - (p1 - rp1)) < 1e-6)
  assert.ok(Math.abs(r.tracking.p2Usmv - (0.005 - 0.045)) < 1e-6)
  assert.deepEqual(r.missing, [])
})

test('冻结规则：ETF 与研究数据都齐才冻结；超过 3 个月带缺项冻结；当月只给预估', () => {
  const prices = makePrices({}, [['2027-01-04', 1]])
  const noResearch = makeIndustry('2026-11')
  const jan = buildShadow({ previous: null, prices, industry: noResearch, today: '2027-01-05', generatedAt: 'x' })
  assert.equal(jan.rows.length, 0)
  assert.equal(jan.current.month, '2027-01')
  assert.equal(jan.current.estimate, true)
  assert.ok(Math.abs(jan.current.etf.SPY - (1 / 1.02 - 1)) < 1e-6)

  const feb = buildShadow({ previous: jan, prices, industry: makeIndustry('2026-11', decIndustry), today: '2027-02-10', generatedAt: 'y' })
  assert.deepEqual(feb.rows.map(r => r.month), ['2026-12'])
  assert.equal(feb.rows[0].frozenAt, '2027-02-10')
  assert.deepEqual(feb.rows[0].missing, [])
  // 1 月没有 2 月交易日、也没有研究数据，不冻结
  assert.equal(feb.rows.find(r => r.month === '2027-01'), undefined)

  const late = buildShadow({ previous: null, prices, industry: noResearch, today: '2027-03-02', generatedAt: 'z' })
  assert.deepEqual(late.rows.map(r => r.month), ['2026-12'])
  assert.deepEqual(late.rows[0].missing, ['研究 P1', '研究 P2'])
  assert.equal(late.rows[0].research.p2, null)
})

test('已冻结的行不被改写；改写或删除会被发现', () => {
  const prices = makePrices({}, [['2027-01-04', 1]])
  const industry = makeIndustry('2026-11', decIndustry)
  const first = buildShadow({ previous: null, prices, industry, today: '2027-02-10', generatedAt: 'x' })
  const restated = makePrices({ SPY: 0.5 }, [['2027-01-04', 1]])
  const again = buildShadow({ previous: first, prices: restated, industry, today: '2027-02-11', generatedAt: 'y' })
  assert.deepEqual(again.rows, first.rows)
  assert.deepEqual(frozenViolations(first, again), [])
  assert.deepEqual(frozenViolations(first, { ...again, rows: [{ ...again.rows[0], S1: 0.9 }] }), ['2026-12'])
  assert.deepEqual(frozenViolations(first, { ...again, rows: [] }), ['2026-12'])
})

test('累计与跟踪差统计', () => {
  const rows = [
    { etf: { SPY: 0.1 }, S1: 0.05, S2: 0.02, S2b: 0.01, tracking: { p1: 0.01, p2Usmv: -0.01, p2Splv: null }, month: '2026-12' },
    { etf: { SPY: -0.1 }, S1: 0.05, S2: 0.02, S2b: 0.01, tracking: { p1: 0.03, p2Usmv: 0.01, p2Splv: null }, month: '2027-01' },
  ]
  const s = summarize(rows)
  assert.equal(s.through, '2027-01')
  assert.ok(Math.abs(s.cumulative.SPY - (1.1 * 0.9 - 1)) < 1e-6)
  assert.ok(Math.abs(s.cumulative.S1 - (1.05 ** 2 - 1)) < 1e-6)
  assert.ok(Math.abs(s.tracking.p1.mean - 0.02) < 1e-6)
  assert.ok(Math.abs(s.tracking.p1.std - Math.SQRT2 * 0.01) < 1e-6)
  assert.deepEqual(s.tracking.p2Splv, { months: 0, mean: null, std: null })
})

test('复权价合并：新窗口整段替换，窗口前旧数据按重叠日比例换算', () => {
  const old = [['2026-10-30', 100], ['2026-11-02', 102], ['2026-11-03', 101]]
  const incoming = [['2026-11-02', 51], ['2026-11-03', 50.5], ['2026-11-04', 52]]
  const m = mergeAdjusted(old, incoming)
  assert.deepEqual(m.map(([d]) => d), ['2026-10-30', '2026-11-02', '2026-11-03', '2026-11-04'])
  assert.ok(close(m[0][1], 50))
  assert.equal(mergeAdjusted(old, [['2026-12-01', 1]]), null)
  assert.deepEqual(mergeAdjusted([], incoming), incoming)
})

// ---------- 真实数据：研究篮子与独立手算一致 ----------
const real = JSON.parse(readFileSync(fileURLToPath(new URL('../data-raw/market-radar/industry-returns.json', import.meta.url)), 'utf8'))
const industry = new Map(real.map(([d, r]) => [d.slice(0, 7), r]))

test('真实数据 2020-03：研究 P1、P2 与独立手算一致', () => {
  const t = '2020-03'
  const idx = real.findIndex(([d]) => d.startsWith(t))
  const row = real[idx][1]
  // P1：按名字取九列直接平均
  const names = ['Food', 'Soda', 'Beer', 'Smoke', 'Hshld', 'Hlth', 'MedEq', 'Drugs', 'Util']
  const p1 = names.map(n => row[INDUSTRIES.indexOf(n)]).reduce((s, v) => s + v, 0) / names.length / 100
  assert.ok(Math.abs(researchP1(t, industry) - p1) < 1e-12)

  // P2：按数组位置取前 36 行（2017-03 至 2020-02），逐行业求样本方差，排序取 10 个
  const window = real.slice(idx - 36, idx).map(([, r]) => r)
  assert.equal(real[idx - 36][0].slice(0, 7), '2017-03')
  assert.equal(real[idx - 1][0].slice(0, 7), '2020-02')
  const variance = INDUSTRIES.map((_, i) => {
    const xs = window.map(r => r[i]); const m = xs.reduce((s, v) => s + v, 0) / 36
    return xs.reduce((s, v) => s + (v - m) ** 2, 0) / 35
  })
  const picks = INDUSTRIES.map((_, i) => i).sort((a, b) => variance[a] - variance[b] || a - b).slice(0, 10)
  assert.deepEqual(lowVolMembers(t, industry), picks)
  const p2 = picks.reduce((s, i) => s + row[i], 0) / 10 / 100
  const got = researchP2(t, industry)
  assert.ok(Math.abs(got.r - p2) < 1e-12)
  assert.deepEqual(got.members, picks.map(i => INDUSTRIES[i]))
  assert.ok(got.members.includes('Util') || got.members.includes('Food'), '低波篮子应含典型防守行业')
})

test('真实数据：最新可得月份能算出研究篮子，数据之后的月份为空', () => {
  const lastMonth = real.at(-1)[0].slice(0, 7)
  assert.ok(researchP1(lastMonth, industry) != null)
  assert.ok(researchP2(lastMonth, industry).r != null)
  assert.equal(researchP1('2099-01', industry), null)
  assert.equal(researchP2('2099-01', industry).r, null)
})
