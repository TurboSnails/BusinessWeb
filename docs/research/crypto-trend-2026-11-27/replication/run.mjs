#!/usr/bin/env node
// L-039 第二实现（Node，无第三方依赖）。
// 只依据 PREREG.md（提交 844bd10f）、DATA.md 与 .dev-team/runs/crypto-trend/tasks/clarify-1.md。
// 读 data-raw/crypto-trend/raw/ 冻结原始文件，先按 SOURCES.md 校验 SHA-256。
// 输出 replication/results.json 和本机 replication/results-daily.json。解读见 replication/NOTES.md。
//
// 用法：node docs/research/crypto-trend-2026-11-27/replication/run.mjs

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../../..');
const RAW = join(REPO, 'data-raw/crypto-trend/raw');
const SOURCES = join(REPO, 'data-raw/crypto-trend/SOURCES.md');
const OUT = join(HERE, 'results.json');
const OUT_DETAIL = join(HERE, 'results-daily.json');

const DAY = 86400000;
const dn = (iso) => Math.round(Date.parse(iso.slice(0, 10) + 'T00:00:00Z') / DAY); // day number
const ds = (n) => new Date(n * DAY).toISOString().slice(0, 10);
const ym = (n) => ds(n).slice(0, 7);

// ---------------------------------------------------------------- 1. SHA-256
function verifySources() {
  const text = readFileSync(SOURCES, 'utf8');
  const expected = new Map();
  for (const line of text.split('\n')) {
    const m = line.match(/^\|\s*`([^`]+)`\s*\|.*`([0-9a-f]{64})`\s*\|\s*$/);
    if (m) {
      if (expected.has(m[1]) && expected.get(m[1]) !== m[2]) throw new Error(`SOURCES 冲突 ${m[1]}`);
      expected.set(m[1], m[2]);
    }
  }
  const results = [];
  let bad = 0;
  for (const [file, sha] of expected) {
    const p = join(RAW, file);
    if (!existsSync(p)) { results.push({ file, ok: false, reason: 'missing' }); bad++; continue; }
    const got = createHash('sha256').update(readFileSync(p)).digest('hex');
    const ok = got === sha;
    if (!ok) bad++;
    results.push({ file, ok, ...(ok ? {} : { expected: sha, got }) });
  }
  const onDisk = readdirSync(RAW).filter((f) => !f.endsWith('.source'));
  const unlisted = onDisk.filter((f) => !expected.has(f));
  return { listed: expected.size, verified: results.filter((r) => r.ok).length, bad, unlisted, failures: results.filter((r) => !r.ok) };
}

// ---------------------------------------------------------------- 2. 读数据
function scaledInt(str) {
  // 精确把十进制字符串转为整数（按 8 位小数缩放）用于 MA200 比较
  const [i, f = ''] = str.split('.');
  if (f.length > 8) throw new Error('小数位过多 ' + str);
  return Number(BigInt(i + f.padEnd(8, '0')));
}

function loadBitstampBTC() {
  const files = readdirSync(RAW).filter((f) => /^bitstamp-btcusd-.*\.json$/.test(f)).sort();
  const bars = new Map();
  let raw = 0, dup = 0, misaligned = 0;
  for (const f of files) {
    const j = JSON.parse(readFileSync(join(RAW, f), 'utf8'));
    for (const r of j.data.ohlc) {
      raw++;
      const ts = Number(r.timestamp);
      if (ts % 86400 !== 0) { misaligned++; continue; }
      const d = ts / 86400;
      const rec = { open: +r.open, high: +r.high, low: +r.low, close: +r.close, vol: +r.volume, closeInt: scaledInt(r.close), rawKey: `${r.open}|${r.high}|${r.low}|${r.close}|${r.volume}` };
      if (bars.has(d)) {
        dup++;
        if (bars.get(d).rawKey !== rec.rawKey) throw new Error('Bitstamp 同日冲突 ' + ds(d));
        continue;
      }
      bars.set(d, rec);
    }
  }
  return { bars, stats: { files: files.length, rawRecords: raw, duplicateRecords: dup, misaligned, uniqueDays: bars.size } };
}

function loadBinanceSpot(sym) {
  const files = readdirSync(RAW).filter((f) => new RegExp(`^spot-${sym}-\\d+\\.json$`).test(f)).sort();
  const bars = new Map();
  let raw = 0, dup = 0, misaligned = 0;
  for (const f of files) {
    const arr = JSON.parse(readFileSync(join(RAW, f), 'utf8'));
    for (const k of arr) {
      raw++;
      const ms = Number(k[0]);
      if (ms % DAY !== 0) { misaligned++; continue; }
      const d = ms / DAY;
      const rec = { open: +k[1], high: +k[2], low: +k[3], close: +k[4], vol: +k[5], closeInt: scaledInt(k[4]), rawKey: k.slice(0, 6).join('|') };
      if (bars.has(d)) { dup++; if (bars.get(d).rawKey !== rec.rawKey) throw new Error('Binance 同日冲突'); continue; }
      bars.set(d, rec);
    }
  }
  return { bars, stats: { files: files.length, rawRecords: raw, duplicateRecords: dup, misaligned, uniqueDays: bars.size } };
}

function loadCoinMetrics() {
  const out = { btc: new Map(), eth: new Map() };
  for (const f of ['cm-metrics-01.json', 'cm-metrics-02.json']) {
    const j = JSON.parse(readFileSync(join(RAW, f), 'utf8'));
    for (const r of j.data) {
      const d = dn(r.time);
      const m = out[r.asset];
      if (!m) continue;
      const rec = {
        price: r.PriceUSD == null ? null : +r.PriceUSD,
        mvrv: r.CapMVRVCur == null ? null : +r.CapMVRVCur,
        cap: r.CapMrktCurUSD == null ? null : +r.CapMrktCurUSD,
        sply: r.SplyCur == null ? null : +r.SplyCur,
      };
      if (m.has(d)) {
        const a = m.get(d);
        if (JSON.stringify(a) !== JSON.stringify(rec)) throw new Error('CM 同日冲突 ' + ds(d));
      }
      m.set(d, rec);
    }
  }
  return out;
}

function loadFred() {
  const p = join(RAW, 'fred-DGS3MO.csv');
  if (!existsSync(p)) return null;
  const lines = readFileSync(p, 'utf8').trim().split(/\r?\n/);
  const obs = []; // [day, rate pct]
  let missing = 0;
  for (const line of lines.slice(1)) {
    const [d, v] = line.split(',');
    if (v === undefined || v === '' || v === '.') { missing++; continue; }
    obs.push([dn(d), Number(v)]);
  }
  obs.sort((a, b) => a[0] - b[0]);
  return { obs, missing, rows: lines.length - 1 };
}

// 现金日利率：交易日 t（open t → open t+1）使用观测日 ≤ t−1 的最近有效观测
function makeCashRate(fred) {
  if (!fred) return null;
  const obs = fred.obs;
  return (t) => {
    let lo = 0, hi = obs.length - 1, ans = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (obs[mid][0] <= t - 1) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
    return ans < 0 ? 0 : obs[ans][1] / 100 / 365;
  };
}

// ---------------------------------------------------------------- 3. 数据质量
function qualityCheck(bars) {
  const days = [...bars.keys()].sort((a, b) => a - b);
  const gaps = [];
  for (let i = 1; i < days.length; i++) if (days[i] - days[i - 1] !== 1) gaps.push([ds(days[i - 1]), ds(days[i])]);
  let ohlcBad = 0, nonPos = 0;
  const zeroVol = [], zeroVolNonFlat = [];
  for (const d of days) {
    const b = bars.get(d);
    if (!(b.low <= Math.min(b.open, b.close) && b.high >= Math.max(b.open, b.close))) ohlcBad++;
    if (!(b.open > 0 && b.close > 0 && b.low > 0)) nonPos++;
    if (b.vol === 0) { zeroVol.push(ds(d)); if (!(b.open === b.close && b.high === b.low && b.open === b.high)) zeroVolNonFlat.push(ds(d)); }
  }
  return { first: ds(days[0]), last: ds(days.at(-1)), days: days.length, gaps, ohlcOrderAnomalies: ohlcBad, nonPositive: nonPos, zeroVolumeDays: zeroVol, zeroVolumeNonFlat: zeroVolNonFlat };
}

// ---------------------------------------------------------------- 4. MA200 状态
// 返回 Map day -> {state: true/false, ma, close}；只在形成 200 个有效收盘后有值。
// 缺失或被排除的收盘：沿用上一有效状态（不更新窗）。
function ma200States(bars, { firstDay, lastDay, include = () => true, fromDay = -Infinity }) {
  const out = new Map();
  const win = [];
  let sum = 0;
  let prev = null;
  for (let d = firstDay; d <= lastDay; d++) {
    const b = bars.get(d);
    if (b && d >= fromDay && include(b, d)) {
      win.push(b.closeInt); sum += b.closeInt;
      if (win.length > 200) sum -= win.shift();
      if (win.length === 200) {
        if (!Number.isSafeInteger(sum)) throw new Error('MA 和溢出');
        prev = { state: 200 * b.closeInt >= sum, ma: sum / 200 / 1e8, close: b.close, carried: false };
        out.set(d, prev);
        continue;
      }
    }
    if (prev) out.set(d, { ...prev, carried: true });
  }
  return out;
}

// ---------------------------------------------------------------- 5. 成本
function bitstampCost(d) {
  const s = ds(d);
  if (s <= '2015-03-01') return { fee: 0.005, slip: s < '2013-01-01' ? 0.0025 : 0.001 };
  return { fee: 0.0025, slip: 0.001 };
}
const binanceCost = () => ({ fee: 0.001, slip: 0.001 });

// ---------------------------------------------------------------- 6. 回测引擎
// 估值点为每日开盘（成交前）。P[i] = 第 i 个开盘的成交前权益；r[i] = P[i+1]/P[i]-1。
// 交易只在「有 bar、成交量 > 0」的开盘执行；排队只保留最新到期目标，执行时净额成交。
function simulate(inst, { start, end, strategy, costMult = 1, cashRate = null, recordDaily = false }) {
  let cash = 1, q = 0;
  let lastVal = null, missStreak = 0, maxMissStreak = 0, fallbackDays = [];
  let pending = null;
  const P = [], trades = [], daily = recordDaily ? [] : null;
  const postW = [];
  strategy.reset?.();
  let turnover = 0;
  for (let t = start; t <= end; t++) {
    const b = inst.bars.get(t);
    let price = null, src = null;
    if (b) { price = b.open; src = 'open'; }
    else {
      const fb = inst.fallback.get(t - 1);
      if (fb && fb.price != null) { price = fb.price; src = 'cm'; fallbackDays.push(ds(t)); }
    }
    if (price == null) { missStreak++; maxMissStreak = Math.max(maxMissStreak, missStreak); price = lastVal; src = 'carry'; }
    else { missStreak = 0; lastVal = price; }
    const equity = cash + q * price;
    P.push(equity);
    if (t === end) {
      if (recordDaily) daily.push({ d: ds(t), price, src, equityPre: equity, end: true });
      break;
    }
    const wcur = equity > 0 ? (q * price) / equity : 0;
    const action = strategy.onDay(t, { q, cash, price, wcur });
    if (action) pending = { target: action.target, allowSell: (pending?.allowSell ?? false) || action.allowSell, tag: action.tag, kind: action.kind ?? pending?.kind };
    const tradable = !!b && b.vol > 0;
    let traded = null;
    if (tradable && pending) {
      const P0 = b.open;
      const E0 = cash + q * P0;
      const c = strategy.cost(t);
      const f = c.fee * costMult, s = c.slip * costMult;
      const w = pending.target;
      const curW = E0 > 0 ? (q * P0) / E0 : 0;
      let dq = 0;
      if (w > curW + 1e-12) {
        const k = (1 + s) * (1 + f) - 1;
        dq = (w * E0 - q * P0) / (P0 * (1 + w * k));
        if (w === 1) dq = cash / (P0 * (1 + s) * (1 + f));
        if (dq * P0 > 1e-12 * E0) {
          const usd = dq * P0 * (1 + s) * (1 + f);
          cash = w === 1 ? 0 : cash - usd;
          q += dq;
          traded = { date: ds(t), side: 'buy', qty: dq, open: P0, execPrice: P0 * (1 + s), fee: dq * P0 * (1 + s) * f, slipCost: dq * P0 * s, usd, equityBefore: E0, targetW: w, tag: pending.tag };
        }
      } else if (w < curW - 1e-12 && pending.allowSell) {
        const k = 1 - (1 - s) * (1 - f);
        dq = w === 0 ? q : (q * P0 - w * E0) / (P0 * (1 - w * k));
        if (dq * P0 > 1e-12 * E0) {
          const usd = dq * P0 * (1 - s) * (1 - f);
          cash += usd;
          q = w === 0 ? 0 : q - dq;
          traded = { date: ds(t), side: 'sell', qty: dq, open: P0, execPrice: P0 * (1 - s), fee: dq * P0 * (1 - s) * f, slipCost: dq * P0 * s, usd, equityBefore: E0, targetW: w, tag: pending.tag };
        }
      }
      if (traded) {
        traded.equityAfter = cash + q * P0;
        traded.wAfter = (q * P0) / traded.equityAfter;
        turnover += Math.abs(traded.qty * P0) / E0;
        trades.push(traded);
        strategy.onExecuted?.(t, traded);
      }
      pending = null;
    }
    const eqPost = cash + q * price;
    postW.push(eqPost > 0 ? (q * price) / eqPost : 0);
    if (recordDaily) daily.push({ d: ds(t), price, src, tradable, equityPre: equity, pending: pending ? pending.target : null, traded: traded ? traded.side : null, q, cash, wPost: eqPost > 0 ? (q * price) / eqPost : 0, ...(strategy.dailyInfo ? strategy.dailyInfo(t) : {}) });
    if (cashRate) cash *= 1 + cashRate(t);
  }
  const r = [];
  for (let i = 1; i < P.length; i++) r.push(P[i] / P[i - 1] - 1);
  return { P, r, trades, daily, postW, turnover, maxMissStreak, fallbackDays, start: ds(start), end: ds(end) };
}

// ---------------------------------------------------------------- 7. 指标
function mean(a) { let s = 0; for (const x of a) s += x; return s / a.length; }
function varS(a) { const m = mean(a); let s = 0; for (const x of a) s += (x - m) ** 2; return s / (a.length - 1); }
function metrics(sim) {
  const r = sim.r, N = r.length;
  const m = mean(r), v = varS(r), sd = Math.sqrt(v);
  let peak = sim.P[0], mdd = 0, mddPeak = 0, mddTrough = 0, pk = 0;
  for (let i = 0; i < sim.P.length; i++) {
    if (sim.P[i] > peak) { peak = sim.P[i]; pk = i; }
    const dd = 1 - sim.P[i] / peak;
    if (dd > mdd) { mdd = dd; mddPeak = pk; mddTrough = i; }
  }
  const losses = r.map((x) => -x).sort((a, b) => b - a);
  const k = Math.ceil(0.05 * N);
  const cvar = mean(losses.slice(0, k));
  let worst30 = null, worst30Start = null;
  if (N >= 30) {
    for (let i = 0; i + 30 <= N; i++) {
      let p = 1; for (let j = i; j < i + 30; j++) p *= 1 + r[j];
      if (worst30 === null || p - 1 < worst30) { worst30 = p - 1; worst30Start = i; }
    }
  }
  const startDay = dn(sim.start);
  const final = sim.P.at(-1) / sim.P[0];
  return {
    N,
    sigma: sd * Math.sqrt(365),
    mdd,
    mddPeak: ds(startDay + mddPeak),
    mddTrough: ds(startDay + mddTrough),
    cer: 365 * (m - 1.5 * v),
    meanDaily: m,
    varDaily: v,
    sharpe: sd > 0 ? (m / sd) * Math.sqrt(365) : null,
    cvar95: cvar,
    cvarDays: k,
    worst30Loss: worst30 === null ? null : -worst30,
    worst30Start: worst30Start === null ? null : ds(startDay + worst30Start),
    cagr: Math.pow(final, 365 / N) - 1,
    finalMultiple: final,
    trades: sim.trades.length,
    turnover: sim.turnover,
    turnoverAnnual: (sim.turnover * 365) / N,
    exposureMean: mean(sim.postW),
    exposureDaysShare: sim.postW.filter((w) => w > 1e-12).length / N,
    maxMissingValuationStreak: sim.maxMissStreak,
    fallbackValuationDays: sim.fallbackDays.length,
  };
}

// ---------------------------------------------------------------- 8. 策略
function B0(cost) {
  let done = false;
  return { reset() { done = false; }, cost, onDay() { if (!done) { done = true; return { target: 1, allowSell: false, tag: 'B0-entry' }; } return null; } };
}
function K1(cost, states, delay = 0) {
  // 执行日 t 的到期信号来自数据日 t-1-delay
  return {
    cost,
    onDay(t) {
      const s = states.get(t - 1 - delay);
      if (!s) return null;
      return { target: s.state ? 1 : 0, allowSell: true, tag: s.state ? 'K1-on' : 'K1-off' };
    },
    dailyInfo(t) { const s = states.get(t - 1 - delay); return { sigDate: s ? ds(t - 1 - delay) : null, sig: s ? (s.state ? 1 : 0) : null }; },
  };
}
function Mref(cost, w, mode = 'monthly') {
  let lastMonth = null, started = false;
  return {
    reset() { lastMonth = null; started = false; },
    cost,
    onDay(t) {
      if (mode === 'daily') return { target: w, allowSell: true, tag: 'M-daily' };
      if (!started || ym(t) !== lastMonth) return { target: w, allowSell: true, tag: started ? 'M-month' : 'M-first' };
      return null;
    },
    onExecuted(t) { started = true; lastMonth = ym(t); },
  };
}
// 注意：Mref 的月调回在「本月首个可成交开盘」执行；onDay 每天在未执行前都会给出动作，
// 不可成交日排队，首个可成交日执行后 lastMonth 更新为该月。

function K2(cost, states, cm) {
  const W = [0, 1 / 6, 1 / 3, 1 / 2];
  let count = 0, ladder = 0, prevTrend = null, first = true, info = {};
  const readings = { needed: 0, missing: 0 };
  return {
    readings,
    reset() { count = 0; ladder = 0; prevTrend = null; first = true; info = {}; readings.needed = 0; readings.missing = 0; },
    cost,
    onDay(t) {
      const s = states.get(t - 1);
      if (!s) { info = { trend: null }; return null; }
      const trend = s.state;
      let action = null;
      const rd = cm.get(t - 2);
      const mvrv = rd && rd.mvrv != null ? rd.mvrv : null;
      if (trend) {
        count = 0; ladder = 0;
        action = { target: 1, allowSell: true, tag: 'K2-trend', kind: 'full' };
        info = { trend: 1, mvrv: null, count, ladder, target: 1 };
      } else {
        const justClosed = prevTrend === true;
        if (justClosed || first) { count = 0; ladder = 0; }
        readings.needed++;
        if (mvrv == null) readings.missing++;
        if (mvrv != null && mvrv < 1) count += 1; else count = 0;
        const prevLadder = ladder;
        let exit = false;
        if (mvrv != null && mvrv >= 1.25) { count = 0; ladder = 0; exit = prevLadder > 0; }
        else {
          const lv = count >= 7 ? 3 : count >= 3 ? 2 : count >= 1 ? 1 : 0;
          if (lv > ladder) ladder = lv;
        }
        const target = W[ladder];
        if (target === 0) action = { target: 0, allowSell: true, tag: exit ? 'K2-exit125' : (justClosed ? 'K2-trendclose' : 'K2-zero'), kind: 'full' };
        else if (justClosed) action = { target, allowSell: true, tag: 'K2-trendclose', kind: 'net' };
        else if (ladder > prevLadder || (first && ladder > 0)) action = { target, allowSell: false, tag: `K2-ladder${ladder}`, kind: 'topup' };
        const rp = rd && rd.cap != null && rd.mvrv && rd.sply ? rd.cap / rd.mvrv / rd.sply : null;
        info = { trend: 0, mvrvDate: ds(t - 2), mvrv, realizedPrice: rp, count, ladder, target, justClosed: justClosed ? 1 : 0, exit125: exit ? 1 : 0 };
      }
      prevTrend = trend;
      first = false;
      return action;
    },
    dailyInfo() { return info; },
  };
}

// ---------------------------------------------------------------- 9. 同波动参考匹配
function matchW(inst, sample, sigmaK1g, sigmaB0g, cost) {
  const sig = (w) => metrics(simulate(inst, { ...sample, strategy: Mref(cost, w / 10000), costMult: 0 })).sigma;
  if (sigmaK1g > sigmaB0g) return { wBp: 10000, w: 1, sigmaM: sigmaB0g, mismatch: true, reason: 'σ(K1) 毛 > σ(B0) 毛', path: [] };
  let lo = 0, hi = 10000;
  const cache = new Map([[0, 0]]);
  const S = (w) => { if (!cache.has(w)) cache.set(w, sig(w)); return cache.get(w); };
  const path = [];
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    const s = S(mid);
    path.push([mid, s]);
    if (s < sigmaK1g) lo = mid; else hi = mid;
  }
  const sLo = S(lo), sHi = S(hi);
  const dLo = Math.abs(sLo - sigmaK1g), dHi = Math.abs(sHi - sigmaK1g);
  const pick = dHi < dLo ? hi : lo;
  const sigmaM = S(pick);
  const mismatch = Math.abs(sigmaM - sigmaK1g) > 0.005;
  return { wBp: pick, w: pick / 10000, sigmaM, bracket: { lo, sLo, hi, sHi }, mismatch, reason: mismatch ? '|σ(M)−σ(K1)| > 0.5 个百分点' : null, path };
}

// ---------------------------------------------------------------- 10. 场景
function runScenario(inst, { start, end, states, cost, delay = 0, costMult = 1, cashRate = null, recordDaily = false, withDailyM = false }) {
  const sample = { start, end };
  const k1g = simulate(inst, { ...sample, strategy: K1(cost, states, delay), costMult: 0 });
  const b0g = simulate(inst, { ...sample, strategy: B0(cost), costMult: 0 });
  const sK1g = metrics(k1g).sigma, sB0g = metrics(b0g).sigma;
  const match = matchW(inst, sample, sK1g, sB0g, cost);
  const k1 = simulate(inst, { ...sample, strategy: K1(cost, states, delay), costMult, cashRate, recordDaily });
  const b0 = simulate(inst, { ...sample, strategy: B0(cost), costMult, cashRate });
  const m = simulate(inst, { ...sample, strategy: Mref(cost, match.w), costMult, cashRate });
  const mK1 = metrics(k1), mB0 = metrics(b0), mM = metrics(m);
  const out = {
    sample: { start: ds(start), end: ds(end), days: end - start },
    delay, costMult, cashRate: !!cashRate,
    gross: { sigmaK1: sK1g, sigmaB0: sB0g, sigmaM: match.sigmaM },
    reference: match,
    K1: { metrics: mK1, trades: k1.trades },
    B0: { metrics: mB0, trades: b0.trades },
    M: { w: match.w, metrics: mM, trades: m.trades },
    deltaCER_K1_M: mK1.cer - mM.cer,
    mddGain_vs_M: mM.mdd - mK1.mdd,
    mddGain_vs_B0: mB0.mdd - mK1.mdd,
    sigmaReduction_vs_B0: 1 - mK1.sigma / mB0.sigma,
    downCrossExecutions: k1.trades.filter((x) => x.side === 'sell').length,
    upCrossExecutions: k1.trades.filter((x) => x.side === 'buy').length,
    coverage: { maxMissingValuationStreak: Math.max(mK1.maxMissingValuationStreak, mB0.maxMissingValuationStreak, mM.maxMissingValuationStreak), insufficient: Math.max(mK1.maxMissingValuationStreak, mB0.maxMissingValuationStreak, mM.maxMissingValuationStreak) >= 4 },
    _daily: recordDaily ? k1.daily : null,
  };
  out.gates = gates(out);
  if (withDailyM) {
    // 报告项：每日调回参考，同样二分匹配
    const sig = (w) => metrics(simulate(inst, { ...sample, strategy: Mref(cost, w / 10000, 'daily'), costMult: 0 })).sigma;
    let lo = 0, hi = 10000; const c = new Map([[0, 0]]); const S = (w) => { if (!c.has(w)) c.set(w, sig(w)); return c.get(w); };
    if (sK1g <= sB0g) { while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if (S(mid) < sK1g) lo = mid; else hi = mid; } }
    else lo = hi = 10000;
    const pick = Math.abs(S(hi) - sK1g) < Math.abs(S(lo) - sK1g) ? hi : lo;
    const md = simulate(inst, { ...sample, strategy: Mref(cost, pick / 10000, 'daily'), costMult, cashRate });
    const mm = metrics(md);
    out.M_daily_report = { w: pick / 10000, sigmaGross: S(pick), metrics: mm, deltaCER_K1_Mdaily: mK1.cer - mm.cer, mddGain_vs_Mdaily: mm.mdd - mK1.mdd };
  }
  return out;
}

function gates(s) {
  const refMatch = !s.reference.mismatch;
  const g = {
    sameVol_deltaCER_ge_0: s.deltaCER_K1_M >= 0,
    sameVol_mdd_shallower_5pp: s.mddGain_vs_M >= 0.05,
    referenceMatched: refMatch,
    b0_mdd_shallower_10pp: s.mddGain_vs_B0 >= 0.10,
    b0_sigma_lower_15pct: s.sigmaReduction_vs_B0 >= 0.15,
  };
  g.sameVolMain = g.sameVol_deltaCER_ge_0 && g.sameVol_mdd_shallower_5pp && refMatch;
  g.b0Risk = g.b0_mdd_shallower_10pp && g.b0_sigma_lower_15pct;
  g.all = g.sameVolMain && g.b0Risk;
  return g;
}

// K2 场景（报告项）
function runK2(inst, { start, end, states, cm, cost, mvrvDayMap }) {
  const strat = K2(cost, states, cm);
  const sim = simulate(inst, { start, end, strategy: strat, recordDaily: true });
  const met = metrics(sim);
  // 逐段：趋势关闭期间底部持仓的建仓、阶梯、平均成本、退出
  const episodes = [];
  let ep = null;
  const tradeByDate = new Map(sim.trades.map((x) => [x.date, x]));
  for (const row of sim.daily) {
    if (row.end) break;
    const tr = tradeByDate.get(row.d);
    if (row.trend === 0 && row.ladder > 0 && !ep) {
      ep = { signalDate: row.d, firstLadderDate: row.d, mvrvAtStart: row.mvrv, mvrvDate: row.mvrvDate, realizedPriceAtStart: row.realizedPrice, steps: [], maxLadder: 0, buyUsd: 0, buyQty: 0, entryFromFullSell: null };
    }
    if (ep) {
      if (row.ladder > ep.maxLadder) ep.maxLadder = row.ladder;
      if (tr && (row.trend === 0)) {
        ep.steps.push({ date: tr.date, side: tr.side, ladder: row.ladder, targetW: tr.targetW, open: tr.open, execPrice: tr.execPrice, qty: tr.qty, usd: tr.usd, mvrv: row.mvrv, mvrvDate: row.mvrvDate, realizedPrice: row.realizedPrice });
        if (tr.side === 'buy') { ep.buyUsd += tr.usd; ep.buyQty += tr.qty; }
        if (tr.side === 'sell' && tr.tag === 'K2-trendclose' && ep.entryFromFullSell === null) ep.entryFromFullSell = true;
      }
      let endReason = null;
      if (row.trend === 1) endReason = 'trend_takeover';
      else if (row.exit125 === 1) endReason = 'mvrv_ge_1.25_exit';
      else if (row.trend === 0 && row.ladder === 0) endReason = 'reset';
      if (endReason) {
        ep.endDate = row.d; ep.endReason = endReason;
        ep.avgBuyCost = ep.buyQty > 0 ? ep.buyUsd / ep.buyQty : null;
        ep.endExecution = tr ? { date: tr.date, side: tr.side, open: tr.open, execPrice: tr.execPrice } : null;
        episodes.push(ep); ep = null;
      }
    }
  }
  if (ep) { ep.endDate = null; ep.endReason = 'open_at_sample_end'; ep.avgBuyCost = ep.buyQty > 0 ? ep.buyUsd / ep.buyQty : null; episodes.push(ep); }
  // 90 日聚簇（相邻段间隔 ≥ 90 个完整自然日另起一簇）
  let cl = 0, lastEnd = null;
  for (const e of episodes) {
    const st = dn(e.firstLadderDate);
    if (lastEnd !== null && st - lastEnd - 1 >= 90) cl++;
    e.cluster = cl + 1;
    lastEnd = e.endDate ? dn(e.endDate) : st;
  }
  const missShare = strat.readings.needed ? strat.readings.missing / strat.readings.needed : 0;
  return {
    sample: { start: ds(start), end: ds(end) },
    metrics: met,
    trades: sim.trades,
    readings: { ...strat.readings, missingShare: missShare, coverageIncomplete: missShare > 0.01 },
    episodes,
    _daily: sim.daily,
  };
}

// ---------------------------------------------------------------- 11. 输出整形
function compactDaily(daily, keys) {
  const cols = {};
  for (const k of keys) cols[k] = daily.map((r) => (r[k] === undefined ? null : r[k]));
  return cols;
}
function round(x, n = 10) {
  if (typeof x !== 'number' || !Number.isFinite(x)) return x;
  return Number(x.toPrecision(n + 2)) === x ? x : +x.toPrecision(12);
}
function deepRound(o) {
  if (Array.isArray(o)) return o.map(deepRound);
  if (o && typeof o === 'object') { const r = {}; for (const [k, v] of Object.entries(o)) r[k] = deepRound(v); return r; }
  return typeof o === 'number' ? round(o) : o;
}

// ---------------------------------------------------------------- main
export { DAY, dn, ds, ym, RAW, REPO, verifySources, loadBitstampBTC, loadBinanceSpot, loadCoinMetrics, loadFred, makeCashRate, ma200States, bitstampCost, binanceCost, simulate, metrics, mean, varS, B0, K1, Mref, K2 };
const IS_MAIN = !!process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
const t0 = Date.now();
const sha = verifySources();
if (sha.bad) { console.error('SHA-256 校验失败', sha.failures); process.exit(2); }

const bs = loadBitstampBTC();
const cm = loadCoinMetrics();
const ethBn = loadBinanceSpot('ethusdt');
const fred = loadFred();
const cashRate = makeCashRate(fred);

const btcBars = bs.bars;
const btcDays = [...btcBars.keys()].sort((a, b) => a - b);
const BTC = { bars: btcBars, fallback: cm.btc };
const ETH = { bars: ethBn.bars, fallback: cm.eth };
const ethDays = [...ethBn.bars.keys()].sort((a, b) => a - b);

const statesMain = ma200States(btcBars, { firstDay: btcDays[0], lastDay: btcDays.at(-1) });
const statesPosVol = ma200States(btcBars, { firstDay: btcDays[0], lastDay: btcDays.at(-1), fromDay: dn('2012-01-01'), include: (b) => b.vol > 0 });
const statesEth = ma200States(ethBn.bars, { firstDay: ethDays[0], lastDay: ethDays.at(-1) });
const firstState = (st) => ds(Math.min(...st.keys()));

// 切换计数（信号层面，按数据日）
function switchCounts(st) {
  const byYear = {};
  let prev = null;
  for (const [d, s] of [...st].sort((a, b) => a[0] - b[0])) {
    if (s.carried) continue;
    if (prev !== null && prev !== s.state) { const y = ds(d).slice(0, 4); byYear[y] ??= { down: 0, up: 0 }; byYear[y][s.state ? 'up' : 'down']++; }
    prev = s.state;
  }
  return byYear;
}

const OLD = { start: dn('2012-03-05'), end: dn('2018-01-01') };
const REP = { start: dn('2018-01-01'), end: dn('2026-11-26') };
const ETHS = { start: dn('2018-03-05'), end: dn('2026-11-26') };

const old = {};
old.main = runScenario(BTC, { ...OLD, states: statesMain, cost: bitstampCost, recordDaily: true, withDailyM: true });
old.late = runScenario(BTC, { ...OLD, states: statesMain, cost: bitstampCost, delay: 1, recordDaily: true });
old.cost2 = runScenario(BTC, { ...OLD, states: statesMain, cost: bitstampCost, costMult: 2, recordDaily: true });
const coverageOK = !old.main.coverage.insufficient && !old.late.coverage.insufficient && !old.cost2.coverage.insufficient;
const allPass = old.main.gates.all && old.late.gates.all && old.cost2.gates.all;
old.grade = !coverageOK ? '证据不足' : allPass ? '旧史方向一致，未经干净数据确认' : '旧史不通过';
old.gradeDetail = {
  coverageOK,
  main: old.main.gates, late: old.late.gates, cost2: old.cost2.gates,
  failed: Object.entries({ main: old.main.gates, late: old.late.gates, cost2: old.cost2.gates }).flatMap(([sc, g]) => Object.entries(g).filter(([k, v]) => !v && !['sameVolMain', 'b0Risk', 'all'].includes(k)).map(([k]) => `${sc}.${k}`)),
};
old.segments = [
  { label: '2012-03-05→2015-01-01', start: dn('2012-03-05'), end: dn('2015-01-01') },
  { label: '2015-01-01→2018-01-01', start: dn('2015-01-01'), end: dn('2018-01-01') },
].map((sg) => {
  const s = runScenario(BTC, { start: sg.start, end: sg.end, states: statesMain, cost: bitstampCost });
  return { label: sg.label, w: s.M.w, referenceMismatch: s.reference.mismatch, K1: s.K1.metrics, M: s.M.metrics, B0: s.B0.metrics, deltaCER_K1_M: s.deltaCER_K1_M, mddK1: s.K1.metrics.mdd, mddM: s.M.metrics.mdd, mddGain_vs_M: s.mddGain_vs_M, K1trades: s.K1.trades.length };
});
const SENS = { start: dn(firstState(statesPosVol)) + 1, end: OLD.end };
const sensMain = runScenario(BTC, { ...SENS, states: statesMain, cost: bitstampCost });
const sensPos = runScenario(BTC, { ...SENS, states: statesPosVol, cost: bitstampCost });
const pick = (s) => ({ w: s.M.w, referenceMismatch: s.reference.mismatch, K1: s.K1.metrics, M: s.M.metrics, B0: s.B0.metrics, deltaCER_K1_M: s.deltaCER_K1_M, mddGain_vs_M: s.mddGain_vs_M, mddGain_vs_B0: s.mddGain_vs_B0, sigmaReduction_vs_B0: s.sigmaReduction_vs_B0, gates: s.gates, K1trades: s.K1.trades.map((x) => [x.date, x.side]) });
old.sensitivity_positiveVolumeMA = {
  firstStatePositiveVol: firstState(statesPosVol),
  window: { start: ds(SENS.start), end: ds(SENS.end) },
  main: pick(sensMain),
  positiveVolume: pick(sensPos),
  switchCountsPositiveVol: switchCounts(statesPosVol),
};
if (cashRate) {
  // 现金利率敏感性：沿用主口径匹配的 w（毛波动匹配不含利息）
  const sc = runScenario(BTC, { ...OLD, states: statesMain, cost: bitstampCost, cashRate });
  old.cashRateSensitivity = { note: 'w 在每个场景内按零利率毛收益重新匹配（与主口径一致）；利息只计入净收益', ...pick(sc) };
}
old.K2 = runK2(BTC, { ...OLD, states: statesMain, cm: cm.btc, cost: bitstampCost });

// 复现段（已见探索段，报告项）
const rep = {};
rep.btc_main = runScenario(BTC, { ...REP, states: statesMain, cost: bitstampCost, recordDaily: true, withDailyM: true });
rep.btc_late = runScenario(BTC, { ...REP, states: statesMain, cost: bitstampCost, delay: 1 });
rep.btc_cost2 = runScenario(BTC, { ...REP, states: statesMain, cost: bitstampCost, costMult: 2 });
if (cashRate) rep.btc_cashRate = pick(runScenario(BTC, { ...REP, states: statesMain, cost: bitstampCost, cashRate }));
rep.eth_main = runScenario(ETH, { ...ETHS, states: statesEth, cost: binanceCost, recordDaily: true });
rep.K2 = runK2(BTC, { ...REP, states: statesMain, cm: cm.btc, cost: bitstampCost });

// ---------------------------------------------------------------- 写结果
const dailyKeysK1 = ['d', 'price', 'src', 'tradable', 'sigDate', 'sig', 'pending', 'traded', 'q', 'cash', 'wPost', 'equityPre'];
const dailyKeysK2 = ['d', 'price', 'tradable', 'trend', 'mvrvDate', 'mvrv', 'realizedPrice', 'count', 'ladder', 'target', 'justClosed', 'exit125', 'pending', 'traded', 'q', 'cash', 'wPost', 'equityPre'];
function strip(s) { const { _daily, ...rest } = s; return rest; }
const daily = {
  old_main_K1: compactDaily(old.main._daily, dailyKeysK1),
  old_late_K1: compactDaily(old.late._daily, dailyKeysK1),
  old_cost2_K1: compactDaily(old.cost2._daily, dailyKeysK1),
  old_K2: compactDaily(old.K2._daily, dailyKeysK2),
  rep_btc_main_K1: compactDaily(rep.btc_main._daily, dailyKeysK1),
  rep_eth_main_K1: compactDaily(rep.eth_main._daily, dailyKeysK1),
  rep_K2: compactDaily(rep.K2._daily, dailyKeysK2),
};
// 附加 MA200 列（按数据日）
for (const [key, st] of [['old_main_K1', statesMain], ['rep_btc_main_K1', statesMain], ['rep_eth_main_K1', statesEth]]) {
  daily[key].ma200_ofSigDate = daily[key].sigDate.map((d) => (d ? st.get(dn(d)).ma : null));
  daily[key].close_ofSigDate = daily[key].sigDate.map((d) => (d ? st.get(dn(d)).close : null));
}

function splitResults(result) {
  const summary = {}, detail = {};
  for (const [key, value] of Object.entries(result)) {
    if (key === 'daily' || (Array.isArray(value) && /trades$/i.test(key))) {
      detail[key] = value;
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      const [nestedSummary, nestedDetail] = splitResults(value);
      summary[key] = nestedSummary;
      if (Object.keys(nestedDetail).length) detail[key] = nestedDetail;
    } else {
      summary[key] = value;
    }
  }
  return [summary, detail];
}

const results = {
  meta: {
    study: 'BTC 单币择时研究（L-039）· 第二实现（Node）',
    prereg: 'docs/research/crypto-trend-2026-11-27/PREREG.md @ 844bd10f',
    clarifications: 'docs/research/crypto-trend-2026-11-27/CLARIFY-1.md',
    node: process.version,
    units: '收益、σ、MDD、CER、CAGR、CVaR 等均为小数（0.01 = 1 个百分点）；σ 年化 = 日样本标准差 × √365；CER = 365×(均值 − 1.5×样本方差)',
    valuation: '每日开盘（成交前）估值；r[i] = P[i+1]/P[i] − 1；首笔成本计入首日收益；终点开盘估值、终点不成交',
  },
  dataChecks: {
    sha256: sha,
    bitstampBTC: { ...bs.stats, ...qualityCheck(btcBars) },
    binanceETHUSDT: { ...ethBn.stats, ...qualityCheck(ethBn.bars) },
    coinMetrics: { btcDays: cm.btc.size, ethDays: cm.eth.size },
    fred: fred ? { rows: fred.rows, valid: fred.obs.length, missing: fred.missing, first: ds(fred.obs[0][0]), last: ds(fred.obs.at(-1)[0]) } : null,
    firstMA200State: { bitstampMain: firstState(statesMain), bitstampPositiveVolFrom2012: firstState(statesPosVol), binanceETH: firstState(statesEth) },
    switchCountsBitstampMain: switchCounts(statesMain),
    switchCountsBinanceETH: switchCounts(statesEth),
    latestState: { date: ds(btcDays.at(-1)), trendOn: statesMain.get(btcDays.at(-1)).state, ma200: statesMain.get(btcDays.at(-1)).ma, close: statesMain.get(btcDays.at(-1)).close, mvrv: cm.btc.get(btcDays.at(-1))?.mvrv ?? null },
  },
  oldHistory: {
    grade: old.grade,
    gradeDetail: old.gradeDetail,
    main: strip(old.main),
    late: strip(old.late),
    cost2: strip(old.cost2),
    segments: old.segments,
    sensitivity_positiveVolumeMA: old.sensitivity_positiveVolumeMA,
    cashRateSensitivity: old.cashRateSensitivity ?? 'skipped: fred-DGS3MO.csv 不存在',
    K2: strip(old.K2),
  },
  replication: {
    note: '已见探索段，只作报告，无判定权',
    btc_main: strip(rep.btc_main),
    btc_late: strip(rep.btc_late),
    btc_cost2: strip(rep.btc_cost2),
    btc_cashRate: rep.btc_cashRate ?? null,
    eth_main: strip(rep.eth_main),
    K2: strip(rep.K2),
  },
  notComputedInPhase1: [
    '杠杆报告项（BTC 2×、3×、趋势 2×＋底部 1× 半权益代理）——第一阶段任务清单未列，留待第二阶段或另派',
    '前推统计与前推覆盖（2026-12-01 起无数据，JSONL 尚未生成）',
    '自助法下界（第二阶段，读主实现导出的固定抽样索引）',
    '五币说法（无法精确复现，DATA.md 已说明）',
  ],
  daily,
};
const [summary, detail] = splitResults(results);
writeFileSync(OUT, JSON.stringify(deepRound(summary)) + '\n');
writeFileSync(OUT_DETAIL, JSON.stringify(deepRound(detail)) + '\n');

// 控制台摘要
const f = (x, n = 2) => (x * 100).toFixed(n);
const line = (name, s) => console.log(`${name.padEnd(10)} w=${s.M.w.toFixed(4)} σK1=${f(s.K1.metrics.sigma)} σM=${f(s.M.metrics.sigma)} σB0=${f(s.B0.metrics.sigma)} | MDD K1=${f(s.K1.metrics.mdd)} M=${f(s.M.metrics.mdd)} B0=${f(s.B0.metrics.mdd)} | CER K1=${f(s.K1.metrics.cer)} M=${f(s.M.metrics.cer)} ΔCER=${f(s.deltaCER_K1_M)} | trades K1=${s.K1.trades.length} mismatch=${s.reference.mismatch} gates=${s.gates.all}`);
console.log(`SHA-256: ${sha.verified}/${sha.listed} 通过；未登记文件：${sha.unlisted.length}`);
line('old.main', old.main); line('old.late', old.late); line('old.cost2', old.cost2);
console.log('旧史分级：', old.grade, old.gradeDetail.failed);
for (const sg of old.segments) console.log(`segment ${sg.label}: w=${sg.w} ΔCER=${f(sg.deltaCER_K1_M)} MDD K1=${f(sg.mddK1)} M=${f(sg.mddM)}`);
line('rep.btc', rep.btc_main); line('rep.eth', rep.eth_main);
console.log(`结果写入 ${OUT} 和 ${OUT_DETAIL}（${Date.now() - t0} ms）`);
}
