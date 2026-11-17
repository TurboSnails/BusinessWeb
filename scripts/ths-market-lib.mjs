// 同花顺 · 市场：纯解析与计算（无网络）。缺值一律 null，不补 0；带日期的源必须对上目标交易日。
import { isTradingDay, prevTradingDay } from './market-mood-lib.mjs'

/** 估值分区阈值：PE(TTM) 历史分位 ≥ 80% 危险、≤ 20% 机会，其余合理。 */
export const DANGER = 80
export const CHANCE = 20

// 九个估值对象：七个中证/上证指数取中证指数官网；深证成指、创业板指非中证编制，改用东财「市场估值」的板块整体 PE。
export const INDICES = [
  { code: '000001', name: '上证指数', source: 'csi', valName: '上证指数' },
  { code: '000016', name: '上证50', source: 'csi', valName: '上证50' },
  { code: '000300', name: '沪深300', source: 'csi', valName: '沪深300' },
  { code: '000905', name: '中证500', source: 'csi', valName: '中证500' },
  { code: '000852', name: '中证1000', source: 'csi', valName: null },
  { code: '000688', name: '科创50', source: 'csi', valName: null },
  { code: '000922', name: '中证红利', source: 'csi', valName: '中证红利' },
  { code: '399001', name: '深市主板（整体）', source: 'board', valName: null },
  { code: '399006', name: '创业板（整体）', source: 'board', valName: null },
]
/** 风格对比：分子 / 分母，比值上升 = 分子相对更强。 */
export const STYLE_PAIRS = [
  { id: 'size', label: '大盘 vs 小盘', num: { code: '000300', name: '沪深300' }, den: { code: '000852', name: '中证1000' } },
  { id: 'size2000', label: '大盘 vs 微盘', num: { code: '000300', name: '沪深300' }, den: { code: '932000', name: '中证2000' } },
  { id: 'growth', label: '成长 vs 价值', num: { code: '000918', name: '300成长' }, den: { code: '000919', name: '300价值' } },
]

export const validDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s
export const num = (x) => (typeof x !== 'number' && typeof x !== 'string') || String(x).trim() === '' || String(x).trim() === '-' || !Number.isFinite(Number(x)) ? null : Number(x)
const round = (x, d = 2) => (x === null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d)
const ymd = (s) => (typeof s === 'string' && /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : typeof s === 'string' ? s.slice(0, 10) : null)
export const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10)
const addYears = (date, n) => `${Number(date.slice(0, 4)) + n}${date.slice(4)}`
export function monthsBack(date, n) {
  const y = Number(date.slice(0, 4)), m = Number(date.slice(5, 7)) - 1 - n
  const d = new Date(Date.UTC(y, m, 1))
  return d.toISOString().slice(0, 7)
}
export function monthList(date, n = 12) {
  return Array.from({ length: n }, (_, i) => monthsBack(date, n - 1 - i))
}

// ---------- URL ----------
export const CSI = 'https://www.csindex.com.cn/csindex-home'
export const csiPerfUrl = (code, start, end) => `${CSI}/perf/index-perf?indexCode=${code}&startDate=${start.replaceAll('-', '')}&endDate=${end.replaceAll('-', '')}`
export const csiValUrl = `${CSI}/data-service/indexValuation`
export const EM = 'https://datacenter-web.eastmoney.com/api/data/v1/get'
export const emUrl = (params) => `${EM}?${new URLSearchParams({ columns: 'ALL', source: 'WEB', client: 'WEB', ...params })}`
export const fundUrl = (page, size) => `https://fund.eastmoney.com/data/FundNewIssue.aspx?t=xcln&sort=jzrgq,desc&y=&page=${page},${size}&isbuy=0`

/**
 * 东财数据中心分页取全：fetchPage(page) 返回接口原始 body。只有第 1 页可以「无数据」（code 9201，确实没有记录）；
 * 第 2 页起再无数据说明翻页途中数据变化或接口抖动，抛错（整批放弃，保留上一份文件）。取完后行数必须等于报表给出的 count。
 */
