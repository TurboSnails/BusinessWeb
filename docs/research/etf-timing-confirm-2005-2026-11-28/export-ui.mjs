#!/usr/bin/env node
// L-056 → src/features/strategy-lab/data/etf-timing-confirm.json（只导出页面展示用的汇总数字）
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = p => fileURLToPath(new URL(p, import.meta.url))
const res = JSON.parse(readFileSync(here('./results.json'), 'utf8'))
// 百分数（results 里以「%」为单位）→ 小数，四舍五入到 0.0001%
const f = x => (x == null ? null : Math.round(x * 1e4) / 1e6)
const r = (x, d = 4) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d)
const median = xs => {
  const s = [...xs].sort((a, b) => a - b)
  const n = s.length
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2
}

const NAMES = {
  H00300: '沪深300', H00905: '中证500', H00852: '中证1000', H00016: '上证50', H00922: '中证红利',
  H00986: '能源', H00987: '原材料', H00988: '工业', H00989: '可选消费', H00990: '主要消费',
  H00991: '医药', H00992: '金融地产', H00993: '信息技术', H00994: '通信', H00995: '公用事业',
}

const m = res.main
const codes = Object.keys(m.perIndex)
const perIndex = codes.map(code => {
  const x = m.perIndex[code]
  return {
    code, name: NAMES[code] ?? code, k: r(x.k, 3),
    annual: { rule: f(x.W.rule.annual), hold: f(x.W.hold.annual), M: f(x.W.M.annual) },
    vol: { rule: f(x.W.vol.rule), M: f(x.W.vol.M) },
    ddC: { rule: f(x.C.rule.dd), hold: f(x.C.hold.dd), M: f(x.C.M.dd) },
    D: x.D, A: x.A, Xann: x.Xann, Xdd: x.Xdd, X: x.X,
    p: r(m.placebo.perIndexP[code], 3),
  }
})
const wp = key => median(codes.map(c => m.perIndex[c].Wprime[key].dd))
const wpa = key => median(codes.map(c => m.perIndex[c].Wprime[key].annual))
const vols = codes.map(c => m.perIndex[c].W.vol)
const ks = codes.map(c => m.perIndex[c].k)

const out = {
  grade: res.final.grade,
  label: '2005–2010：同仓位下回撤改善成立，收益代价未确认',
  window: { W: res.windows?.W ?? null, C: res.windows?.C ?? null },
  counts: {
    D: m.counts.D, A: m.counts.A, P: m.counts.P, X: m.counts.X, Xann: m.counts.Xann, Xdd: m.counts.Xdd,
    Xprime: m.counts.Xprime, volLowerThanM: m.counts.volLowerThanM, n: codes.length,
  },
  pC: r(m.placebo.pC, 6),
  nShifts: m.placebo.nShifts,
  DbarRule: f(m.placebo.DbarRule),
  DbarShiftMedian: f(m.placebo.dist.Dbar.median),
  downgrade1Triggered: m.downgrade1Triggered,
  l004: { grade: res.l004Layout.grade, P: res.l004Layout.counts.P, D: res.l004Layout.counts.D, X: res.l004Layout.counts.X, pC: r(res.l004Layout.placebo.pC, 6) },
  e1: { grade: res.e1.grade, P: res.e1.counts.P, D: res.e1.counts.D, X: res.e1.counts.X, pC: r(res.e1.placebo.pC, 4) },
  likelihood: { pH1: res.final.likelihood.pH1, pH0: res.final.likelihood.pH0, ratio: r(res.final.likelihood.ratio, 4) },
  volRange: {
    rule: [f(Math.min(...vols.map(v => v.rule))), f(Math.max(...vols.map(v => v.rule)))],
    M: [f(Math.min(...vols.map(v => v.M))), f(Math.max(...vols.map(v => v.M)))],
  },
  kRange: [r(Math.min(...ks), 3), r(Math.max(...ks), 3)],
  published: {
    Xprime: m.counts.Xprime,
    annual: { rule: f(wpa('rule')), hold: f(wpa('hold')), M: f(wpa('M')) },
    dd: { rule: f(wp('rule')), hold: f(wp('hold')), M: f(wp('M')) },
  },
  crashes: Object.entries(res.fourCrashes).map(([name, c]) => ({
    name: name.replace(/（.*）/, ''), source: name.includes('本检验') ? 'test' : 'power',
    pC: r(c.pC, 4), X: c.X, better: c.betterThanRandom,
  })),
  filterPlacebo: { pDbar: r(res.filterPlacebo.pDbar, 3), pX: r(res.filterPlacebo.pX, 3) },
  macdOnlyDdMedian: f(median(codes.map(c => res.macdOnly[c].C.dd))),
  cash: { A: res.variants.cashCounts.A, P: res.variants.cashCounts.P },
  perIndex,
}
writeFileSync(here('../../../src/features/strategy-lab/data/etf-timing-confirm.json'), `${JSON.stringify(out, null, 2)}\n`)
console.log('ok')
