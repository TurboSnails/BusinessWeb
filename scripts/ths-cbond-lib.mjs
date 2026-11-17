// 同花顺 · 可转债页（scripts/ths-cbond.mjs）的纯计算部分：解析东财数据、选债字段、双低、到期税前收益率、
// 强赎 / 下修 / 回售计数、全景统计与分布、打新债与抢权配债。全部是盘后统计，不构成买卖建议。

export const round = (x, n = 2) => (x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 10 ** n) / 10 ** n + 0)
/** 东财的缺失值：null / '' / '-'（含前后空白）都算缺失，不当 0 */
export const numOf = (x) => {
  if (x === null || x === undefined || typeof x === 'boolean') return null
  const t = typeof x === 'string' ? x.trim() : x
  if (t === '' || t === '-' || t === '--') return null
  const v = typeof t === 'number' ? t : Number(t)
  return Number.isFinite(v) ? v : null
}
const day = (s) => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null)
const ymd = (n) => { const s = String(n ?? ''); return /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null }
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null)
export function median(xs) {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b)
  if (!v.length) return null
  const m = v.length >> 1
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}
const daysBetween = (a, b) => (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5

/* ---------- 目标交易日 ---------- */
/**
 * 本次要生成哪一天：收盘（15:10）后的交易日取当天，否则取 lastTradingDay（上一个已收盘的交易日）。
 * 东财逐日估值表、日 K 都带日期，所以凌晨或盘中运行也能安全地生成上一交易日的数据。
 */
export function pickTarget({ bjDate, minutes, isTradingDay, prevTradingDay }) {
  if (isTradingDay(bjDate) && minutes >= 15 * 60 + 10) return { date: bjDate, sameDay: true }
  return { date: prevTradingDay(bjDate), sameDay: false }
}

/* ---------- 东财数据解析 ---------- */
/** datacenter 返回体 → data 数组；接口报错时抛出 */
export function dcRows(body) {
  if (!body || body.success === false) throw new Error(`东财数据中心报错：${body?.message ?? '空响应'}`)
  return Array.isArray(body.result?.data) ? body.result.data : []
}

/** 转债列表（RPT_BOND_CB_LIST）里在 date 当天上市交易、未退市、未到期的公开发行转债 */
export function universe(list, date) {
  return list.filter((r) => {
    const listed = day(r.LISTING_DATE), delist = day(r.DELIST_DATE), expire = day(r.EXPIRE_DATE)
    return listed && listed <= date && (!delist || delist > date) && (!expire || expire >= date)
  })
}

/** 东财可转债逐日估值表（RPTA_WEB_KZZ_LS）→ Map(代码 → 当日收盘、转股价值、纯债价值、转股溢价率)；日期不符的行丢弃 */
export function parseLs(rows, date) {
  const out = new Map()
  for (const r of rows) {
    if (day(r.DATE) !== date || typeof r.ZCODE !== 'string') continue
    out.set(r.ZCODE, { close: numOf(r.FCLOSE), convValue: numOf(r.SWAPVALUE), bondValue: numOf(r.PUREBONDVALUE), premium: numOf(r.SWAPOR), bondPremium: numOf(r.PUREBONDOR) })
  }
  return out
}

/** push2 转债列表快照（fs=b:MK0354）→ 同结构 Map；每行的交易日 f297 必须是 date，否则整批放弃 */
export function parseClist(diff, date) {
  const out = new Map()
  for (const r of diff) {
    if (ymd(r.f297) !== date) throw new Error(`转债快照 ${r.f12} 的交易日是 ${r.f297}，不是 ${date}`)
    out.set(String(r.f12), { close: numOf(r.f2), prevClose: numOf(r.f18), convValue: numOf(r.f236), bondValue: numOf(r.f227), premium: numOf(r.f237), bondPremium: numOf(r.f238) })
  }
  return out
}

/** 日 K（fields2=f51,f52,f53,f59：日期、开盘、收盘、涨跌幅）→ 升序数组 */
export function parseKline(body) {
  const ks = body?.data?.klines
  if (!Array.isArray(ks)) return []
  return ks.map((s) => {
    const [date, open, close, pct] = String(s).split(',')
    return { date, open: numOf(open), close: numOf(close), pct: numOf(pct) }
  }).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k.date) && k.close !== null).sort((a, b) => a.date.localeCompare(b.date))
}

