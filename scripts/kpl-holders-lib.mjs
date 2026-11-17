// 开盘啦「持仓两融」页签（/market-mood/holders）的纯计算。功能对照开盘啦 App 的融资融券个股排行、基金季度持仓、牛散追踪。
// 数据全部来自东方财富数据中心（datacenter-web）公开报表，报表名和字段均已实测（2026-11-18 凌晨）：
//   RPTA_WEB_RZRQ_GGMX   两融个股明细（每交易日一行；DATE 交易日，次一交易日早上更新）
//                        RZYE 融资余额、RZMRE 融资买入额、RZCHE 融资偿还额、RZJME 融资净买入 = RZMRE − RZCHE（元）
//                        RZJME3D / 5D / 10D = 近 3 / 5 / 10 个交易日 RZJME 之和（含当日，已用逐日数据核对）
//                        FIN_BALANCE_GR 融资余额较上一交易日增幅 %（= RZYE ÷ 上日 RZYE − 1，已核对）
//                        RZYEZB 融资余额占流通市值 %（= RZYE ÷ SZ，SZ 为流通市值），SPJ 收盘价、ZDF 涨跌幅 %
//                        表里也有 ETF、LOF 等基金（代码 1/5 开头），这里只保留 A 股代码
//   RPTA_WEB_BKJYMXN     两融板块汇总（BOARD_TYPE_CODE 005 = 东方财富行业，006 概念，004 地域；字段 FIN_BALANCE / FIN_NETBUY_AMT / FIN_BALANCE_RATIO…）
//   RPT_MAIN_ORGHOLD     机构持股汇总（每个报告期、每只股票、每类机构一行；ORG_TYPE '01' = 基金）
//                        HOULD_NUM 持有基金家数、TOTAL_SHARES 持股数、HOLD_VALUE 持股市值、FREESHARES_RATIO 占流通股 %、
//                        HOLDCHA_NUM 持股数较上期变化、HOLDCHA_RATIO 变化幅度 %（HOLDCHA_VALUE 含股价变化，不用）
//   RPT_VALUEANALYSIS_DET 每日估值（ORIG_BOARD_CODE / BOARD_NAME 为东方财富行业，与 BKJYMXN 的 005 行业同一套）——只用来给基金持仓按行业汇总
//   RPT_F10_EH_FREEHOLDERS 十大流通股东（IS_MAX_REPORTDATE='1' 为每只股票最新一期，HOLDER_NEWTYPE='个人' 为自然人；
//                        HOLDER_STATE_NEW 新进 / 加仓 / 减仓 / 不变，XZCHANGE 持股数变化（新进为空），
//                        IS_SJKZR 实际控制人、IS_DJG 董监高标记；个人股东没有唯一编号，只有姓名）
// 只做盘后统计，不做主观判断，不构成投资建议。

/** null / 空串 / '-' / 非数字一律视为缺失（null），不能当 0 */
export const num = (x) => (x === null || x === undefined || String(x).trim() === '' || String(x).trim() === '-' || !Number.isFinite(Number(x)) ? null : Number(x))
export const round = (x, n = 2) => (x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 10 ** n) / 10 ** n)
export const day = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null)
const str = (v) => (typeof v === 'string' ? v.trim() : '')
/** 沪深京 A 股代码（排除 1/5 开头的基金、债券）：0/3/6 开头沪深、4/8/92 开头北交所 */
export const isStockCode = (c) => /^(?:[0368]\d{5}|4\d{5}|92\d{4})$/.test(String(c ?? ''))

/** 分页取数的完整性：拿到的行数必须等于报表给出的总数 */
export function checkComplete(rows, count, label) {
  if (!Array.isArray(rows) || !Number.isInteger(count) || rows.length !== count) throw new Error(`${label}行数不完整（${rows?.length ?? 0}/${count}）`)
  return rows
}

