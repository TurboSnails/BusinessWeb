// 同花顺 · 行业景气：纯解析与计算（无网络）。缺值一律 null，不补 0；带日期的源必须对上目标交易日。
// 行业口径：中证行业分类（CICS，2021-12 修订版）二级行业，估值取中证指数官网「行业市盈率」，
// 财务取东方财富业绩报表按 CICS 二级汇总（整体法），涨跌按成分股总市值汇总。
import { isTradingDay, prevTradingDay } from './market-mood-lib.mjs'
import { addDays, num, percentile, validDate, weekly } from './ths-market-lib.mjs'

/** 景气得分 = 以下四项「行业间百分位排名」的平均（本站自定）；至少 3 项有值才计算。 */
export const SCORE_ITEMS = [
  { key: 'npYoy', label: '净利润同比' },
  { key: 'revYoy', label: '营收同比' },
  { key: 'roe', label: 'ROE' },
  { key: 'ret60', label: '近 60 日涨跌幅' },
]
export const SCORE_MIN_ITEMS = 3
/** 新版 CICS 行业估值自此日起；更早为旧版十大行业口径，不可比。 */
export const CICS_FROM = '2021-12-17'
/** 业绩报表覆盖率门槛：报告期披露家数 ≥ 中证行业样本数 × 85% 才视为「最新一期」。 */
export const PERIOD_COVERAGE = 0.85
/** 倒推净资产时加权 ROE 绝对值下限（%）：更小的值两位小数舍入误差过大，不计入 ROE。 */
export const ROE_MIN_ABS = 0.5

/** 指数贡献度：四个宽基；weight = 权重来源。 */
export const CONTRIB_INDICES = [
  { code: '000300', name: '沪深300', weight: 'csi' },
  { code: '000016', name: '上证50', weight: 'csi' },
  { code: '399006', name: '创业板指', weight: 'cni' },
  { code: '000688', name: '科创50', weight: 'csi' },
]
export const TOP_N = 10

const round = (x, d = 2) => (x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d)
const ymd = (s) => (typeof s === 'string' && /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : typeof s === 'string' ? s.slice(0, 10) : null)
const pos = (x) => (x !== null && x > 0 ? x : null)

// ---------- URL ----------
const CSI = 'https://www.csindex.com.cn/csindex-home'
export const csiIndustryUrl = (date) => `${CSI}/dataServer/queryCsiPeIndustryBytradeDate?${new URLSearchParams({ tradeDate: date.replaceAll('-', ''), classType: '2' })}`
export const csiStockUrl = (date) => `${CSI}/dataServer/queryCsiPeSecurity?${new URLSearchParams({ tradeDate: date.replaceAll('-', ''), classType: '2' })}`
export const csiContribUrl = `${CSI}/data-service/mainIndexContributionPoints`
export const csiWeightUrl = (code) => `https://oss-ch.csindex.com.cn/static/html/csindex/public/uploads/file/autofile/closeweight/${code}closeweight.xls`
export const cniWeightUrl = (code, date) => `https://www.cnindex.com.cn/sample-detail/download?${new URLSearchParams({ indexcode: code, dateStr: date.slice(0, 7) })}`
export const klineUrl = (secid, end, lmt = 10) => `https://push2his.eastmoney.com/api/qt/stock/kline/get?${new URLSearchParams({ secid, klt: '101', fqt: '0', end: end.replaceAll('-', ''), lmt: String(lmt), fields1: 'f1,f2,f3', fields2: 'f51,f53' })}`

// ---------- 交易日 ----------
/** from..to 之间每周最后一个交易日（含 to 所在周截至 to）。用于种子历史的周采样。 */
export function weekEnds(from, to) {
  const out = []
  let d = to
  while (d >= from) {
    if (isTradingDay(d)) {
      out.push(d)
      const wd = new Date(`${d}T00:00:00Z`).getUTCDay() || 7 // 周一=1 … 周日=7
      d = addDays(d, -wd) // 跳到上周日，再往前找上周最后一个交易日
    } else d = addDays(d, -1)
  }
  return out.reverse()
}
/** 第 n 个之前的交易日（n=1 即 prevTradingDay）。 */
export function tradingDaysBack(date, n) {
  let d = date
  for (let i = 0; i < n; i++) d = prevTradingDay(d)
  return d
}
/** target 之前（含）最近的若干个季度末，降序。 */
export function quarterEnds(target, n = 4) {
  const out = []
  let y = Number(target.slice(0, 4)), q = Math.floor((Number(target.slice(5, 7)) - 1) / 3) // 当季之前的季度
  for (let i = 0; i < n; i++) {
    if (q === 0) { y -= 1; q = 4 }
    out.push(`${y}-${['03-31', '06-30', '09-30', '12-31'][q - 1]}`)
    q -= 1
  }
  return out
}
export const periodLabel = (p) => `${p.slice(0, 4)}年${{ '03-31': '一季报', '06-30': '中报', '09-30': '三季报', '12-31': '年报' }[p.slice(5)]}`
export const lastYear = (p) => `${Number(p.slice(0, 4)) - 1}${p.slice(4)}`