/** 证券代码（带 .SH/.SZ/.BJ 后缀）→ 东财 secid */
export const secidOf = (secucode) => {
  const [code, mkt] = String(secucode ?? '').split('.')
  if (!/^\d{6}$/.test(code ?? '')) return null
  return `${mkt === 'SH' ? 1 : 0}.${code}`
}

/* ---------- 到期税前收益率 ---------- */
/** 「第1年0.2%,第2年0.4%,…」→ [0.2, 0.4, …]（每百元票息）；年份不连续时返回 null */
export function couponsOf(text) {
  const out = []
  for (const m of String(text ?? '').matchAll(/第\s*([一二三四五六七八九十\d]+)\s*年\s*(?:为|:|：)?\s*([\d.]+)\s*%/g)) {
    const cn = '一二三四五六七八九十'.indexOf(m[1])
    const k = /^\d+$/.test(m[1]) ? Number(m[1]) : cn + 1
    out[k - 1] = Number(m[2])
  }
  // 稀疏数组的空位会被 every 跳过，所以逐个下标检查：第 1 年到第 N 年必须连续、都是有限数
  if (!out.length) return null
  for (let i = 0; i < out.length; i++) if (!Number.isFinite(out[i])) return null
  return out
}

const addYears = (d, k) => `${Number(d.slice(0, 4)) + k}${d.slice(4)}`
/**
 * 到期税前收益率（%，年化复利）：以收盘价（转债为全价交易）买入持有到期，收到剩余各年票息与到期赎回价。
 * 到期赎回价通常已含最后一年利息（东财条款表 IS_CONTAIN_COMPENIR=是）；不含时另加最后一年票息。不计税、不计交易费用。
 */
export function ytm({ price, coupons, valueDate, expireDate, redeem, date, redeemHasLast = true }) {
  if (!(price > 0) || !coupons?.length || !Array.from(coupons, (c) => Number.isFinite(c) && c >= 0).every(Boolean) || !valueDate || !expireDate || !(redeem > 0) || expireDate <= date) return null
  const flows = []
  for (let k = 1; k <= coupons.length; k++) {
    const pay = k === coupons.length ? expireDate : addYears(valueDate, k)
    if (pay <= date) continue
    const t = daysBetween(date, pay) / 365
    flows.push([t, k === coupons.length ? redeem + (redeemHasLast ? 0 : coupons[k - 1]) : coupons[k - 1]])
  }
  if (!flows.length) return null
  const pv = (y) => flows.reduce((s, [t, c]) => s + c / (1 + y) ** t, 0)
  let lo = -0.9, hi = 5
  const [pLo, pHi] = [pv(lo), pv(hi)]
  // 现值算不出来（NaN）时直接放弃，不能让二分退化成返回区间端点
  if (!Number.isFinite(pLo) || !Number.isFinite(pHi) || pLo < price || pHi > price) return null
  for (let i = 0; i < 100; i++) {
    const m = (lo + hi) / 2, v = pv(m)
    if (!Number.isFinite(v)) return null
    if (v > price) lo = m; else hi = m
  }
  return round(((lo + hi) / 2) * 100, 2)
}

/* ---------- 条款计数 ---------- */
/**
 * 在正股最近 calc 个交易日（截至 date，且不早于 from）里，数收盘价满足条件的天数。
 * cmp='ge'：收盘 ≥ 门槛（强赎）；'lt'：收盘 < 门槛（下修、回售）。
 * 返回 { hit, window, consecutive }：window 为实际计入的交易日数；consecutive 为截至 date 连续满足的天数。
 */