/** 报告期标签：2026-09-30 → 2026 年三季报 */
export function periodLabel(p) {
  const y = p.slice(0, 4)
  return { '03-31': `${y} 年一季报`, '06-30': `${y} 年中报`, '09-30': `${y} 年三季报`, '12-31': `${y} 年年报` }[p.slice(5)] ?? p
}
/** 上一个季度末 */
export function prevQuarter(p) {
  const y = Number(p.slice(0, 4)), md = p.slice(5)
  return { '03-31': `${y - 1}-12-31`, '06-30': `${y}-03-31`, '09-30': `${y}-06-30`, '12-31': `${y}-09-30` }[md] ?? null
}
/** date（含）之前最近的 n 个季度末，倒序 */
export function quartersBefore(date, n) {
  const out = []
  const y = Number(date.slice(0, 4))
  for (let yy = y; out.length < n; yy--) {
    for (const md of ['12-31', '09-30', '06-30', '03-31']) {
      const p = `${yy}-${md}`
      if (p <= date && out.length < n) out.push(p)
    }
  }
  return out
}
export const addDays = (date, k) => new Date(Date.parse(`${date}T00:00:00Z`) + k * 864e5).toISOString().slice(0, 10)

/* ---------------- 1. 融资融券个股 ---------------- */
export const MARGIN_TOP = 30
export const GROWTH_MIN_BALANCE = 1e8 // 余额增幅榜只看融资余额 ≥ 1 亿元的个股（余额太小时增幅没有意义）——本页自定阈值

/** RPTA_WEB_RZRQ_GGMX 一天的行 → 个股（只留 A 股）；日期必须一致，股票数太少视为未发全 */
export function parseMargin(rows, date, minCount = 3000) {
  if (!Array.isArray(rows)) throw new Error('两融明细不是数组')
  const out = []
  for (const r of rows) {
    if (day(r?.DATE) !== date) throw new Error(`两融明细日期不符（${r?.DATE}）`)
    if (!isStockCode(r.SCODE)) continue
    out.push({
      code: String(r.SCODE), name: str(r.SECNAME), close: num(r.SPJ), pct: round(num(r.ZDF)),
      balance: num(r.RZYE), buy: num(r.RZMRE), repay: num(r.RZCHE), net: num(r.RZJME), net3: num(r.RZJME3D), net5: num(r.RZJME5D), net10: num(r.RZJME10D),
      growth: round(num(r.FIN_BALANCE_GR)), ratio: round(num(r.RZYEZB)), floatCap: num(r.SZ),
    })
  }
  if (out.length < minCount) throw new Error(`${date} 两融个股数不足（${out.length}）`)
  return out
}

/** RPTA_WEB_BKJYMXN 行业（005）一天的行 */
export function parseMarginIndustries(rows, date) {
  if (!Array.isArray(rows)) throw new Error('两融行业不是数组')
  const out = []
  for (const r of rows) {
    if (day(r?.TRADE_DATE) !== date) throw new Error(`两融行业日期不符（${r?.TRADE_DATE}）`)
    if (String(r.BOARD_TYPE_CODE) !== '005') continue
    out.push({ code: String(r.BOARD_CODE), name: str(r.BOARD_NAME), balance: num(r.FIN_BALANCE), buy: num(r.FIN_BUY_AMT), repay: num(r.FIN_REPAY_AMT), net: num(r.FIN_NETBUY_AMT), ratio: round(num(r.FIN_BALANCE_RATIO)), floatCap: num(r.NOTLIMITED_MARKETCAP_A) })
  }
  return out
}

const topBy = (rows, get, dir, n, keep = () => true) => rows.filter((r) => get(r) !== null && keep(r)).sort((a, b) => (get(b) - get(a)) * dir).slice(0, n)
const sum = (rows, get) => { let s = 0, k = 0; for (const r of rows) { const v = get(r); if (v !== null) { s += v; k++ } } return k ? s : null }

export function buildMargin(stocks, industries, date, { top = MARGIN_TOP, minBalance = GROWTH_MIN_BALANCE } = {}) {
  const net = (r) => r.net, net5 = (r) => r.net5
  const inds = industries.filter((r) => r.net !== null)
  return {
    date,
    count: stocks.length,
    totals: {
      balance: sum(stocks, (r) => r.balance),
      net: sum(stocks, net),
      net5: sum(stocks, net5),
      up: stocks.filter((r) => r.net !== null && r.net > 0).length,
      down: stocks.filter((r) => r.net !== null && r.net < 0).length,
    },
    buy: topBy(stocks, net, 1, top, (r) => r.net > 0),
    sell: topBy(stocks, net, -1, top, (r) => r.net < 0),
    buy5: topBy(stocks, net5, 1, top, (r) => r.net5 > 0),
    sell5: topBy(stocks, net5, -1, top, (r) => r.net5 < 0),
    growth: topBy(stocks, (r) => r.growth, 1, top, (r) => r.balance !== null && r.balance >= minBalance),
    ratio: topBy(stocks, (r) => r.ratio, 1, top),
    minBalance,
    industries: {
      count: inds.length,
      inflow: topBy(inds, net, 1, 15, (r) => r.net > 0),
      outflow: topBy(inds, net, -1, 15, (r) => r.net < 0),
    },
  }
}