export async function emPaginate(fetchPage, label, maxPages = 40) {
  const out = []
  let count = null, pages = null
  for (let page = 1; page <= maxPages; page++) {
    const body = await fetchPage(page)
    if (body?.code === 9201 || (body?.success === false && /数据/.test(body?.message ?? ''))) {
      if (page === 1) return out
      throw new Error(`东财 ${label} 第 ${page} 页无数据（已取 ${out.length}/${count}）`)
    }
    if (!body?.success || !Array.isArray(body?.result?.data)) throw new Error(`东财 ${label} 返回异常：${body?.message}`)
    count ??= body.result.count
    pages ??= body.result.pages
    out.push(...body.result.data)
    if (page >= pages) {
      if (!Number.isInteger(count) || out.length !== count) throw new Error(`东财 ${label} 行数不完整（${out.length}/${count}）`)
      return out
    }
  }
  throw new Error(`东财 ${label} 页数超过上限`)
}

// ---------- 估值 ----------
/** 中证官网 index-perf：peg 字段 = 滚动市盈率（官网前端文案「PETTM:滚动市盈率」）。过滤周末与节假日重复行。 */
export function parseCsiPerf(body, target) {
  const rows = body?.data
  if (String(body?.code) !== '200' || !Array.isArray(rows) || !rows.length) throw new Error('中证指数行情为空')
  const out = []
  for (const r of rows) {
    const date = ymd(r?.tradeDate)
    if (!validDate(date) || date > target) continue
    const wd = new Date(`${date}T00:00:00Z`).getUTCDay()
    if (wd === 0 || wd === 6 || !isTradingDay(date)) continue
    const close = num(r.close), pe = num(r.peg)
    const prev = out.at(-1)
    if (prev && (prev.date >= date || (prev.close === close && prev.vol === num(r.tradingVol)))) continue // 乱序或节假日复制行
    out.push({ date, close, pe: pe !== null && pe > 0 ? pe : null, vol: num(r.tradingVol) })
  }
  if (!out.length || out.at(-1).date !== target || out.at(-1).close === null) throw new Error(`中证指数行情未更新到 ${target}`)
  return out.map(({ vol, ...r }) => r)
}

/** 估值快照里必须出现的指数名（INDICES 中配置了 valName 的全部指数）。 */
export const VAL_NAMES = INDICES.filter(i => i.valName).map(i => i.valName)
/**
 * 中证官网 indexValuation：当日快照，含静态 PE、滚动 PE(peg)、PB、股息率。tradeDate 必须是目标日，
 * 且 expected 里的指数都要有当日行——缺任何一个视为未发全（抛错，整批放弃），不能用缺项快照覆盖 PB / 股息率和 PB 历史。
 */
export function parseCsiValuation(body, target, expected = VAL_NAMES) {
  const d = body?.data
  if (String(body?.code) !== '200' || ymd(d?.tradeDate) !== target || !Array.isArray(d.indexValuations)) throw new Error(`中证估值快照日期不是 ${target}`)
  const map = {}
  for (const r of d.indexValuations) {
    if (ymd(r?.tradeDate) !== target || typeof r.indexName !== 'string') continue
    map[r.indexName] = { peTtm: num(r.peg), pb: num(r.pb), dp: num(r.dp) }
  }
  const missing = expected.filter(n => !map[n])
  if (missing.length) throw new Error(`中证估值快照缺少 ${missing.join('、')}`)
  return map
}

/** PB 历史逐日累积：只记有限值；同一天已有的值不被缺失值覆盖。返回新对象。 */
export function mergePbDay(history, date, snap, indices = INDICES) {
  const day = { ...(history[date] ?? {}) }
  for (const i of indices) {
    const pb = i.valName ? snap[i.valName]?.pb ?? null : null
    if (pb !== null && Number.isFinite(pb)) day[i.code] = pb
  }
  return { ...history, [date]: day }
}

/** 东财 RPT_VALUEMARKET：板块整体 PE(TTM)，自 2017-01 起。 */
export function parseBoardPe(rows, target) {
  const seen = new Set()
  const out = rows.map(r => ({ date: ymd(r?.TRADE_DATE), pe: num(r?.PE_TTM_AVG) }))
    .filter(r => validDate(r.date) && r.date <= target && !seen.has(r.date) && seen.add(r.date))
    .map(r => ({ date: r.date, pe: r.pe !== null && r.pe > 0 ? r.pe : null }))
    .sort((a, b) => a.date.localeCompare(b.date))
  if (!out.length || out.at(-1).date !== target || out.at(-1).pe === null) throw new Error(`板块估值未更新到 ${target}`)
  return out
}

/**
 * 历史分位：窗口内（含当日）PE ≤ 当前值的交易日占比。窗口起点之后 45 天内才有数据视为覆盖不足，返回 null。
 */
