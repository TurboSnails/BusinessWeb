#!/usr/bin/env node
// L-039 第二实现 · 第二阶段补算：
//   1) 旧史自助法下界：读主实现导出的固定区块起点（bootstrap-indices.json），独立重建 M 并重新匹配 w；
//   2) 杠杆报告项：按 PREREG「成本与杠杆报告」与 clarify-1 第 1 条独立实现。
// 输出 replication/extra-results.json。
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DAY, dn, ds, RAW, verifySources, loadBitstampBTC, loadCoinMetrics, ma200States, bitstampCost,
  simulate, metrics, mean, varS, K1, K2,
} from './run.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const t0 = Date.now();
const sha = verifySources();
if (sha.bad) { console.error('SHA-256 校验失败', sha.failures); process.exit(2); }
const { bars } = loadBitstampBTC();
const cm = loadCoinMetrics();
const days = [...bars.keys()].sort((a, b) => a - b);
const states = ma200States(bars, { firstDay: days[0], lastDay: days.at(-1) });
const BTC = { bars, fallback: cm.btc };

// =====================================================================
// 1. 自助法
// =====================================================================
function bootstrap() {
  const start = dn('2012-03-05'), end = dn('2018-01-01');
  const N = end - start;
  const k1n = simulate(BTC, { start, end, strategy: K1(bitstampCost, states), costMult: 1 }).r;
  const k1g = simulate(BTC, { start, end, strategy: K1(bitstampCost, states), costMult: 0 }).r;
  const u = new Float64Array(N), tradable = new Uint8Array(N), monthly = new Uint8Array(N), fee = new Float64Array(N), slip = new Float64Array(N);
  let lastMonth = null;
  for (let i = 0; i < N; i++) {
    const t = start + i;
    const b = bars.get(t), b1 = bars.get(t + 1);
    u[i] = b1.open / b.open - 1; // 本样本无缺日，估值价即开盘
    tradable[i] = b.vol > 0 ? 1 : 0;
    const m = ds(t).slice(0, 7);
    if (tradable[i] && m !== lastMonth) { monthly[i] = 1; lastMonth = m; }
    const c = bitstampCost(t); fee[i] = c.fee; slip[i] = c.slip;
  }
  const idx = JSON.parse(readFileSync(join(HERE, '../bootstrap-indices.json'), 'utf8'));
  if (idx.sourceDayCount !== N || idx.blockLength !== 90 || idx.sourceStart !== ds(start)) throw new Error('索引文件与样本不符');
  const B = idx.blockLength;
  const ix = new Int32Array(N);
  const U = new Float64Array(N), G = new Float64Array(N), Nt = new Float64Array(N), F = new Float64Array(N), S = new Float64Array(N);
  const R = new Uint8Array(N); // 调回标识：原日月调回标识，或抽样序列中的首个可成交日
  const sd = (a) => Math.sqrt(varS(a));
  const cer = (a) => 365 * (mean(a) - 1.5 * varS(a));
  const tmp = new Float64Array(N);
  function grossSigma(w) {
    let wt = 0;
    for (let i = 0; i < N; i++) {
      if (R[i]) wt = w;
      tmp[i] = wt * U[i];
      wt = wt === 0 ? 0 : (wt * (1 + U[i])) / (1 + wt * U[i]);
    }
    return sd(tmp);
  }
  function netReturns(w) {
    // 以权益 E 与 BTC 权重 wt 表示；调回日按成本后目标权益成交（与主回测 B3 同式）
    const out = new Float64Array(N);
    let wt = 0;
    for (let i = 0; i < N; i++) {
      let keep = 1; // 成交后权益 / 成交前权益
      if (R[i] && Math.abs(w - wt) > 1e-13) {
        if (w > wt) { const k = (1 + S[i]) * (1 + F[i]) - 1; const notional = (w - wt) / (1 + w * k); keep = 1 - notional * k; }
        else { const k = 1 - (1 - S[i]) * (1 - F[i]); const notional = (wt - w) / (1 - w * k); keep = 1 - notional * k; }
        wt = w;
      } else if (R[i]) wt = w;
      out[i] = keep * (1 + wt * U[i]) - 1;
      wt = wt === 0 ? 0 : (wt * (1 + U[i])) / (1 + wt * U[i]);
    }
    return out;
  }
  const deltas = new Float64Array(idx.blockStarts.length);
  let wMin = Infinity, wMax = -Infinity;
  for (let dr = 0; dr < idx.blockStarts.length; dr++) {
    const starts = idx.blockStarts[dr];
    let p = 0;
    for (const st of starts) for (let o = 0; o < B && p < N; o++) ix[p++] = (st + o) % N;
    let started = false;
    for (let i = 0; i < N; i++) {
      const j = ix[i];
      U[i] = u[j]; G[i] = k1g[j]; Nt[i] = k1n[j]; F[i] = fee[j]; S[i] = slip[j];
      R[i] = tradable[j] && (monthly[j] || !started) ? 1 : 0;
      if (tradable[j]) started = true;
    }
    const target = sd(G);
    // B0 毛：首个可成交日起满仓
    let act = false;
    for (let i = 0; i < N; i++) { if (R[i]) act = true; tmp[i] = act ? U[i] : 0; }
    const bh = sd(tmp);
    let pick;
    if (target > bh) pick = 10000;
    else {
      let lo = 0, hi = 10000;
      const cache = new Map([[0, 0]]);
      const sig = (w) => { if (!cache.has(w)) cache.set(w, grossSigma(w / 10000)); return cache.get(w); };
      while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if (sig(mid) < target) lo = mid; else hi = mid; }
      pick = Math.abs(sig(hi) - target) < Math.abs(sig(lo) - target) ? hi : lo;
    }
    wMin = Math.min(wMin, pick); wMax = Math.max(wMax, pick);
    deltas[dr] = cer(Nt) - cer(netReturns(pick / 10000));
  }
  const sorted = Float64Array.from(deltas).sort();
  const q = (p) => { const h = (sorted.length - 1) * p; const l = Math.floor(h); return sorted[l] + (h - l) * (sorted[Math.min(l + 1, sorted.length - 1)] - sorted[l]); };
  return { draws: deltas.length, blockLength: B, lower95: q(0.05), median: q(0.5), p95: q(0.95), meanDelta: mean(deltas), weightUnitsMin: wMin, weightUnitsMax: wMax, quantileMethod: 'linear（NumPy 默认）' };
}

