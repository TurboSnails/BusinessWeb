#!/usr/bin/env node
// L-039 交叉核对：两份实现的 results.json 和本机 results-daily.json。
// 输出 replication/crosscheck.json（逐项数值、差、是否在容差内）。
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
function mergeDetails(summary, detail) {
  const result = { ...summary };
  for (const [key, value] of Object.entries(detail)) {
    result[key] = Object.hasOwn(summary, key) ? mergeDetails(summary[key], value) : value;
  }
  return result;
}
function loadResults(directory, command) {
  const summary = JSON.parse(readFileSync(join(directory, 'results.json'), 'utf8'));
  const detailPath = join(directory, 'results-daily.json');
  try {
    return mergeDetails(summary, JSON.parse(readFileSync(detailPath, 'utf8')));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    throw new Error(`缺少 ${detailPath}，请先运行 ${command}`, { cause: error });
  }
}
const main = loadResults(join(HERE, '..'), 'run.py');
const mine = loadResults(HERE, 'replication/run.mjs');
const extra = (() => { try { return JSON.parse(readFileSync(join(HERE, 'extra-results.json'), 'utf8')); } catch { return null; } })();

const TOL = 0.0001; // 0.01 个百分点
const rows = [];
const issues = [];
function num(item, a, b, tol = TOL) {
  const diff = a == null || b == null ? null : b - a;
  const ok = diff != null && Math.abs(diff) <= tol;
  rows.push({ item, main: a, replication: b, diff, tol, ok });
  if (!ok) issues.push(item);
}
function eq(item, a, b) {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  rows.push({ item, main: a, replication: b, diff: ok ? 0 : 'differs', tol: 'exact', ok });
  if (!ok) issues.push(item);
}