export function percentile(series, years) {
  const last = series.at(-1)
  if (!last || last.value === null) return null
  const start = addYears(last.date, -years)
  const first = series.find(p => p.value !== null)
  if (!first || first.date > addDays(start, 45)) return null
  const win = series.filter(p => p.date > start && p.value !== null)
  if (win.length < 20) return null
  return round((win.filter(p => p.value <= last.value).length / win.length) * 100, 1)
}
export const zoneOf = (p) => (p === null ? null : p >= DANGER ? '危险' : p <= CHANCE ? '机会' : '合理')

/** 周采样（每周最后一个交易日），给前端画 10 年曲线，避免文件过大。 */
export function weekly(series) {
  const out = []
  let key = null
  for (const p of series) {
    const t = Date.parse(`${p.date}T00:00:00Z`)
    const k = Math.floor((t / 864e5 + 3) / 7) // 以周一为界
    if (k === key) out[out.length - 1] = p
    else { out.push(p); key = k }
  }
  return out
}

export function valuationRow(meta, series, snapshot) {
  const s = series.map(p => ({ date: p.date, value: p.pe }))
  const last = series.at(-1)
  const p5 = percentile(s, 5), p10 = percentile(s, 10)
  const basis = p10 !== null ? 10 : p5 !== null ? 5 : null
  const since = series.find(p => p.pe !== null)?.date ?? null
  return {
    code: meta.code, name: meta.name, source: meta.source,
    pe: round(last.pe), pb: round(snapshot?.pb ?? null), dp: round(snapshot?.dp ?? null),
    peP5: p5, peP10: p10, zoneBasis: basis, zone: zoneOf(basis === 10 ? p10 : p5), since,
    history: weekly(series.filter(p => p.date > addYears(last.date, -10) && (since === null || p.date >= since))).map(p => [p.date, round(p.pe)]),
  }
}

// ---------- 资金供需 ----------
/** 限售解禁：目标日之后 30 个自然日，按周（周一起）汇总。LIFT_MARKET_CAP 单位万元，按最新价估算。 */
export function liftWeeks(rows, target) {
  const end = addDays(target, 30)
  const weeks = new Map()
  for (const r of rows) {
    const date = ymd(r?.FREE_DATE), cap = num(r?.LIFT_MARKET_CAP)
    if (!validDate(date) || date <= target || date > end) continue
    const wd = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7
    const start = addDays(date, -wd)
    const from = addDays(target, 1), wEnd = addDays(start, 6)
    const w = weeks.get(start) ?? { start: start < from ? from : start, end: wEnd > end ? end : wEnd, amount: 0, priced: 0, stocks: new Set(), unpriced: 0 }
    if (cap === null) w.unpriced += 1
    else { w.amount += cap / 1e4; w.priced += 1 }
    if (r.SECURITY_CODE) w.stocks.add(r.SECURITY_CODE)
    weeks.set(start, w)
  }
  // 一周内全部批次都没有市值 → 金额 null（不是 0）；部分缺失由 unpriced 计数标出
  const list = [...weeks.values()].sort((a, b) => a.start.localeCompare(b.start)).map(w => ({ start: w.start, end: w.end, amount: w.priced ? round(w.amount) : null, stocks: w.stocks.size, unpriced: w.unpriced }))
  const priced = list.filter(w => w.amount !== null)
  // 没有任何解禁批次时合计为真实的 0；有批次但都无市值时为 null
  return { from: addDays(target, 1), to: end, weeks: list, total: list.length && !priced.length ? null : round(priced.reduce((a, w) => a + w.amount, 0)) }
}

