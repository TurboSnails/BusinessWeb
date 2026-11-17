// 开盘啦 · 打板页（/market-mood/daban）的纯计算：功能对照开盘啦 App「打板」区的竞价 / 涨停 / 炸板 / 跌停 / 新股 / 自然涨停 / 曾跌停
// 与个股「溢价基因」。数据全部来自公开行情（东财股池、新浪全市场、腾讯报价），不调用开盘啦接口。
// 只做盘后统计：「即将涨停」需要盘中实时数据，不做；「竞价」只用开盘价对比昨收，没有竞价成交明细。不构成投资建议。
import { isNew, parsePool, parseSinaRow, prevTradingDay } from './market-mood-lib.mjs'

export const DT_PRE = -4.8 // 曾跌停候选：最低价较昨收跌幅 ≤ −4.8%（覆盖 5% 档），再用腾讯报价里的跌停价逐只确认
export const PREMIUM = 5 // 溢价 5%：次日最高价较涨停收盘价（即次日昨收）涨 ≥ 5%
export const KEEP_DAYS = 250 // 溢价基因样本最多保留约一年交易日

// null / 空串 / 非数字都是缺失，不当 0
export const num = (x) => (x === null || x === undefined || String(x).trim() === '' || !Number.isFinite(Number(x)) ? null : Number(x))
export const round = (x, n = 2) => (x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 10 ** n) / 10 ** n)
const rate = (part, total) => (total > 0 ? round((part / total) * 100, 1) : null)
const mean = (xs) => { const v = xs.filter((x) => Number.isFinite(x)); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null }

/** 东财时间整数 92500 / 143544 → '09:25:00' / '14:35:44'；缺失或 0 → null */
export function hms(t) {
  const v = num(t)
  if (v === null || v <= 0 || v >= 240000) return null
  const s = String(Math.round(v)).padStart(6, '0')
  return `${s.slice(0, 2)}:${s.slice(2, 4)}:${s.slice(4, 6)}`
}
/** 20261117 → '2026-11-17' */
export function ymd(x) {
  const s = String(x ?? '')
  return /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null
}
/** 东财股池价格字段是「元 × 1000」；无涨跌幅限制的新股涨停价是 1e9 这类占位值 */
const px = (p) => { const v = num(p); return v === null || v <= 0 || v >= 1e8 ? null : round(v / 1000, 2) }
const str = (x) => (typeof x === 'string' ? x.trim() : '')
const streakOf = (z) => (z && num(z.days) !== null && num(z.ct) !== null ? { days: num(z.days), ct: num(z.ct) } : null)

/** 股池原始行：先用市场情绪页同一套校验（日期 = 当日、tc = 条数、代码与名称齐全），再返回原始字段供各池取自己的列 */
export function poolRaw(body, date) {
  parsePool(body, date)
  return body.data.pool
}

export const mapZt = (r) => ({
  code: r.c, name: str(r.n), pct: round(num(r.zdp)), price: px(r.p), boards: num(r.lbc), streak: streakOf(r.zttj),
  firstSeal: hms(r.fbt), lastSeal: hms(r.lbt), opens: num(r.zbc), fund: num(r.fund), amount: num(r.amount),
  turnover: round(num(r.hs)), floatCap: num(r.ltsz), sector: str(r.hybk),
})
export const mapZb = (r) => ({
  code: r.c, name: str(r.n), pct: round(num(r.zdp)), price: px(r.p), limitPrice: px(r.ztp), streak: streakOf(r.zttj),
  firstSeal: hms(r.fbt), opens: num(r.zbc), amplitude: round(num(r.zf)), amount: num(r.amount),
  turnover: round(num(r.hs)), floatCap: num(r.ltsz), sector: str(r.hybk),
})
export const mapDt = (r) => ({
  code: r.c, name: str(r.n), pct: round(num(r.zdp)), price: px(r.p), days: num(r.days), lastSeal: hms(r.lbt), opens: num(r.oc),
  fund: num(r.fund), boardAmount: num(r.fba), amount: num(r.amount), turnover: round(num(r.hs)), floatCap: num(r.ltsz), sector: str(r.hybk),
})
export const mapYzt = (r) => ({
  code: r.c, name: str(r.n), pct: round(num(r.zdp)), price: px(r.p), yBoards: num(r.ylbc), yFirstSeal: hms(r.yfbt), amount: num(r.amount), sector: str(r.hybk),
})
export const mapNew = (r) => ({
  code: r.c, name: str(r.n), pct: round(num(r.zdp)), price: px(r.p), listDate: ymd(r.ipod), days: num(r.ods),
  turnover: round(num(r.hs)), amount: num(r.amount), floatCap: num(r.ltsz), newHigh: r.nh === 1 ? true : r.nh === 0 ? false : null,
  noLimit: num(r.ztp) !== null && num(r.ztp) >= 1e8, sector: str(r.hybk),
})

