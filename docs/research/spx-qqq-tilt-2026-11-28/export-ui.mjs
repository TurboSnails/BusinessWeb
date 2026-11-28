#!/usr/bin/env node
// L-049 → src/features/strategy-lab/data/spx-qqq-tilt.json（只导出页面展示用的汇总数字）
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = p => fileURLToPath(new URL(p, import.meta.url))
const res = JSON.parse(readFileSync(here('./results.json'), 'utf8'))
const r = (x, d = 4) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d)
const pass = (dec, id) => dec.conditions.find(c => c.id === id)?.pass ?? null

const k1 = res.K1.main
const k1v = res.K1.veto.kf1973_1984
const k2 = res.K2.main
const head = res.report.headlineAbsoluteRisk
const seg = res.K2.leverageByPeakSegment.reduce((a, b) => (b.deltaCerShare > a.deltaCerShare ? b : a))
const known = res.report.knownResult1999_2026.K1
const e1 = res.exploratory.E1
const cp = res.K2.placebo.conditional

const out = {
  verdict: { K1: res.verdict.K1, K2: res.verdict.K2 },
  K1: {
    vol: r(k1.K1.daily.vol), volM: r(k1.M.daily.vol),
    maxDd: r(k1.K1.daily.maxDd), maxDdM: r(k1.M.daily.maxDd),
    kSameVol: r(head.K1_kForSameVol, 3),
    sharpe: r(k1.K1.monthly.sharpe), sharpeM: r(k1.M.monthly.sharpe),
    dSharpe: r(k1.checks.sharpeVsM.value), dSharpeThr: k1.checks.sharpeVsM.threshold, dSharpePass: k1.checks.sharpeVsM.pass,
    L: r(k1.L, 3), LPass: k1.checks.L.pass,
    maxDdVsMstar: r(k1.checks.maxDdVsMstar.value), maxDdPass: k1.checks.maxDdVsMstar.pass,
    veto1973: { dSharpe: r(k1v.checks.sharpeVsM.value), triggered: pass(res.K1.decision, 'veto_kf1973') === false },
    vetoEtfTriggered: pass(res.K1.decision, 'veto_spyqqq') === false,
  },
  K2: {
    vol: r(k2.K2.daily.vol), volM: r(k2.M.daily.vol),
    maxDd: r(k2.K2.daily.maxDd), maxDdM: r(k2.M.daily.maxDd),
    dCerVsM: r(k2.deltaCerVsM), dCerVsMPass: k2.checks.deltaCerVsM_nonneg.pass,
    dCerVsMstar: r(k2.deltaCerVsMstar), dCerVsMstarThr: k2.checks.deltaCerVsMstar.threshold, dCerVsMstarPass: k2.checks.deltaCerVsMstar.pass,
    L: r(k2.L, 3), LPass: k2.checks.L.pass,
    placeboP: r(res.K2.placebo.pDeltaCer, 2), placeboPass: pass(res.K2.decision, 'placebo'),
    concentration: { share: r(seg.deltaCerShare, 3), from: seg.peak.slice(0, 4), to: seg.recoveryAth.slice(0, 4) },
    concentrationPass: pass(res.K2.decision, 'concentration'),
    crash1929: { cand: r(head.K2_1929_32.cumReturn, 3), m: r(head.K2_1929_32.M_cumReturn, 3) },
    crash1937: { cand: r(head.K2_1937_38.cumReturn, 3), m: r(head.K2_1937_38.M_cumReturn, 3) },
    conditionalP: r(cp.p, 4), maIncrement: r(cp.maIncrementVsE1, 3),
  },
  E1: { liquidateDate: e1.liquidateIfNoRebalance.hit ? e1.liquidateIfNoRebalance.date : null, maxDd: r(e1.main.K2.daily.maxDd), dCerVsM: r(e1.main.deltaCerVsM) },
  proxy: {
    corr: r(res.proxyQuality.kf1927_1972.corr, 3), volRatio: r(res.proxyQuality.kf1927_1972.volRatio, 3),
    qqqCorr: r(res.proxyQuality.qqq_vs_spy_1999_2026.corr, 2), qqqBeta: r(res.proxyQuality.qqq_vs_spy_1999_2026.beta, 2), qqqVolRatio: r(res.proxyQuality.qqq_vs_spy_1999_2026.volRatio, 2),
  },
  known1999: {
    mix: { cagr: r(known.K1.daily.cagr, 3), vol: r(known.K1.daily.vol, 3), maxDd: r(known.K1.daily.maxDd, 3), sharpe: r(known.K1.monthly.sharpe, 3), cer: r(known.K1.monthly.cerG5) },
    spy: { cagr: r(known.M.daily.cagr, 3), vol: r(known.M.daily.vol, 3), maxDd: r(known.M.daily.maxDd, 3), sharpe: r(known.M.monthly.sharpe, 3), cer: r(known.M.monthly.cerG5) },
  },
}
writeFileSync(here('../../../src/features/strategy-lab/data/spx-qqq-tilt.json'), `${JSON.stringify(out, null, 2)}\n`)
console.log('ok')