const metricMap = [
  ['sigma', 'sigma'], ['mdd', 'mdd'], ['cer', 'cer'], ['cagr', 'cagr'], ['cvar95', 'cvar95'], ['worst30', 'worst30Loss'], ['exposure', 'exposureMean'],
];
function cmpMetrics(prefix, a, b, { annualOnly = false } = {}) {
  for (const [ka, kb] of metricMap) num(`${prefix}.${ka}`, a[ka], b[kb]);
  num(`${prefix}.sharpe`, a.sharpe, b.sharpe, 0.0001);
  num(`${prefix}.turnover`, a.turnover, b.turnover, 1e-6);
  eq(`${prefix}.trades`, a.trades, b.trades);
  num(`${prefix}.endingEquity(rel)`, 1, b.finalMultiple / a.endingEquity, 1e-9);
}
function tradeKey(list, dateKey = 'date') { return list.map((t) => `${t[dateKey]}:${t.side}`); }
function cmpLedger(prefix, a, b) {
  eq(`${prefix}.tradeDatesSides`, tradeKey(a), tradeKey(b));
  if (a.length === b.length) {
    let maxRel = 0;
    for (let i = 0; i < a.length; i++) maxRel = Math.max(maxRel, Math.abs(a[i].quantity / b[i].qty - 1));
    num(`${prefix}.tradeQtyMaxRelDiff`, 0, maxRel, 1e-9);
  }
}
function cmpScenario(prefix, a, b, { dailyMine = null, hasM = true } = {}) {
  cmpMetrics(`${prefix}.K1`, a.K1, b.K1.metrics);
  cmpMetrics(`${prefix}.B0`, a.B0, b.B0.metrics);
  cmpLedger(`${prefix}.K1`, a.K1.ledger, b.K1.trades);
  cmpLedger(`${prefix}.B0`, a.B0.ledger, b.B0.trades);
  num(`${prefix}.K1.sigmaGross`, a.K1.sigmaGross, b.gross.sigmaK1);
  num(`${prefix}.B0.sigmaGross`, a.B0.sigmaGross, b.gross.sigmaB0);
  if (hasM) {
    cmpMetrics(`${prefix}.M`, a.M, b.M.metrics);
    if (a.M.ledger) cmpLedger(`${prefix}.M`, a.M.ledger, b.M.trades);
    eq(`${prefix}.M.weightUnits`, a.M.weightUnits, b.reference.wBp);
    num(`${prefix}.M.sigmaGross`, a.M.sigmaGross, b.reference.sigmaM);
    eq(`${prefix}.M.mismatch`, a.M.mismatch, b.reference.mismatch);
    num(`${prefix}.deltaCER`, a.deltas.cerVsM, b.deltaCER_K1_M);
    num(`${prefix}.mddVsM`, a.deltas.mddVsM, b.mddGain_vs_M);
    num(`${prefix}.mddVsB0`, a.deltas.mddVsB0, b.mddGain_vs_B0);
    num(`${prefix}.sigmaReductionVsB0`, a.deltas.sigmaReductionVsB0, b.sigmaReduction_vs_B0);
    const g = b.gates;
    eq(`${prefix}.gates`, a.gates, { match: g.referenceMatched, cerVsM: g.sameVol_deltaCER_ge_0, mddVsM: g.sameVol_mdd_shallower_5pp, mddVsB0: g.b0_mdd_shallower_10pp, sigmaReductionVsB0: g.b0_sigma_lower_15pct });
    eq(`${prefix}.pass`, a.pass, g.all);
    eq(`${prefix}.downcrossExecutions`, a.K1.executedDowncrosses, b.downCrossExecutions);
    eq(`${prefix}.maxMissingValuation`, a.coverage.maxMissingValuationDays, b.coverage.maxMissingValuationStreak);
  }
  if (dailyMine) cmpDaily(`${prefix}.K1.daily`, a.K1.daily, dailyMine);
}
function cmpDaily(prefix, a, d) {
  const n = d.d.length - 1; // 末行为终点估值
  eq(`${prefix}.length`, a.length, n);
  let dateBad = 0, sideBad = 0, sigBad = 0, maxW = 0, maxQ = 0, maxE = 0, maxMA = 0;
  const firstBad = [];
  for (let i = 0; i < Math.min(a.length, n); i++) {
    const x = a[i];
    if (x.date !== d.d[i]) dateBad++;
    if ((x.tradeSide ?? null) !== (d.traded[i] ?? null)) { sideBad++; if (firstBad.length < 5) firstBad.push(x.date); }
    const sig = x.trend === true ? 1 : x.trend === false ? 0 : null;
    if (sig !== d.sig[i]) sigBad++;
    maxW = Math.max(maxW, Math.abs(x.weight - d.wPost[i]));
    maxQ = Math.max(maxQ, x.quantity === 0 && d.q[i] === 0 ? 0 : Math.abs(x.quantity / d.q[i] - 1));
    maxE = Math.max(maxE, Math.abs(x.equityBeforeTrade / d.equityPre[i] - 1));
    if (x.ma200 != null && d.ma200_ofSigDate?.[i] != null) maxMA = Math.max(maxMA, Math.abs(x.ma200 / d.ma200_ofSigDate[i] - 1));
  }
  eq(`${prefix}.dateMismatches`, 0, dateBad);
  eq(`${prefix}.tradeSideMismatches`, 0, sideBad);
  eq(`${prefix}.trendStateMismatches`, 0, sigBad);
  num(`${prefix}.maxAbsWeightDiff`, 0, maxW, 1e-9);
  num(`${prefix}.maxRelQtyDiff`, 0, maxQ, 1e-9);
  num(`${prefix}.maxRelEquityDiff`, 0, maxE, 1e-9);
  if (d.ma200_ofSigDate) num(`${prefix}.maxRelMA200Diff`, 0, maxMA, 1e-12);
}
function cmpK2Daily(prefix, a, d) {
  const n = d.d.length - 1;
  let bad = { ladder: 0, count: 0, target: 0, side: 0, trend: 0 }, maxW = 0, maxE = 0;
  for (let i = 0; i < Math.min(a.length, n); i++) {
    const x = a[i];
    const tr = x.trend === true ? 1 : x.trend === false ? 0 : null;
    if (tr !== d.trend[i]) bad.trend++;
    if (tr === 0) {
      if (x.ladder !== d.ladder[i]) bad.ladder++;
      if (x.count !== d.count[i]) bad.count++;
    }
    if (tr !== null && Math.abs(x.target - (tr === 1 ? 1 : d.target[i])) > 1e-12) bad.target++;
    if ((x.tradeSide ?? null) !== (d.traded[i] ?? null)) bad.side++;
    maxW = Math.max(maxW, Math.abs(x.weight - d.wPost[i]));
    maxE = Math.max(maxE, Math.abs(x.equityBeforeTrade / d.equityPre[i] - 1));
  }
  eq(`${prefix}.length`, a.length, n);
  for (const [k, v] of Object.entries(bad)) eq(`${prefix}.${k}Mismatches`, 0, v);
  num(`${prefix}.maxAbsWeightDiff`, 0, maxW, 1e-9);
  num(`${prefix}.maxRelEquityDiff`, 0, maxE, 1e-9);
}