export function countDays(bars, { date, threshold, cmp, calc, from = null }) {
  if (!(threshold > 0) || !(calc > 0)) return null
  const upto = bars.filter((b) => b.date <= date)
  if (!upto.length || upto.at(-1).date !== date) return null
  const win = upto.slice(-calc).filter((b) => !from || b.date >= from)
  const ok = (b) => (cmp === 'ge' ? b.close >= threshold : b.close < threshold)
  let consecutive = 0
  for (let i = win.length - 1; i >= 0 && ok(win[i]); i--) consecutive++
  return { hit: win.filter(ok).length, window: win.length, consecutive }
}

const nextDay = (d) => new Date(Date.parse(`${d}T00:00:00Z`) + 864e5).toISOString().slice(0, 10)
/**
 * 东财条款表的强赎状态。CALLDAY 如「已公告强赎」「不强赎【2026-11-20】重新计算」「10/15|30」；
 * CALLNOTICE 为不强赎公告摘要（如「…2026年11月03日后首个交易日重新计算」）。from 为重新计数的首日（含）。
 */
export function callStatus(callday, notice, date) {
  const s = String(callday ?? '')
  if (/已公告强赎/.test(s)) return { status: 'announced', from: null, note: '已公告强赎' }
  const n = String(notice ?? '').match(/(\d{4})年(\d{2})月(\d{2})日后首个交易日重新计算/)
  const fromNotice = n ? nextDay(`${n[1]}-${n[2]}-${n[3]}`) : null
  const m = s.match(/不强赎【(\d{4}-\d{2}-\d{2})】/)
  const from = m?.[1] ?? fromNotice
  if (from && from > date) return { status: 'promised', from, note: notice || `公告不强赎，${from} 起重新计算` }
  return { status: 'counting', from, note: from ? `不强赎承诺期已过，自 ${from} 起重新计数` : '' }
}

/**
 * 东财条款表的下修状态：RIVSEDAY 如「提议下修,【2026-11-26】」「暂不下修,自【2026-12-01】重新开始」「已触发」「至少还需13天,2/15|30」。
 * restart：本站此前记下的「暂不下修」重新计数日（承诺期结束后东财不再显示该日期）。
 */
export function downStatus(rivseday, date, restart = null) {
  const s = String(rivseday ?? '')
  const d = s.match(/【(\d{4}-\d{2}-\d{2})】/)?.[1] ?? null
  if (/提议下修/.test(s)) return { status: 'proposed', from: null, note: d ? `董事会已提议下修（东财标注日期 ${d}）` : '董事会已提议下修' }
  const from = (/暂不下修/.test(s) ? d : null) ?? restart
  if (from && from > date) return { status: 'paused', from, note: `公告暂不下修，${from} 起重新计算` }
  return { status: 'counting', from, note: from ? `暂不下修期已过，自 ${from} 起重新计数` : '' }
}

/** 从条款表记下「暂不下修」的重新计数日，供承诺期结束后继续使用（旧记录保留，新日期覆盖） */
export function updateRestarts(old, clauseRows) {
  const out = { ...(old ?? {}) }
  for (const c of clauseRows) {
    const d = String(c.RIVSEDAY ?? '').match(/暂不下修.*?【(\d{4}-\d{2}-\d{2})】/)?.[1]
    if (d && (!out[c.SECURITY_CODE] || out[c.SECURITY_CODE] < d)) out[c.SECURITY_CODE] = d
  }
  return out
}

/* ---------- 选债表 ---------- */
/**
 * 合并一只转债的列表信息、条款、当日估值、正股日 K，得到选债表的一行。
 * 双低 = 价格 + 转股溢价率（百分数的数值，即溢价率 × 100）。
 */
