#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = p => fileURLToPath(new URL(p, import.meta.url))
const ROOT = here('../../../../')
const RAW = `${ROOT}data-raw/spx-qqq-tilt/raw/`
const OUT = here('./results.json')
const COST = 0.0005
const FEE = 0.001
const FINANCE = 0.015
const GAMMA = 5
const DAY = 86_400_000
const YEAR_DAYS = 365.2425
const round = (x, n = 12) => Number.isFinite(x) ? Number(x.toFixed(n)) : x === Infinity ? 'Infinity' : x === -Infinity ? '-Infinity' : null
const mean = xs => xs.reduce((s, x) => s + x, 0) / xs.length
const std = xs => {
  if (xs.length < 2) return 0
  const m = mean(xs)
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1))
}
const isoMs = d => Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`)
const daysBetween = (a, b) => (isoMs(b) - isoMs(a)) / DAY
const ym = d => d.slice(0, 6)
const monthOf = d => `${d.slice(0, 4)}-${d.slice(4, 6)}`
const mulberry32 = seed => () => {
  let a = seed += 0x6d2b79f5
  let t = a
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const sha = path => createHash('sha256').update(readFileSync(path)).digest('hex')
const unzip = file => execFileSync('unzip', ['-p', file], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
const parseDaily = (text, growth = false) => text.split(/\r?\n/).filter(line => /^\d{8},/.test(line)).map(line => {
  const [date, a, b, c, d] = line.trim().split(',')
  return growth ? { date, g: Number(d) / 100 } : { date, mkt: Number(a) / 100, rf: Number(d) / 100 }
})
const factorsDaily = parseDaily(unzip(`${RAW}F-F_Research_Data_Factors_daily_CSV.zip`))
const growthDaily = new Map()
for (const row of parseDaily(unzip(`${RAW}6_Portfolios_2x3_daily_CSV.zip`), true)) {
  if (!growthDaily.has(row.date)) growthDaily.set(row.date, row.g)
}
const kf = factorsDaily.map(r => ({ ...r, g: growthDaily.get(r.date), gross: r.mkt + r.rf, price: r.mkt }))
if (kf.some(r => !Number.isFinite(r.g))) throw new Error('BIG LoBM 缺失')

const readYahoo = id => readFileSync(`${RAW}yahoo_${id}_daily.csv`, 'utf8').trim().split(/\r?\n/).slice(1).map(line => {
  const [date, close, adjclose] = line.split(',')
  return { date: date.replaceAll('-', ''), close: Number(close), adj: Number(adjclose) }
})
const spyAll = readYahoo('SPY')
const qqqAll = readYahoo('QQQ')
const gspcAll = readYahoo('GSPC')
const ndxAll = readYahoo('NDX')
const rfSorted = kf.map(r => [r.date, r.rf])
const rfAt = date => {
  let lo = 0
  let hi = rfSorted.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (rfSorted[mid][0] <= date) lo = mid + 1
    else hi = mid
  }
  return lo ? rfSorted[lo - 1][1] : 0
}
const withReturns = (rows, key, growthKey = null) => rows.map((r, i) => ({
  date: r.date,
  gross: i ? r.adj / rows[i - 1].adj - 1 : 0,
  mkt: i ? r.adj / rows[i - 1].adj - 1 : 0,
  g: growthKey && i ? r[growthKey] / rows[i - 1][growthKey] - 1 : 0,
  rf: rfAt(r.date),
  price: i ? r.close / rows[i - 1].close - 1 : 0,
}))
const spy = withReturns(spyAll)
const qqqReturns = new Map(withReturns(qqqAll).map(r => [r.date, r.gross]))
const etf = spy.filter(r => r.date >= '19990311').map(r => ({ ...r, g: qqqReturns.get(r.date) }))
if (etf.some(r => !Number.isFinite(r.g))) throw new Error('QQQ 缺失')

const shiller = new Map(readFileSync(`${RAW}shiller.csv`, 'utf8').trim().split(/\r?\n/).slice(1).map(line => {
  const [month, p, d] = line.split(',')
  return [month, { p: Number(p), d: Number(d) }]
}))
const gspcByDate = new Map(gspcAll.map(r => [r.date, r]))
const ndx = ndxAll.filter(r => r.date <= '19990309').map((r, i, all) => {
  const prev = all[i - 1]
  const g = prev ? r.adj / prev.adj - 1 : 0
  const s = prev ? gspcByDate.get(r.date) : null
  const sp = prev && s ? s.adj / gspcByDate.get(prev.date).adj - 1 : 0
  const sh = shiller.get(monthOf(r.date))
  const monthDays = all.filter(x => monthOf(x.date) === monthOf(r.date)).length
  return {
    date: r.date,
    gross: sp + (sh ? sh.d / sh.p / 12 / monthDays : 0),
    mkt: sp + (sh ? sh.d / sh.p / 12 / monthDays : 0),
    g,
    rf: rfAt(r.date),
    price: sp,
  }
})

const windowInfo = rows => {
  const years = daysBetween(rows[0].date, rows.at(-1).date) / YEAR_DAYS
  return { years, N: rows.length, A: rows.length / years }
}
const slice = (rows, start, end) => rows.filter(r => r.date >= start && r.date <= end)
const netM = (r, A, fee = FEE) => r.gross - fee / A
const netG = (r, A, fee = FEE) => r.g - fee / A

function simulateM(rows, A, fee = FEE) {
  let nav = 1
  return rows.map(r => {
    nav *= 1 + netM(r, A, fee)
    return { date: r.date, nav }
  })
}

function simulateMStar(rows, k, A, spread = FINANCE, fee = FEE) {
  let nav = 1
  return rows.map(r => {
    const financing = r.rf + spread / A
    const ret = k * netM(r, A, fee) + (1 - k) * (k > 1 ? financing : r.rf)
    nav *= 1 + ret
    return { date: r.date, nav }
  })
}

function simulateK1(rows, A, {
  tilt = 0.3, band = 0.05, bandCenter = tilt, mode = 'band', cost = COST, fee = FEE,
} = {}) {
  let m = 1 - tilt
  let g = tilt
  let cash = 0
  let debt = 0
  let pending = false
  let liquidated = false
  let turnover = 0
  let rebalances = 0
  const out = []
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i]
    if (!liquidated) {
      m *= 1 + netM(r, A, fee)
      g *= 1 + netG(r, A, fee)
      cash *= 1 + (cash >= 0 ? r.rf : r.rf + FINANCE / A)
      debt *= 1 + r.rf + FINANCE / A
    }
    const before = m + g + cash - debt
    let nav = before
    let traded = false
    let tradeTurnover = 0
    if (!liquidated && pending) {
      const targetM = (1 - tilt) * before
      const targetG = tilt * before
      const trade = Math.abs(targetM - m) + Math.abs(targetG - g)
      const charge = cost * trade
      nav = before - charge
      m = targetM
      g = targetG
      cash = nav - m - g + debt
      turnover += trade / before
      tradeTurnover = trade / before
      rebalances += 1
      traded = true
    }
    const exposure = nav > 0 ? (m + g) / nav : Infinity
    if (!liquidated && (nav <= 0 || exposure >= 2)) {
      nav -= cost * (m + g)
      cash = nav
      m = 0
      g = 0
      debt = 0
      liquidated = true
      pending = false
    }
    const share = m + g ? g / (m + g) : 0
    out.push({ date: r.date, nav, gShare: share, traded, tradeTurnover, liquidated })
    pending = !liquidated && (mode === 'band' ? share < bandCenter - band || share > bandCenter + band
      : mode === 'annual' ? i + 1 < rows.length && rows[i + 1].date.slice(0, 4) !== r.date.slice(0, 4)
        : false)
  }
  return { rows: out, turnover, rebalances, liquidated }
}

function sliceK1(k1, start, end) {
  const firstIndex = k1.rows.findIndex(r => r.date >= start)
  const initialNav = firstIndex > 0 ? k1.rows[firstIndex - 1].nav : 1
  const rows = slice(k1.rows, start, end).map(r => ({ ...r, initialNav }))
  return {
    ...k1,
    rows,
    turnover: rows.reduce((s, r) => s + (r.tradeTurnover ?? 0), 0),
    rebalances: rows.filter(r => r.traded).length,
  }
}

function signalFrame(rows, priceSignal = false) {
  let wealth = 1
  let high = -Infinity
  const history = []
  return rows.map(r => {
    wealth *= 1 + (priceSignal ? r.price : r.gross)
    high = Math.max(high, wealth)
    history.push(wealth)
    const sma = history.length >= 200 ? mean(history.slice(-200)) : null
    return { I: wealth, dd: wealth / high - 1, sma, above: sma == null ? null : wealth > sma, below: sma == null ? null : wealth < sma }
  })
}

function simulateLeverage(rows, A, {
  cost = COST, fee = FEE, spread = FINANCE, entry = 0.2, smaConfirm = true,
  drift = true, fixedSchedule = null, stockReturns = null, priceSignal = false,
  resetAt = null, initialLeveraged = null,
} = {}) {
  const signals = signalFrame(rows, priceSignal)
  const startIndex = resetAt == null ? 0 : rows.findIndex(r => r.date >= resetAt)
  if (startIndex < 0 || startIndex >= rows.length) throw new Error(`找不到独立窗口起点 ${resetAt}`)
  if (resetAt != null && initialLeveraged == null) throw new Error('独立窗口必须给出前收盘信号状态')
  let stock = fixedSchedule?.[0] || initialLeveraged === true ? 1.3 : 1
  let debt = fixedSchedule?.[0] || initialLeveraged === true ? 0.3 : 0
  let cash = 0
  let leveraged = fixedSchedule?.[0] ? true : initialLeveraged === true
  let pending = null
  let liquidated = false
  let turnover = 0
  let rebalances = 0
  const out = []
  const execute = (target, before, action) => {
    const next = target * before
    const trade = Math.abs(next - stock)
    const charge = cost * trade
    const nav = before - charge
    stock = next
    debt = Math.max(0, stock - nav)
    cash = nav - stock + debt
    leveraged = target > 1
    turnover += trade / before
    rebalances += 1
    return { nav, action, tradeTurnover: trade / before }
  }
  for (let i = startIndex; i < rows.length; i += 1) {
    const r = rows[i]
    if (!liquidated) {
      stock *= 1 + (stockReturns ? stockReturns[i] : netM(r, A, fee))
      debt *= 1 + r.rf + spread / A
      cash *= 1 + (cash >= 0 ? r.rf : r.rf + spread / A)
    }
    let nav = stock + cash - debt
    let action = null
    let tradeTurnover = 0
    let exposure = nav > 0 ? stock / nav : Infinity
    if (!liquidated && fixedSchedule) {
      const target = fixedSchedule[i] ? 1.3 : 1
      if (target !== (leveraged ? 1.3 : 1) || (leveraged && drift && (exposure < 1.25 || exposure > 1.35))) {
        const result = execute(target, nav, target === 1.3 ? 'rebalance' : 'exit')
        nav = result.nav
        action = result.action
        tradeTurnover = result.tradeTurnover
      }
    } else if (!liquidated && pending != null) {
      const result = execute(pending, nav, pending === 1.3 ? (leveraged ? 'rebalance' : 'enter') : 'exit')
      nav = result.nav
      action = result.action
      tradeTurnover = result.tradeTurnover
      pending = null
    }
    exposure = nav > 0 ? stock / nav : Infinity
    if (!liquidated && (nav <= 0 || exposure >= 2)) {
      const charge = cost * stock
      nav -= charge
      tradeTurnover = nav !== 0 ? stock / Math.abs(nav) : 0
      cash = nav
      stock = 0
      debt = 0
      leveraged = false
      liquidated = true
      action = 'liquidation'
      pending = null
    }
    exposure = nav > 0 ? stock / nav : Infinity
    out.push({ date: r.date, nav, exposure, leveraged, liquidated, action, tradeTurnover, dd: signals[i].dd, sma: signals[i].sma, I: signals[i].I })
    if (liquidated || fixedSchedule) continue
    const s = signals[i]
    if (!leveraged) {
      const confirm = !smaConfirm || s.above === true
      if (s.dd <= -entry && confirm) pending = 1.3
    } else {
      if ((smaConfirm && s.below === true) || s.dd > -0.05) pending = 1
      else if (drift && (exposure < 1.25 || exposure > 1.35)) pending = 1.3
    }
  }
  return { rows: out, turnover, rebalances, liquidated, leverage: out.map(r => r.leveraged) }
}

function independentLeverage(rows, A, start, fee = FEE) {
  const full = simulateLeverage(rows, A, { fee })
  const index = rows.findIndex(r => r.date >= start)
  if (index < 0) throw new Error('独立窗口缺少前收盘状态')
  const initialLeveraged = index === 0 ? false : full.rows[index - 1].leveraged
  return simulateLeverage(rows, A, { fee, resetAt: start, initialLeveraged })
}

function simulateE6(rows, A, { cost = COST, fee = FEE, spread = FINANCE, entry = 0.2 } = {}) {
  const signals = signalFrame(rows)
  let m = 0.7
  let g = 0.3
  let cash = 0
  let debt = 0
  let leveraged = false
  let liquidated = false
  let pendingK1 = false
  let pendingK2 = null
  let turnover = 0
  let rebalances = 0
  const out = []
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i]
    if (!liquidated) {
      m *= 1 + netM(r, A, fee)
      g *= 1 + netG(r, A, fee)
      cash *= 1 + (cash >= 0 ? r.rf : r.rf + spread / A)
      debt *= 1 + r.rf + spread / A
    }
    const before = m + g + cash - debt
    let nav = before
    let action = null
    let tradeTurnover = 0
    if (!liquidated && (pendingK2 != null || pendingK1)) {
      const wasLeveraged = leveraged
      const target = pendingK2 ?? (leveraged ? 1.3 : 1)
      const total = target * before
      const nextM = 0.7 * total
      const nextG = 0.3 * total
      const trade = Math.abs(nextM - m) + Math.abs(nextG - g)
      const charge = cost * trade
      nav = before - charge
      m = nextM
      g = nextG
      cash = nav - m - g + debt
      leveraged = pendingK2 != null ? target > 1 : leveraged
      turnover += trade / before
      tradeTurnover = trade / before
      rebalances += 1
      action = pendingK2 != null ? (target === 1 ? 'exit' : wasLeveraged ? 'rebalance' : 'enter') : 'k1-rebalance'
      pendingK1 = false
      pendingK2 = null
    }
    let exposure = nav > 0 ? (m + g) / nav : Infinity
    if (!liquidated && (nav <= 0 || exposure >= 2)) {
      nav -= cost * (m + g)
      cash = nav
      m = 0
      g = 0
      debt = 0
      leveraged = false
      liquidated = true
      action = 'liquidation'
      pendingK1 = false
      pendingK2 = null
    }
    exposure = nav > 0 ? (m + g) / nav : Infinity
    out.push({ date: r.date, nav, exposure, leveraged, liquidated, action, tradeTurnover, dd: signals[i].dd, sma: signals[i].sma, I: signals[i].I })
    if (liquidated) continue
    const share = m + g ? g / (m + g) : 0
    pendingK1 = share < 0.25 || share > 0.35
    const s = signals[i]
    if (!leveraged) {
      if (s.dd <= -entry && s.above === true) pendingK2 = 1.3
    } else if (s.below === true || s.dd > -0.05) pendingK2 = 1
    else if (exposure < 1.25 || exposure > 1.35) pendingK2 = 1.3
  }
  return { rows: out, turnover, rebalances, liquidated, leverage: out.map(r => r.leveraged) }
}

function monthlyReturns(rows) {
  const ends = []
  for (let i = 0; i < rows.length; i += 1) {
    if (i === rows.length - 1 || ym(rows[i + 1].date) !== ym(rows[i].date)) ends.push(i)
  }
  const out = []
  let previous = rows[0].initialNav ?? 1
  for (const i of ends) {
    out.push({ month: ym(rows[i].date), endDate: rows[i].date, r: rows[i].nav / previous - 1 })
    previous = rows[i].nav
  }
  return out
}

function monthlyCashReturns(rows) {
  const out = []
  let month = ym(rows[0].date)
  let wealth = 1
  for (let i = 0; i < rows.length; i += 1) {
    if (i > 0 && ym(rows[i].date) !== month) {
      out.push(wealth - 1)
      month = ym(rows[i].date)
      wealth = 1
    }
    wealth *= 1 + rows[i].rf
  }
  out.push(wealth - 1)
  return out
}

function cer(monthly, gamma = GAMMA) {
  if (monthly.some(r => 1 + r <= 0)) return -Infinity
  const power = 1 - gamma
  return mean(monthly.map(r => (1 + r) ** power)) ** (1 / power) - 1
}
const annualCer = (monthly, gamma = GAMMA) => (1 + cer(monthly, gamma)) ** 12 - 1

function drawdown(rows) {
  let peak = rows[0].initialNav ?? rows[0].nav
  let peakDate = rows[0].date
  let worst = 0
  let worstPeak = peakDate
  let troughDate = peakDate
  let longest = { tradingDays: 0, from: peakDate, to: peakDate }
  for (let i = 1; i < rows.length; i += 1) {
    const r = rows[i]
    if (r.nav >= peak) {
      const duration = i - rows.findIndex(x => x.date === peakDate)
      if (duration > longest.tradingDays) longest = { tradingDays: duration, from: peakDate, to: r.date }
      peak = r.nav
      peakDate = r.date
    }
    const dd = r.nav / peak - 1
    if (dd < worst) {
      worst = dd
      worstPeak = peakDate
      troughDate = r.date
    }
  }
  const openDuration = rows.length - 1 - rows.findIndex(x => x.date === peakDate)
  if (openDuration > longest.tradingDays) longest = { tradingDays: openDuration, from: peakDate, to: rows.at(-1).date }
  return { max: worst, peak: worstPeak, trough: troughDate, longest }
}

const dailyReturns = strategy => strategy.map((r, i) => i ? r.nav / strategy[i - 1].nav - 1 : r.nav / (strategy[0].initialNav ?? 1) - 1)

function metrics(strategy, rows, info, extra = {}) {
  const returns = dailyReturns(strategy)
  const rf = rows.map(r => r.rf)
  const monthly = monthlyReturns(strategy).map(r => r.r)
  const monthlyRf = monthlyCashReturns(rows)
  const dd = drawdown(strategy)
  const end = strategy.at(-1).nav
  const initial = strategy[0].initialNav ?? 1
  return {
    annualReturn: (end / initial) ** (1 / info.years) - 1,
    dailyVol: std(returns) * Math.sqrt(info.A),
    monthlyVol: std(monthly) * Math.sqrt(12),
    dailySharpe: std(returns.map((r, i) => r - rf[i])) ? mean(returns.map((r, i) => r - rf[i])) / std(returns.map((r, i) => r - rf[i])) * Math.sqrt(info.A) : 0,
    monthlySharpe: std(monthly.map((r, i) => r - monthlyRf[i])) ? mean(monthly.map((r, i) => r - monthlyRf[i])) / std(monthly.map((r, i) => r - monthlyRf[i])) * Math.sqrt(12) : 0,
    maxDrawdown: dd.max,
    drawdownPeak: dd.peak,
    drawdownTrough: dd.trough,
    longestDrawdown: dd.longest,
    cer5: annualCer(monthly, 5),
    cer3: annualCer(monthly, 3),
    finalNav: end,
    ...extra,
  }
}

function rollingWorst(strategy, benchmark, months = 36) {
  const a = monthlyReturns(strategy)
  const b = monthlyReturns(benchmark)
  let worst = { gap: Infinity, from: null, to: null }
  for (let i = 0; i + months <= a.length; i += 1) {
    const ca = a.slice(i, i + months).reduce((v, r) => v * (1 + r.r), 1) - 1
    const cb = b.slice(i, i + months).reduce((v, r) => v * (1 + r.r), 1) - 1
    const rel = (1 + ca) / (1 + cb) - 1
    if (rel < worst.gap) worst = { gap: rel, from: a[i].month, to: a[i + months - 1].month }
  }
  return worst
}

function oldEvents(rows, fee = FEE, feeA = windowInfo(rows).A) {
  let wealth = 1
  let high = 1
  let peakDate = rows[0].date
  let trough = 1
  let troughDate = peakDate
  const events = []
  let current = null
  for (const r of rows) {
    wealth *= 1 + netM(r, feeA, fee)
    if (wealth >= high) {
      if (current && current.dd <= -0.1) events.push({ ...current, recovery: r.date })
      high = wealth
      peakDate = r.date
      trough = wealth
      troughDate = r.date
      current = null
    } else {
      if (wealth < trough) {
        trough = wealth
        troughDate = r.date
      }
      current = { peak: peakDate, trough: troughDate, dd: trough / high - 1, recovery: null }
    }
  }
  if (current && current.dd <= -0.1) events.push(current)
  return events.sort((a, b) => a.dd - b.dd).slice(0, 6)
}

function zigzagEvents(rows, fee = FEE, feeA = windowInfo(rows).A) {
  let wealth = 1
  let peak = 1
  let peakDate = rows[0].date
  let trough = 1
  let troughDate = peakDate
  const events = []
  for (const r of rows) {
    wealth *= 1 + netM(r, feeA, fee)
    if (wealth >= peak) {
      peak = wealth
      peakDate = r.date
      trough = wealth
      troughDate = r.date
    } else {
      if (wealth < trough) {
        trough = wealth
        troughDate = r.date
      }
      if (wealth >= trough * 1.2) {
        if (trough / peak - 1 <= -0.1) events.push({ peak: peakDate, trough: troughDate, dd: trough / peak - 1, rebound: r.date })
        peak = wealth
        peakDate = r.date
        trough = wealth
        troughDate = r.date
      }
    }
  }
  if (trough / peak - 1 <= -0.1) events.push({ peak: peakDate, trough: troughDate, dd: trough / peak - 1, rebound: null })
  return events.sort((a, b) => a.dd - b.dd).slice(0, 6)
}

function eventLoss(rows, event) {
  const peak = rows.find(r => r.date === event.peak)
  const trough = rows.find(r => r.date === event.trough)
  return peak && trough ? 1 - trough.nav / peak.nav : null
}

function tailReport(candidate, benchmark, mRows, fee = FEE, marketFee = fee, feeA = windowInfo(mRows).A) {
  const old = oldEvents(mRows, marketFee, feeA)
  const modern = zigzagEvents(mRows, marketFee, feeA)
  const market = simulateM(mRows, feeA, marketFee)
  const pack = events => events.map(e => ({
    ...e,
    marketLoss: eventLoss(market, e),
    candidateLoss: eventLoss(candidate, e),
    benchmarkLoss: eventLoss(benchmark, e),
  }))
  const newRows = pack(modern)
  const oldRows = pack(old)
  const ratio = rows => {
    const c = rows.reduce((s, r) => s + (r.candidateLoss ?? 0), 0)
    const b = rows.reduce((s, r) => s + (r.benchmarkLoss ?? 0), 0)
    return b ? c / b : null
  }
  return { new: newRows, old: oldRows, LNew: ratio(newRows), LOld: ratio(oldRows) }
}

function independentSegments(rows) {
  const signals = signalFrame(rows)
  const events = []
  let start = 0
  let high = signals[0].I
  for (let i = 1; i < signals.length; i += 1) {
    if (signals[i].I >= high) {
      if (signals[i].I > high) {
        events.push({ start, end: i, peak: rows[start].date, recovery: rows[i].date })
        start = i
      }
      high = signals[i].I
    } else if (i === signals.length - 1) {
      events.push({ start, end: i, peak: rows[start].date, recovery: null })
    }
    high = Math.max(high, signals[i].I)
  }
  return events.filter(e => {
    const segment = signals.slice(e.start, e.end + 1)
    return Math.min(...segment.map(s => s.dd)) <= -0.2
  })
}

function segmentStats(k2, m, rows) {
  const kReturns = dailyReturns(k2.rows)
  const mReturns = dailyReturns(m)
  const logDifferences = kReturns.map((r, i) => Math.log(1 + r) - Math.log(1 + mReturns[i]))
  const base = logDifferences.reduce((s, x) => s + x, 0)
  const segments = independentSegments(rows).map(segment => {
    const peak = rows[segment.start].date
    const recovery = rows[segment.end].date
    const actions = k2.rows.filter(r => r.date > peak && r.date <= recovery && r.action)
    const levDays = k2.rows.filter(r => r.date > peak && r.date <= recovery && r.leveraged).length
    const kStart = k2.rows.find(r => r.date === peak).nav
    const kEnd = k2.rows.find(r => r.date === recovery).nav
    const mStart = m.find(r => r.date === peak).nav
    const mEnd = m.find(r => r.date === recovery).nav
    const contribution = logDifferences.slice(segment.start + 1, segment.end + 1).reduce((s, x) => s + x, 0)
    return {
      peak, recovery, entries: actions.filter(r => r.action === 'enter').length,
      exits: actions.filter(r => r.action === 'exit').length,
      rebalances: actions.filter(r => r.action === 'rebalance').length,
      leveragedDays: levDays,
      cumulativeDifference: (kEnd / kStart) / (mEnd / mStart) - 1,
      cerContribution: contribution,
      concentration: base !== 0 ? contribution / base : null,
    }
  })
  return { base, segments, maxConcentration: base !== 0 ? Math.max(...segments.map(s => s.concentration)) : null }
}

function tradesBetween(rows, start, end) {
  return rows.filter(r => r.date >= start && r.date <= end && r.action).map(r => ({
    date: r.date, action: r.action, exposure: r.exposure, nav: r.nav, drawdown: r.dd,
  }))
}

function quality(rows, a = 'gross', b = 'g') {
  const x = rows.slice(1).map(r => r[a])
  const y = rows.slice(1).map(r => r[b])
  const mx = mean(x)
  const my = mean(y)
  const cov = x.reduce((s, v, i) => s + (v - mx) * (y[i] - my), 0) / (x.length - 1)
  return { correlation: cov / (std(x) * std(y)), beta: cov / std(x) ** 2, volRatio: std(y) / std(x) }
}

function bootstrapK1(k1, m, rows) {
  const cash = monthlyCashReturns(rows)
  const a = monthlyReturns(k1).map((r, i) => r.r - cash[i])
  const b = monthlyReturns(m).map((r, i) => r.r - cash[i])
  const sharpe = x => mean(x) / std(x) * Math.sqrt(12)
  const actual = sharpe(a) - sharpe(b)
  const rng = mulberry32(20261128)
  const differences = []
  let extreme = 0
  for (let draw = 0; draw < 10000; draw += 1) {
    const ia = []
    const ib = []
    while (ia.length < a.length) {
      const start = Math.floor(rng() * a.length)
      for (let j = 0; j < 12 && ia.length < a.length; j += 1) {
        ia.push(a[(start + j) % a.length])
        ib.push(b[(start + j) % a.length])
      }
    }
    const difference = sharpe(ia) - sharpe(ib)
    differences.push(difference)
    if (difference - actual >= actual) extreme += 1
  }
  const months = monthlyReturns(k1).map(r => r.month)
  return {
    actualDifference: actual, draws: 10000, block: 12, seed: 20261128, p: (extreme + 1) / 10001,
    T: a.length, firstMonth: months[0], lastMonth: months.at(-1),
    distributionMean: mean(differences), distributionStd: std(differences),
  }
}

function placeboK2(rows, actual, A) {
  const n = rows.length
  const leverage = actual.leverage
  const actualMonthly = monthlyReturns(actual.rows).map(r => r.r)
  const m = simulateM(rows, A)
  const mDaily = dailyReturns(m)
  const actualDaily = dailyReturns(actual.rows)
  const mStarK = std(actualDaily) / std(mDaily)
  const mStar = simulateMStar(rows, mStarK, A)
  const actualDelta = annualCer(actualMonthly, 5) - annualCer(monthlyReturns(mStar).map(r => r.r), 5)
  const actualMean = mean(actualDaily.map((r, i) => r - mDaily[i]))
  let count = 0
  let countMean = 0
  let shifts = 0
  for (let shift = 21; shift < n; shift += 21) {
    const schedule = leverage.map((_, i) => leverage[(i - shift + n) % n])
    const sim = simulateLeverage(rows, A, { fixedSchedule: schedule })
    const delta = annualCer(monthlyReturns(sim.rows).map(r => r.r), 5) - annualCer(monthlyReturns(mStar).map(r => r.r), 5)
    const daily = dailyReturns(sim.rows)
    const md = mean(daily.map((r, i) => r - mDaily[i]))
    if (delta >= actualDelta) count += 1
    if (md >= actualMean) countMean += 1
    shifts += 1
  }
  return { N: shifts, step: 21, actualDeltaCer: actualDelta, actualMeanDailyDifference: actualMean, pCer: (count + 1) / (shifts + 1), pMeanDaily: (countMean + 1) / (shifts + 1) }
}

function conditionalPlacebo(rows, actual, A) {
  const signals = signalFrame(rows)
  const eligibleRuns = []
  let run = []
  for (let i = 0; i < rows.length; i += 1) {
    if (signals[i].dd <= -0.2) run.push(i)
    else if (run.length) { eligibleRuns.push(run); run = [] }
  }
  if (run.length) eligibleRuns.push(run)
  const lengths = []
  let length = 0
  for (const flag of actual.leverage) {
    if (flag) length += 1
    else if (length) { lengths.push(length); length = 0 }
  }
  if (length) lengths.push(length)
  lengths.sort((a, b) => b - a)
  const rng = mulberry32(20261128)
  const m = simulateM(rows, A)
  const k = std(dailyReturns(actual.rows)) / std(dailyReturns(m))
  const mStar = simulateMStar(rows, k, A)
  const base = annualCer(monthlyReturns(mStar).map(r => r.r), 5)
  const e1 = simulateLeverage(rows, A, { smaConfirm: false })
  const actualDelta = annualCer(monthlyReturns(actual.rows).map(r => r.r), 5) - annualCer(monthlyReturns(e1.rows).map(r => r.r), 5)
  let extreme = 0
  let valid = 0
  for (let draw = 0; draw < 5000; draw += 1) {
    let schedule = null
    for (let attempt = 0; attempt < 10000 && !schedule; attempt += 1) {
      const candidate = new Array(rows.length).fill(false)
      const occupied = new Array(rows.length).fill(false)
      let ok = true
      for (const len of lengths) {
        const candidates = eligibleRuns.filter(run => {
          if (run.length < len) return false
          for (let offset = 0; offset + len <= run.length; offset += 1) {
            if (run.slice(offset, offset + len).every(index => !occupied[index])) return true
          }
          return false
        })
        if (!candidates.length) { ok = false; break }
        const chosen = candidates[Math.floor(rng() * candidates.length)]
        const offsets = []
        for (let offset = 0; offset + len <= chosen.length; offset += 1) {
          if (chosen.slice(offset, offset + len).every(index => !occupied[index])) offsets.push(offset)
        }
        const offset = offsets[Math.floor(rng() * offsets.length)]
        for (let j = 0; j < len; j += 1) {
          const index = chosen[offset + j]
          candidate[index] = true
          occupied[index - 1] = true
          occupied[index] = true
          occupied[index + 1] = true
        }
      }
      if (ok) schedule = candidate
    }
    if (!schedule) throw new Error('条件安慰剂在 10000 次尝试后仍放不下全部不重叠杠杆段')
    const sim = simulateLeverage(rows, A, { fixedSchedule: schedule })
    const delta = annualCer(monthlyReturns(sim.rows).map(r => r.r), 5) - base
    const e1Delta = annualCer(monthlyReturns(e1.rows).map(r => r.r), 5) - base
    if (delta - e1Delta >= actualDelta) extreme += 1
    valid += 1
  }
  return { draws: 5000, valid, seed: 20261128, lengths, actualK2MinusE1: actualDelta, p: (extreme + 1) / (valid + 1) }
}

function packageMetrics(info, m, k1, k2, rows, fee = FEE, feeA = info.A) {
  const mMonthly = monthlyReturns(m).map(r => r.r)
  const k1Monthly = monthlyReturns(k1.rows).map(r => r.r)
  const k1Daily = dailyReturns(k1.rows)
  const mDaily = dailyReturns(m)
  const k2Daily = dailyReturns(k2.rows)
  const k1K = std(k1Monthly) / std(mMonthly)
  const k2K = std(k2Daily) / std(mDaily)
  const mStarK1 = simulateMStar(rows, k1K, feeA, FINANCE, fee)
  const mStarK2 = simulateMStar(rows, k2K, feeA, FINANCE, fee)
  const k2Turnover = k2.rows.reduce((s, r) => s + (r.tradeTurnover ?? 0), 0)
  const k2Rebalances = k2.rows.filter(r => r.action).length
  return {
    M: metrics(m, rows, info),
    K1: metrics(k1.rows, rows, info, { turnoverPerYear: k1.turnover / info.years, rebalancesPerYear: k1.rebalances / info.years, trackingError: std(k1Daily.map((r, i) => r - mDaily[i])) * Math.sqrt(info.A), worstRolling36: rollingWorst(k1.rows, m) }),
    K2: metrics(k2.rows, rows, info, { turnoverPerYear: k2Turnover / info.years, rebalancesPerYear: k2Rebalances / info.years, liquidated: k2.rows.some(r => r.liquidated) }),
    MstarK1: { k: k1K, ...metrics(mStarK1, rows, info) },
    MstarK2: { k: k2K, ...metrics(mStarK2, rows, info) },
  }
}

function gatesFor(pack, tailK1, tailK2, k2Placebo, k2Segments) {
  const k1Conditions = {
    efficiencyMain: pack.K1.monthlySharpe >= pack.M.monthlySharpe + 0.03,
    drawdown: pack.K1.maxDrawdown >= pack.MstarK1.maxDrawdown - 0.01,
    tail: tailK1.LNew <= 1,
  }
  const deltaCerStar = pack.K2.cer5 - pack.MstarK2.cer5
  const deltaCerM = pack.K2.cer5 - pack.M.cer5
  const k2Conditions = {
    cerStar: deltaCerStar >= 0.002,
    cerM: deltaCerM >= 0,
    drawdown: pack.K2.maxDrawdown >= pack.M.maxDrawdown - 0.01,
    tail: tailK2.LNew <= 1,
    timing: k2Placebo.pCer <= 0.1,
    concentration: k2Segments.maxConcentration == null || k2Segments.maxConcentration <= 0.5,
    noLiquidation: !pack.K2.liquidated,
  }
  return {
    K1: { conditions: k1Conditions, pass: Object.values(k1Conditions).every(Boolean) },
    K2: { conditions: k2Conditions, deltaCerStar, deltaCerM, pass: Object.values(k2Conditions).every(Boolean) },
  }
}

function evaluateKfWindow(rows, fullK2Rows, label, feeA = null, independent = false) {
  const info = windowInfo(rows)
  const dailyFeeA = feeA ?? info.A
  const m = simulateM(rows, dailyFeeA)
  const k1 = sliceK1(simulateK1(fullK2Rows, dailyFeeA), rows[0].date, rows.at(-1).date)
  const k2 = independent ? independentLeverage(fullK2Rows, dailyFeeA, rows[0].date) : simulateLeverage(fullK2Rows, dailyFeeA)
  const firstIndex = k2.rows.findIndex(r => r.date === rows[0].date)
  const initialNav = firstIndex > 0 ? k2.rows[firstIndex - 1].nav : 1
  const k2Rows = slice(k2.rows, rows[0].date, rows.at(-1).date).map(r => ({ ...r, initialNav }))
  const k2Sliced = { ...k2, rows: k2Rows }
  const pack = packageMetrics(info, m, k1, k2Sliced, rows, FEE, dailyFeeA)
  const tailK1 = tailReport(k1.rows, simulateMStar(rows, pack.MstarK1.k, dailyFeeA), rows, FEE, FEE, dailyFeeA)
  const tailK2 = tailReport(k2Rows, m, rows, FEE, 0, dailyFeeA)
  const placebo = placeboK2(rows, { ...k2Sliced, leverage: k2Rows.map(r => r.leveraged) }, info.A)
  const segments = segmentStats({ ...k2Sliced, rows: k2Rows }, m, rows)
  const gates = gatesFor(pack, tailK1, tailK2, placebo, segments)
  return { label, info, pack, tailK1, tailK2, placebo, segments, gates, k1Bootstrap: bootstrapK1(k1.rows, m, rows) }
}

function evaluateEtfWindow(rows, fullSignalRows = spy) {
  const info = windowInfo(rows)
  const m = simulateM(rows, info.A, 0)
  const k1 = simulateK1(rows, info.A, { fee: 0 })
  const k2 = independentLeverage(fullSignalRows, info.A, rows[0].date, 0)
  const firstIndex = k2.rows.findIndex(r => r.date === rows[0].date)
  const initialNav = firstIndex > 0 ? k2.rows[firstIndex - 1].nav : 1
  const k2Rows = slice(k2.rows, rows[0].date, rows.at(-1).date).map(r => ({ ...r, initialNav }))
  const pack = packageMetrics(info, m, k1, { ...k2, rows: k2Rows }, rows, 0)
  const tailK1 = tailReport(k1.rows, simulateMStar(rows, pack.MstarK1.k, info.A, FINANCE, 0), rows, 0)
  const tailK2 = tailReport(k2Rows, m, rows, 0)
  const segments = segmentStats({ ...k2, rows: k2Rows }, m, rows)
  return { info, pack, tailK1, tailK2, segments, k1Bootstrap: bootstrapK1(k1.rows, m, rows) }
}

const MAIN = ['19270103', '19721229']
const HALF1 = ['19270103', '19491231']
const HALF2 = ['19500101', '19721229']
const VETO = ['19730101', '19841231']
const mainRows = slice(kf, ...MAIN)
const mainK2 = simulateLeverage(mainRows, windowInfo(mainRows).A)
const mainEval = evaluateKfWindow(mainRows, mainRows, 'main')
const half1Rows = slice(kf, ...HALF1)
const half2Rows = slice(kf, ...HALF2)
const half1Eval = evaluateKfWindow(half1Rows, mainRows, 'half1', windowInfo(mainRows).A)
const half2Eval = evaluateKfWindow(half2Rows, mainRows, 'half2', windowInfo(mainRows).A)
const vetoRows = slice(kf, ...VETO)
const vetoEval = evaluateKfWindow(vetoRows, kf, 'vetoKf', null, true)
const etfEval = evaluateEtfWindow(etf)
const ndxEval = evaluateEtfWindow(ndx, ndx)

function sensitivity(rows, etfMode = false, fullRows = rows) {
  const info = windowInfo(rows)
  const fee = etfMode ? 0 : FEE
  const full = simulateLeverage(fullRows, info.A, { fee })
  const firstIndex = fullRows.findIndex(r => r.date >= rows[0].date)
  const reset = fullRows === rows ? {} : { resetAt: rows[0].date, initialLeveraged: full.rows[firstIndex - 1].leveraged }
  const m = simulateM(rows, info.A, fee)
  const k1Cost = simulateK1(rows, info.A, { cost: 0.002, fee })
  const k2Cost = simulateLeverage(fullRows, info.A, { cost: 0.002, fee, ...reset })
  const k2Finance3 = simulateLeverage(fullRows, info.A, { spread: 0.03, fee, ...reset })
  const k2Finance6 = simulateLeverage(fullRows, info.A, { spread: 0.045, fee, ...reset })
  return {
    K1Cost20bp: metrics(k1Cost.rows, rows, info, { turnoverPerYear: k1Cost.turnover / info.years }),
    K2Cost20bp: metrics(slice(k2Cost.rows, rows[0].date, rows.at(-1).date), rows, info, { turnoverPerYear: k2Cost.turnover / info.years }),
    K2FinanceRfPlus3: metrics(slice(k2Finance3.rows, rows[0].date, rows.at(-1).date), rows, info),
    K2FinanceFixed6: metrics(slice(k2Finance6.rows, rows[0].date, rows.at(-1).date), rows, info),
  }
}

function explorations(rows, info, mainK2Result) {
  const e1 = simulateLeverage(rows, info.A, { smaConfirm: false })
  const e1NoDrift = simulateLeverage(rows, info.A, { smaConfirm: false, drift: false })
  const e2 = [0.15, 0.25].map(entry => ({ entry, result: simulateLeverage(rows, info.A, { entry }) }))
  const e3 = [
    { id: 'band3', options: { band: 0.03 } },
    { id: 'band10', options: { band: 0.10 } },
    { id: 'annual', options: { mode: 'annual' } },
    { id: 'never', options: { mode: 'never' } },
  ].map(({ id, options }) => ({ id, result: simulateK1(rows, info.A, options) }))
  const e4 = [0.2, 0.4].map(tilt => ({ tilt, result: simulateK1(rows, info.A, { tilt }) }))
  const e5 = simulateLeverage(rows, info.A, { priceSignal: true })
  const e6 = simulateE6(rows, info.A)
  const pack = sim => metrics(sim.rows, rows, info, { turnoverPerYear: sim.turnover / info.years, liquidated: sim.liquidated })
  return {
    E1: pack(e1),
    E1NoDrift: pack(e1NoDrift),
    E1Path1929_1932: slice(e1.rows, '19290101', '19321231'),
    E1NoDriftLiquidated: e1NoDrift.liquidated,
    E2: e2.map(x => ({ entry: x.entry, ...pack(x.result) })),
    E3: e3.map(x => ({ id: x.id, ...pack(x.result) })),
    E4: e4.map(x => ({ tilt: x.tilt, ...pack(x.result) })),
    E5: pack(e5),
    E6: pack(e6),
    conditionalPlacebo: conditionalPlacebo(rows, mainK2Result, info.A),
  }
}

const explorationsMain = explorations(mainRows, windowInfo(mainRows), mainK2)
const mainSensitivity = sensitivity(mainRows)
const vetoSensitivity = sensitivity(vetoRows, false, kf)
const etfSensitivity = sensitivity(etf, true, spy)
const qualityMain = quality([kf.find(r => r.date === '19261231'), ...mainRows])
const qualityNdx = quality(ndxAll.filter(r => r.date <= '19990309').map((r, i, all) => ({
  gross: i && gspcByDate.get(r.date) ? gspcByDate.get(r.date).adj / gspcByDate.get(all[i - 1].date).adj - 1 : 0,
  g: i ? r.adj / all[i - 1].adj - 1 : 0,
})))
const qualityEtf = quality([{ ...spy.find(r => r.date === '19990310'), g: qqqReturns.get('19990310') }, ...etf])

const monthlyKfText = unzip(`${RAW}F-F_Research_Data_Factors_CSV.zip`)
const monthlyKf = new Map(monthlyKfText.split(/\r?\n/).filter(line => /^\d{6},/.test(line)).map(line => {
  const [month, a, , , d] = line.trim().split(',')
  return [month, (Number(a) + Number(d)) / 100]
}))
const dailyM = simulateM(mainRows, windowInfo(mainRows).A, 0)
const monthlyComparison = monthlyReturns(dailyM).map(r => ({
  month: r.month, dailyCompounded: r.r, kfMonthly: monthlyKf.get(r.month),
  difference: r.r - (monthlyKf.get(r.month) ?? 0),
}))
const saturdayCount = mainRows.filter(r => new Date(`${r.date.slice(0, 4)}-${r.date.slice(4, 6)}-${r.date.slice(6, 8)}T00:00:00Z`).getUTCDay() === 6).length
const edgeSynthetic = Array.from({ length: 205 }, (_, i) => ({ date: `1927${String(1 + Math.floor(i / 28)).padStart(2, '0')}${String(1 + i % 28).padStart(2, '0')}`, gross: 0, mkt: 0, price: 0, g: 0, rf: 0 }))
const edgeFirst200 = simulateLeverage(edgeSynthetic, 200)
const edgeDriftRows = edgeSynthetic.map((r, i) => ({ ...r, gross: i === 2 ? 0.2 : 0 }))
const edgeDrift = simulateLeverage(edgeDriftRows, 200, { fixedSchedule: new Array(205).fill(true) })
const edgeLiquidation = simulateLeverage(edgeSynthetic.map((r, i) => ({ ...r, gross: i === 2 ? -0.9 : 0 })), 200, { fixedSchedule: new Array(205).fill(true) })
const edgeChecks = {
  equalSmaLeavesState: (() => {
    const rows = edgeSynthetic.map(r => ({ ...r, gross: 0.01 }))
    const sim = simulateLeverage(rows, 200)
    return sim.rows.every((r, i) => i < 199 || !r.leveraged)
  })(),
  first200Unleveraged: edgeFirst200.rows.slice(0, 199).every(r => !r.leveraged),
  driftBandRebalances: edgeDrift.rows.some(r => r.action === 'rebalance'),
  liquidationDetected: edgeLiquidation.liquidated && edgeLiquidation.rows.some(r => r.action === 'liquidation'),
  reentryAfterExitAllowed: mainK2.rows.some((r, i) => r.action === 'enter' && mainK2.rows.slice(0, i).some(x => x.action === 'exit')),
  zigzagSegmentation: (() => {
    const dates = ['19270103', '19270104', '19270105', '19270106']
    const values = [1, 0.8, 0.96, 0.7]
    const rows = dates.map((date, i) => ({ date, gross: i ? values[i] / values[i - 1] - 1 : 0, rf: 0 }))
    return zigzagEvents(rows, 0).length === 2
  })(),
  actualTradingDayAnnualization: Number.isFinite(windowInfo(mainRows).A) && windowInfo(mainRows).A > 250,
  saturdayTradingDaysPresent: saturdayCount > 0,
}

const holm = (() => {
  const rows = [
    { id: 'K1', p: mainEval.k1Bootstrap.p },
    { id: 'K2', p: mainEval.placebo.pCer },
  ].sort((a, b) => a.p - b.p)
  let running = 0
  for (let i = 0; i < rows.length; i += 1) {
    running = Math.max(running, Math.min(1, (rows.length - i) * rows[i].p))
    rows[i].holm = running
  }
  return rows
})()
const k1HalfConditions = [half1Eval, half2Eval].map(x => x.pack.K1.monthlySharpe >= x.pack.M.monthlySharpe - 0.02)
const k1VetoConditions = [vetoEval, etfEval].map(x => ({
  sharpe: x.pack.K1.monthlySharpe >= x.pack.M.monthlySharpe - 0.03,
  drawdown: x.pack.K1.maxDrawdown >= x.pack.MstarK1.maxDrawdown - 0.05,
}))
const k2HalfConditions = [half1Eval, half2Eval].map(x => x.pack.K2.cer5 - x.pack.MstarK2.cer5 >= -0.002)
const k2VetoConditions = [vetoEval, etfEval].map(x => ({
  cer: x.pack.K2.cer5 - x.pack.M.cer5 >= -0.005,
  drawdown: x.pack.K2.maxDrawdown >= x.pack.M.maxDrawdown - 0.01,
  noLiquidation: !x.pack.K2.liquidated,
}))
const k1MainOk = mainEval.gates.K1.pass && k1HalfConditions.every(Boolean)
const k2MainOk = mainEval.gates.K2.pass && k2HalfConditions.every(Boolean)
const k1VetoOk = k1VetoConditions.every(x => x.sharpe && x.drawdown)
const k2VetoOk = k2VetoConditions.every(x => x.cer && x.drawdown && x.noLiquidation)
const verdicts = {
  K1: {
    mainAndHalves: k1MainOk, veto: k1VetoOk, halfConditions: k1HalfConditions, vetoConditions: k1VetoConditions,
    verdict: k1MainOk && k1VetoOk ? '通过' : k1MainOk ? '部分成立' : '不通过',
  },
  K2: {
    mainAndHalves: k2MainOk, veto: k2VetoOk, halfConditions: k2HalfConditions, vetoConditions: k2VetoConditions,
    verdict: k2MainOk && k2VetoOk ? '通过' : k2MainOk ? '部分成立' : '不通过',
  },
}

const iso = d => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
const schemaWindow = (label, rows, info) => ({ start: iso(rows[0].date), end: iso(rows.at(-1).date), nDays: info.N, years: info.years, A: info.A })
const schemaMetrics = (m, rows, info) => ({
  daily: {
    nDays: info.N, cagr: m.annualReturn, vol: m.dailyVol, sharpeDaily: m.dailySharpe,
    maxDd: m.maxDrawdown,
    maxDdDays: rows.filter(r => r.date >= m.drawdownPeak && r.date <= m.drawdownTrough).length - 1,
  },
  monthly: {
    nMonths: monthlyReturns(rows.map((r, i) => ({ date: r.date, nav: r.nav ?? 1 }))).length,
    sharpe: m.monthlySharpe, cerG5: m.cer5, cerG3: m.cer3,
  },
})
const schemaTail = tail => ({
  L: tail.LNew,
  polyline: tail.new.map(e => ({ peak: iso(e.peak), trough: iso(e.trough), method: 'polyline', dropM: -e.marketLoss, dropCandidate: -e.candidateLoss, dropBenchmark: -e.benchmarkLoss })),
  priorHigh: tail.old.map(e => ({ peak: iso(e.peak), trough: iso(e.trough), method: 'priorHigh', dropM: -e.marketLoss, dropCandidate: -e.candidateLoss, dropBenchmark: -e.benchmarkLoss })),
})
const monthlyTracking = (a, b) => {
  const x = monthlyReturns(a).map(r => r.r)
  const y = monthlyReturns(b).map(r => r.r)
  return std(x.map((r, i) => r - y[i])) * Math.sqrt(12)
}
function makeK1Window(rows, k1, label, fee = FEE, feeA = null) {
  const info = windowInfo(rows)
  const dailyFeeA = feeA ?? info.A
  const m = simulateM(rows, dailyFeeA, fee)
  const k1Monthly = monthlyReturns(k1.rows).map(r => r.r)
  const mMonthly = monthlyReturns(m).map(r => r.r)
  const k = std(k1Monthly) / std(mMonthly)
  const mStar = simulateMStar(rows, k, dailyFeeA, FINANCE, fee)
  const tail = schemaTail(tailReport(k1.rows, mStar, rows, fee, fee, dailyFeeA))
  const mk = metrics(k1.rows, rows, info)
  const mm = metrics(m, rows, info)
  const ms = metrics(mStar, rows, info)
  return {
    window: label,
    K1: schemaMetrics(mk, k1.rows, info), M: schemaMetrics(mm, m, info), Mstar: schemaMetrics(ms, mStar, info),
    k, L: tail.L, tailPolyline: tail.polyline, tailPriorHigh: tail.priorHigh,
    turnoverPerYear: k1.turnover / 2 / info.years, rebalanceCount: k1.rebalances,
    trackingError: monthlyTracking(k1.rows, m),
    worstRolling36: (() => { const x = rollingWorst(k1.rows, m); return { rel: x.gap, from: `${x.from.slice(0, 4)}-${x.from.slice(4, 6)}`, to: `${x.to.slice(0, 4)}-${x.to.slice(4, 6)}` } })(),
    checks: {
      sharpeVsM: { value: mk.monthlySharpe - mm.monthlySharpe, threshold: 0.03, pass: mk.monthlySharpe - mm.monthlySharpe >= 0.03 },
      maxDdVsMstar: { value: mk.maxDrawdown - ms.maxDrawdown, threshold: -0.01, pass: mk.maxDrawdown >= ms.maxDrawdown - 0.01 },
      L: { value: tail.L, threshold: 1, pass: tail.L <= 1 },
      ...(label.startsWith('half') ? { sharpeVsM_half: { value: mk.monthlySharpe - mm.monthlySharpe, threshold: -0.02, pass: mk.monthlySharpe - mm.monthlySharpe >= -0.02 } } : {}),
    },
    _internal: { info, m, k1, mStar, mk, mm, ms },
  }
}
function makeK2Window(rows, k2, label, fee = FEE, feeA = null) {
  const info = windowInfo(rows)
  const dailyFeeA = feeA ?? info.A
  const m = simulateM(rows, dailyFeeA, fee)
  const firstIndex = k2.rows.findIndex(r => r.date === rows[0].date)
  const initialNav = firstIndex > 0 ? k2.rows[firstIndex - 1].nav : 1
  const path = slice(k2.rows, rows[0].date, rows.at(-1).date).map(r => ({ ...r, initialNav }))
  const daily = dailyReturns(path)
  const mDaily = dailyReturns(m)
  const k = std(daily) / std(mDaily)
  const mStar = simulateMStar(rows, k, dailyFeeA, FINANCE, fee)
  const tail = schemaTail(tailReport(path, m, rows, fee, 0, dailyFeeA))
  const mk = metrics(path, rows, info)
  const mm = metrics(m, rows, info)
  const ms = metrics(mStar, rows, info)
  const deltaCerVsMstar = mk.cer5 - ms.cer5
  const deltaCerVsM = mk.cer5 - mm.cer5
  return {
    window: label,
    K2: schemaMetrics(mk, path, info), M: schemaMetrics(mm, m, info), Mstar: schemaMetrics(ms, mStar, info),
    k, L: tail.L, deltaCerVsMstar, deltaCerVsM, tailPolyline: tail.polyline, tailPriorHigh: tail.priorHigh,
    liquidated: path.some(r => r.liquidated),
    checks: {
      deltaCerVsMstar: { value: deltaCerVsMstar, threshold: 0.002, pass: deltaCerVsMstar >= 0.002 },
      deltaCerVsM_nonneg: { value: deltaCerVsM, threshold: 0, pass: deltaCerVsM >= 0 },
      maxDdVsM: { value: mk.maxDrawdown - mm.maxDrawdown, threshold: -0.01, pass: mk.maxDrawdown >= mm.maxDrawdown - 0.01 },
      L: { value: tail.L, threshold: 1, pass: tail.L <= 1 },
      liquidated: { value: path.some(r => r.liquidated), threshold: false, pass: !path.some(r => r.liquidated) },
      ...(label.startsWith('half') ? { deltaCerVsMstar_half: { value: deltaCerVsMstar, threshold: -0.002, pass: deltaCerVsMstar >= -0.002 } } : {}),
    },
    _internal: { info, m, path, mStar, mk, mm, ms },
  }
}
const stripInternal = value => JSON.parse(JSON.stringify(value, (key, x) => key === '_internal' ? undefined : x))

const k1SchemaMain = makeK1Window(mainRows, simulateK1(mainRows, windowInfo(mainRows).A), 'main_1927_1972')
const k1SchemaHalf1 = makeK1Window(half1Rows, sliceK1(simulateK1(mainRows, windowInfo(mainRows).A), ...HALF1), 'half_1927_1949', FEE, windowInfo(mainRows).A)
const k1SchemaHalf2 = makeK1Window(half2Rows, sliceK1(simulateK1(mainRows, windowInfo(mainRows).A), ...HALF2), 'half_1950_1972', FEE, windowInfo(mainRows).A)
const k1SchemaVeto = makeK1Window(vetoRows, simulateK1(vetoRows, windowInfo(vetoRows).A), 'veto_kf_1973_1984')
const k1SchemaEtf = makeK1Window(etf, simulateK1(etf, windowInfo(etf).A, { fee: 0 }), 'veto_spy_qqq_1999_2026', 0)
const k2SchemaMain = makeK2Window(mainRows, mainK2, 'main_1927_1972')
const k2SchemaHalf1 = makeK2Window(half1Rows, simulateLeverage(mainRows, windowInfo(mainRows).A), 'half_1927_1949', FEE, windowInfo(mainRows).A)
const k2SchemaHalf2 = makeK2Window(half2Rows, simulateLeverage(mainRows, windowInfo(mainRows).A), 'half_1950_1972', FEE, windowInfo(mainRows).A)
const k2SchemaVeto = makeK2Window(vetoRows, independentLeverage(kf, windowInfo(vetoRows).A, vetoRows[0].date), 'veto_kf_1973_1984')
const k2SchemaEtf = makeK2Window(slice(spy, '19990310', '20261127'), independentLeverage(spy, windowInfo(slice(spy, '19990310', '20261127')).A, '19990310', 0), 'veto_spy_1999_2026', 0)

const e1Schema = makeK2Window(mainRows, simulateLeverage(mainRows, windowInfo(mainRows).A, { smaConfirm: false }), 'E1')
const e1NoDriftSchema = simulateLeverage(mainRows, windowInfo(mainRows).A, { smaConfirm: false, drift: false })
const e2Schema = [0.15, 0.25].map(entry => makeK2Window(mainRows, simulateLeverage(mainRows, windowInfo(mainRows).A, { entry }), `E2_${entry}`))
const e3Schema = [
  ['band3', { band: 0.03 }], ['band10', { band: 0.10 }], ['annual', { mode: 'annual' }], ['never', { mode: 'never' }],
].map(([id, options]) => [id, makeK1Window(mainRows, simulateK1(mainRows, windowInfo(mainRows).A, options), `E3_${id}`)])
const e4Schema = [0.2, 0.4].map(tilt => makeK1Window(mainRows, simulateK1(mainRows, windowInfo(mainRows).A, { tilt }), `E4_${tilt}`))
const e5Schema = makeK2Window(mainRows, simulateLeverage(mainRows, windowInfo(mainRows).A, { priceSignal: true }), 'E5')
const e6Schema = makeK2Window(mainRows, simulateE6(mainRows, windowInfo(mainRows).A), 'E6')
const k1SchemaNdx = makeK1Window(ndx, simulateK1(ndx, windowInfo(ndx).A, { fee: 0 }), 'report_ndx_1985_1999', 0)
const k2SchemaNdx = makeK2Window(ndx, independentLeverage(ndx, windowInfo(ndx).A, ndx[0].date, 0), 'report_ndx_1985_1999', 0)
const fullNdxQualityRows = ndxAll.map((r, i, all) => ({
  date: r.date,
  gross: i && gspcByDate.get(r.date) ? gspcByDate.get(r.date).adj / gspcByDate.get(all[i - 1].date).adj - 1 : 0,
  g: i ? r.adj / all[i - 1].adj - 1 : 0,
}))
const qualityFullNdx = quality(fullNdxQualityRows)
const tradeSchema = rows => rows.map(r => {
  const index = mainK2.rows.findIndex(x => x.date === r.date)
  return {
    signalDate: iso(mainK2.rows[Math.max(0, index - 1)].date), execDate: iso(r.date), action: r.action,
    exposure: r.exposure, nav: r.nav,
    navPrev: mainK2.rows[Math.max(0, index - 1)].nav,
    navChange: r.nav / mainK2.rows[Math.max(0, index - 1)].nav - 1,
  }
})
const mainSignalFrame = signalFrame(mainRows)
const segmentDrop = segment => {
  const start = mainRows.findIndex(r => r.date === segment.peak)
  const end = mainRows.findIndex(r => r.date === segment.recovery)
  const peak = mainSignalFrame[start].I
  const lowest = Math.min(...mainSignalFrame.slice(start, end + 1).map(s => s.I))
  return lowest / peak - 1
}
const segmentSchema = mainEval.segments.segments.filter(s => {
  const event = oldEvents(mainRows).find(e => e.peak === s.peak)
  return event && event.dd <= -0.2
}).map(s => ({
  peak: iso(s.peak), trough: iso(oldEvents(mainRows).find(e => e.peak === s.peak)?.trough ?? s.peak),
  recoveryAth: s.recovery ? iso(s.recovery) : null, entries: s.entries, leveredDays: s.leveragedDays,
  drop: segmentDrop(s),
  cumDiffVsM: s.cumulativeDifference, deltaCerShare: s.concentration,
  deltaCerContrib: s.cerContribution,
}))
const k2Event = (start, end) => {
  const rows = slice(mainRows, start, end)
  const info = windowInfo(rows)
  const m = simulateM(rows, info.A)
  const path = slice(mainK2.rows, start, end)
  return { K2: metrics(path, rows, info), M: metrics(m, rows, info) }
}
const knownEventReports = Object.fromEntries([['2000_2002', ['20000310', '20021231']], ['2008', ['20080101', '20081231']], ['2020', ['20200201', '20200430']], ['2022', ['20220101', '20221231']]].map(([id, range]) => {
  const rows = slice(etf, ...range)
  const info = windowInfo(rows)
  const m = simulateM(rows, info.A, 0)
  const k1 = simulateK1(rows, info.A, { fee: 0 })
  return [id, { info, M: metrics(m, rows, info), K1: metrics(k1.rows, rows, info) }]
}))
const firstSentence = `100% 暴露下，K1 年化波动较 M 变化 ${(k1SchemaMain.K1.daily.vol - k1SchemaMain.M.daily.vol).toFixed(6)}，最大回撤变化 ${(k1SchemaMain.K1.daily.maxDd - k1SchemaMain.M.daily.maxDd).toFixed(6)}；K2 最大回撤 ${k2SchemaMain.K2.daily.maxDd.toFixed(6)}，1929–32 与 1937–38 已单列；K1 同波动所需 k=${k1SchemaMain.k.toFixed(6)}。1999–2026 SPY/QQQ 为已知结果，不是证据。`
const schemaResults = {
  meta: {
    ledger: 'L-049', preregCommit: '15b95bb2', preregPath: 'docs/research/spx-qqq-tilt-2026-11-28/PREREG.md',
    impl: 'replication-node', seed: 20261128,
    notes: [
      '口径裁定：年数=(末日-首日)日历天/365.2425；A=N/年数；费与融资利差按 rate/A 逐日；月收益=日净值自然月复利；M* 按日 k 常数每日再平衡。',
      'FRED DTB4WK 本机不可得：1999 窗口在 KF RF 结束后沿用 2026-09 最后一日 RF。',
    ],
  },
  inputs: Object.fromEntries(['6_Portfolios_2x3_CSV.zip', '6_Portfolios_2x3_daily_CSV.zip', 'F-F_Research_Data_Factors_CSV.zip', 'F-F_Research_Data_Factors_daily_CSV.zip', 'shiller.csv', ...['SPY', 'QQQ', 'GSPC', 'NDX'].flatMap(id => [`yahoo_${id}_daily.csv`, `yahoo_${id}_chart.json`])].map(f => [f, sha(`${RAW}${f}`)])),
  proxyQuality: {
    kf1927_1972: { corr: qualityMain.correlation, beta: qualityMain.beta, volRatio: qualityMain.volRatio, start: iso(mainRows[0].date), end: iso(mainRows.at(-1).date) },
    ndx1985_2026: { corr: qualityFullNdx.correlation, beta: qualityFullNdx.beta, volRatio: qualityFullNdx.volRatio, start: iso(fullNdxQualityRows[1].date), end: iso(fullNdxQualityRows.at(-1).date) },
    qqq_spy_1999_2026: { corr: qualityEtf.correlation, beta: qualityEtf.beta, volRatio: qualityEtf.volRatio, start: iso(etf[0].date), end: iso(etf.at(-1).date) },
    ndx_vs_gspc_1985_2026: { corr: qualityFullNdx.correlation, beta: qualityFullNdx.beta, volRatio: qualityFullNdx.volRatio, start: iso(fullNdxQualityRows[1].date), end: iso(fullNdxQualityRows.at(-1).date) },
    qqq_vs_spy_1985_2026: { corr: qualityEtf.correlation, beta: qualityEtf.beta, volRatio: qualityEtf.volRatio, start: iso(etf[0].date), end: iso(etf.at(-1).date) },
    qqq_vs_spy_1999_2026: { corr: qualityEtf.correlation, beta: qualityEtf.beta, volRatio: qualityEtf.volRatio, start: iso(etf[0].date), end: iso(etf.at(-1).date) },
  },
  windows: Object.fromEntries([
    ['main', mainRows], ['half1', half1Rows], ['half2', half2Rows], ['veto_kf', vetoRows], ['veto_etf', etf],
  ].map(([id, rows]) => [id, schemaWindow(id, rows, windowInfo(rows))])),
  K1: {
    main: k1SchemaMain,
    halves: { '1927_1949': k1SchemaHalf1, '1950_1972': k1SchemaHalf2 },
    veto: { kf1973_1984: k1SchemaVeto, spyQqq1999_2026: k1SchemaEtf },
    decision: { grade: verdicts.K1.verdict, conditions: [
      { id: 'main_sharpe', pass: k1SchemaMain.checks.sharpeVsM.pass, detail: `Δ夏普=${k1SchemaMain.checks.sharpeVsM.value}` },
      { id: 'half1_sharpe', pass: k1SchemaHalf1.checks.sharpeVsM_half.pass, detail: `Δ=${k1SchemaHalf1.checks.sharpeVsM_half.value}` },
      { id: 'half2_sharpe', pass: k1SchemaHalf2.checks.sharpeVsM_half.pass, detail: `Δ=${k1SchemaHalf2.checks.sharpeVsM_half.value}` },
      { id: 'maxDd', pass: k1SchemaMain.checks.maxDdVsMstar.pass, detail: `ΔDD=${k1SchemaMain.checks.maxDdVsMstar.value}` },
      { id: 'L', pass: k1SchemaMain.checks.L.pass, detail: `L=${k1SchemaMain.L}` },
      { id: 'veto_kf1973', pass: k1VetoConditions[0].sharpe && k1VetoConditions[0].drawdown, detail: k1VetoConditions[0].sharpe && k1VetoConditions[0].drawdown ? '否决未触发' : '否决触发' },
      { id: 'veto_spyqqq', pass: k1VetoConditions[1].sharpe && k1VetoConditions[1].drawdown, detail: k1VetoConditions[1].sharpe && k1VetoConditions[1].drawdown ? '否决未触发' : '否决触发' },
    ] },
  },
  K2: {
    main: k2SchemaMain,
    halves: { '1927_1949': k2SchemaHalf1, '1950_1972': k2SchemaHalf2 },
    veto: { kf1973_1984: k2SchemaVeto, spy1999_2026: k2SchemaEtf },
    leverageByPeakSegment: segmentSchema,
    tradeDetails: {
      '1930_spring': tradeSchema(tradesBetween(mainK2.rows, '19300301', '19300630')),
      '1932_summer': tradeSchema(tradesBetween(mainK2.rows, '19320601', '19320930')),
      '1937': tradeSchema(tradesBetween(mainK2.rows, '19370101', '19381231')),
    },
    placebo: {
      N: mainEval.placebo.N, pDeltaCer: mainEval.placebo.pCer,
      pMeanDailyExcessDiff: mainEval.placebo.pMeanDaily,
      conditionalP: explorationsMain.conditionalPlacebo.p,
      conditionalValid: explorationsMain.conditionalPlacebo.valid,
    },
    decision: { grade: verdicts.K2.verdict, conditions: [
      { id: 'deltaCer_mstar', pass: k2SchemaMain.checks.deltaCerVsMstar.pass, detail: String(k2SchemaMain.deltaCerVsMstar) },
      { id: 'deltaCer_m', pass: k2SchemaMain.checks.deltaCerVsM_nonneg.pass, detail: String(k2SchemaMain.deltaCerVsM) },
      { id: 'half1', pass: k2SchemaHalf1.checks.deltaCerVsMstar_half.pass, detail: String(k2SchemaHalf1.deltaCerVsMstar) },
      { id: 'half2', pass: k2SchemaHalf2.checks.deltaCerVsMstar_half.pass, detail: String(k2SchemaHalf2.deltaCerVsMstar) },
      { id: 'maxDd', pass: k2SchemaMain.checks.maxDdVsM.pass, detail: String(k2SchemaMain.checks.maxDdVsM.value) },
      { id: 'L', pass: k2SchemaMain.checks.L.pass, detail: String(k2SchemaMain.L) },
      { id: 'placebo', pass: mainEval.placebo.pCer <= 0.1, detail: `p=${mainEval.placebo.pCer}, N=${mainEval.placebo.N}` },
      { id: 'liquidated', pass: !k2SchemaMain.liquidated, detail: String(k2SchemaMain.liquidated) },
      { id: 'concentration', pass: mainEval.segments.maxConcentration == null || mainEval.segments.maxConcentration <= 0.5, detail: `maxShare=${mainEval.segments.maxConcentration}, nEpisodes=${segmentSchema.length}, ΔCER=${k2SchemaMain.deltaCerVsM}` },
      { id: 'veto_kf1973', pass: k2VetoConditions[0].cer && k2VetoConditions[0].drawdown, detail: k2VetoConditions[0].cer && k2VetoConditions[0].drawdown ? '否决未触发' : '否决触发' },
      { id: 'veto_spy', pass: k2VetoConditions[1].cer && k2VetoConditions[1].drawdown, detail: k2VetoConditions[1].cer && k2VetoConditions[1].drawdown ? '否决未触发' : '否决触发' },
    ] },
  },
  exploratory: {
    E1: {
      main: e1Schema,
      path1929_1932: e1Schema._internal.path.filter((r, i, all) => r.date >= '19290101' && r.date <= '19321231' && (i === all.length - 1 || ym(all[i + 1].date) !== ym(r.date))).map(r => ({ date: iso(r.date), nav: r.nav, exposure: r.exposure, levered: r.leveraged })),
      liquidateIfNoRebalance: { hit: e1NoDriftSchema.liquidated, date: e1NoDriftSchema.rows.find(r => r.liquidated)?.date ? iso(e1NoDriftSchema.rows.find(r => r.liquidated).date) : null },
    },
    E2: { dd15: e2Schema[0], dd25: e2Schema[1] },
    E3: Object.fromEntries(e3Schema),
    E4: { tilt20: e4Schema[0], tilt40: e4Schema[1] },
    E5: e5Schema,
    E6: e6Schema,
  },
  report: {
    headlineAbsoluteRisk: {
      K1_volVsM: k1SchemaMain.K1.daily.vol - k1SchemaMain.M.daily.vol,
      K1_maxDdVsM: k1SchemaMain.K1.daily.maxDd - k1SchemaMain.M.daily.maxDd,
      K1_kForSameVol: k1SchemaMain.k,
      K2_maxDd: k2SchemaMain.K2.daily.maxDd,
      K2_1929_32: k2Event('19290101', '19321231'),
      K2_1937_38: k2Event('19370101', '19381231'),
    },
    knownResult1999_2026: { note: '已知结果，不是证据', full: k1SchemaEtf, events: knownEventReports },
    approx1985_1999: { K1: k1SchemaNdx, K2: k2SchemaNdx },
    costSensitivity: { cost05bps: { K1: k1SchemaMain.K1, K2: k2SchemaMain.K2 }, cost20bps: mainSensitivity },
    fundingSensitivity: { rfPlus15: { deltaCerVsMstar: k2SchemaMain.deltaCerVsMstar, deltaCerVsM: k2SchemaMain.deltaCerVsM }, rfPlus30: vetoSensitivity.K2FinanceRfPlus3, fixed6pct: vetoSensitivity.K2FinanceFixed6 },
    holm: { pK1: mainEval.k1Bootstrap.p, pK2: mainEval.placebo.pCer, adjusted: Object.fromEntries(holm.map(x => [x.id === 'K1' ? 'pK1' : 'pK2', x.holm])) },
  },
  verdict: { K1: verdicts.K1.verdict, K2: verdicts.K2.verdict, firstSentence },
}
const clean = value => JSON.parse(JSON.stringify(value, (key, x) => typeof x === 'number' ? round(x) : x))
const results = {
  meta: {
    study: 'L-049', implementation: 'independent-node', frozenClarification: 'manager msg_9948b516df69',
    annualization: 'years=(last-first)/365.2425 calendar days; A=N/years; fee and financing spread divided by A per trading day',
    monthlyReturns: 'all monthly returns compounded from daily NAV; KF monthly file only cross-checks',
    cashFallback: 'KF daily RF through 2026-09-30; last available value carried into Oct-Nov 2026',
    inputs: Object.fromEntries(['F-F_Research_Data_Factors_daily_CSV.zip', 'F-F_Research_Data_Factors_CSV.zip', '6_Portfolios_2x3_daily_CSV.zip', '6_Portfolios_2x3_CSV.zip', 'yahoo_SPY_daily.csv', 'yahoo_QQQ_daily.csv', 'yahoo_GSPC_daily.csv', 'yahoo_NDX_daily.csv', 'shiller.csv'].map(f => [f, sha(`${RAW}${f}`)])),
  },
  windows: {
    main: mainEval,
    half1: half1Eval,
    half2: half2Eval,
    vetoKf: vetoEval,
    vetoEtf: etfEval,
    reportNdx: ndxEval,
  },
  explorationsMain,
  verdicts,
  holm,
  sensitivity: { main: mainSensitivity, vetoKf: vetoSensitivity, vetoEtf: etfSensitivity },
  quality: { mainBigLoBM: qualityMain, reportNdxVsGspc: qualityNdx, etfQqqVsSpy: qualityEtf },
  detailedTrades: {
    spring1930: tradesBetween(mainK2.rows, '19300301', '19300630'),
    summer1932: tradesBetween(mainK2.rows, '19320601', '19320930'),
    year1937: tradesBetween(mainK2.rows, '19370101', '19371231'),
  },
  monthlyCrosscheck: monthlyComparison,
  edgeChecks: { ...edgeChecks, saturdayCount },
  knownEtfEvents: knownEventReports,
}
const vetoInfo = windowInfo(vetoRows)
const vetoFullSim = simulateLeverage(kf, vetoInfo.A)
const vetoDebugSim = independentLeverage(kf, vetoInfo.A, vetoRows[0].date)
const vetoStartIndex = vetoDebugSim.rows.findIndex(r => r.date === vetoRows[0].date)
const vetoFullStartIndex = vetoFullSim.rows.findIndex(r => r.date === vetoRows[0].date)
const vetoPrevious = vetoFullSim.rows[vetoFullStartIndex - 1]
const vetoPreviousNav = 1
const vetoMNav = simulateM(vetoRows, vetoInfo.A)
const vetoK2Path = vetoDebugSim.rows.slice(vetoStartIndex).filter(r => r.date <= vetoRows.at(-1).date).map(r => ({ ...r, nav: r.nav / vetoPreviousNav, initialNav: 1 }))
const vetoK2Std = std(dailyReturns(vetoK2Path))
const vetoMStd = std(dailyReturns(vetoMNav))
const vetoSignals = signalFrame(kf)
const vetoFirstSignal = vetoSignals[vetoFullStartIndex]
const vetoPreviousSignal = vetoSignals[vetoFullStartIndex - 1]
const debugVeto = {
  window: { start: iso(vetoRows[0].date), end: iso(vetoRows.at(-1).date), years: vetoInfo.years, tradingDays: vetoInfo.N, A: vetoInfo.A },
  initialPosition: { date: iso(vetoPrevious.date), nav: 1, cash: 0, debt: 0, leveraged: vetoPrevious.leveraged, exposure: vetoPrevious.leveraged ? 1.3 : 1 },
  firstFiveDays: vetoK2Path.slice(0, 5).map((r, i) => ({
    date: iso(r.date), mDailyReturn: netM(vetoRows[i], vetoInfo.A), k2Exposure: r.exposure,
    managementFeeRate: FEE / vetoInfo.A,
    financingRate: vetoRows[i].rf + FINANCE / vetoInfo.A,
    k2Nav: r.nav, mNav: vetoMNav[i].nav,
  })),
  volatilityAndMstar: { k2DailyReturnStd: vetoK2Std, mDailyReturnStd: vetoMStd, k: vetoK2Std / vetoMStd },
  firstDayState: {
    date: iso(vetoRows[0].date), leveraged: vetoK2Path[0].leveraged,
    dd: vetoFirstSignal.dd, I: vetoFirstSignal.I, sma200: vetoFirstSignal.sma,
    previousCloseState: {
      date: iso(vetoPrevious.date), leveraged: vetoPrevious.leveraged,
      dd: vetoPreviousSignal.dd, I: vetoPreviousSignal.I, sma200: vetoPreviousSignal.sma,
    },
  },
}
writeFileSync(here('./debug-veto-1973.json'), JSON.stringify(clean(debugVeto), null, 2) + '\n')
writeFileSync(here('./internal-results.json'), JSON.stringify(clean(results), null, 2) + '\n')
writeFileSync(OUT, JSON.stringify(clean(stripInternal(schemaResults)), null, 2) + '\n')
console.log(`wrote ${OUT}`)
console.log(JSON.stringify({ edgeChecks, main: { K1: mainEval.pack.K1, M: mainEval.pack.M, K2: mainEval.pack.K2, gates: mainEval.gates }, vetoKf: vetoEval.gates, quality: results.quality }, null, 2))