/* ---------------- 2. 基金季度持仓 ---------------- */
export const FUND_MIN_STOCKS = 2500 // 一个报告期的基金持股覆盖少于 2500 只股票时视为尚未披露完（季报约 3900 只、中报 / 年报约 5300 只）
export const FUND_LAG_DAYS = 25 // 基金季报在季度结束后 15 个工作日内披露，季末 25 天后才用该期

/** 选报告期：candidates 为 [{ period, count }] 倒序；第一个「季末已过 25 天且覆盖 ≥ 2500 只」的报告期 */
export function pickFundPeriod(candidates, today) {
  for (const c of candidates) {
    if (addDays(c.period, FUND_LAG_DAYS) <= today && Number.isInteger(c.count) && c.count >= FUND_MIN_STOCKS) return c.period
  }
  return null
}
/** 季报（3、9 月）只披露前十大重仓股；中报、年报披露全部持仓 */
export const isFullPeriod = (p) => /-(06-30|12-31)$/.test(p)

export function parseFunds(rows, period) {
  if (!Array.isArray(rows)) throw new Error('基金持仓不是数组')
  const out = []
  for (const r of rows) {
    if (day(r?.REPORT_DATE) !== period) throw new Error(`基金持仓报告期不符（${r?.REPORT_DATE}）`)
    if (String(r.ORG_TYPE ?? '01') !== '01' || !isStockCode(r.SECURITY_CODE)) continue
    out.push({ code: String(r.SECURITY_CODE), name: str(r.SECURITY_NAME_ABBR), funds: num(r.HOULD_NUM), shares: num(r.TOTAL_SHARES), value: num(r.HOLD_VALUE), freeRatio: round(num(r.FREESHARES_RATIO)), change: num(r.HOLDCHA_NUM), changeRatio: round(num(r.HOLDCHA_RATIO)) })
  }
  return out
}

/**
 * 基金持仓变动：上期没有基金持有的记「新进」（变动 = 本期持股数）；
 * 变动市值估算 = 持股数变化 × 本期末股价（本期持股市值 ÷ 持股数），剔除了股价涨跌的影响。
 * industryOf: Map 代码 → 行业名
 */
export function buildFunds(cur, prevCodes, industryOf, period, prevPeriod, { top = MARGIN_TOP } = {}) {
  const prevSet = prevCodes ? new Set(prevCodes) : null
  const rows = cur.map((r) => {
    const price = r.value !== null && r.shares ? r.value / r.shares : null
    const isNew = prevSet ? !prevSet.has(r.code) : false
    const change = isNew ? r.shares : r.change
    return { ...r, industry: industryOf.get(r.code) ?? null, isNew, change, changeRatio: isNew ? null : r.changeRatio, changeValue: change !== null && price !== null ? Math.round(change * price) : null }
  })
  const cv = (r) => r.changeValue
  const byInd = new Map()
  for (const r of rows) {
    const k = r.industry ?? '未分类'
    const g = byInd.get(k) ?? { name: k, stocks: 0, value: 0, changeValue: 0, newCount: 0, addCount: 0, cutCount: 0 }
    g.stocks++
    g.value += r.value ?? 0
    g.changeValue += r.changeValue ?? 0
    if (r.isNew) g.newCount++
    else if (r.change > 0) g.addCount++
    else if (r.change < 0) g.cutCount++
    byInd.set(k, g)
  }
  const strip = ({ isNew, ...r }) => ({ ...r, isNew })
  return {
    period, label: periodLabel(period), full: isFullPeriod(period),
    prevPeriod, prevLabel: prevPeriod ? periodLabel(prevPeriod) : null, prevFull: prevPeriod ? isFullPeriod(prevPeriod) : null,
    count: rows.length,
    totalValue: sum(rows, (r) => r.value),
    newCount: prevSet ? rows.filter((r) => r.isNew).length : null,
    addCount: rows.filter((r) => !r.isNew && r.change > 0).length,
    cutCount: rows.filter((r) => !r.isNew && r.change < 0).length,
    top: topBy(rows, (r) => r.value, 1, top).map(strip),
    add: topBy(rows, cv, 1, top, (r) => !r.isNew && r.changeValue > 0).map(strip),
    cut: topBy(rows, cv, -1, top, (r) => !r.isNew && r.changeValue < 0).map(strip),
    fresh: prevSet ? topBy(rows, (r) => r.value, 1, top, (r) => r.isNew).map(strip) : null,
    industries: [...byInd.values()].map((g) => ({ ...g, value: Math.round(g.value), changeValue: Math.round(g.changeValue) })).sort((a, b) => b.value - a.value),
  }
}