export function buildRow({ item, clause, quote, prev, bars, date }) {
  const price = quote?.close ?? null
  const prevClose = quote?.prevClose ?? prev?.close ?? null
  const bar = bars?.at(-1)?.date === date ? bars.at(-1) : null
  const convPrice = numOf(clause?.TRANSFER_PRICE)
  const premium = quote?.premium ?? null
  const expire = day(clause?.EXPIRE_DATE) ?? day(item.EXPIRE_DATE)
  const convStart = day(clause?.TRANSFER_START_DATE) ?? day(item.TRANSFER_START_DATE)
  const coupons = couponsOf(clause?.INTEREST_RATE) ?? couponsOf(item.INTEREST_RATE_EXPLAIN)
  const redeem = numOf(clause?.EXPIRE_REDEEM_PRICE)
  return {
    code: String(item.SECURITY_CODE),
    name: String(item.SECURITY_NAME_ABBR ?? ''),
    price: round(price, 3),
    pct: price !== null && prevClose ? round((price / prevClose - 1) * 100, 2) : null,
    stockCode: String(item.CONVERT_STOCK_CODE ?? ''),
    stockName: String(item.SECURITY_SHORT_NAME ?? clause?.CONVERT_SECUNAME ?? ''),
    stockPrice: bar ? round(bar.close, 2) : null,
    stockPct: bar ? round(bar.pct, 2) : null,
    convPrice: round(convPrice, 2),
    convValue: round(quote?.convValue ?? null, 2),
    premium: round(premium, 2),
    bondValue: round(quote?.bondValue ?? null, 2),
    ytm: ytm({ price, coupons, valueDate: day(item.VALUE_DATE) ?? day(clause?.VALUE_DATE), expireDate: expire, redeem, date, redeemHasLast: clause?.IS_CONTAIN_COMPENIR !== '否' }),
    remain: numOf(clause?.REMAINVOL),
    years: expire ? round(daysBetween(date, expire) / 365, 2) : null,
    rating: String(clause?.ZDRZXPJ || item.RATING || '') || null,
    dualLow: price !== null && premium !== null ? round(price + premium, 2) : null,
    redeemTrigger: round(numOf(clause?.REDEEM_TRIGGER_PRICE), 2),
    expireRedeem: redeem,
    expireDate: expire,
    putStart: day(clause?.DAT_SDATEPUTS),
    convStart,
    inConvert: convStart ? convStart <= date : null,
  }
}

/* ---------- 全景统计 ---------- */
const range = (lo, hi) => (x) => x >= lo && x < hi
/** 分布区间：左闭右开；涨跌幅单列 0% */
export const PRICE_BINS = [['<100', range(-Infinity, 100)], ['100–110', range(100, 110)], ['110–120', range(110, 120)], ['120–130', range(120, 130)], ['>130', range(130, Infinity)]]
export const PREMIUM_BINS = [['<0%', range(-Infinity, 0)], ['0–10%', range(0, 10)], ['10–20%', range(10, 20)], ['20–30%', range(20, 30)], ['30–50%', range(30, 50)], ['50–100%', range(50, 100)], ['>100%', range(100, Infinity)]]
export const PCT_BINS = [['≤−3%', (x) => x <= -3], ['−3~−1%', (x) => x > -3 && x <= -1], ['−1~0%', (x) => x > -1 && x < 0], ['0%', (x) => x === 0], ['0~1%', (x) => x > 0 && x < 1], ['1~3%', (x) => x >= 1 && x < 3], ['≥3%', (x) => x >= 3]]
const binCount = (xs, bins) => bins.map(([label, ok]) => ({ label, n: xs.filter(ok).length }))

/** 一天的全景：数量、价格均值 / 中位数、转股溢价率均值 / 中位数、涨跌家数、价格 / 溢价率 / 涨跌幅分布 */
export function summarize(rows) {
  const prices = rows.map((r) => r.price).filter((x) => x !== null)
  const prem = rows.map((r) => r.premium).filter((x) => x !== null)
  const pcts = rows.map((r) => r.pct).filter((x) => x !== null)
  return {
    count: rows.length,
    priced: prices.length,
    avgPrice: round(mean(prices), 2),
    medianPrice: round(median(prices), 2),
    avgPremium: round(mean(prem), 2),
    medianPremium: round(median(prem), 2),
    up: pcts.filter((x) => x > 0).length,
    down: pcts.filter((x) => x < 0).length,
    flat: pcts.filter((x) => x === 0).length,
    priceBins: binCount(prices, PRICE_BINS),
    premiumBins: binCount(prem, PREMIUM_BINS),
    pctBins: binCount(pcts, PCT_BINS),
  }
}

