// 今天几星 · A股估值表的公开数据解析与统计。
import { isTradingDay } from './market-mood-lib.mjs'
import { num, validDate, weekly } from './ths-market-lib.mjs'

const PB_MIN = 250
const CSI_SOURCE = 'csi'
const CNI_SOURCE = 'cni'
const beijingDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' })

// 中证代码、源端简称核对自 index-perf / indexCsiDsPe，深市四条核对自国证 index/running。
const csi = (group, code, csiName, { name = csiName, basis = 'pe', snapshot = false } = {}) =>
  ({ group, code, name, csiName, basis, snapshot, source: CSI_SOURCE })
const cni = (group, code, name) => ({ group, code, name, basis: 'pe', source: CNI_SOURCE })

export const INDICES = [
  csi('broad', '000016', '上证50', { snapshot: true }),
  csi('broad', '000300', '沪深300', { snapshot: true }),
  csi('broad', '000510', '中证A500'),
  csi('broad', '000905', '中证500', { snapshot: true }),
  csi('broad', '000852', '中证1000'),
  csi('broad', '932000', '中证2000'),
  cni('broad', '399006', '创业板指'),
  csi('broad', '000688', '科创50'),
  csi('broad', '000985', '中证全指'),
  csi('broad', '000001', '上证指数', { snapshot: true }),
  cni('broad', '399001', '深证成指'),
  cni('broad', '399330', '深证100'),
  csi('broad', '000906', '中证800'),
  csi('broad', '000010', '上证180', { snapshot: true }),
  csi('broad', '000009', '上证380', { snapshot: true }),
  csi('strategy', '000922', '中证红利', { snapshot: true }),
  csi('strategy', '000015', '红利指数', { name: '上证红利', snapshot: true }),
  cni('strategy', '399324', '深证红利'),
  csi('strategy', 'H30269', '红利低波'),
  csi('strategy', '930955', '红利低波100'),
  csi('strategy', '000825', '央企红利'),
  csi('strategy', '000824', '国企红利'),
  csi('strategy', '000925', '基本面50'),
  csi('strategy', '932365', '中证现金流'),
  csi('strategy', '000919', '300价值'),
  csi('industry', '000932', '800消费', { name: '中证主要消费' }),
  csi('industry', '399989', '中证医疗'),
  csi('industry', '399986', '中证银行', { basis: 'pb' }),
  csi('industry', '399975', '证券公司', { basis: 'pb' }),
  csi('industry', '399997', '中证白酒'),
  csi('industry', '930653', 'CS食品饮', { name: '中证食品饮料' }),
  csi('industry', '399971', '中证传媒'),
  csi('industry', '930651', 'CS计算机', { name: '中证计算机' }),
  csi('industry', 'H30184', '半导体', { name: '全指半导体' }),
  csi('industry', '399808', '中证新能', { name: '中证新能源' }),
  csi('industry', '930997', '新能源车'),
  csi('industry', '931151', '光伏产业'),
  csi('industry', '399967', '中证军工'),
  csi('industry', '930708', '中证有色', { name: '中证有色金属', basis: 'pb' }),
  csi('industry', '000820', '煤炭指数', { basis: 'pb' }),
  csi('industry', '000827', '中证环保'),
  csi('industry', '931775', '房地产', { name: '中证全指房地产', basis: 'pb' }),
  csi('industry', '930608', '中证基建'),
  csi('pension', '399812', '养老产业'),
]

const positive = value => {
  const n = num(value)
  return n !== null && n > 0 ? n : null
}
const ok = body => String(body?.code) === '200' && body?.success !== false

export function sourceDate(value) {
  if (typeof value !== 'string') return null
  const date = value.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3')
  return validDate(date) ? date : null
}

export function windowStart(date) {
  const start = `${Number(date.slice(0, 4)) - 10}${date.slice(4)}`
  return validDate(start) ? start : `${start.slice(0, 8)}28`
}

/** 经验百分位，返回 [0, 1]，当前值也可作为一个样本。 */
export function percentile(values, current) {
  if (!Number.isFinite(current)) return null
  let less = 0, equal = 0, count = 0
  for (const value of values) {
    if (!Number.isFinite(value)) continue
    count++
    if (value < current) less++
    else if (value === current) equal++
  }
  return count ? (less + 0.5 * equal) / count : null
}

/** 中证历史估值只含 peg（滚动 PE）。首日可能是合成点，休市日可能沿用前值。 */
export function parseCsiHistory(body, index, start, target, tradingDays) {
  if (!ok(body) || !Array.isArray(body.data)) return []
  const history = new Map()
  for (const row of body.data) {
    const date = sourceDate(row?.tradeDate)
    const pe = positive(row?.peg)
    if (row?.indexName !== index.csiName || !date || date <= start || date > target || !tradingDays.has(date) || pe === null) continue
    if (history.has(date) && history.get(date) !== pe) return []
    history.set(date, pe)
  }
  return [...history].map(([date, pe]) => [date, pe, null])
}