/** 新浪全市场行：在市场情绪页解析结果上补开盘价、最低价（停牌为 null） */
export function parseSinaFull(row) {
  const base = parseSinaRow(row)
  const live = base.price !== null
  const open = num(row.open), low = num(row.low)
  return { ...base, open: live && open > 0 ? open : null, low: live && low > 0 ? low : null }
}

/** 腾讯报价 v_sh600000="1~名称~代码~现价~昨收~今开~…" → Map(code → {price, prev, open, high, low, limitUp, limitDown})；只收当日行情，无涨跌幅限制的 -1 记为 null */
export function parseTencent(text, date) {
  const want = date.replaceAll('-', '')
  const out = new Map()
  for (const m of String(text).matchAll(/v_(?:sh|sz|bj)(\d{6})="([^"]*)"/g)) {
    const f = m[2].split('~')
    if (f[30]?.slice(0, 8) !== want) continue
    const pos = (x) => { const v = num(x); return v !== null && v > 0 ? v : null }
    out.set(m[1], { price: pos(f[3]), prev: pos(f[4]), open: pos(f[5]), high: pos(f[33]), low: pos(f[34]), limitUp: pos(f[47]), limitDown: pos(f[48]) })
  }
  return out
}

/** 涨停板型：一字（全天一个价）/ T字（开盘即涨停、盘中开过板）/ 换手（盘中封上）；缺开高低价时为 null */
export function sealShape(s) {
  if (!s || s.price === null || s.open === null || s.high === null || s.low === null) return null
  if (s.low >= s.price && s.high <= s.price) return '一字'
  if (s.open >= s.price) return 'T字'
  return '换手'
}

/** 曾跌停候选：最低价跌幅 ≤ DT_PRE、收盘不在跌停池、不是上市首日等无涨跌幅限制的新股 */
export function touchCandidates(rows, { dtCodes = new Set(), noLimit = new Set() } = {}) {
  return rows.filter((r) => r.pct !== null && r.low !== null && r.prev && !isNew(r.name) && !dtCodes.has(r.code) && !noLimit.has(r.code)
    && ((r.low - r.prev) / r.prev) * 100 <= DT_PRE)
}

/** 曾跌停：盘中最低价触及跌停价（腾讯报价给出的当日跌停价），收盘高于跌停价 */
export function buildTouched(cands, limits, { ztCodes = new Set(), sectorOf = new Map() } = {}) {
  const out = []
  for (const r of cands) {
    const q = limits.get(r.code)
    if (!q || q.limitDown === null || q.low === null || q.price === null || q.prev === null) continue
    if (!(q.low <= q.limitDown + 1e-6 && q.price > q.limitDown + 1e-6)) continue
    out.push({
      code: r.code, name: r.name, pct: round(((q.price - q.prev) / q.prev) * 100), price: q.price, limitDown: q.limitDown,
      lowPct: round(((q.low - q.prev) / q.prev) * 100), rebound: round(((q.price - q.low) / q.prev) * 100), amount: r.amount || null,
      sector: sectorOf.get(r.code) || '', limitUpToo: ztCodes.has(r.code),
    })
  }
  return out.sort((a, b) => b.rebound - a.rebound)
}

/** 竞价（盘后版）：昨日涨停股今日开盘价相对昨收的涨跌（竞价涨幅）、收盘涨幅、收盘较开盘、今日是否再封涨停 */
export function buildAuction(yzt, byCode, ztCodes) {
  const rows = yzt.map((y) => {
    const s = byCode.get(y.code)
    const open = s?.open ?? null, prev = s?.prev ?? null, price = s?.price ?? null
    return {
      code: y.code, name: y.name, yBoards: y.yBoards, yFirstSeal: y.yFirstSeal,
      openPct: open !== null && prev ? round(((open - prev) / prev) * 100) : null,
      pct: y.pct ?? (s ? round(s.pct) : null),
      closeVsOpen: open !== null && price !== null ? round(((price - open) / open) * 100) : null,
      sealed: ztCodes.has(y.code), amount: y.amount ?? (s?.amount || null), sector: y.sector,
    }
  })
  rows.sort((a, b) => (b.openPct ?? -Infinity) - (a.openPct ?? -Infinity))
  const opens = rows.map((r) => r.openPct).filter((x) => x !== null)
  const summary = {
    n: rows.length, avgOpen: round(mean(opens)), highOpen: opens.filter((x) => x > 0).length, lowOpen: opens.filter((x) => x < 0).length,
    sealed: rows.filter((r) => r.sealed).length,
  }
  return { rows, summary }
}