/** 历史一天的精简记录（用于走势图） */
export const historyDay = (date, s, extra = {}) => ({
  date, count: s.count, avgPrice: s.avgPrice, medianPrice: s.medianPrice, avgPremium: s.avgPremium, medianPremium: s.medianPremium,
  up: s.up, down: s.down, priceBins: s.priceBins.map((b) => b.n), ...extra,
})

/** 合并历史：同一天以新记录为准；逐日估值表（report）优先于快照（snapshot）；最多保留 keep 天 */
export function mergeHistory(days, add, keep = 500) {
  const map = new Map(days.map((d) => [d.date, d]))
  for (const d of add) {
    const old = map.get(d.date)
    if (old && old.source === 'report' && d.source === 'snapshot') continue
    map.set(d.date, d)
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-keep)
}

/* ---------- 发布前的完整度比较 ---------- */
const SOURCE_RANK = { report: 2, snapshot: 1 }
/**
 * 是否用本次结果替换已发布的文件。prev / next 为 { asOf, source, quality }，quality = { clauses, quotes, klineFail }。
 * 已发布的更新（asOf 更晚）不替换（DATE 历史重跑）；同一天：逐日估值表优先于快照，同来源时条款 / 估值覆盖更少或日 K 失败更多的不替换。
 */
export function shouldReplace(prev, next) {
  if (!prev?.asOf) return true
  if (prev.asOf !== next.asOf) return prev.asOf < next.asOf
  const rp = SOURCE_RANK[prev.source] ?? 0, rn = SOURCE_RANK[next.source] ?? 0
  if (rp !== rn) return rn > rp
  const a = prev.quality, b = next.quality
  if (!a || !b) return true
  return !(b.clauses < a.clauses || b.quotes < a.quotes || b.klineFail > a.klineFail)
}

/* ---------- 套利与条款 ---------- */
/** 折价转股：溢价率 < 0 且已进入转股期。每 10 张（1 手）理论价差 = (转股价值 − 价格) × 10 元，未扣费用与次日正股波动 */
export const discountList = (rows) => rows
  .filter((r) => r.inConvert && r.premium !== null && r.premium < 0 && r.price !== null && r.convValue !== null)
  .map((r) => ({ code: r.code, name: r.name, price: r.price, convValue: r.convValue, premium: r.premium, stockPct: r.stockPct, gapPerLot: round((r.convValue - r.price) * 10, 1), remain: r.remain }))
  .sort((a, b) => a.premium - b.premium)

/** 东财条款表里的计数「10/15|30」「至少还需13天,2/15|30」→ { hit, need, calc } */
export function parseProgress(text) {
  const m = String(text ?? '').match(/(\d+)\/(\d+)\|(\d+)/)
  return m ? { hit: Number(m[1]), need: Number(m[2]), calc: Number(m[3]) } : null
}

/**
 * 东财条款表没有更新日期：用本站按日 K 自算的强赎天数与东财的强赎天数比对，
 * 绝大多数一致时认为条款表已更新到 date，否则标为日期不明（页面提示可能滞后）。
 */
export function clauseCheck(callRows, date) {
  const both = callRows.filter((r) => r.status === 'counting' && r.hit !== null && r.emHit !== null)
  const agree = both.filter((r) => r.hit === r.emHit).length
  return { agree, total: both.length, asOf: both.length >= 3 && agree / both.length >= 0.8 ? date : null }
}

const windowStart = (bars, date, calc) => bars.filter((b) => b.date <= date).slice(-calc)[0]?.date ?? null