/** 股东增减持：按公告月汇总，亿元。金额 = 变动股数(万股) × 成交均价；均价缺失用该行收盘价估算并计数。 */
export function holderMonths(rows, target, n = 12) {
  const months = monthList(target, n)
  const acc = Object.fromEntries(months.map(m => [m, { month: m, increase: 0, decrease: 0, incPriced: 0, incUnpriced: 0, decPriced: 0, decUnpriced: 0, records: 0, estimated: 0, unpriced: 0 }]))
  for (const r of rows) {
    const date = ymd(r?.NOTICE_DATE)
    if (!validDate(date) || date > target) continue
    const m = acc[date.slice(0, 7)]
    if (!m) continue
    const qty = num(r.CHANGE_NUM), avg = num(r.TRADE_AVERAGE_PRICE), close = num(r.CLOSE_PRICE)
    const dir = r.DIRECTION === '增持' ? 1 : r.DIRECTION === '减持' ? -1 : 0
    if (!dir || qty === null) continue
    m.records += 1
    const price = avg ?? close
    if (price === null) { m.unpriced += 1; if (dir > 0) m.incUnpriced += 1; else m.decUnpriced += 1; continue }
    if (avg === null) m.estimated += 1
    const amt = Math.abs(qty) * price / 1e4
    if (dir > 0) { m.increase += amt; m.incPriced += 1 } else { m.decrease += amt; m.decPriced += 1 }
  }
  // 某方向有记录但全部无价 → 该方向金额 null（不是 0），净额随之 null；没有记录才是真实的 0
  return months.map(m => {
    const x = acc[m]
    const inc = x.incUnpriced && !x.incPriced ? null : round(x.increase)
    const dec = x.decUnpriced && !x.decPriced ? null : round(x.decrease)
    return { month: m, increase: inc, decrease: dec, net: inc === null || dec === null ? null : round(x.increase - x.decrease), records: x.records, estimated: x.estimated, unpriced: x.unpriced }
  })
}

/** 股权与可转债融资：IPO 按上市日、增发按新增股份上市日、可转债按起息日，月度亿元。 */
export function financingMonths({ ipo, seo, cb }, target, n = 12) {
  const months = monthList(target, n)
  const acc = Object.fromEntries(months.map(m => [m, { month: m, ipo: 0, ipoCount: 0, ipoUnpriced: 0, seo: 0, seoCount: 0, seoUnpriced: 0, cb: 0, cbCount: 0, cbUnpriced: 0 }]))
  const add = (date, key, v) => {
    if (!validDate(date) || date > target) return
    const m = acc[date.slice(0, 7)]
    if (!m) return
    if (v === null) { m[`${key}Unpriced`] += 1; return } // 金额缺失只计数，不当 0
    m[key] += v; m[`${key}Count`] += 1
  }
  for (const r of ipo) {
    const raise = num(r?.TOTAL_RAISE_FUNDS)
    const price = num(r?.ISSUE_PRICE), qty = num(r?.ISSUE_NUM)
    add(ymd(r?.LISTING_DATE), 'ipo', raise ?? (price !== null && qty !== null ? price * qty / 1e4 : null)) // ISSUE_NUM 万股
  }
  for (const r of seo) { const v = num(r?.TOTAL_RAISE_FUNDS); add(ymd(r?.ISSUE_LISTING_DATE), 'seo', v === null ? null : v / 1e8) }
  for (const r of cb) add(ymd(r?.VALUE_DATE), 'cb', num(r?.ACTUAL_ISSUE_SCALE))
  // xxxCount = 有金额的笔数，xxxUnpriced = 金额缺失的笔数；有记录但全部缺金额 → null
  const amt = (x, k) => (x[`${k}Unpriced`] && !x[`${k}Count`] ? null : round(x[k]))
  return months.map(m => { const x = acc[m]; return { ...x, ipo: amt(x, 'ipo'), seo: amt(x, 'seo'), cb: amt(x, 'cb') } })
}

/** 天天基金新成立基金：datas 数组。A/C 等份额类别同列重复的募集份额，按（公司、去类别名、成立日）去重。 */
export function parseFundIssue(text) {
  const m = /datas:(\[[\s\S]*?\]\])\s*,\s*record/.exec(String(text))
  if (!m) { if (/datas:\[\]/.test(String(text))) return []; throw new Error('新发基金格式异常') }
  let src = m[1]
  while (src.includes(',,')) src = src.replaceAll(',,', ',null,') // JS 稀疏数组空位
  const rows = JSON.parse(src)
  return rows.map(r => ({ code: r[0], name: r[1], company: r[2], type: r[4], shares: num(r[5]), setup: validDate(r[6]) ? r[6] : null }))
}
/**
 * 新发基金翻页的覆盖下界：列表按认购截止日倒序，翻到最后一页（不足一页）或整页都早于 from − 90 天才算覆盖完整（返回 null）；
 * 否则返回最后一页里最晚的成立日——该日所在月份及更早的数据可能没翻到。
 */