// =====================================================================
// 2. 杠杆报告项
// =====================================================================
function loadPerp() {
  const read = (prefix) => {
    const out = [];
    for (let i = 1; i < 20; i++) {
      const f = join(RAW, `${prefix}-${String(i).padStart(2, '0')}.json`);
      let j; try { j = JSON.parse(readFileSync(f, 'utf8')); } catch { break; }
      out.push(...j);
    }
    return out;
  };
  const kl = (rows) => { const m = new Map(); for (const k of rows) { const ms = Number(k[0]); const key = ms; if (m.has(key) && m.get(key).join() !== k.join()) throw new Error('重复冲突'); m.set(key, k); } return m; };
  const trade = kl(read('perp-btcusdt'));
  const mark = kl(read('mark-btcusdt'));
  const mark8h = kl(read('mark8h-btcusdt'));
  const funding = new Map();
  for (const r of read('funding-btcusdt')) {
    const slot = Math.round(r.fundingTime / 60000) * 60000; // 最近 UTC 分钟
    if (funding.has(slot)) throw new Error('资金费重复 ' + slot);
    let m = r.markPrice === '' || r.markPrice == null ? null : Number(r.markPrice), src = 'event';
    if (m == null && mark8h.has(slot)) { m = Number(mark8h.get(slot)[1]); src = 'mark8h_open'; }
    funding.set(slot, { rate: Number(r.fundingRate), mark: m, src });
  }
  return { trade, mark, funding };
}