/** 强赎进度：已公告强赎、承诺不强赎，或计数 ≥ 1 天的转股期内转债。emText 为东财条款表原文，供对照 */
export function callList(rows, { clauses, bars, date }) {
  const out = []
  for (const r of rows) {
    const c = clauses.get(r.code)
    if (!c || !r.inConvert) continue
    const st = callStatus(c.CALLDAY, c.CALLNOTICE, date)
    const ratio = numOf(c.REDEEM_TRIGGER_RATIO), need = numOf(c.REDEEM_CONTENT_DAYS), calc = numOf(c.REDEEM_CALCULATE_DAYS)
    const adj = day(c.LAST_ADJ_DATE)
    const bs = bars.get(r.code) ?? []
    const from = [r.convStart, st.from, adj].filter(Boolean).sort().at(-1) ?? null
    const cnt = r.convPrice && ratio && st.status === 'counting' ? countDays(bs, { date, threshold: r.convPrice * ratio / 100, cmp: 'ge', calc, from }) : null
    if (st.status === 'counting' && !(cnt?.hit > 0)) continue
    const ws = windowStart(bs, date, calc)
    out.push({
      code: r.code, name: r.name, price: r.price, stockPrice: r.stockPrice, trigger: r.convPrice && ratio ? round(r.convPrice * ratio / 100, 2) : null, ratio,
      hit: cnt?.hit ?? null, need, calc, window: cnt?.window ?? null, status: st.status, note: st.note,
      partial: !!(adj && ws && adj > ws), emText: c.CALLDAY ?? null, emHit: parseProgress(c.CALLDAY)?.hit ?? null, remain: r.remain,
    })
  }
  const rank = { announced: 0, counting: 1, promised: 2 }
  return out.sort((a, b) => rank[a.status] - rank[b.status] || (b.hit ?? -1) - (a.hit ?? -1))
}

/**
 * 下修进度：董事会已提议、暂不下修期内、东财标「已触发」，或天数达到要求的一半以上。
 * 天数以东财条款表为准（它按公告扣除了已过期的「暂不下修」重算期）；本站按日 K 机械计数的 hit 作对照。
 */
export function downList(rows, { clauses, bars, date, restarts = {} }) {
  const out = []
  for (const r of rows) {
    const c = clauses.get(r.code)
    if (!c) continue
    const st = downStatus(c.RIVSEDAY, date, restarts[r.code] ?? null)
    const ratio = numOf(c.TRANSFER_TRIGGER_RATIO), need = numOf(c.TRANSFER_CONTENT_DAYS), calc = numOf(c.TRANSFER_CALCULATE_DAYS)
    const adj = day(c.LAST_ADJ_DATE)
    const from = [st.from, adj].filter(Boolean).sort().at(-1) ?? null
    const cnt = r.convPrice && ratio && st.status === 'counting' ? countDays(bars.get(r.code) ?? [], { date, threshold: r.convPrice * ratio / 100, cmp: 'lt', calc, from }) : null
    const em = parseProgress(c.RIVSEDAY)
    const shown = em ? em.hit : cnt?.hit
    if (st.status === 'counting' && !/已触发/.test(c.RIVSEDAY ?? '') && !(need && shown >= Math.ceil(need / 2))) continue
    out.push({
      code: r.code, name: r.name, price: r.price, stockPrice: r.stockPrice, convPrice: r.convPrice, trigger: r.convPrice && ratio ? round(r.convPrice * ratio / 100, 2) : null, ratio,
      hit: cnt?.hit ?? null, need, calc, window: cnt?.window ?? null, status: st.status, note: st.note, emText: c.RIVSEDAY ?? null, emHit: em?.hit ?? null, premium: r.premium, remain: r.remain,
    })
  }
  const rank = { proposed: 0, counting: 1, paused: 2 }
  return out.sort((a, b) => rank[a.status] - rank[b.status] || (b.emHit ?? b.hit ?? -1) - (a.emHit ?? a.hit ?? -1))
}

