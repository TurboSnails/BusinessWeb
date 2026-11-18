// 今天几星 · 今日星级：纯解析与计算（无网络）。星级为本站自定公式，与银行螺丝钉官方星级无关。
// 缺值一律 null，不补 0；滚动统计只用当日及以前的数据（不看未来）。
import { num, validDate } from './ths-market-lib.mjs'

/** 星级参数：中心 3.45 星 = 1.0–5.9 的中点，对应「三项输入都等于各自近 10 年中位数」。 */
export const STAR = { min: 1.0, max: 5.9, center: 3.45, drop: 0.2, windowYears: 10, minYears: 3 }
/** 一星对应的对数估值幅度：估值下跌 20%（× 0.8）= ln(1 / 0.8)。 */
export const STEP = Math.log(1 / (1 - STAR.drop))
export const BANDS = [
  { min: 5, max: 5.9, label: '估值很低' },
  { min: 4, max: 4.9, label: '部分低估' },
  { min: 3, max: 3.9, label: '正常偏低' },
  { min: 2, max: 2.9, label: '偏高' },
  { min: 1, max: 1.9, label: '很高' },
]
export const bandOf = (star) => (star === null || !Number.isFinite(star) ? null : (BANDS.find(b => star >= b.min) ?? BANDS.at(-1)).label)

/**
 * 公开文章里能查到的螺丝钉星级（近似，只作对照，不用于拟合）。
 * 依据：银行螺丝钉公众号 / 雪球历年文章中提到的当日星级。
 */
export const CHECKS = [
  { date: '2015-06-12', ref: '1 星多（≈1.x）', refMin: 1, refMax: 1.9 },
  { date: '2021-02-18', ref: '≈3.7 或更低', refMin: null, refMax: 3.7 },
  { date: '2022-04-26', ref: '5 星多（≈5.x）', refMin: 5, refMax: 5.9 },
  { date: '2024-02-05', ref: '≈5.9（极低）', refMin: 5.9, refMax: 5.9 },
  { date: '2024-09-13', ref: '≈5.9（极低）', refMin: 5.9, refMax: 5.9 },
  { date: '2026-03-06', ref: '≈3.8–3.9', refMin: 3.8, refMax: 3.9 },
  { date: '2026-04-15', ref: '≈3.8–3.9', refMin: 3.8, refMax: 3.9 },
  { date: '2026-05-07', ref: '≈3.6', refMin: 3.6, refMax: 3.6 },
  { date: '2026-11-18', ref: '≈5.0（用户在小程序看到）', refMin: 5, refMax: 5 },
]

const round = (x, d = 2) => (x === null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d)
export const ymd = (s) => (typeof s === 'string' && /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : typeof s === 'string' ? s.slice(0, 10) : null)
export const addYears = (date, n) => {
  const y = Number(date.slice(0, 4)) + n
  const md = date.slice(5) === '02-29' ? '02-28' : date.slice(5)
  return `${y}-${md}`
}

/**
 * 中证官网 index-perf 全历史：peg = 滚动市盈率。去掉周末与节假日复制行（收盘与成交量都和前一行相同），
 * PE ≤ 0 视为缺失。不检查目标日（由调用方判断数据日）。
 */
export function parsePerfSeries(body) {
  const rows = body?.data
  if (String(body?.code) !== '200' || !Array.isArray(rows) || !rows.length) throw new Error('中证指数行情为空')
  const out = []
  for (const r of rows) {
    const date = ymd(r?.tradeDate)
    if (!validDate(date)) continue
    const wd = new Date(`${date}T00:00:00Z`).getUTCDay()
    if (wd === 0 || wd === 6) continue
    const close = num(r.close), pe = num(r.peg), vol = num(r.tradingVol)
    const prev = out.at(-1)
    if (prev && (prev.date >= date || (prev.close === close && prev.vol === vol))) continue
    out.push({ date, close, pe: pe !== null && pe > 0 ? pe : null, amount: num(r.tradingValue), vol })
  }
  return out.map(({ vol, ...r }) => r)
}

/** 中证官网板块 PB 最早可查日（更早的日期接口无数据）。 */
export const MV_FROM = '2014-01-02'
export const mvUrl = (date) => `https://www.csindex.com.cn/csindex-home/dataServer/queryCsiPeIndustryBytradeDate?tradeDate=${date.replaceAll('-', '')}&classType=3`
/**
 * 中证官网「行业市盈率」板块口径（classType=3）：沪深市场整体的 1 静态 PE、2 滚动 PE、3 PB、4 股息率。
 * 返回 { status: 'ok', pb, pe, dp } / 'pending'（当日行存在但数值为空，尚未发布）/ 'other-day'（接口回落到别的日期 = 该日无数据）。
 */