function leverage(SIZING) {
  const P = loadPerp();
  const END = dn('2026-11-26');
  const okDay = (t) => P.trade.has(t * DAY) && P.mark.has(t * DAY) && [0, 8, 16].every((h) => P.funding.get(t * DAY + h * 3600000)?.mark != null);
  let first = null;
  for (let t = dn('2019-09-01'); t <= END; t++) { if (okDay(t)) { if (first === null) first = t; } else if (first !== null && t < END) throw new Error('共同覆盖不连续 ' + ds(t)); else first = null; }
  // 终点只需开盘标记与 00:00 资金费
  const srcCount = { event: 0, mark8h_open: 0 };
  for (let t = first; t < END; t++) for (const h of [0, 8, 16]) srcCount[P.funding.get(t * DAY + h * 3600000).src]++;
  srcCount.terminal00 = P.funding.get(END * DAY).src;

  // 信号：K1 趋势（数据日 E−1）与 K2 阶梯（样本首日起）
  const k2 = K2(bitstampCost, states, cm.btc);
  k2.reset();
  const sig = new Map();
  for (let t = first; t < END; t++) { k2.onDay(t); const info = k2.dailyInfo(); sig.set(t, { trend: states.get(t - 1).state, ladder: info.trend === 0 ? info.ladder : 0 }); }
  const W = [0, 1 / 6, 1 / 3, 1 / 2];

  function run(legDefs, costMult, ordering) {
    const fee = 0.001 * costMult, slip = 0.001 * costMult, mm = 0.005;
    const legs = legDefs.map(([name, L, cap]) => ({ name, L, cash: cap, init: cap, qty: 0, basis: 0, margin: 0, prevT: 0, funding: 0, touches: [], ledger: [], curve: [cap] }));
    const iso = (g, m) => g.margin + g.qty * m - g.basis;
    const eq = (g, m) => g.cash + iso(g, m);
    const touched = (g, m, adj = 0) => g.qty > 0 && iso(g, m) + adj <= mm * g.qty * m;
    const settle = (g, ev) => { const a = -g.qty * ev.mark * ev.rate; g.margin += a; g.funding += a; };
    const liquidate = (g, t, phase, m) => { g.touches.push({ date: ds(t), phase, mark: m, qty: g.qty }); g.qty = 0; g.basis = 0; g.margin = 0; };
    const total = [legs.reduce((s, g) => s + g.cash, 0)];
    for (let t = first; t < END; t++) {
      const tk = P.trade.get(t * DAY), mk = P.mark.get(t * DAY);
      const open = Number(tk[1]), mOpen = Number(mk[1]), mLow = Number(mk[3]);
      const f0 = P.funding.get(t * DAY), f8 = P.funding.get(t * DAY + 8 * 3600000), f16 = P.funding.get(t * DAY + 16 * 3600000);
      const s = sig.get(t);
      for (const g of legs) {
        // 00:00 资金费先于同刻换仓
        settle(g, f0);
        const T = g.name === 'bottom' ? W[s.ladder] : s.trend ? 1 : 0;
        if (T === 0 && g.qty > 0) {
          const ex = open * (1 - slip);
          const fe = g.qty * ex * fee;
          const proceeds = g.margin + g.qty * ex - g.basis - fe;
          g.cash += Math.max(0, proceeds);
          g.ledger.push({ date: ds(t), side: 'sell', qty: g.qty, price: ex, fee: fe });
          g.qty = 0; g.basis = 0; g.margin = 0;
        } else if (T > g.prevT && g.cash > 0) {
          // 成交后：持仓名义（按开盘标记）= T × 杠杆 × 该腿成交后权益
          const ex = open * (1 + slip);
          const E0 = eq(g, mOpen);
          const c = ex * fee + (ex - mOpen);
          // 默认（第二实现读法）：成交后名义（按标记）= T × L × 成交后权益。
          // SIZING=margin 为诊断变体：成交后逐仓权益（保证金 + 浮盈亏）= T × 成交后权益（主实现读法）。
          let dq = SIZING === 'margin'
            ? (T * E0 - iso(g, mOpen)) / (ex / g.L - (1 - T) * (ex - mOpen) + T * ex * fee)
            : (T * g.L * E0 - g.qty * mOpen) / (mOpen + T * g.L * c);
          dq = Math.min(dq, g.cash / (ex / g.L + ex * fee));
          if (dq > 0) {
            const fe = dq * ex * fee, mg = dq * ex / g.L;
            g.cash = Math.max(0, g.cash - mg - fe);
            g.margin += mg; g.qty += dq; g.basis += dq * ex;
            g.ledger.push({ date: ds(t), side: 'buy', qty: dq, price: ex, fee: fe, target: T });
          }
        }
        g.prevT = T;
        // 日内：08:00、16:00 结算与标记日低；日低时点未知，按资金费累计余额取最差或最好位置
        const steps = [0, -g.qty * f8.mark * f8.rate, -g.qty * f8.mark * f8.rate - g.qty * f16.mark * f16.rate];
        const k = ordering === 'pessimistic' ? steps.indexOf(Math.min(...steps)) : steps.indexOf(Math.max(...steps));
        if (touched(g, mLow, steps[k])) liquidate(g, t, `day_low_slot${k}`, mLow);
        for (const ev of [f8, f16]) { if (touched(g, ev.mark)) liquidate(g, t, 'settlement_mark', ev.mark); settle(g, ev); }
      }
      // 次日开盘估值（含次日 00:00 资金费）
      const nf = P.funding.get((t + 1) * DAY), nm = Number(P.mark.get((t + 1) * DAY)[1]);
      for (const g of legs) {
        const inc = -g.qty * nf.mark * nf.rate;
        const v = touched(g, nm, inc) || touched(g, nf.mark, inc) ? g.cash : eq(g, nm) + inc;
        g.curve.push(v);
      }
      total.push(legs.reduce((sum, g) => sum + g.curve.at(-1), 0));
    }
    const ev = (curve) => {
      const P0 = curve[0];
      const Pn = curve.map((x) => x / P0);
      const r = []; for (let i = 1; i < Pn.length; i++) r.push(Pn[i - 1] > 0 ? Pn[i] / Pn[i - 1] - 1 : 0);
      const m = metrics({ P: Pn, r, trades: [], turnover: 0, postW: [0], start: ds(first), maxMissStreak: 0, fallbackDays: [] });
      return { sigma: m.sigma, mdd: m.mdd, cer: m.cer, cagr: m.cagr, sharpe: m.sharpe, endingEquity: m.finalMultiple };
    };
    return { ...ev(total), legs: Object.fromEntries(legs.map((g) => [g.name, { ...ev(g.curve), touches: g.touches.length, touchList: g.touches, trades: g.ledger.length, funding: g.funding, ledger: g.ledger }])) };
  }
  const strategies = { trend2x: [['trend', 2, 1]], trend3x: [['trend', 3, 1]], halfEquityProxy: [['trend', 2, 0.5], ['bottom', 1, 0.5]] };
  const out = { start: ds(first), end: ds(END), fundingMarkSources: srcCount };
  for (const [sc, mult] of [['base', 1], ['doubleCost', 2]]) {
    out[sc] = {};
    for (const [name, legs] of Object.entries(strategies)) {
      const pess = run(legs, mult, 'pessimistic'), opt = run(legs, mult, 'optimistic');
      out[sc][name] = { ...pess, legs: Object.fromEntries(Object.entries(pess.legs).map(([k, v]) => [k, { ...v, touchesPessimistic: v.touches, touchesOptimistic: opt.legs[k].touches }])), optimistic: { sigma: opt.sigma, mdd: opt.mdd, cer: opt.cer, cagr: opt.cagr } };
    }
  }
  return out;
}

