// 今天几星 · A股估值表的公开数据解析与统计。
import { isTradingDay } from './market-mood-lib.mjs'
import { addDays, num, validDate, weekly } from './ths-market-lib.mjs'

export const PB_MIN = 250
/** PE 分位 / 估值状态最少样本（与 PB 门槛一致）。 */
export const PE_MIN = 250
const CSI_SOURCE = 'csi'
const CNI_SOURCE = 'cni'
const beijingDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' })

/**
 * PB 判定行没有指数级逐日 PB，改用中证官网「行业市盈率」classType=2 的行业 PB。
 * codes 按优先级：先新版 CICS，再旧版；命中任一即取。接续日见 CICS_SPLICE。
 */
export const CICS_SPLICE = '2021-12-10'
export const PB_INDUSTRY = {
  '399986': {
    name: '银行', codes: ['4010', '0601'], since: '2014-01-02',
    labels: { '4010': '银行', '0601': '银行' },
  },
  '399975': {
    name: '证券公司', codes: ['403010', '06030102'], since: '2016-12-16',
    labels: { '403010': '证券公司', '06030102': '投资银行业与经纪业' },
  },
  '931775': {
    name: '房地产', codes: ['6010', '0605'], since: '2016-12-16',
    labels: { '6010': '房地产', '0605': '房地产' },
  },
  '930708': {
    name: '有色金属', codes: ['1520', '010105'], since: '2014-01-02',
    labels: { '1520': '有色金属', '010105': '有色金属' },
  },
  '000820': {
    name: '煤炭', codes: ['101030', '000103'], since: '2016-12-16',
    labels: { '101030': '煤炭', '000103': '煤炭' },
  },
}
/** 行业市盈率接口可查的最早交易日（与今日星级板块 PB 同源）。 */
export const INDUSTRY_PB_FROM = '2014-01-02'
export const industryPbUrl = (date) =>
  `https://www.csindex.com.cn/csindex-home/dataServer/queryCsiPeIndustryBytradeDate?tradeDate=${date.replaceAll('-', '')}&classType=2`

/** 库存槽是否已有任一行业 PB（>0）。空 `{}` 不算有数据。 */
export function industrySlotHasData(slot) {
  if (!slot || typeof slot !== 'object') return false
  return Object.values(slot).some(v => v && Number.isFinite(v.pb) && v.pb > 0)
}

/**
 * 该日是否已查询、不必再抓。
 * emptyCounts=true（默认，用于更早的 rebuild 缺口）：有键即算已查（含休市回退写成的 `{}`）。
 * emptyCounts=false（目标日 + 近 N 日）：空槽不算已查，便于早班未发布后晚班重抓（B1'）。
 */
export function industryDateQueried(store, date, { emptyCounts = true } = {}) {
  if (!Object.prototype.hasOwnProperty.call(store?.byDate ?? {}, date)) return false
  if (!emptyCounts && !industrySlotHasData(store.byDate[date])) return false
  return true
}

/**
 * 根据一次行业接口响应决定库存动作（纯函数；调用方写入 byDate）。
 * - wrote：解析出行业，返回 slot 片段（与已有槽合并）
 * - holiday：code 200 且 tradeDate ≠ 请求日（回退＝休市）→ 记 `{}`
 * - pending：code 200 且 tradeDate = 请求日但列表空（未发布）→ 不写，下次重抓
 * - skip：其他
 */
export function decideIndustryFetchResult(date, body) {
  const parsed = parseIndustryPb(body, date)
  if (parsed.size) {
    const slot = {}
    for (const [code, value] of parsed) {
      slot[code] = {
        pb: value.pb, dp: value.dp, industryCode: value.industryCode, industryName: value.industryName,
      }
    }
    return { action: 'wrote', slot, parsed: parsed.size }
  }
  if (String(body?.code) === '200') {
    const got = sourceDate(body?.data?.tradeDate)
    if (got && got !== date) return { action: 'holiday', slot: {}, parsed: 0 }
    return { action: 'pending', slot: null, parsed: 0 }
  }
  return { action: 'skip', slot: null, parsed: 0 }
}

/** 将 decideIndustryFetchResult 结果落到 store（原地），返回 action。 */
export function applyIndustryFetchResult(store, date, body) {
  const result = decideIndustryFetchResult(date, body)
  if (result.action === 'wrote') {
    store.byDate[date] = { ...(store.byDate[date] ?? {}), ...result.slot }
  } else if (result.action === 'holiday') {
    store.byDate[date] = store.byDate[date] ?? {}
  }
  return result
}

/**
 * 决定要抓的行业 PB 日期：目标日优先（降序）。
 * daily：只补目标日 + 近 recent 个交易日中尚未查询的（近窗空槽会重抓）。
 * extra：rebuild 时并入的周采样缺口等（空 `{}` 仍算已查）。
 */
export function planIndustryFetch(store, target, { recent = 10, extra = [] } = {}) {
  const needed = new Set()
  if (validDate(target) && isTradingDay(target) && !industryDateQueried(store, target, { emptyCounts: false })) {
    needed.add(target)
  }
  let d = target
  for (let i = 0; i < recent; i++) {
    d = addDays(d, -1)
    if (isTradingDay(d) && !industryDateQueried(store, d, { emptyCounts: false })) needed.add(d)
  }
  for (const day of extra) {
    if (validDate(day) && !industryDateQueried(store, day, { emptyCounts: true })) needed.add(day)
  }
  return [...needed].sort((a, b) => b.localeCompare(a))
}

// 中证代码、源端简称核对自 index-perf / indexCsiDsPe，深市四条核对自国证 index/running。
const csi = (group, code, csiName, { name = csiName, basis = 'pe', snapshot = false } = {}) =>
  ({ group, code, name, csiName, basis, snapshot, source: CSI_SOURCE, pbIndustry: PB_INDUSTRY[code] ?? null })