export function parseCsiSnapshot(body, target) {
  const snapshot = new Map()
  const data = body?.data
  if (!ok(body) || sourceDate(data?.tradeDate) !== target || !Array.isArray(data.indexValuations)) return snapshot
  for (const row of data.indexValuations) {
    if (sourceDate(row?.tradeDate) !== target || typeof row?.indexName !== 'string') continue
    if (snapshot.has(row.indexName)) return new Map()
    snapshot.set(row.indexName, { date: target, pe: positive(row.peg), pb: positive(row.pb), dp: num(row.dp) })
  }
  return snapshot
}

/** 国证逐日收盘数组第 0、5 项分别是交易日和收盘点位。 */
export function marketCloses(body, target) {
  const closes = new Map()
  if (!ok(body) || !Array.isArray(body.data?.data)) return closes
  for (const row of body.data.data) {
    if (!Array.isArray(row)) continue
    const date = sourceDate(row[0])
    const close = positive(row[5])
    if (date && date <= target && isTradingDay(date) && close !== null) closes.set(date, close)
  }
  return closes
}

/** 运行表本身无日期，以官网日期标签和同日收盘点位共同校验。 */
export function parseCniSnapshot(body, calendar, target, indices, closesByCode) {
  const snapshot = new Map()
  if (!ok(body) || !Array.isArray(body.data) || !ok(calendar) || !Number.isFinite(calendar.data)) return snapshot
  const labelDate = new Date(calendar.data)
  if (!Number.isFinite(labelDate.getTime()) || beijingDay.format(labelDate) !== target) return snapshot
  for (const index of indices) {
    const rows = body.data.filter(row => row?.indexcode === index.code && row.indexname === index.name)
    if (rows.length !== 1) continue
    const [row] = rows
    const close = closesByCode.get(index.code)?.get(target)
    if (close === undefined || positive(row.closeingPoint) !== close) continue
    snapshot.set(index.code, { date: target, pe: positive(row.peDynamic), pb: positive(row.pb), dp: null })
  }
  return snapshot
}

/** 紧凑历史格式 [交易日, PE(TTM), PB]，新观测只覆盖有值的指标。 */
export function mergeHistory(existing, incoming, target) {
  const byDate = new Map()
  for (const [date, pe, pb] of [...existing, ...incoming]) {
    if (!validDate(date) || date > target || !isTradingDay(date)) continue
    const [, oldPe, oldPb] = byDate.get(date) ?? []
    const next = [date, positive(pe) ?? oldPe ?? null, positive(pb) ?? oldPb ?? null]
    if (next[1] !== null || next[2] !== null) byDate.set(date, next)
  }
  return [...byDate.values()].sort((a, b) => a[0].localeCompare(b[0]))
}

export function valuationStatus(basis, pePct, pbPct) {
  const p = basis === 'pb' ? pbPct : pePct
  if (!Number.isFinite(p)) return null
  return p < 0.3 ? 'low' : p > 0.7 ? 'high' : 'normal'
}

export function buildRow(index, date, current, history) {
  const { pe, pb, dp } = current
  const start = windowStart(date)
  const window = history.filter(([day]) => day >= start && day <= date)
  const pePoints = window.filter(([, v]) => v !== null).map(([day, value]) => ({ date: day, value }))
  const pbPoints = window.filter(([, , v]) => v !== null).map(([day, , value]) => ({ date: day, value }))
  const peValues = pePoints.map(p => p.value)
  const pePct = percentile(peValues, pe)
  const pbPct = pbPoints.length < PB_MIN ? null : percentile(pbPoints.map(p => p.value), pb)
  const summary = points => ({ since: points[0]?.date ?? null, count: points.length })
  const sortedPe = [...peValues].sort((a, b) => a - b)
  return {
    code: index.code, name: index.name, group: index.group, basis: index.basis, source: index.source, date,
    pe, pb, dp, roe: pe !== null && pb !== null ? pb / pe : null, pePct, pbPct,
    status: valuationStatus(index.basis, pePct, pbPct),
    peHistory: summary(pePoints), pbHistory: summary(pbPoints),
    peSeries: weekly(pePoints).map(p => [p.date, p.value]),
    peRefs: [0.3, 0.7].map(p => sortedPe[Math.ceil(p * sortedPe.length) - 1] ?? null),
  }
}

/** 公开表采用同一数据日，所有预期行和字段齐全后才推进。 */
export function canPublish(publishedDate, target, indices, observations) {
  if (!validDate(target) || !isTradingDay(target) || (publishedDate && publishedDate >= target) || !indices.length) return false
  return indices.every(index => {
    const row = observations.get(index.code)
    return row?.date === target && positive(row.pe) !== null &&
      (!(index.snapshot || index.source === CNI_SOURCE) || positive(row.pb) !== null) &&
      (!index.snapshot || (Number.isFinite(row.dp) && row.dp >= 0))
  })
}