// ---------- 中证行业估值 ----------
/**
 * 中证官网行业市盈率（classType=2 中证行业）：map 键 1=静态市盈率、2=滚动市盈率、3=市净率、4=股息率。
 * 只取二级行业；tradeDate 必须等于目标日（官网对无效日期会回退到别的日期）。
 */
export function parseCsiIndustry(body, target) {
  const d = body?.data
  if (String(body?.code) !== '200' || ymd(d?.tradeDate) !== target) throw new Error(`中证行业估值日期不是 ${target}`)
  const m = d.csipeindustryMapList
  if (!m || !Array.isArray(m['2']) || !m['2'].length) throw new Error('中证行业估值为空')
  const byKey = (k) => {
    const out = new Map()
    for (const l1 of m[k] ?? []) for (const l2 of l1?.children ?? []) {
      if (String(l2?.level) !== '2' || ymd(l2?.tradeDate) !== target) continue
      out.set(String(l2.industryCode), { l2: l2, l1 })
    }
    return out
  }
  const peMap = byKey('2'), pbMap = byKey('3'), dyMap = byKey('4')
  const rows = []
  for (const [code, { l2, l1 }] of peMap) {
    rows.push({
      code, name: String(l2.industryName), l1Code: String(l1.industryCode), l1Name: String(l1.industryName),
      cons: Number.isInteger(l2.consNum) || Number.isFinite(l2.consNum) ? Math.round(l2.consNum) : null,
      loss: Number.isFinite(l2.lossNum) ? Math.round(l2.lossNum) : null,
      pe: pos(num(l2.pe)), pb: pos(num(pbMap.get(code)?.l2.pe)), dy: num(dyMap.get(code)?.l2.pe),
    })
  }
  if (rows.length < 30) throw new Error(`中证二级行业只有 ${rows.length} 个`)
  return rows.sort((a, b) => a.code.localeCompare(b.code))
}
export const historyEntry = (rows) => Object.fromEntries(rows.map(r => [r.code, [r.pe, r.pb, r.dy]]))

/** 估值分位：历史按周采样（每周最后一个有数据的交易日），近 years 年窗口内 ≤ 当前值的占比。 */
export function valuationPct(history, code, target, years, idx = 0) {
  const series = Object.keys(history).filter(d => validDate(d) && d <= target && d >= CICS_FROM).sort()
    .map(d => ({ date: d, value: history[d]?.[code]?.[idx] ?? null }))
  if (!series.length || series.at(-1).date !== target) return null
  return percentile(weekly(series), years)
}

// ---------- 个股行业映射 ----------
/** 中证官网个股行业（含 CICS 一至四级）→ Map(6 位代码 → {l1, l2Code, l2})。 */
export function parseCsiStocks(body, target) {
  const d = body?.data
  if (String(body?.code) !== '200' || ymd(d?.tradeDate) !== target || !Array.isArray(d.list)) throw new Error(`中证个股行业日期不是 ${target}`)
  const map = new Map()
  for (const r of d.list) {
    const code = String(r?.securityCode ?? '')
    if (!/^\d{6}$/.test(code) || !r.cics2ndCode) continue
    map.set(code, { l1: String(r.cics1stName), l2Code: String(r.cics2ndCode), l2: String(r.cics2ndName) })
  }
  if (map.size < 4000) throw new Error(`中证个股行业只有 ${map.size} 只`)
  return map
}

// ---------- 财务（业绩报表，整体法） ----------
/** 东财 RPT_LICO_FN_CPD：同一代码保留最新公告；只要 A 股。 */
export function parseCpd(rows, period) {
  const map = new Map()
  for (const r of rows) {
    const code = String(r?.SECURITY_CODE ?? '')
    if (!/^\d{6}$/.test(code) || ymd(r?.REPORTDATE) !== period) continue
    if (r.SECURITY_TYPE_CODE && r.SECURITY_TYPE_CODE !== '058001001') continue
    const prev = map.get(code)
    const notice = ymd(r.NOTICE_DATE) ?? ''
    if (prev && prev.notice >= notice) continue
    map.set(code, { notice, np: num(r.PARENT_NETPROFIT), rev: num(r.TOTAL_OPERATE_INCOME), roe: num(r.WEIGHTAVG_ROE) })
  }
  return map
}