// ---- 数据与分级
eq('verifiedSourceCount', main.verifiedSourceCount, mine.dataChecks.sha256.verified);
eq('verdict', main.verdict, mine.oldHistory.grade);
eq('asOf.trend', main.asOf.trend, mine.dataChecks.latestState.trendOn);
num('asOf.ma200', main.asOf.ma200, mine.dataChecks.latestState.ma200, 1e-9);
num('asOf.mvrv', main.asOf.mvrv, mine.dataChecks.latestState.mvrv, 1e-10);

// ---- 旧史三场景
const H = main.history, O = mine.oldHistory;
cmpScenario('old.base', H.base, O.main, { dailyMine: mine.daily.old_main_K1 });
cmpScenario('old.late', H.lateOneDay, O.late, { dailyMine: mine.daily.old_late_K1 });
cmpScenario('old.cost2', H.doubleCost, O.cost2, { dailyMine: mine.daily.old_cost2_K1 });
// 每日调回参考
const dr = H.base.dailyReference, mdr = O.main.M_daily_report;
eq('old.base.dailyReference.weightUnits', dr.weightUnits, Math.round(mdr.w * 10000));
num('old.base.dailyReference.sigmaGross', dr.sigmaGross, mdr.sigmaGross);
for (const [ka, kb] of metricMap) num(`old.base.dailyReference.${ka}`, dr[ka], mdr.metrics[kb]);
eq('old.base.dailyReference.trades', dr.trades, mdr.metrics.trades);