export function parseMarketVal(body, date) {
  const d = body?.data
  if (String(body?.code) !== '200' || !d) return { status: 'error' }
  if (ymd(d.tradeDate) !== date) return { status: 'other-day' }
  const m = d.csipeindustryMapList ?? {}
  const pick = (k) => { const row = Array.isArray(m[k]) ? m[k].find(r => r?.industryName === '沪深市场') ?? m[k][0] : null; return row ? num(row.pe) : null }
  const pb = pick('3'), pe = pick('2'), dp = pick('4')
  if (pb === null || pb <= 0) return { status: 'pending' }
  return { status: 'ok', pb, pe: pe !== null && pe > 0 ? pe : null, dp }
}

/** 东财 RPTA_WEB_TREASURYYIELD → Map(date → 10 年期国债收益率 %)，只收有限值。 */
export function treasuryMap(rows) {
  const m = new Map()
  for (const r of rows) {
    const date = ymd(r?.SOLAR_DATE), y = num(r?.EMM00166466)
    if (validDate(date) && y !== null && !m.has(date)) m.set(date, y)
  }
  return m
}

/** 统一的分位定义：(低于 x 的个数 + 0.5 × 等于 x 的个数) / n × 100。sorted 为升序数组。 */
export function pctRankSorted(sorted, x) {
  const lo = lowerBound(sorted, x), hi = upperBound(sorted, x)
  return sorted.length ? ((lo + 0.5 * (hi - lo)) / sorted.length) * 100 : null
}
export const pctRank = (values, x) => pctRankSorted([...values].sort((a, b) => a - b), x)
function lowerBound(a, x) { let l = 0, h = a.length; while (l < h) { const m = (l + h) >> 1; if (a[m] < x) l = m + 1; else h = m } return l }
function upperBound(a, x) { let l = 0, h = a.length; while (l < h) { const m = (l + h) >> 1; if (a[m] <= x) l = m + 1; else h = m } return l }
const median = (s) => (s.length % 2 ? s[(s.length - 1) >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2)

/**
 * 滚动统计：series 为升序 [{date, v}]（v 可为 null）。对每个有值的日子，窗口 = (date − years, date] 内的有值样本；
 * 序列首个有值日早于 date − minYears 才算历史够长，否则 null。返回与 series 等长的数组 {median, pct, start, n} | null。
 */
export function rolling(series, years = STAR.windowYears, minYears = STAR.minYears) {
  const first = series.find(p => p.v !== null)?.date ?? null
  const sorted = []
  const out = []
  let head = 0
  for (let i = 0; i < series.length; i++) {
    const p = series[i]
    if (p.v !== null) sorted.splice(upperBound(sorted, p.v), 0, p.v)
    const start = addYears(p.date, -years)
    while (head <= i && series[head].date <= start) {
      const v = series[head].v
      if (v !== null) sorted.splice(lowerBound(sorted, v), 1)
      head++
    }
    if (p.v === null || first === null || first > addYears(p.date, -minYears)) { out.push(null); continue }
    let s = head
    while (series[s].v === null) s++
    out.push({ median: median(sorted), pct: pctRankSorted(sorted, p.v), start: series[s].date, n: sorted.length })
  }
  return out
}

/**
 * 逐日计算星级。perf = parsePerfSeries 结果；pb = { date: pb | null }；y10 = treasuryMap。
 * 股债性价比 erp = 100 / PE − 10 年国债收益率（百分点）。
 * 三个分项星（相对各自近 10 年中位数）：
 *   PE、PB：ln(中位数 / 当前) / ln(1.25)，即估值比中位数低 20% 记 +1 星；
 *   股债性价比：(当前 − 中位数) / (0.25 × 100 / PE 中位数)，即 PE 下跌 20% 带来的盈利收益率增量记 +1 星。
 * 星级 = clamp(3.45 + 分项均值, 1.0, 5.9)，保留 1 位小数。某项历史一旦够长（≥ 3 年）就必须参与，当天缺该项则星级为 null。
 */
export function buildStarRows({ perf, pb, y10 }) {
  // PB 接口明确「该日无数据」（记为 null）的日子是行情表里的节假日残行，整天去掉
  const days = perf.filter(r => !(r.date >= MV_FROM && pb[r.date] === null) && (r.pe !== null || pb[r.date] != null))
  const peS = days.map(r => ({ date: r.date, v: r.pe }))
  const pbS = days.map(r => ({ date: r.date, v: pb[r.date] ?? null }))
  const erpS = days.map(r => ({ date: r.date, v: r.pe !== null && y10.has(r.date) ? 100 / r.pe - y10.get(r.date) : null }))
  const [rPe, rPb, rErp] = [rolling(peS), rolling(pbS), rolling(erpS)]
  const firstReady = (r) => { const i = r.findIndex(Boolean); return i < 0 ? null : days[i].date }
  const ready = { pe: firstReady(rPe), pb: firstReady(rPb), erp: firstReady(rErp) }
  return days.map((d, i) => {
    const sPe = rPe[i] ? Math.log(rPe[i].median / d.pe) / STEP : null
    const sPb = rPb[i] ? Math.log(rPb[i].median / pbS[i].v) / STEP : null
    const sErp = rErp[i] && rPe[i] ? (erpS[i].v - rErp[i].median) / (0.25 * 100 / rPe[i].median) : null
    const need = [['pe', sPe], ['pb', sPb], ['erp', sErp]].filter(([k]) => ready[k] !== null && d.date >= ready[k])
    const ok = need.length >= 2 && need.some(([k]) => k === 'pe') && need.every(([, s]) => s !== null)
    const raw = ok ? STAR.center + need.reduce((a, [, s]) => a + s, 0) / need.length : null
    const star = raw === null ? null : round(Math.min(STAR.max, Math.max(STAR.min, raw)), 1)
    return {
      date: d.date, close: d.close, pe: d.pe, pb: pbS[i].v, y10: y10.get(d.date) ?? null, erp: round(erpS[i].v, 4),
      sPe: round(sPe, 3), sPb: round(sPb, 3), sErp: round(sErp, 3), raw: round(raw, 3), star, inputs: ok ? need.map(([k]) => k) : [],
      stats: { pe: rPe[i], pb: rPb[i], erp: rErp[i] },
    }
  })
}

/** 数据日：不晚于 candidate、PE / PB / 10 年国债三项当日都有、星级可算的最后一个交易日。 */
export function pickAsOf(rows, candidate) {
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i]
    if (r.date > candidate) continue
    if (r.pe !== null && r.pb !== null && r.y10 !== null && r.star !== null && r.inputs.length === 3) return i
  }
  return -1
}