/**
 * 行业财务（整体法，同口径样本）：
 * - 净利润同比 = Σ本期归母净利润 ÷ Σ上年同期归母净利润 − 1（只计两期都有值的公司；分母 ≤ 0 时不计算）
 * - 营收同比同理（营业总收入）
 * - ROE = Σ归母净利润 ÷ Σ(归母净利润 ÷ 加权ROE)，后者为按加权 ROE 倒推的加权平均归母净资产；|加权ROE| < 0.5% 的公司不计入
 */
export function industryFinance(cur, prev, stocks) {
  const acc = new Map()
  for (const [code, c] of cur) {
    const s = stocks.get(code)
    if (!s) continue
    const a = acc.get(s.l2Code) ?? { np: 0, npPrev: 0, npN: 0, rev: 0, revPrev: 0, revN: 0, roeNp: 0, roeEq: 0, roeN: 0, n: 0 }
    a.n++
    const p = prev.get(code)
    if (p && c.np !== null && p.np !== null) { a.np += c.np; a.npPrev += p.np; a.npN++ }
    if (p && c.rev !== null && p.rev !== null) { a.rev += c.rev; a.revPrev += p.rev; a.revN++ }
    if (c.np !== null && c.roe !== null && Math.abs(c.roe) >= ROE_MIN_ABS) { a.roeNp += c.np; a.roeEq += c.np / (c.roe / 100); a.roeN++ }
    acc.set(s.l2Code, a)
  }
  const out = new Map()
  for (const [code, a] of acc) {
    out.set(code, {
      npYoy: a.npN && a.npPrev > 0 ? round((a.np / a.npPrev - 1) * 100, 2) : null,
      revYoy: a.revN && a.revPrev > 0 ? round((a.rev / a.revPrev - 1) * 100, 2) : null,
      roe: a.roeN && a.roeEq > 0 ? round((a.roeNp / a.roeEq) * 100, 2) : null,
      finCount: a.n, yoyCount: a.npN, roeCount: a.roeN,
    })
  }
  return out
}

// ---------- 涨跌与排名 ----------
/**
 * 行业区间涨跌幅（%）：当前 CICS 二级成分在两日都有总市值的，Σ总市值(t) ÷ Σ总市值(基准日) − 1。
 * 用总市值而不是收盘价，送转除权不会造成假跌；期间增发、分红会带来少量偏差。成分少于 3 只返回 null。
 */
export function industryReturns(stocks, today, base) {
  const acc = new Map()
  for (const [code, s] of stocks) {
    const t = today.get(code)?.cap, b = base.get(code)?.cap
    if (!t || !b) continue
    const a = acc.get(s.l2Code) ?? { t: 0, b: 0, n: 0 }
    a.t += t; a.b += b; a.n++
    acc.set(s.l2Code, a)
  }
  return new Map([...acc].map(([k, a]) => [k, a.n >= 3 ? round((a.t / a.b - 1) * 100, 2) : null]))
}
/** 行业间百分位排名（0–100，值越大排名越高；并列取平均）。少于 2 个有效值返回空。 */
export function rankPct(values) {
  const valid = values.filter(v => v !== null && Number.isFinite(v))
  const n = valid.length
  return values.map(v => {
    if (v === null || !Number.isFinite(v) || n < 2) return null
    const less = valid.filter(x => x < v).length, eq = valid.filter(x => x === v).length - 1
    return round(((less + eq / 2) / (n - 1)) * 100, 1)
  })
}
/** 给每行加 ranks 与 score（SCORE_ITEMS 排名平均，≥ SCORE_MIN_ITEMS 项）。 */
export function scoreRows(rows) {
  const ranks = Object.fromEntries(SCORE_ITEMS.map(it => [it.key, rankPct(rows.map(r => r[it.key]))]))
  return rows.map((r, i) => {
    const rk = Object.fromEntries(SCORE_ITEMS.map(it => [it.key, ranks[it.key][i]]))
    const vals = Object.values(rk).filter(v => v !== null)
    return { ...r, ranks: rk, score: vals.length >= SCORE_MIN_ITEMS ? round(vals.reduce((a, b) => a + b, 0) / vals.length, 1) : null }
  })
}

