// 「择时＋只认金叉」及对照策略的纯函数（研究与影子运行共用）。历史统计，不构成投资建议。
// bars: [{date, open, high, low, close}]，按日期升序。fill: 'open' = 信号次日开盘成交；'close' = 信号次日收盘成交（只有收盘价的指数）。
export const COST = 0.001

export function macdCross(bars) {
  const gold = [], dead = []; let f = bars[0].close, s = f, dea = 0, prev
  for (let i = 0; i < bars.length; i++) {
    if (i) { f += 2 / 13 * (bars[i].close - f); s += 2 / 27 * (bars[i].close - s) }
    const dif = f - s; dea += 0.2 * (dif - dea)
    gold.push(!!prev && prev[0] <= prev[1] && dif > dea); dead.push(!!prev && prev[0] >= prev[1] && dif < dea); prev = [dif, dea]
  }
  return { gold, dead }
}

/** a/b 收盘比值高于其 20 日均线为牛；返回 Map(date → boolean) */
export function ratioTiming(aBars, bBars) {
  const a = new Map(aBars.map((x) => [x.date, x.close])); const out = new Map(); const q = []
  for (const x of bBars) { const av = a.get(x.date); if (!av) continue; q.push(av / x.close); if (q.length > 20) q.shift(); if (q.length === 20) out.set(x.date, q.at(-1) > q.reduce((s, v) => s + v, 0) / 20) }
  return out
}

/** 择时＋只认金叉：牛市金叉 → 次日买；熊市不开仓；死叉当日收盘卖（买入当日触发则次日卖）。返回 {eq, pos, lastSignal}。 */
export function timingGold(bars, bull, { warmup = 120, fill = 'open' } = {}) {
  const { gold, dead } = macdCross(bars); const eq = [], pos = []
  let cash = 1, units = 0, pend, buyIdx = -1, lastBull, lastSignal
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i]; const t = bull.get(b.date); if (t !== undefined) lastBull = t; const isBull = lastBull !== false
    const px = fill === 'open' ? b.open : b.close
    if (pend === 'buy') { units = cash * (1 - COST) / px; cash = 0; buyIdx = i } else if (pend === 'sell') { cash = units * px * (1 - COST); units = 0 }
    pend = undefined
    if (i >= warmup) {
      if (!units && gold[i] && isBull) { pend = 'buy'; lastSignal = { date: b.date, side: 'buy' } }
      else if (units && dead[i]) { lastSignal = { date: b.date, side: 'sell' }; if (buyIdx === i) pend = 'sell'; else { cash = units * b.close * (1 - COST); units = 0 } }
    }
    eq.push(units ? units * b.close : cash); pos.push(units ? 1 : 0)
  }
  return { eq, pos, pending: pend, lastSignal, bull: lastBull !== false }
}

/** MACD 金叉次日买、死叉次日卖 */
export function macdOnly(bars, { warmup = 60, fill = 'open' } = {}) {
  const { gold, dead } = macdCross(bars); const eq = []; let cash = 1, units = 0, pend
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i]; const px = fill === 'open' ? b.open : b.close
    if (pend === 'buy') { units = cash * (1 - COST) / px; cash = 0 } else if (pend === 'sell') { cash = units * px * (1 - COST); units = 0 }
    pend = undefined
    if (i >= warmup) { if (!units && gold[i]) pend = 'buy'; else if (units && dead[i]) pend = 'sell' }
    eq.push(units ? units * b.close : cash)
  }
  return { eq }
}

/** 收盘在 20 日线上次日持有、跌破次日卖 */
export function ma20(bars, { warmup = 60, fill = 'open' } = {}) {
  const eq = []; let cash = 1, units = 0, pend, sum = 0
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i]; const px = fill === 'open' ? b.open : b.close
    if (pend === 'buy') { units = cash * (1 - COST) / px; cash = 0 } else if (pend === 'sell') { cash = units * px * (1 - COST); units = 0 }
    pend = undefined; sum += b.close; if (i >= 20) sum -= bars[i - 20].close
    if (i >= warmup) { const m = sum / 20; if (!units && b.close > m) pend = 'buy'; else if (units && b.close < m) pend = 'sell' }
    eq.push(units ? units * b.close : cash)
  }
  return { eq }
}

/** 区间 [from, to] 的年化与最大回撤（按收盘权益） */
export function windowStats(bars, eq, from, to) {
  const i0 = bars.findIndex((b) => b.date >= from); if (i0 < 0) return null
  let i1 = bars.length - 1; if (to) { const k = bars.findIndex((b) => b.date > to); if (k > 0) i1 = k - 1 }
  if (i1 <= i0) return null
  const years = (Date.parse(bars[i1].date) - Date.parse(bars[i0].date)) / (365.25 * 864e5)
  const ret = eq[i1] / eq[i0]; let peak = -Infinity, dd = 0
  for (let i = i0; i <= i1; i++) { peak = Math.max(peak, eq[i]); dd = Math.min(dd, eq[i] / peak - 1) }
  return { years, total: (ret - 1) * 100, annual: years >= 1 ? (ret ** (1 / years) - 1) * 100 : null, dd: dd * 100 }
}

/** 择时+KD10（朋友方案）：牛市时空仓出现 MACD 金叉，或收盘由 10 日线下/平站上 10 日线且 KDJ(9,3,3) K−D ≥ threshold → 次日买；
 *  持仓时死叉，或择时为熊且收盘跌破 10 日线 → 当日收盘卖（买入当日触发则次日卖）。只有收盘价时 KD 用收盘近似。 */
export function kd10(bars, bull, { warmup = 120, fill = 'open', threshold = 5.3 } = {}) {
  const { gold, dead } = macdCross(bars); const n = bars.length
  const above = [], below = [], kd = []; let sum = 0, k = 50, d = 50
  for (let i = 0; i < n; i++) {
    sum += bars[i].close; if (i >= 10) sum -= bars[i - 10].close
    const ma = i >= 9 ? sum / 10 : NaN; const eps = Math.abs(bars[i].close) * 1e-9
    above.push(i >= 9 && bars[i].close > ma + eps); below.push(i >= 9 && bars[i].close < ma - eps)
    let hi = -Infinity, lo = Infinity
    for (let j = Math.max(0, i - 8); j <= i; j++) { hi = Math.max(hi, bars[j].high); lo = Math.min(lo, bars[j].low) }
    const rsv = hi > lo ? 100 * (bars[i].close - lo) / (hi - lo) : 50
    k = (2 * k + rsv) / 3; d = (2 * d + k) / 3; kd.push(k - d)
  }
  const eq = []; let cash = 1, units = 0, pend, buyIdx = -1, lastBull
  for (let i = 0; i < n; i++) {
    const b = bars[i]; const t = bull.get(b.date); if (t !== undefined) lastBull = t; const isBull = lastBull !== false
    const px = fill === 'open' ? b.open : b.close
    if (pend === 'buy') { units = cash * (1 - COST) / px; cash = 0; buyIdx = i } else if (pend === 'sell') { cash = units * px * (1 - COST); units = 0 }
    pend = undefined
    if (i >= warmup) {
      if (units) {
        if (dead[i] || (!isBull && below[i])) { if (buyIdx === i) pend = 'sell'; else { cash = units * b.close * (1 - COST); units = 0 } }
      } else if (isBull && (gold[i] || (above[i] && !above[i - 1] && kd[i] >= threshold))) pend = 'buy'
    }
    eq.push(units ? units * b.close : cash)
  }
  return { eq }
}