/** 即将到期（一年内）与回售期内的转债；回售计数：最近窗口内收盘低于回售门槛的天数（多为连续 30 日） */
export function maturityList(rows, { clauses, bars, date }) {
  const out = []
  for (const r of rows) {
    const c = clauses.get(r.code)
    const soon = r.years !== null && r.years <= 1
    const inPut = !!(r.putStart && r.putStart <= date)
    if (!soon && !inPut) continue
    const ratio = numOf(c?.RESALE_TRIGGER_RATIO), need = numOf(c?.RESALE_CONTENT_DAYS), calc = numOf(c?.RESALE_CALCULATE_DAYS)
    const cnt = inPut && r.convPrice && ratio ? countDays(bars.get(r.code) ?? [], { date, threshold: r.convPrice * ratio / 100, cmp: 'lt', calc, from: day(c?.LAST_ADJ_DATE) }) : null
    out.push({
      code: r.code, name: r.name, price: r.price, expireDate: r.expireDate, years: r.years, expireRedeem: r.expireRedeem,
      redeemGap: r.price !== null && r.expireRedeem !== null ? round(r.expireRedeem - r.price, 2) : null, ytm: r.ytm,
      inPut, putTrigger: inPut && r.convPrice && ratio ? round(r.convPrice * ratio / 100, 2) : null, putHit: cnt ? cnt.consecutive : null, putNeed: inPut ? need : null, remain: r.remain,
    })
  }
  return out.sort((a, b) => (a.years ?? 99) - (b.years ?? 99))
}

/* ---------- 打新债与抢权配债 ---------- */
/**
 * 打新日历：申购日在 date 前 days 天以内或之后的公开发行转债。首日表现取转债日 K 第一根（须为上市日）。
 * 中签率为东财 ONLINE_GENERAL_LWR（单位 %）；每签收益为东财 FIRST_PROFIT（按首日成交均价，每签 10 张，元）。
 */
export function issueList(list, { date, days = 45, firstBars = new Map(), stockBars = new Map() }) {
  const from = new Date(Date.parse(`${date}T00:00:00Z`) - days * 864e5).toISOString().slice(0, 10)
  return list.filter((r) => { const d = day(r.PUBLIC_START_DATE); return d && d >= from })
    .map((r) => {
      const code = String(r.SECURITY_CODE)
      const list = day(r.LISTING_DATE)
      const fb = firstBars.get(code)
      const first = fb && list && fb.date === list && list <= date ? fb : null
      const per = numOf(r.FIRST_PER_PREPLACING)
      const sb = stockBars.get(code)
      const record = day(r.SECURITY_START_DATE)
      // 抢权配债看股权登记日收盘价；登记日之后看当日收盘价
      const ref = sb?.filter((b) => b.date <= (record && record < date ? record : date)).at(-1) ?? null
      return {
        code, name: String(r.SECURITY_NAME_ABBR ?? ''), applyCode: r.CORRECODE ?? null, stockCode: String(r.CONVERT_STOCK_CODE ?? ''), stockName: String(r.SECURITY_SHORT_NAME ?? ''),
        applyDate: day(r.PUBLIC_START_DATE), recordDate: record, lotDate: day(r.BOND_START_DATE), listDate: list && list <= date ? list : null,
        scale: round(numOf(r.ACTUAL_ISSUE_SCALE), 2), rating: r.RATING || null, convPrice: round(numOf(r.INITIAL_TRANSFER_PRICE), 2),
        perShare: per, winRate: round(numOf(r.ONLINE_GENERAL_LWR), 6),
        refPrice: ref ? round(ref.close, 2) : null, refDate: ref?.date ?? null,
        rightsPer100: per !== null && ref?.close ? round((per / ref.close) * 100, 2) : null,
        minShares: per ? Math.ceil(1000 / per / 100) * 100 : null,
        firstOpen: first ? round(first.open, 3) : null, firstClose: first ? round(first.close, 3) : null,
        firstPct: first ? round(first.close - 100, 2) : null,
        profitPerLot: list && list <= date ? round(numOf(r.FIRST_PROFIT), 1) : null,
      }
    })
    .sort((a, b) => (b.applyDate ?? '').localeCompare(a.applyDate ?? ''))
}

/** 抢权配债：股权登记日在 date 当天或之后（还能买正股参与优先配售）的发行 */
export const rightsList = (issues, date) => issues.filter((r) => r.recordDate && r.recordDate >= date)