// ---- 分段
for (const [k, i] of [['early', 0], ['late', 1]]) {
  const a = main.segments[k], b = O.segments[i];
  for (const [ka, kb] of metricMap) { num(`segment.${k}.K1.${ka}`, a.K1[ka], b.K1[kb]); num(`segment.${k}.M.${ka}`, a.M[ka], b.M[kb]); num(`segment.${k}.B0.${ka}`, a.B0[ka], b.B0[kb]); }
  eq(`segment.${k}.weightUnits`, a.M.weightUnits, Math.round(b.w * 10000));
  eq(`segment.${k}.mismatch`, a.M.mismatch, b.referenceMismatch);
  num(`segment.${k}.deltaCER`, a.deltas.cerVsM, b.deltaCER_K1_M);
  num(`segment.${k}.mddVsM`, a.deltas.mddVsM, b.mddGain_vs_M);
  eq(`segment.${k}.K1.trades`, a.K1.trades, b.K1trades);
}
// ---- 正成交量敏感性
for (const [k, kb] of [['standard', 'main'], ['positiveOnly', 'positiveVolume']]) {
  const a = main.sensitivities.positiveVolume[k], b = O.sensitivity_positiveVolumeMA[kb], win = O.sensitivity_positiveVolumeMA.window;
  eq(`sens.${k}.window`, [a.coverage.start, a.coverage.end], [win.start, win.end]);
  for (const [ka, kbm] of metricMap) { num(`sens.${k}.K1.${ka}`, a.K1[ka], b.K1[kbm]); num(`sens.${k}.M.${ka}`, a.M[ka], b.M[kbm]); }
  eq(`sens.${k}.weightUnits`, a.M.weightUnits, Math.round(b.w * 10000));
  num(`sens.${k}.deltaCER`, a.deltas.cerVsM, b.deltaCER_K1_M);
  eq(`sens.${k}.K1.tradeDatesSides`, tradeKey(a.K1.ledger), b.K1trades.map(([d, s]) => `${d}:${s}`));
  eq(`sens.${k}.gates`, a.gates, { match: b.gates.referenceMatched, cerVsM: b.gates.sameVol_deltaCER_ge_0, mddVsM: b.gates.sameVol_mdd_shallower_5pp, mddVsB0: b.gates.b0_mdd_shallower_10pp, sigmaReductionVsB0: b.gates.b0_sigma_lower_15pct });
}
// ---- 现金利率
{
  const a = main.sensitivities.cashRate, b = O.cashRateSensitivity;
  for (const [ka, kb] of metricMap) { num(`cash.K1.${ka}`, a.K1[ka], b.K1[kb]); num(`cash.M.${ka}`, a.M[ka], b.M[kb]); num(`cash.B0.${ka}`, a.B0[ka], b.B0[kb]); }
  eq('cash.weightUnits', a.M.weightUnits, Math.round(b.w * 10000));
  num('cash.deltaCER', a.deltas.cerVsM, b.deltaCER_K1_M);
  num('cash.mddVsM', a.deltas.mddVsM, b.mddGain_vs_M);
  eq('cash.K1.tradeDatesSides', tradeKey(a.K1.ledger), b.K1trades.map(([d, s]) => `${d}:${s}`));
  eq('cash.gates', a.gates, { match: b.gates.referenceMatched, cerVsM: b.gates.sameVol_deltaCER_ge_0, mddVsM: b.gates.sameVol_mdd_shallower_5pp, mddVsB0: b.gates.b0_mdd_shallower_10pp, sigmaReductionVsB0: b.gates.b0_sigma_lower_15pct });
}
// ---- K2
for (const [k, kb, dk] of [['history', 'K2', 'old_K2'], ['replay', 'K2', 'rep_K2']]) {
  const a = main.K2[k], b = (k === 'history' ? O : mine.replication)[kb];
  cmpMetrics(`K2.${k}`, a, b.metrics);
  cmpLedger(`K2.${k}`, a.ledger, b.trades);
  eq(`K2.${k}.requiredMvrv`, a.requiredMvrv, b.readings.needed);
  eq(`K2.${k}.missingMvrv`, a.missingMvrv, b.readings.missing);
  eq(`K2.${k}.incomplete`, a.incomplete, b.readings.coverageIncomplete);
  cmpK2Daily(`K2.${k}.daily`, a.daily, mine.daily[dk]);
  // 逐笔阶梯成交（0<目标<1）
  const ea = a.clusters.flatMap((c) => c.entries.map((e) => `${e.date}:${e.side}:L${e.ladder}`));
  const eb = b.episodes.flatMap((e) => e.steps.filter((s) => s.targetW > 0 && s.targetW < 1).map((s) => `${s.date}:${s.side}:L${s.ladder}`));
  eq(`K2.${k}.ladderEntries`, ea, eb);
  const xa = a.clusters.flatMap((c) => c.exits.map((e) => `${e.executionDate}:${e.reason}`));
  const xb = b.episodes.filter((e) => e.endDate).map((e) => `${e.endDate}:${e.endReason === 'trend_takeover' ? 'trend' : 'mvrv'}`);
  eq(`K2.${k}.exits`, xa, xb);
  const ca = a.clusters.map((c) => c.averageCost);
  rows.push({ item: `K2.${k}.clusterAverageCost(main, 按 MVRV<1 簇)`, main: ca, replication: b.episodes.map((e) => e.avgBuyCost), diff: 'definition', tol: 'n/a', ok: true });
}
// ---- 复现段
cmpScenario('rep.btc', main.replay.BTC, mine.replication.btc_main, { dailyMine: mine.daily.rep_btc_main_K1 });
{
  const a = main.replay.ETH, b = mine.replication.eth_main;
  cmpMetrics('rep.eth.K1', a.K1, b.K1.metrics);
  cmpMetrics('rep.eth.B0', a.B0, b.B0.metrics);
  cmpLedger('rep.eth.K1', a.K1.ledger, b.K1.trades);
  cmpDaily('rep.eth.K1.daily', a.K1.daily, mine.daily.rep_eth_main_K1);
}
// ---- 自助法与杠杆（第二实现补算，见 extra-results.json）
if (extra?.bootstrap) {
  num('bootstrap.cerDeltaLower95', main.bootstrap.cerDeltaLower95, extra.bootstrap.lower95, 0.001);
  eq('bootstrap.weightUnitsMin', main.bootstrap.weightUnitsMin, extra.bootstrap.weightUnitsMin);
  eq('bootstrap.weightUnitsMax', main.bootstrap.weightUnitsMax, extra.bootstrap.weightUnitsMax);
}
for (const [tag, key] of [['lev', 'leverageMarginSizing'], ['levNotional(第二实现读法，仅供参照)', 'leverage']]) if (extra?.[key]) {
  eq(`${tag}.window`, [main.leverage.start, main.leverage.end], [extra[key].start, extra[key].end]);
  for (const sc of ['base', 'doubleCost']) for (const name of ['trend2x', 'trend3x', 'halfEquityProxy']) {
    const a = main.leverage.scenarios[sc][name].minFundingBalance, b = extra[key][sc][name];
    const am = main.leverage.scenarios[sc][name].maxFundingBalance;
    if (tag === 'lev') num(`${tag}.${sc}.${name}.mdd(maxFundingBalance vs optimistic)`, am.mdd, b.optimistic.mdd);
    for (const k of ['sigma', 'mdd', 'cer', 'cagr']) num(`${tag}.${sc}.${name}.${k}`, a[k], b[k]);
    for (const leg of Object.keys(a.legs)) {
      eq(`${tag}.${sc}.${name}.${leg}.touches`, a.legs[leg].touches, b.legs[leg].touchesPessimistic);
      eq(`${tag}.${sc}.${name}.${leg}.trades`, a.legs[leg].trades, b.legs[leg].trades);
      num(`${tag}.${sc}.${name}.${leg}.fundingCashFlow`, a.legs[leg].fundingCashFlow, b.legs[leg].funding, 1e-4);
      eq(`${tag}.${sc}.${name}.${leg}.tradeDatesSides`, a.legs[leg].ledger.map((t) => `${t.date}:${t.side}`), b.legs[leg].ledger.map((t) => `${t.date}:${t.side}`));
    }
  }
}

writeFileSync(join(HERE, 'crosscheck.json'), JSON.stringify({ generatedAt: new Date().toISOString(), total: rows.length, failed: issues.length, issues, rows }, null, 1) + '\n');
console.log(`比对 ${rows.length} 项，超出容差 ${issues.length} 项`);
for (const r of rows.filter((x) => !x.ok)) console.log('  ✗', r.item, JSON.stringify(r.main)?.slice(0, 160), '|', JSON.stringify(r.replication)?.slice(0, 160), '| diff', JSON.stringify(r.diff));