/** 每周最后一个交易日采样（按 ISO 周：周一为起点）。 */
export function weeklyRows(rows) {
  const out = []
  const key = (d) => { const t = Date.parse(`${d}T00:00:00Z`); const wd = (new Date(t).getUTCDay() + 6) % 7; return new Date(t - wd * 864e5).toISOString().slice(0, 10) }
  for (const r of rows) { if (out.length && key(out.at(-1).date) === key(r.date)) out[out.length - 1] = r; else out.push(r) }
  return out
}

const inputOut = (value, st, digits) => ({
  value: round(value, digits), median: st ? round(st.median, digits) : null, pct: st ? round(st.pct, 1) : null,
  start: st?.start ?? null, n: st?.n ?? 0,
})

/** 组装页面文件（不含 generatedAt / sources，由脚本补）。idx = pickAsOf 结果。 */
export function buildStarData(rows, idx) {
  const r = rows[idx]
  const prev = rows[idx - 1] ?? null
  const kept = rows.slice(0, idx + 1)
  const first = kept.findIndex(x => x.star !== null)
  const history = kept.slice(first).map(x => [x.date, x.star])
  const checks = CHECKS.map(c => {
    const row = kept.find(x => x.date === c.date) ?? null
    return { ...c, star: row?.star ?? null, band: bandOf(row?.star ?? null), pe: row?.pe ?? null, pb: row?.pb ?? null, erp: row?.erp ?? null }
  })
  const pbStart = rows.find(x => x.pb !== null)?.date ?? null
  return {
    version: 1, asOf: r.date, prevDate: prev?.date ?? null,
    star: r.star, raw: r.raw, band: bandOf(r.star), prevStar: prev?.star ?? null,
    change: prev?.star == null ? null : round(r.star - prev.star, 1),
    inputs: {
      pe: { ...inputOut(r.pe, r.stats.pe, 2), sub: r.sPe },
      pb: { ...inputOut(r.pb, r.stats.pb, 2), sub: r.sPb },
      erp: { ...inputOut(r.erp, r.stats.erp, 2), sub: r.sErp, y10: r.y10, ey: round(100 / r.pe, 2) },
    },
    params: { ...STAR, step: round(STEP, 4) },
    bands: BANDS,
    since: { star: history[0]?.[0] ?? null, pe: rows.find(x => x.pe !== null)?.date ?? null, pb: pbStart, threeInputs: kept.find(x => x.inputs.length === 3)?.date ?? null },
    history,
    inputsWeekly: weeklyRows(kept.slice(first)).map(x => [x.date, x.pe, x.pb, x.erp]),
    checks,
  }
}

// 按 classType=2 的一级节点接续。旧版 06「金融地产」含房地产业，新版 40、60 单列。
export const NEUTRAL_INDUSTRIES = [
  ['10', '00', '能源'],
  ['15', '01', '原材料'],
  ['20', '02', '工业'],
  ['25', '03', '可选消费'],
  ['30', '04', '主要消费'],
  ['35', '05', '医药卫生'],
  ['45', '07', '信息技术'],
  ['50', '08', '通信服务'],
  ['55', '09', '公用事业'],
].map(([code, oldCode, name]) => ({ code, oldCode, name }))