/** 次日表现（溢价基因用）：昨日涨停股今日开盘、最高、收盘较昨收的涨幅，[代码, 开, 高, 收] */
export function nextDayRecord(yzt, byCode) {
  const out = []
  for (const y of yzt) {
    const s = byCode.get(y.code)
    if (!s || s.price === null || !s.prev) continue
    const p = (v) => (v === null ? null : round(((v - s.prev) / s.prev) * 100))
    out.push([y.code, p(s.open), p(s.high), y.pct ?? round(s.pct)])
  }
  return out
}

/* ---------- 历史（溢价基因样本） ---------- */
// data-raw/kpl-daban/history.json：{ days: { 日期: { zt: [[代码, 连板数]], zb: [代码] | null, next: [[代码, 开, 高, 收]] | null, counts, seeded? } } }

/** 从每日复盘归档补出早期涨停名单：只有涨停股与连板数，没有炸板名单和次日表现 */
export function seedFromArchive(snapshots) {
  const days = {}
  for (const s of snapshots ?? []) {
    if (s?.session !== 'closed' || !Array.isArray(s.upStocks) || !/^\d{4}-\d{2}-\d{2}$/.test(s.dataDate ?? '')) continue
    if (!s.sources?.some((x) => x.id === 'limitUp' && x.status === 'ready')) continue
    const zt = s.upStocks.filter((r) => /^\d{6}$/.test(r?.code)).map((r) => [r.code, Number.isInteger(r.boards) ? r.boards : null])
    days[s.dataDate] = { zt, zb: null, next: null, seeded: true, counts: { zt: zt.length } }
  }
  return days
}

/** 合并：真实记录总是覆盖种子，种子不覆盖真实记录；按日期保留最近 keep 天 */
export function mergeStore(store, days, keep = KEEP_DAYS) {
  const all = { ...(store?.days ?? {}) }
  for (const [d, rec] of Object.entries(days)) { const old = all[d]; if (!old || old.seeded || !rec.seeded) all[d] = rec }
  return { days: Object.fromEntries(Object.entries(all).sort(([a], [b]) => a.localeCompare(b)).slice(-keep)) }
}

/**
 * 个股溢价基因：codes 内每只股票在样本窗口里的
 * 涨停次数；溢价 5% 次数（次日最高 ≥ 5%）与次日红盘率（次日收盘 > 0）——分母为有次日记录的涨停次数；
 * 首板封板率 / 破板率——分母为有炸板名单的日子里的首板尝试（当日首板涨停，或炸板且上一交易日未涨停）；
 * 连板率——次日（下一交易日有记录）仍涨停的比例。
 * 「次日」只认 prevTradingDay(次日) === 当日，缺天不拿更晚的一天充数。
 */
export function computeGenes(codes, store) {
  const days = store?.days ?? {}
  const dates = Object.keys(days).sort()
  const ztMap = new Map(dates.map((d) => [d, new Map(days[d].zt.map(([c, b]) => [c, b]))]))
  const nextOf = new Map()
  for (const d of dates) nextOf.set(prevTradingDay(d), d)
  const want = new Set(codes)
  const g = new Map([...want].map((c) => [c, { zt: 0, nextN: 0, p5: 0, red: 0, firstTry: 0, firstSeal: 0, lbBase: 0, lb: 0 }]))
  for (const d of dates) {
    const zt = ztMap.get(d)
    const nd = nextOf.get(d)
    const nextRows = nd && days[nd].next ? new Map(days[nd].next.map((x) => [x[0], x])) : null
    for (const [c, boards] of zt) {
      const s = g.get(c)
      if (!s) continue
      s.zt++
      if (nd) { s.lbBase++; if (ztMap.get(nd).has(c)) s.lb++ }
      const n = nextRows?.get(c)
      if (n) { s.nextN++; if (n[2] !== null && n[2] >= PREMIUM) s.p5++; if (n[3] !== null && n[3] > 0) s.red++ }
      if (days[d].zb && boards === 1) { s.firstTry++; s.firstSeal++ }
    }
    if (days[d].zb) {
      const prevZt = ztMap.get(prevTradingDay(d))
      if (prevZt) for (const c of days[d].zb) { const s = g.get(c); if (s && !prevZt.has(c)) s.firstTry++ }
    }
  }
  const byCode = {}
  for (const [c, s] of g) {
    const sealRate = rate(s.firstSeal, s.firstTry)
    byCode[c] = {
      ...s, redRate: rate(s.red, s.nextN), firstSealRate: sealRate, firstBreakRate: sealRate === null ? null : round(100 - sealRate, 1), lbRate: rate(s.lb, s.lbBase),
    }
  }
  const full = dates.filter((d) => !days[d].seeded)
  const window = { from: dates[0] ?? null, to: dates.at(-1) ?? null, days: dates.length, fullFrom: full[0] ?? null, fullDays: full.length }
  return { byCode, window }
}