const cni = (group, code, name) => ({ group, code, name, basis: 'pe', source: CNI_SOURCE, pbIndustry: null })

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

const ymd = (s) => {
  if (typeof s !== 'string') return null
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
  return validDate(s.slice(0, 10)) ? s.slice(0, 10) : null
}

/** 在行业树中按 codes 优先级取 PB / 股息率；map 键 3=市净率、4=股息率。 */
export function pickIndustryMetrics(nodes, codes, metricKey = '3') {
  const want = new Set(codes.map(String))
  let hit = null
  const walk = list => {
    for (const node of list ?? []) {
      if (want.has(String(node?.industryCode))) {
        const value = metricKey === '3' ? positive(node.pe) : num(node.pe)
        if (value !== null && (metricKey !== '3' || value > 0)) {
          hit = { code: String(node.industryCode), name: String(node.industryName ?? ''), value }
          return true
        }
      }
      if (walk(node?.children)) return true
    }
    return false
  }
  walk(nodes)
  return hit
}

/**
 * 解析 classType=2 行业市盈率。返回 Map(指数代码 → {pb, dp, industryCode, industryName})；
 * 日期必须等于 target（官网对无效日会回退）。
 */
export function parseIndustryPb(body, target, proxies = PB_INDUSTRY) {
  const out = new Map()
  const data = body?.data
  if (String(body?.code) !== '200' || ymd(data?.tradeDate) !== target) return out
  const pbTree = data?.csipeindustryMapList?.['3']
  const dpTree = data?.csipeindustryMapList?.['4']
  if (!Array.isArray(pbTree) || !pbTree.length) return out
  for (const [indexCode, proxy] of Object.entries(proxies)) {
    const pb = pickIndustryMetrics(pbTree, proxy.codes, '3')
    if (!pb) continue
    const dpHit = pickIndustryMetrics(dpTree, [pb.code, ...proxy.codes], '4')
    out.set(indexCode, {
      pb: pb.value,
      dp: dpHit && Number.isFinite(dpHit.value) && dpHit.value >= 0 ? dpHit.value : null,
      industryCode: pb.code,
      industryName: pb.name || proxy.name,
    })
  }
  return out
}

export function buildRow(index, date, current, history) {
  const { pe, pb, dp } = current
  const start = windowStart(date)
  const window = history.filter(([day]) => day >= start && day <= date)
  const pePoints = window.filter(([, v]) => v !== null).map(([day, value]) => ({ date: day, value }))
  const pbPoints = window.filter(([, , v]) => v !== null).map(([day, , value]) => ({ date: day, value }))
  const industry = index.pbIndustry
  // 行业 PB：分位与曲线统一用周采样，避免日后日度点权重漂移（I5）
  const pbSample = industry ? weekly(pbPoints) : pbPoints
  const peValues = pePoints.map(p => p.value)
  const pbValues = pbSample.map(p => p.value)
  const pePct = pePoints.length < PE_MIN ? null : percentile(peValues, pe)
  const pbPct = pbSample.length < PB_MIN ? null : percentile(pbValues, pb)
  const summary = points => ({ since: points[0]?.date ?? null, count: points.length })
  const sortedPe = [...peValues].sort((a, b) => a - b)
  const sortedPb = [...pbValues].sort((a, b) => a - b)
  const peSeries = weekly(pePoints).map(p => [p.date, p.value])
  const pbSeries = weekly(pbPoints).map(p => [p.date, p.value])
  const refsOf = sorted => [0.3, 0.7].map(p => sorted[Math.ceil(p * sorted.length) - 1] ?? null)
  return {
    code: index.code, name: index.name, group: index.group, basis: index.basis, source: index.source, date,
    pe, pb,
    // 行业替代 PB 不混填股息率；ROE 也不用行业 PB÷指数 PE（I2）
    dp: industry ? null : dp,
    roe: industry || pe === null || pb === null ? null : pb / pe,
    pePct, pbPct,
    status: valuationStatus(index.basis, pePct, pbPct),
    peHistory: summary(pePoints),
    pbHistory: summary(pbSample),
    peSeries, pbSeries,
    peRefs: refsOf(sortedPe),
    pbRefs: refsOf(sortedPb),
    pbKind: industry ? 'industry' : 'index',
    pbIndustry: industry ? { code: current.industryCode ?? industry.codes[0], name: current.industryName ?? industry.name } : null,
  }
}

/** 主表去掉周线序列，留给懒加载 hist 文件。 */
export function slimRow(row) {
  const { peSeries: _pe, pbSeries: _pb, ...rest } = row
  return { ...rest, peSeries: [] }
}

export function histPayload(row) {
  return {
    code: row.code, asOf: row.date,
    peSeries: row.peSeries, pbSeries: row.pbSeries ?? [],
    peRefs: row.peRefs, pbRefs: row.pbRefs ?? [null, null],
  }
}

/** 公开表采用同一数据日，所有预期行和字段齐全后才推进。 */
export function canPublish(publishedDate, target, indices, observations) {
  if (!validDate(target) || !isTradingDay(target) || (publishedDate && publishedDate >= target) || !indices.length) return false
  return indices.every(index => {
    const row = observations.get(index.code)
    const needsPb = index.snapshot || index.source === CNI_SOURCE || index.basis === 'pb' || !!index.pbIndustry
    return row?.date === target && positive(row.pe) !== null &&
      (!needsPb || positive(row.pb) !== null) &&
      (!index.snapshot || (Number.isFinite(row.dp) && row.dp >= 0))
  })
}