const bs = bootstrap();
const lev = leverage('notional');
const levMargin = leverage('margin');
writeFileSync(join(HERE, 'extra-results.json'), JSON.stringify({ generatedAt: new Date().toISOString(), runtimeMs: Date.now() - t0, bootstrap: bs, leverage: lev, leverageMarginSizing: levMargin, sizingNote: 'leverage = 第二实现读法（成交后按标记计的名义 = 目标 × 杠杆 × 成交后权益）；leverageMarginSizing = 主实现读法（成交后逐仓权益 = 目标 × 成交后权益，名义 = 杠杆 × 按成交价计的保证金）' }) + '\n');
console.log('bootstrap', JSON.stringify(bs));
for (const [tag, L] of [['notional', lev], ['margin', levMargin]]) for (const sc of ['base', 'doubleCost']) for (const [n, v] of Object.entries(L[sc])) console.log(tag, sc, n, v.sigma.toFixed(6), v.mdd.toFixed(6), v.cer.toFixed(6), v.cagr.toFixed(6), Object.entries(v.legs).map(([k, x]) => `${k}:touch ${x.touchesPessimistic}/${x.touchesOptimistic} trades ${x.trades} funding ${x.funding.toFixed(5)}`).join(' '), 'opt mdd', v.optimistic.mdd.toFixed(6));
console.log(lev.start, lev.end, JSON.stringify(lev.fundingMarkSources), `${Date.now() - t0} ms`);