/** 每日计数（走势图用） */
export const historyOf = (store) => Object.entries(store?.days ?? {}).sort(([a], [b]) => a.localeCompare(b))
  .map(([date, r]) => ({ date, ...(r.seeded ? { seeded: true } : {}), zt: r.counts?.zt ?? r.zt.length, zb: r.counts?.zb ?? null, dt: r.counts?.dt ?? null, natural: r.counts?.natural ?? null, touched: r.counts?.touched ?? null, auctionAvg: r.counts?.auctionAvg ?? null, sealRate: r.counts?.sealRate ?? null }))

/**
 * 当日完整结果。输入都是已校验的当日数据：zt/zb/dt/yzt/cx 东财股池（已映射），rows 新浪全市场（parseSinaFull），
 * limits 曾跌停候选的腾讯报价，store 历史。返回 { payload（不含 meta）, record（当日历史记录）, store（合并后） }。
 */
export function buildDaban({ date, zt, zb, dt, yzt, cx, rows, limits, store }) {
  const byCode = new Map(rows.map((r) => [r.code, r]))
  const ztCodes = new Set(zt.map((r) => r.code))
  const sectorOf = new Map([...cx, ...dt, ...yzt, ...zb, ...zt].filter((r) => r.sector).map((r) => [r.code, r.sector]))
  const noLimit = new Set(cx.filter((r) => r.noLimit).map((r) => r.code))
  const ztRows = zt.map((r) => {
    const shape = sealShape(byCode.get(r.code))
    return { ...r, shape, natural: shape === null ? null : shape !== '一字' && !isNew(r.name) }
  }).sort((a, b) => (b.boards ?? 0) - (a.boards ?? 0) || (a.firstSeal ?? '99').localeCompare(b.firstSeal ?? '99'))
  const touched = buildTouched(touchCandidates(rows, { dtCodes: new Set(dt.map((r) => r.code)), noLimit }), limits, { ztCodes, sectorOf })
  const auction = buildAuction(yzt, byCode, ztCodes)
  const natural = ztRows.filter((r) => r.natural).length
  const counts = {
    zt: zt.length, zb: zb.length, dt: dt.length, natural, touched: touched.length, auctionAvg: auction.summary.avgOpen,
    sealRate: rate(zt.length, zt.length + zb.length),
  }
  const record = { zt: zt.map((r) => [r.code, r.boards]), zb: zb.map((r) => r.code), next: nextDayRecord(yzt, byCode), counts }
  const merged = mergeStore(store, { [date]: record })
  const { byCode: genes, window } = computeGenes(ztCodes, merged)
  const payload = {
    asOf: date,
    summary: { ...counts, newStocks: cx.length, auction: auction.summary, oneWord: ztRows.filter((r) => r.shape === '一字').length },
    zt: ztRows.map((r) => ({ ...r, gene: genes[r.code] ?? null })),
    zb: [...zb].sort((a, b) => (a.firstSeal ?? '99').localeCompare(b.firstSeal ?? '99')),
    dt: [...dt].sort((a, b) => (b.days ?? 0) - (a.days ?? 0) || (b.fund ?? 0) - (a.fund ?? 0)),
    touched, auction: auction.rows,
    newStocks: [...cx].sort((a, b) => (b.listDate ?? '').localeCompare(a.listDate ?? '') || a.code.localeCompare(b.code)),
    gene: window, history: historyOf(merged),
  }
  return { payload, record, store: merged }
}