/* ---------------- 3. 牛散（自然人流通股东） ---------------- */
export const INVESTOR_TOP = 100
export const INVESTOR_MIN_STOCKS = 3
const STATE = { 新进: 'new', 加仓: 'add', 减仓: 'cut', 不变: 'same' }

/**
 * 十大流通股东里的自然人：只留 A 股、截止日不早于 minEnd 的最新一期（过滤掉停牌多年 / 已退市股票的陈旧记录），
 * 排除实际控制人和董监高（IS_SJKZR / IS_DJG 为 '1'）——他们是公司内部人，不是「牛散」。
 */
export function parseInvestors(rows, minEnd) {
  if (!Array.isArray(rows)) throw new Error('十大流通股东不是数组')
  const out = []
  for (const r of rows) {
    const end = day(r?.END_DATE)
    const name = str(r?.HOLDER_NAME)
    if (!end || end < minEnd || !name || !isStockCode(r.SECURITY_CODE)) continue
    if (String(r.IS_SJKZR) === '1' || String(r.IS_DJG) === '1') continue
    out.push({
      holder: name, code: String(r.SECURITY_CODE), name: str(r.SECURITY_NAME_ABBR), end, notice: day(r.NOTICE_DATE),
      rank: num(r.HOLDER_RANK), shares: num(r.HOLD_NUM), value: num(r.HOLDER_MARKET_CAP), ratio: round(num(r.FREE_HOLDNUM_RATIO), 3),
      state: STATE[str(r.HOLDER_STATE_NEW)] ?? null, change: num(r.XZCHANGE),
    })
  }
  return out
}

/** 按「出现在几只股票的十大流通股东里」排序选出前 N 位（同名按合计持股市值），至少出现在 minStocks 只股票 */
export function buildInvestors(rows, { top = INVESTOR_TOP, minStocks = INVESTOR_MIN_STOCKS } = {}) {
  const by = new Map()
  for (const r of rows) {
    const g = by.get(r.holder) ?? []
    if (!g.some((x) => x.code === r.code)) g.push(r)
    by.set(r.holder, g)
  }
  const people = [...by.entries()].filter(([, g]) => g.length >= minStocks).map(([name, g]) => ({
    name,
    count: g.length,
    value: sum(g, (x) => x.value),
    newCount: g.filter((x) => x.state === 'new').length,
    addCount: g.filter((x) => x.state === 'add').length,
    cutCount: g.filter((x) => x.state === 'cut').length,
    latestEnd: g.reduce((m, x) => (x.end > m ? x.end : m), ''),
    items: g.sort((a, b) => (b.value ?? -1) - (a.value ?? -1)).map(({ holder: _h, ...x }) => x),
  }))
  people.sort((a, b) => b.count - a.count || (b.value ?? 0) - (a.value ?? 0) || a.name.localeCompare(b.name))
  const ends = rows.map((r) => r.end).sort()
  return {
    candidates: by.size,
    eligible: people.length,
    rows: rows.length,
    minStocks,
    endFrom: ends[0] ?? null,
    endTo: ends.at(-1) ?? null,
    list: people.slice(0, top),
  }
}

/** 除 generatedAt / fetched 外内容一致则不重写文件 */
export function sameContent(a, b) {
  if (!a || !b) return false
  const strip = (x) => JSON.stringify({ ...x, generatedAt: null, funds: x.funds ? { ...x.funds, fetched: null } : x.funds, investors: x.investors ? { ...x.investors, fetched: null } : x.investors })
  return strip(a) === strip(b)
}