// ---------- 指数贡献度 ----------
/** 东财 RPT_VALUEANALYSIS_DET（个股估值，带交易日）→ Map(代码 → {close, pct, floatCap, cap})，日期必须是 date。 */
export function parseDet(rows, date) {
  const map = new Map()
  for (const r of rows) {
    if (ymd(r?.TRADE_DATE) !== date) throw new Error(`个股日数据混入 ${ymd(r?.TRADE_DATE)}`)
    const code = String(r.SECURITY_CODE ?? '')
    if (/^\d{6}$/.test(code)) map.set(code, { name: String(r.SECURITY_NAME_ABBR ?? ''), close: pos(num(r.CLOSE_PRICE)), pct: num(r.CHANGE_RATE), floatCap: pos(num(r.NOTLIMITED_MARKETCAP_A)), cap: pos(num(r.TOTAL_MARKET_CAP)) })
  }
  if (map.size < 4000) throw new Error(`${date} 个股日数据只有 ${map.size} 只`)
  return map
}

const col = (head, ...names) => {
  const i = head.findIndex(h => names.some(n => h.includes(n)))
  if (i < 0) throw new Error(`权重文件缺少列 ${names[0]}`)
  return i
}
/** 中证收盘权重文件（xls 转出的 {head, rows}）：单一日期、单一指数、权重和约 100。 */
export function parseCsiWeights(sheet, indexCode) {
  const { head, rows } = sheet
  const di = col(head, '日期'), ii = col(head, '指数代码'), ci = col(head, '成份券代码'), ni = col(head, '成份券名称'), wi = col(head, '权重')
  const dates = new Set(), list = []
  for (const r of rows) {
    if (!/^\d{6}$/.test(r[ci] ?? '')) continue
    if (r[ii] !== indexCode) throw new Error(`权重文件指数代码 ${r[ii]} 不是 ${indexCode}`)
    dates.add(r[di])
    list.push({ code: r[ci], name: r[ni], weight: num(r[wi]) })
  }
  const date = dates.size === 1 ? ymd([...dates][0]) : null
  if (!validDate(date)) throw new Error(`${indexCode} 权重文件日期异常`)
  const sum = list.reduce((a, r) => a + (r.weight ?? 0), 0)
  if (!list.length || list.some(r => r.weight === null) || Math.abs(sum - 100) > 1) throw new Error(`${indexCode} 权重和 ${sum.toFixed(2)} 异常`)
  return { date, list }
}
/** 国证样本文件：全部样本代码 + 前十大权重（其余为「--」，国证官网只公开前十）。 */
export function parseCniSample(sheet) {
  const { head, rows } = sheet
  const di = col(head, '日期'), ci = col(head, '样本代码'), ni = col(head, '样本简称'), wi = col(head, '权重')
  const dates = new Set(), list = []
  for (const r of rows) {
    if (!/^\d{6}$/.test(r[ci] ?? '')) continue
    dates.add(r[di])
    list.push({ code: r[ci], name: r[ni], weight: num(r[wi]) })
  }
  const date = dates.size === 1 ? ymd([...dates][0]) : null
  if (!validDate(date)) throw new Error('国证样本文件日期异常')
  const top = list.filter(r => r.weight !== null)
  if (list.length < 50 || top.length < 5 || top.length > 20) throw new Error('国证样本文件内容异常')
  return { date, list }
}

/** 归一化到 100。 */
const normalize = (list) => {
  const s = list.reduce((a, r) => a + r.weight, 0)
  return list.map(r => ({ ...r, weight: (r.weight / s) * 100 }))
}

/**
 * 中证：基准日收盘权重按价格漂移到前一交易日：w(t−1) ∝ w(基准) × P(t−1) ÷ P(基准)。
 * 基准日或前一日缺价（停牌）的成分按基准权重不漂移。
 */
export function driftWeights(list, baseDay, prevDay) {
  if (!baseDay) return normalize(list.map(r => ({ ...r })))
  return normalize(list.map(r => {
    const b = baseDay.get(r.code)?.close, p = prevDay.get(r.code)?.close
    return { ...r, weight: b && p ? r.weight * (p / b) : r.weight }
  }))
}

/**
 * 国证：前十大为当日收盘权重，按当日涨跌幅还原到前一交易日：w(t−1) ∝ w(t) ÷ (1 + r)；
 * 其余样本按前一交易日 A 股流通市值分配剩余权重（近似：国证按自由流通市值加权，流通市值未剔除限售/大股东持股）。
 */