export function fundCoverage(pages, from, pageSize) {
  const last = pages.at(-1) ?? []
  if (last.length < pageSize || last.every(r => !r.setup || r.setup < addDays(from, -90))) return null
  return last.map(r => r.setup).filter(validDate).sort().at(-1) ?? from
}
/** coveredFrom：fundCoverage 的结果；该日所在月份及更早月份标 complete=false，份额为 null（不是 0）。份额缺失的基金计入 unknown。 */
export function fundMonths(rows, target, n = 12, coveredFrom = null) {
  const months = monthList(target, n)
  const acc = Object.fromEntries(months.map(m => [m, { month: m, shares: 0, funds: 0, equityShares: 0, unknown: 0 }]))
  const seen = new Set()
  for (const r of rows) {
    if (!validDate(r.setup) || r.setup > target || !acc[r.setup.slice(0, 7)]) continue
    const key = `${r.company}|${String(r.name).replace(/(发起式)?[A-Z]$/, '')}|${r.setup}`
    if (seen.has(key)) continue
    seen.add(key)
    const x = acc[r.setup.slice(0, 7)]
    if (r.shares === null) { x.unknown += 1; continue }
    x.shares += r.shares; x.funds += 1
    if (/股票|偏股|指数型-股票/.test(String(r.type))) x.equityShares += r.shares
  }
  const cut = coveredFrom ? coveredFrom.slice(0, 7) : null
  return months.map(m => {
    const x = acc[m]
    const complete = !(cut && m <= cut)
    const none = !complete || (x.unknown > 0 && x.funds === 0)
    return { month: m, shares: none ? null : round(x.shares), funds: x.funds, equityShares: none ? null : round(x.equityShares), unknown: x.unknown, complete }
  })
}

// ---------- 利率 ----------
/** 东财 RPTA_WEB_TREASURYYIELD：EMM00166466 中国 10 年、EMM00588704 中国 2 年（%）。 */
export function parseTreasury(rows, target) {
  const seen = new Set()
  return rows.map(r => ({ date: ymd(r?.SOLAR_DATE), y10: num(r?.EMM00166466), y2: num(r?.EMM00588704) }))
    .filter(r => validDate(r.date) && r.date <= target && r.y10 !== null && !seen.has(r.date) && seen.add(r.date))
    .sort((a, b) => a.date.localeCompare(b.date))
}
/** 东财 RPT_IMP_INTRESTRATEN：上海银行间同业拆放利率（MARKET_CODE 001），INDICATOR_ID 001=隔夜，101=1 周。 */
export function parseShibor(rows, target) {
  const by = new Map()
  for (const r of rows) {
    const date = ymd(r?.REPORT_DATE), v = num(r?.IR_RATE)
    if (!validDate(date) || date > target || v === null) continue
    const x = by.get(date) ?? { date, on: null, w1: null }
    if (r.INDICATOR_ID === '001') x.on = v
    if (r.INDICATOR_ID === '101') x.w1 = v
    by.set(date, x)
  }
  return [...by.values()].sort((a, b) => a.date.localeCompare(b.date))
}

// ---------- 风格 ----------
/** 往前数 k 个交易日（按交易日历，不看数据有没有那天）。 */
export function tradingDaysBack(date, k) {
  let d = date
  for (let i = 0; i < k; i++) d = prevTradingDay(d)
  return d
}
/**
 * 比值序列（分子收盘 / 分母收盘，起点归一为 100），与 20/60 日相对强弱（%）。只用双方同日都有收盘的交易日。
 * 相对强弱按确切交易日：比较日 = 最新日往前第 k 个交易日；那天任一方缺收盘则为 null，不拿更早的观测顶替。
 */
export function stylePair(pair, numRows, denRows, keep = 250) {
  const den = new Map(denRows.map(r => [r.date, r.close]))
  const joined = numRows.filter(r => r.close !== null && den.get(r.date) != null).map(r => ({ date: r.date, ratio: r.close / den.get(r.date) }))
  if (joined.length < 61) return null
  const byDate = new Map(joined.map(r => [r.date, r.ratio]))
  const rel = (k) => { const b = byDate.get(tradingDaysBack(joined.at(-1).date, k)); return b === undefined ? null : round((joined.at(-1).ratio / b - 1) * 100) }
  const tail = joined.slice(-keep)
  const base = tail[0].ratio
  return { id: pair.id, label: pair.label, num: pair.num.name, den: pair.den.name, rel20: rel(20), rel60: rel(60), series: tail.map(r => [r.date, round(r.ratio / base * 100, 2)]) }
}