const positive = value => {
  const n = num(value)
  return n !== null && n > 0 ? n : null
}

/** 同日、两张估值表均已发布时才接受。只读一级，且仅保留明确纳入的行业。 */
export function parseNeutralIndustry(body, date) {
  const data = body?.data
  if (String(body?.code) !== '200' || ymd(data?.tradeDate) !== date) return null
  const map = data.csipeindustryMapList
  if (!Array.isArray(map?.['2']) || !map['2'].length || !Array.isArray(map?.['3']) || !map['3'].length) return null
  const levelOne = rows => new Map(rows.filter(r => String(r?.level) === '1').map(r => [String(r.industryCode), positive(r.pe)]))
  const pe = levelOne(map['2']), pb = levelOne(map['3'])
  const values = {}
  for (const { code, oldCode } of NEUTRAL_INDUSTRIES) {
    const p = pe.get(code) ?? pe.get(oldCode) ?? null
    const b = pb.get(code) ?? pb.get(oldCode) ?? null
    if (p !== null || b !== null) values[code] = [p, b]
  }
  return Object.keys(values).length ? values : null
}

export function applyNeutralIndustry(store, date, body) {
  const values = parseNeutralIndustry(body, date)
  if (!values) return false
  store[date] = values
  return true
}

export function planNeutralIndustryDates(store, candidate, priorTradingDates, backfill = false) {
  const previous = priorTradingDates.filter(date => date < candidate)
  const weekly = backfill ? weeklyRows(previous.map(date => ({ date }))).map(row => row.date) : []
  const dates = [candidate, ...previous.slice(-10).reverse(), ...weekly, ...(backfill ? CHECKS.map(c => c.date) : [])]
  return [...new Set(dates)].filter(date => date >= MV_FROM && date <= candidate && !Object.keys(store[date] ?? {}).length)
}

export function neutralScore(industries) {
  const used = industries.filter(r => r.cheapness !== null)
  if (!used.length) return { count: 0, cheapness: null, raw: null, star: null }
  const cheapness = used.reduce((sum, r) => sum + r.cheapness, 0) / used.length
  const raw = 1 + 4.9 * cheapness
  return { count: used.length, cheapness, raw, star: round(raw, 1) }
}

/** 只取截至目标日的周末样本。本周以目标日为止的最新一笔为准，因此对照日也可独立计算。 */
export function buildNeutralRow(rows, target) {
  const current = rows.find(row => row.date === target)
  if (!current) return null
  const window = weeklyRows(rows.filter(row => row.date > addYears(target, -STAR.windowYears) && row.date <= target))
  const statistic = (code, index, value) => {
    const samples = window.flatMap(({ date, values }) => {
      const sample = values[code]?.[index]
      return sample != null ? [{ date, sample }] : []
    })
    return { value, pct: value === null ? null : pctRank(samples.map(s => s.sample), value), start: samples[0]?.date ?? null, n: samples.length }
  }
  const industries = NEUTRAL_INDUSTRIES.map(industry => {
    const [pe, pb] = current.values[industry.code] ?? [null, null]
    const peStat = statistic(industry.code, 0, pe)
    const pbStat = statistic(industry.code, 1, pb)
    const cheapness = peStat.pct === null || pbStat.pct === null ? null : 1 - (peStat.pct + pbStat.pct) / 200
    return { ...industry, pe: peStat, pb: pbStat, cheapness }
  })
  return { date: target, ...neutralScore(industries), industries }
}

export function buildNeutralData(store, candidate, previousTradingDate) {
  const rows = Object.entries(store)
    .filter(([date, values]) => date >= MV_FROM && date <= candidate && Object.keys(values ?? {}).length)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => ({ date, values }))
  const eligible = rows.filter(({ values }) => Object.values(values).some(([pe, pb]) => pe !== null && pb !== null))
  const history = weeklyRows(eligible).map(({ date }) => {
    const { star, count } = buildNeutralRow(rows, date)
    return [date, star, count]
  })
  const asOf = history.at(-1)?.[0]
  if (!asOf) return null
  const current = buildNeutralRow(rows, asOf)
  const prevDate = previousTradingDate(asOf)
  const prevStar = buildNeutralRow(rows, prevDate)?.star ?? null
  return {
    asOf, star: current.star, raw: current.raw, cheapness: current.cheapness, count: current.count,
    band: bandOf(current.star), prevDate, prevStar, change: prevStar === null ? null : round(current.star - prevStar, 1),
    industries: current.industries, history,
    checks: CHECKS.map(({ date }) => ({ date, star: buildNeutralRow(rows, date)?.star ?? null })),
  }
}