export function cniPrevWeights(list, today, prevDay) {
  const top = list.filter(r => r.weight !== null)
  const rest = list.filter(r => r.weight === null)
  const back = top.map(r => {
    const pct = today.get(r.code)?.pct
    return { ...r, weight: pct === null || pct === undefined ? r.weight : r.weight / (1 + pct / 100) }
  })
  // 前十大还原后的份额：Σw(t)/(1+r) ÷ [Σw(t)/(1+r) + 其余 Σw(t)/(1+r)]，其余的当日涨跌用流通市值加权平均近似
  const caps = rest.map(r => prevDay.get(r.code)?.floatCap ?? null)
  if (caps.some(c => c === null)) throw new Error('国证样本缺少前一日流通市值')
  const capSum = caps.reduce((a, b) => a + b, 0)
  const restPct = rest.reduce((a, r, i) => a + (caps[i] / capSum) * ((today.get(r.code)?.pct ?? 0) / 100), 0)
  const topToday = top.reduce((a, r) => a + r.weight, 0)
  const restBack = (100 - topToday) / (1 + restPct)
  const topBack = back.reduce((a, r) => a + r.weight, 0)
  const scale = 100 / (topBack + restBack)
  return [
    ...back.map(r => ({ ...r, weight: r.weight * scale, est: false })),
    ...rest.map((r, i) => ({ ...r, weight: (caps[i] / capSum) * restBack * scale, est: true })),
  ]
}

/** 贡献点数 = 前一交易日权重(%) × 当日涨跌幅(%) × 前一交易日指数点位 ÷ 10000。 */
export function contributions({ weights, today, prevClose, stocks }) {
  return weights.map(w => {
    const d = today.get(w.code)
    const pct = d?.pct ?? null
    return {
      code: w.code, name: d?.name || w.name, weight: round(w.weight, 3), pct: round(pct, 2),
      points: pct === null ? null : round((w.weight * pct * prevClose) / 10000, 3),
      industry: stocks.get(w.code)?.l1 ?? null, est: w.est ?? false,
    }
  })
}

/** 汇总：前 N 拉动 / 拖累、行业合计、估算总点数与实际涨跌点数的差。 */
export function summarize(rows, actual, n = TOP_N) {
  const valid = rows.filter(r => r.points !== null)
  const sum = valid.reduce((a, r) => a + r.points, 0)
  const ind = new Map()
  for (const r of valid) {
    const k = r.industry ?? '未分类'
    const a = ind.get(k) ?? { name: k, points: 0, count: 0, weight: 0 }
    a.points += r.points; a.count++; a.weight += r.weight
    ind.set(k, a)
  }
  return {
    up: valid.filter(r => r.points > 0).sort((a, b) => b.points - a.points).slice(0, n),
    down: valid.filter(r => r.points < 0).sort((a, b) => a.points - b.points).slice(0, n),
    industries: [...ind.values()].map(a => ({ ...a, points: round(a.points, 2), weight: round(a.weight, 2) })).sort((a, b) => b.points - a.points),
    estSum: round(sum, 2), residual: round(actual - sum, 2), missing: rows.length - valid.length,
    upCount: valid.filter(r => r.pct > 0).length, downCount: valid.filter(r => r.pct < 0).length,
  }
}

/** 中证官网「指数贡献」前 10（按名称）与本站估算对照，返回匹配数与最大绝对偏差。 */
export function crossCheck(official, rows) {
  if (!Array.isArray(official) || !official.length) return null
  const byName = new Map(rows.map(r => [r.name.replace(/\s/g, ''), r]))
  let matched = 0, maxDiff = 0
  for (const o of official) {
    const r = byName.get(String(o?.securityName ?? '').replace(/\s/g, ''))
    const p = num(o?.contributionPoint)
    if (!r || r.points === null || p === null) continue
    matched++
    maxDiff = Math.max(maxDiff, Math.abs(r.points - p))
  }
  return { listed: official.length, matched, maxDiff: matched ? round(maxDiff, 2) : null }
}

/** 东财日 K（f51 日期、f53 收盘）→ 升序 [{date, close}]，≤ target。 */
export function parseKline(body, target) {
  const k = body?.data?.klines
  if (!Array.isArray(k) || !k.length) throw new Error('日 K 为空')
  return k.map(s => String(s).split(',')).map(([d, c]) => ({ date: d, close: pos(num(c)) }))
    .filter(r => validDate(r.date) && r.date <= target).sort((a, b) => a.date.localeCompare(b.date))
}

/** 指数前一交易日与当日收盘：必须恰好是 prevTradingDay(target) 与 target。 */
export function closePair(series, target) {
  const last = series.at(-1), prev = series.at(-2)
  if (!last || last.date !== target || !prev || prev.date !== prevTradingDay(target) || last.close === null || prev.close === null) throw new Error(`指数收盘未覆盖 ${prevTradingDay(target)} 与 ${target}`)
  return { prevClose: prev.close, close: last.close, change: round(last.close - prev.close, 2), changePct: round((last.close / prev.close - 1) * 100, 2) }
}
