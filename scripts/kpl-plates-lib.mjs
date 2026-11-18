// 开盘啦 · 板块题材页（/market-mood/plates）的纯计算。功能对照开盘啦 App「板块」列表（强度、涨幅、主力净额、领涨股）与「题材」涨停分布，
// 数据全部来自公开行情：东财板块行情（申万二级行业、概念板块）、东财涨停股池、东财个股所属行业 / 概念、东财板块日 K。
// 开盘啦的板块强度在它的服务器上计算，安装包里没有算法；这里的公式为本站自定，页面上写明口径。只做盘后统计，不构成投资建议。
import { lin } from './market-mood-lib.mjs'

export const MIN_MEMBERS = 10 // 成分股不足 10 只的板块不计强度（两三只股票同时涨停就会排到最前，失真）
export const FRESH_SHARE = 0.95 // 至少 95% 的板块最后更新时间是当天收盘后，才认为是当天收盘数据
export const CONCEPT_MIN_ZT = 2 // 题材涨停分布只列涨停 ≥ 2 家的概念

const round = (x, n = 2) => (x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 10 ** n) / 10 ** n)
const mean = (xs) => { const v = xs.filter((x) => x !== null && Number.isFinite(x)); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null }
/** 东财字段：null / 空串 / '-' 都是缺失，不当 0 */
export const num = (x) => (x === null || x === undefined || typeof x === 'boolean' || ['', '-'].includes(String(x).trim()) || !Number.isFinite(Number(x)) ? null : Number(x))
const str = (x) => (typeof x === 'string' && x.trim() && x.trim() !== '-' ? x.trim() : null)

/** 东财 secid：沪市（6 开头，含科创板）为 1，深市与北证为 0 */
export const secidOf = (code) => `${/^6/.test(code) ? 1 : 0}.${code}`

/** 东财时间戳（秒）→ 北京时间 { date: 'YYYY-MM-DD', minutes } */
export function bjTime(sec) {
  if (!Number.isFinite(sec) || sec <= 0) return null
  const d = new Date(sec * 1000 + 8 * 3600_000)
  return { date: d.toISOString().slice(0, 10), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() }
}

/** 东财 clist 一页 → { total, rows }；rc 不为 0 或结构不对时报错 */
export function parseClistPage(body) {
  const d = body?.data
  if (body?.rc !== 0 || !d || !Number.isInteger(d.total) || !Array.isArray(d.diff)) throw new Error('东财板块列表结构异常')
  return { total: d.total, rows: d.diff }
}

/** 板块行情行（东财 clist m:90）→ 规整行。金额换算成亿元 */
export function parseBoardRow(r) {
  if (!/^BK\d{4}$/.test(r?.f12) || !str(r.f14)) throw new Error('板块字段不完整')
  const yi = (x, d = 2) => (num(x) === null ? null : round(num(x) / 1e8, d))
  const up = num(r.f104), down = num(r.f105), flat = num(r.f106)
  const leaderName = str(r.f128), leaderCode = str(r.f140)
  return {
    code: r.f12, name: r.f14.trim(), pct: num(r.f3), amount: yi(r.f6, 1),
    mainNet: yi(r.f62), mainNetPct: num(r.f184), up, down,
    members: up === null || down === null || flat === null ? null : up + down + flat,
    leader: leaderName && leaderCode ? { code: leaderCode, name: leaderName, pct: num(r.f136) } : null,
    updatedAt: num(r.f124),
  }
}

/**
 * 校验整张板块列表：条数在合理范围、代码不重复、涨幅基本齐全、绝大多数板块最后更新时间是 date 当天 15:00 之后。
 * 板块行情本身不带日期，盘后到次日开盘前看到的都是「最近一个交易日」的数据，必须用更新时间核对，不能把昨天的当今天写。
 */
export function validateBoards(rows, date, { min, max, label }) {
  if (!(rows.length >= min && rows.length <= max)) throw new Error(`${label}板块数量异常：${rows.length}`)
  if (new Set(rows.map((r) => r.code)).size !== rows.length) throw new Error(`${label}板块代码重复`)
  if (rows.filter((r) => r.pct !== null).length < rows.length * 0.9) throw new Error(`${label}板块涨幅缺失过多`)
  const fresh = rows.filter((r) => { const t = bjTime(r.updatedAt); return t && t.date === date && t.minutes >= 15 * 60 }).length
  if (fresh < rows.length * FRESH_SHARE) throw new Error(`${label}板块不是 ${date} 收盘后数据（${fresh}/${rows.length}）`)
  return rows
}

/** 东财 ulist（个股）→ Map(code → { industry, region, concepts[] })；industry 为申万二级行业名，region 为地域板块名（f102），concepts 为所属概念名 */
export function parseStockMeta(body) {
  const d = body?.data
  if (body?.rc !== 0 || !d || !Array.isArray(d.diff)) throw new Error('东财个股所属板块结构异常')
  const out = new Map()
  for (const r of d.diff) {
    if (!/^\d{6}$/.test(r?.f12)) continue
    const concepts = typeof r.f103 === 'string' ? r.f103.split(',').map((s) => s.trim()).filter((s) => s && s !== '-') : []
    out.set(r.f12, { industry: str(r.f100), region: str(r.f102), concepts })
  }
  return out
}

/**
 * 板块强度（0–100）：四项各映射到 0–100 后取平均，缺项用其余项；成分股不足 MIN_MEMBERS 只不计。
 *  · 涨幅：−3% → 0，+5% → 100
 *  · 上涨家数占比：上涨家数 ÷ 成分股数（本身就是 0–100）
 *  · 涨停家数：0 家 → 0，5 家及以上 → 100（用家数而非占比，免得小板块一只涨停就满分）
 *  · 主力净占比：主力净流入 ÷ 成交额，−10% → 0，+10% → 100
 */
export function boardStrength({ pct, up, members, zt, mainNetPct }) {
  if (!Number.isFinite(members) || members < MIN_MEMBERS) return null
  const parts = [lin(pct, -3, 5), Number.isFinite(up) ? (up / members) * 100 : null, Number.isFinite(zt) ? lin(zt, 0, 5) : null, lin(mainNetPct, -10, 10)]
  const v = mean(parts)
  return v === null ? null : Math.round(v)
}

const sealTime = (t) => (Number.isFinite(t) && t > 0 ? `${String(Math.floor(t / 10000)).padStart(2, '0')}:${String(Math.floor(t / 100) % 100).padStart(2, '0')}` : null)
const byLadder = (a, b) => (b.boards ?? 1) - (a.boards ?? 1) || (a.firstSeal ?? 999999) - (b.firstSeal ?? 999999)

/**
 * 给板块列表补上涨停家数、最高连板、涨停占比、上涨占比与强度。
 * keyOf(meta) 返回该涨停股归属的板块名（行业：一个；概念：多个）。
 */
export function annotateBoards(rows, zt, meta, keyOf) {
  const byName = new Map()
  for (const s of zt) {
    const m = meta.get(s.code)
    if (!m) continue
    for (const name of keyOf(m)) { const a = byName.get(name) ?? []; a.push(s); byName.set(name, a) }
  }
  return rows.map((r) => {
    const list = byName.get(r.name) ?? []
    const zc = list.length
    const maxBoards = list.reduce((mx, s) => Math.max(mx, s.boards ?? 1), 0) || null
    const out = {
      ...r, zt: zc, maxBoards,
      upRatio: Number.isFinite(r.members) && r.members > 0 && r.up !== null ? round((r.up / r.members) * 100, 1) : null,
    }
    out.strength = boardStrength({ pct: r.pct, up: r.up, members: r.members, zt: zc, mainNetPct: r.mainNetPct })
    delete out.updatedAt
    return out
  })
}

/** 默认排序：强度降序（无强度的排后），同分按涨幅 */
export const sortByStrength = (rows) => [...rows].sort((a, b) => (b.strength ?? -1) - (a.strength ?? -1) || (b.pct ?? -99) - (a.pct ?? -99))

/**
 * 题材涨停分布：当日涨停股按板块分组，组内按连板数、首次封板时间排；
 * 组按涨停家数、最高连板排序。一只股票属于多个概念，概念分组之间会重叠。
 */
export function ztGroups(zt, meta, keyOf, { minCount = 1, limit = 40, boards = [] } = {}) {
  const info = new Map(boards.map((b) => [b.name, b]))
  const groups = new Map()
  for (const s of zt) {
    const m = meta.get(s.code)
    if (!m) continue
    for (const name of keyOf(m)) { const a = groups.get(name) ?? []; a.push(s); groups.set(name, a) }
  }
  return [...groups.entries()]
    .filter(([name, list]) => list.length >= minCount && (!boards.length || info.has(name)))
    .map(([name, list]) => {
      const sorted = [...list].sort(byLadder)
      const b = info.get(name)
      return {
        name, code: b?.code ?? null, pct: b?.pct ?? null, count: list.length, maxBoards: sorted[0]?.boards ?? 1,
        stocks: sorted.map((s) => ({ code: s.code, name: s.name, boards: s.boards, firstSeal: sealTime(s.firstSeal), st: /ST/i.test(s.name) })),
      }
    })
    .sort((a, b) => b.count - a.count || b.maxBoards - a.maxBoards || (b.pct ?? -99) - (a.pct ?? -99))
    .slice(0, limit)
}

/** 东财板块日 K（fields2=f51 日期, f53 收盘, f59 涨跌幅）→ 升序 [{date, close, pct}] */
export function parseKline(body) {
  const ks = body?.data?.klines
  if (body?.rc !== 0 || !Array.isArray(ks)) throw new Error('东财板块日 K 结构异常')
  return ks.map((s) => String(s).split(',')).map(([date, close, pct]) => ({ date, close: num(close), pct: num(pct) }))
    .filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k.date) && k.close !== null)
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** 区间涨幅：最后一根相对 n 根之前的收盘；不足 n+1 根时为 null */
export function rangeReturn(kline, n) {
  if (kline.length <= n) return null
  const a = kline.at(-1 - n).close, b = kline.at(-1).close
  return a > 0 ? round((b / a - 1) * 100, 2) : null
}

/** 每日存档的精简记录：{ code: [涨幅, 涨停家数, 强度] } */
export function compactDay(boards) {
  return Object.fromEntries(boards.map((b) => [b.code, [b.pct, b.zt, b.strength]]))
}

/**
 * 某板块的近 N 日走势：日 K（收盘、涨幅）与每日存档（涨停家数、强度）按日期合并。
 * days: 升序 [{ date, seeded?, industry: {code: [...]}, concept: {...} }]
 */
export function boardSeries({ code, kind, kline = [], days = [], n = 40 }) {
  const map = new Map()
  for (const k of kline) map.set(k.date, { date: k.date, close: k.close, pct: k.pct, zt: null, strength: null })
  for (const d of days) {
    if (!d[kind]) continue
    // 种子记录只存有涨停的板块，没列出即 0 家；真实记录存全部板块，没列出即缺失
    const rec = d[kind][code] ?? (d.seeded ? [null, 0, null] : null)
    if (!rec) continue
    const p = map.get(d.date) ?? { date: d.date, close: null, pct: null, zt: null, strength: null }
    const [pct, zt, strength] = rec
    if (p.pct === null) p.pct = pct ?? null
    p.zt = zt ?? null
    p.strength = strength ?? null
    map.set(d.date, p)
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-n)
}

/** 近几日强势板块：每天强度前 top 的板块（种子记录没有强度，跳过） */
export function strongHistory(days, kind, names, { top = 5, n = 10 } = {}) {
  return days.filter((d) => !d.seeded && d[kind]).slice(-n).reverse().map((d) => ({
    date: d.date,
    boards: Object.entries(d[kind]).filter(([, r]) => r[2] !== null).sort((a, b) => b[1][2] - a[1][2] || (b[1][0] ?? -99) - (a[1][0] ?? -99)).slice(0, top)
      .map(([code, r]) => ({ code, name: names.get(code) ?? code, strength: r[2], pct: r[0], zt: r[1] })),
  }))
}

/**
 * 从每日复盘归档（public/data/daily-analysis.json）补出早期每日各板块涨停家数：
 * 归档只有涨停股代码与连板数，所属行业 / 概念用「现在的」分类回填，记为 seeded，页面注明。
 */
export function seedDays(snapshots, meta, industryCodes, conceptCodes, existing = new Set()) {
  const ok = snapshots.filter((s) => s.session === 'closed' && Array.isArray(s.upStocks) && s.upStocks.length && !existing.has(s.dataDate)
    && s.sources?.some((x) => x.id === 'limitUp' && x.status === 'ready'))
  return ok.filter((s) => s.upStocks.filter((st) => meta.has(st.code)).length >= s.upStocks.length * 0.95).map((s) => {
    // 所属板块查不到的涨停股超过 5% 时整天不补（宁缺不错）
    const industry = {}, concept = {}
    for (const st of s.upStocks) {
      const m = meta.get(st.code)
      if (!m) continue
      const ic = m.industry && industryCodes.get(m.industry)
      if (ic) industry[ic] = [null, (industry[ic]?.[1] ?? 0) + 1, null]
      for (const c of m.concepts) { const cc = conceptCodes.get(c); if (cc) concept[cc] = [null, (concept[cc]?.[1] ?? 0) + 1, null] }
    }
    return { date: s.dataDate, seeded: true, industry, concept }
  }).sort((a, b) => a.date.localeCompare(b.date))
}

/* ---------- 板块涨停 / 炸板 / 跌停 / 自然涨停 / 曾跌停 分布（开盘啦 PlateAnalysis） ---------- */
export const DIST_KEYS = ['zt', 'zb', 'dt', 'natural', 'touched']

/**
 * 按板块统计各股池的家数。sets：{ zt, zb, dt, natural, touched } 各为股票代码数组；拿不到的池为 null（整列缺失，不当 0）。
 * keyOf(meta) 返回该股归属的板块名；boards 为当日板块列表（名称 → 代码）。只列至少一项不为 0 的板块。
 */
export function distTable(sets, meta, keyOf, boards, { limit = 80 } = {}) {
  const byName = new Map(boards.map((b) => [b.name, b]))
  const rows = new Map()
  for (const k of DIST_KEYS) {
    if (!Array.isArray(sets[k])) continue
    for (const code of new Set(sets[k])) {
      const m = meta.get(code)
      if (!m) continue
      for (const name of keyOf(m)) {
        const b = byName.get(name)
        if (!b) continue
        const r = rows.get(b.code) ?? { code: b.code, name: b.name, ...Object.fromEntries(DIST_KEYS.map((x) => [x, Array.isArray(sets[x]) ? 0 : null])) }
        r[k]++
        rows.set(b.code, r)
      }
    }
  }
  return [...rows.values()]
    .sort((a, b) => b.zt - a.zt || b.zb - a.zb || b.dt - a.dt || (b.touched ?? 0) - (a.touched ?? 0) || a.name.localeCompare(b.name))
    .slice(0, limit)
}

/** 打板页当日数据（public/data/kpl-daban.json）→ 各股池代码；日期不是当天时返回 null（不拿别的日子凑） */
export function dabanSets(daban, date) {
  if (!daban || daban.asOf !== date || !Array.isArray(daban.zt)) return null
  const codes = (xs) => (Array.isArray(xs) ? xs.filter((r) => /^\d{6}$/.test(r?.code)).map((r) => r.code) : null)
  // 自然涨停：板型判断不出来（缺开高低价）的股票不计入；一只都判断不出时整列缺失
  const judged = daban.zt.filter((r) => typeof r.natural === 'boolean')
  return {
    zt: codes(daban.zt), zb: codes(daban.zb), dt: codes(daban.dt),
    natural: judged.length ? judged.filter((r) => r.natural).map((r) => r.code) : null,
    touched: codes(daban.touched),
  }
}

/* ---------- 板块叠加：当日分时（东财 push2his trends2） ---------- */

/**
 * trends2 → { pre, points: [{ t: 'HH:MM', close }] }。每一分钟都必须是 date 当天的数据，否则报错（盘后到次日开盘前接口给的是上一交易日）。
 * trends 每项：'YYYY-MM-DD HH:MM,开,收,高,低,量,额,均价'
 */
export function parseTrends(body, date) {
  const d = body?.data
  if (body?.rc !== 0 || !d || !Array.isArray(d.trends) || !d.trends.length) throw new Error('东财分时结构异常')
  const pre = num(d.preClose) ?? num(d.prePrice)
  if (!(pre > 0)) throw new Error('东财分时缺昨收')
  const points = d.trends.map((s) => {
    const [ts, , close] = String(s).split(',')
    const [day, t] = String(ts).split(' ')
    if (day !== date) throw new Error(`分时日期 ${day} 不是 ${date}`)
    return { t, close: num(close) }
  }).filter((p) => /^\d{2}:\d{2}$/.test(p.t ?? ''))
  if (points.length < 200) throw new Error(`分时点数不足：${points.length}`)
  return { pre, points }
}

/** 分时 → 相对昨收的涨跌幅（%），按统一的时间轴对齐；缺的分钟为 null */
export function trendPct(parsed, times) {
  const at = new Map(parsed.points.map((p) => [p.t, p.close]))
  return times.map((t) => { const c = at.get(t); return c === null || c === undefined ? null : round((c / parsed.pre - 1) * 100, 2) })
}

/* ---------- 概念成分快照与变动 ---------- */
// 快照：东财全 A 股列表的「所属概念」（f103；实测与 b:BKxxxx 成分列表一致），按概念名对到当日概念板块代码。
// 文本格式（便于 git 按行比较）：第一行 '#date\tYYYY-MM-DD'，之后每只股票一行 '代码\t名称\tBK0001,BK0002'

/** 全 A 股行（f12 代码、f14 名称、f103 所属概念）→ { stocks: Map(code → { name, concepts: string[] }), unmatched } */
export function conceptSnapshot(rows, conceptCodeByName) {
  const stocks = new Map()
  const unmatched = new Set()
  for (const r of rows) {
    if (!/^\d{6}$/.test(r?.f12)) continue
    const names = typeof r.f103 === 'string' ? r.f103.split(',').map((s) => s.trim()).filter((s) => s && s !== '-') : []
    const concepts = []
    for (const n of names) { const c = conceptCodeByName.get(n); if (c) concepts.push(c); else unmatched.add(n) }
    stocks.set(r.f12, { name: str(r.f14) ?? r.f12, concepts: [...new Set(concepts)].sort() })
  }
  return { stocks, unmatched: [...unmatched] }
}

export function serializeSnapshot(date, stocks) {
  const lines = [...stocks.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([c, s]) => `${c}\t${s.name.replace(/[\t\n]/g, ' ')}\t${s.concepts.join(',')}`)
  return `#date\t${date}\n${lines.join('\n')}\n`
}

export function parseSnapshot(text) {
  const lines = String(text ?? '').split('\n')
  const m = /^#date\t(\d{4}-\d{2}-\d{2})$/.exec(lines[0] ?? '')
  if (!m) return null
  const stocks = new Map()
  for (const line of lines.slice(1)) {
    const [code, name, cs] = line.split('\t')
    if (!/^\d{6}$/.test(code ?? '')) continue
    stocks.set(code, { name: name || code, concepts: cs ? cs.split(',').filter(Boolean) : [] })
  }
  return { date: m[1], stocks }
}

/**
 * 两个快照的成分变动。只比较「两天都在列表里」或「今天新上市」的股票：
 *  · 昨天在、今天不在列表里的（退市等）不算剔除；
 *  · 昨天有概念、今天一个都没有的视为当天数据缺失，整只跳过（skipped 计数），不当作全部剔除。
 * 某概念昨天没有任何成分、今天有 → newConcepts（新上线概念，只给家数）；昨天有、今天全没了 → droppedConcepts。
 */
export function diffSnapshots(base, cur, conceptNames, { listLimit = 60 } = {}) {
  const added = new Map(), removed = new Map()
  let skipped = 0
  const push = (map, concept, code, name) => { const a = map.get(concept) ?? []; a.push({ code, name }); map.set(concept, a) }
  for (const [code, s] of cur.stocks) {
    const b = base.stocks.get(code)
    if (b && b.concepts.length && !s.concepts.length) { skipped++; continue }
    const before = new Set(b?.concepts ?? [])
    const after = new Set(s.concepts)
    for (const c of after) if (!before.has(c)) push(added, c, code, s.name)
    for (const c of before) if (!after.has(c)) push(removed, c, code, s.name)
  }
  const count = (snap) => { const m = new Map(); for (const s of snap.stocks.values()) for (const c of s.concepts) m.set(c, (m.get(c) ?? 0) + 1); return m }
  const baseCount = count(base), curCount = count(cur)
  const name = (c) => conceptNames.get(c) ?? c
  const newConcepts = [...curCount.entries()].filter(([c]) => !baseCount.has(c)).map(([c, n]) => ({ code: c, name: name(c), members: n }))
  const droppedConcepts = [...baseCount.entries()].filter(([c]) => !curCount.has(c)).map(([c, n]) => ({ code: c, name: name(c), members: n }))
  const special = new Set([...newConcepts, ...droppedConcepts].map((x) => x.code))
  const concepts = [...new Set([...added.keys(), ...removed.keys()])].filter((c) => !special.has(c)).map((c) => {
    const a = added.get(c) ?? [], r = removed.get(c) ?? []
    return {
      code: c, name: name(c), members: curCount.get(c) ?? 0, addedCount: a.length, removedCount: r.length,
      added: a.slice(0, listLimit), removed: r.slice(0, listLimit),
    }
  }).sort((x, y) => (y.addedCount + y.removedCount) - (x.addedCount + x.removedCount) || x.name.localeCompare(y.name))
  return { concepts, newConcepts, droppedConcepts, skipped }
}

/**
 * 快照轮换：latest 为上次写入的快照、base 为 latest 当时的比较基准。
 * 今天第二次运行（latest.date === date）时沿用原基准；否则 latest 变成新的基准。基准必须恰好是 prevTradingDay(date)，否则不比较。
 */
export function pickBase(latest, base, date, prevDay) {
  const cand = latest?.date === date ? base : latest
  return { base: cand?.date === prevDay ? cand : null, rotate: latest && latest.date !== date ? latest : base }
}

/** 成分变动历史：{ 日期: 变动 } 保留最近 keep 个交易日 */
export function mergeChanges(store, date, rec, keep = 60) {
  const all = { ...(store ?? {}), [date]: rec }
  return Object.fromEntries(Object.entries(all).sort(([a], [b]) => a.localeCompare(b)).slice(-keep))
}

/* ---------- 板块关联 ETF（开盘啦 PlateEtfDetail） ---------- */
// ETF 行情：东财 clist fs=b:MK0021（场内股票型 ETF；MK0022 货币、MK0023 跨境、MK0024 商品与 A 股行业 / 概念板块无关，不取）。
// 跟踪指数：东财基金基本资料（fundmobapi FundMNNBasicInformation 的 INDEXCODE / INDEXNAME），逐只查询后缓存在
// data-raw/kpl-plates/etf-index.json；站内人工核验的 ETF 目录（public/data/index-etf-catalog.json）有的以目录为准。
// 板块 → ETF：用下面人工审核的关键词表，板块名精确命中某条规则后，跟踪指数名称符合该规则的 ETF 记为关联；表里没有的板块不硬配。

export const ETF_INDEX_TTL_DAYS = 60 // 跟踪指数缓存 60 天后重查（基金变更标的指数很少见）

/** ETF 行（clist f12 代码、f14 名称、f3 涨跌幅、f6 成交额、f124 更新时间）→ 规整行，成交额换算成亿元；代码 / 名称不对时返回 null */
export function parseEtfRow(r) {
  if (!/^\d{6}$/.test(r?.f12 ?? '') || !str(r.f14)) return null
  const amt = num(r.f6)
  return { code: r.f12, name: r.f14.trim(), pct: num(r.f3), amount: amt === null ? null : round(amt / 1e8, 2), updatedAt: num(r.f124) }
}

/**
 * ETF 快照校验：只数有成交的（停牌 / 未成交的更新时间停在以前，不参与新鲜度判断），
 * 至少 90% 有成交的 ETF 更新时间是 date 当天 15:00 之后，否则认为不是当天收盘数据。
 */
export function validateEtfs(rows, date, { min = 500 } = {}) {
  if (rows.length < min) throw new Error(`ETF 数量异常：${rows.length}`)
  const traded = rows.filter((r) => r.amount !== null && r.amount > 0)
  const fresh = traded.filter((r) => { const t = bjTime(r.updatedAt); return t && t.date === date && t.minutes >= 15 * 60 }).length
  if (!traded.length || fresh < traded.length * 0.9) throw new Error(`ETF 行情不是 ${date} 收盘后数据（${fresh}/${traded.length}）`)
  return rows
}

/** 东财基金基本资料 → { indexCode, indexName }；不是指数基金（'--' / 空）时两项为 null；结构不对报错 */
export function parseFundIndex(body, code) {
  const d = body?.Datas
  if (!body || body.ErrCode !== 0 || !d || d.FCODE !== code) throw new Error(`${code} 基金资料结构异常`)
  const clean = (x) => { const s = str(x); return s === null || /^-+$/.test(s) ? null : s }
  return { indexCode: clean(d.INDEXCODE), indexName: clean(d.INDEXNAME) }
}

const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400_000)
/** 需要查询跟踪指数的 ETF：缓存里没有或超过 TTL 的，按成交额从大到小，最多 limit 只 */
export function pickIndexFetch(etfs, cache, today, limit) {
  return etfs
    .filter((e) => { const c = cache?.[e.code]; return !c || !/^\d{4}-\d{2}-\d{2}$/.test(c.fetchedAt ?? '') || daysBetween(c.fetchedAt, today) > ETF_INDEX_TTL_DAYS })
    .sort((a, b) => (b.amount ?? -1) - (a.amount ?? -1))
    .slice(0, limit)
    .map((e) => e.code)
}

/**
 * 人工审核的板块 → 跟踪指数关键词表。
 *  · boards：东财板块名（申万二级行业 / 概念，精确匹配，不做模糊）；
 *  · index：跟踪指数名称须匹配的正则；exclude：命中后再排除的（港股、海外指数一律排除，A 股板块不配境外指数）；
 *  · scope：'exact' 指数与板块是同一行业 / 题材；'broad' 只能配到更宽的行业指数，页面注明「宽口径」。
 * 改表时同步改 scripts/kpl-plates.test.mjs 的用例。
 */
const OVERSEAS = /港股|恒生|香港|沪港深|沪深港|AH|中概|海外|全球|纳斯达克|标普|美国|日经|德国|法国|沙特|亚太|东南亚|中韩|中日/
export const ETF_RULES = [
  { id: 'semi', label: '半导体 / 芯片', boards: ['半导体', '半导体概念', '芯片概念', '中芯概念', '存储芯片', '先进封装', 'AI芯片', '汽车芯片', 'MCU芯片', '光刻机', '光刻胶', '第三代半导体', '第四代半导体', '大基金持股', 'EDA概念', 'IGBT概念', '碳化硅', '氮化镓', '电子化学品Ⅱ'], index: /半导体|芯片|集成电路/, scope: 'exact' },
  { id: 'broker', label: '证券公司', boards: ['证券Ⅱ', '券商概念', '参股券商'], index: /证券公司|证券龙头|全指证券|证券指数|证券行业|券商/, scope: 'exact' },
  { id: 'bank', label: '银行', boards: ['银行Ⅱ', '参股银行'], index: /银行/, exclude: /非银/, scope: 'exact' },
  { id: 'insure', label: '保险', boards: ['保险Ⅱ', '参股保险'], index: /保险/, scope: 'broad' },
  { id: 'nonbank', label: '非银 / 金融', boards: ['多元金融'], index: /非银|全指金融|金融地产/, scope: 'broad' },
  { id: 'liquor', label: '酒', boards: ['白酒Ⅱ', '白酒', '酿酒概念', '非白酒', '啤酒概念'], index: /酒/, scope: 'exact' },
  { id: 'food', label: '食品饮料', boards: ['饮料乳品', '休闲食品', '食品加工', '调味发酵品Ⅱ', '乳业', '调味品概念', '预制菜概念', '食品安全'], index: /食品|饮料/, scope: 'broad' },
  { id: 'medDevice', label: '医疗器械', boards: ['医疗器械', '医疗器械概念', '体外诊断概念'], index: /医疗器械|医疗设备/, scope: 'exact' },
  { id: 'medService', label: '医疗', boards: ['医疗服务', 'CRO', '创新医疗服务', '民营医院', '互联网医疗', '智能医疗'], index: /医疗(?!器械|设备)/, scope: 'exact' },
  { id: 'innovDrug', label: '创新药 / 生物医药', boards: ['创新药', '化学制药', '生物制品', '单抗概念', 'CAR-T细胞疗法', '免疫治疗', '重组蛋白', '生物疫苗', '减肥药', 'AI制药（医疗）'], index: /创新药|生物医药|生物科技|生物药|化学药|制药|疫苗/, scope: 'exact' },
  { id: 'tcm', label: '中药', boards: ['中药Ⅱ', '中药概念'], index: /中药/, scope: 'exact' },
  { id: 'pharma', label: '医药', boards: ['医药商业', '医药电商', '特色药', '独家药品'], index: /医药/, scope: 'broad' },
  { id: 'pv', label: '光伏', boards: ['光伏设备', '光伏概念', 'TOPCon电池', 'HJT电池', 'BC电池', '钙钛矿电池', '硅能源'], index: /光伏|太阳能/, scope: 'exact' },
  { id: 'battery', label: '电池', boards: ['电池', '锂电池概念', '固态电池', '钠离子电池', '电池技术', '麒麟电池', '刀片电池', '复合集流体', '动力电池回收'], index: /电池|锂电/, scope: 'exact' },
  { id: 'ev', label: '新能源车', boards: ['新能源车', '换电概念', '充电桩', '高压快充', '汽车热管理'], index: /新能源车|新能源汽车|电动车|电动汽车/, scope: 'exact' },
  { id: 'auto', label: '汽车', boards: ['乘用车', '汽车零部件', '商用车', '汽车整车', '汽车电子', '智能驾驶', '车联网(车路云)', '小米汽车', '华为汽车', '汽车服务', '汽车一体化压铸'], index: /汽车|智能车|智能驾驶|车联网/, exclude: /新能源/, scope: 'exact' },
  { id: 'storage', label: '储能', boards: ['储能概念', '钒电池', '熔盐储能', '抽水蓄能', '虚拟电厂', '超级电容'], index: /储能/, scope: 'exact' },
  { id: 'wind', label: '风电', boards: ['风电设备', '风能'], index: /风电/, scope: 'exact' },
  { id: 'power', label: '电力 / 电网', boards: ['电力', '绿色电力', '电网设备', '电网概念', '智能电网', '特高压', '柔性直流输电', '核能核电', '超超临界发电'], index: /电力|电网|公用事业|绿电|绿色电力|核电/, scope: 'exact' },
  { id: 'defense', label: '军工', boards: ['军工电子Ⅱ', '航天装备Ⅱ', '航空装备Ⅱ', '地面兵装Ⅱ', '军工', '军民融合', '航母概念', '大飞机', '航天航空'], index: /军工|国防|航空航天/, scope: 'exact' },
  { id: 'space', label: '卫星 / 商业航天', boards: ['商业航天', '卫星互联网', '卫星导航', '空间站概念'], index: /卫星|航天/, scope: 'exact' },
  { id: 'lowAlt', label: '低空经济', boards: ['低空经济', '飞行汽车(eVTOL)', '通用航空', '无人机'], index: /低空|通用航空/, scope: 'exact' },
  { id: 'software', label: '软件 / 信创', boards: ['软件开发', 'IT服务Ⅱ', '计算机设备', '国产软件', '信创', 'ERP概念', '财税数字化', '华为欧拉', '鸿蒙概念', '华为鲲鹏', '网络安全', '数据安全'], index: /软件|信创|信息技术|信息安全|网络安全|计算机/, scope: 'exact' },
  { id: 'cloud', label: '云计算 / 大数据', boards: ['云计算', '大数据', '数据中心', '东数西算', '算力概念', '算力租赁', '智算中心（AIDC）', '数据要素', '国资云概念', '边缘计算', '液冷服务器'], index: /云计算|大数据|数据中心|算力|数字经济/, scope: 'exact' },
  { id: 'ai', label: '人工智能', boards: ['人工智能', 'AI应用', 'AIGC概念', 'ChatGPT概念', 'AI智能体', '多模态AI', 'DeepSeek概念', 'Kimi概念', '智谱AI概念', 'AI语料', 'MLOps概念', '物理AI'], index: /人工智能|AI/, scope: 'exact' },
  { id: 'robot', label: '机器人', boards: ['机器人概念', '人形机器人', '减速器', '机器人执行器', '机器视觉', '虚拟机器人', '自动化设备'], index: /机器人/, scope: 'exact' },
  { id: 'telecom', label: '通信', boards: ['通信设备', '通信服务', '5G概念', '6G概念', 'CPO概念', '光通信模块', '铜缆高速连接', 'F5G概念', '光纤概念', '通信技术', '毫米波概念'], index: /通信|电信|5G|光模块/, exclude: /科技传媒通信/, scope: 'exact' },
  { id: 'consElec', label: '消费电子', boards: ['消费电子', '消费电子概念', '苹果概念', '小米概念', 'AI手机', 'AIPC', 'AI眼镜', '智能穿戴', '无线耳机'], index: /消费电子/, scope: 'exact' },
  { id: 'electronics', label: '电子', boards: ['元件', '光学光电子', '其他电子Ⅱ', 'PCB', '被动元件概念', 'MLCC', 'LED概念', 'OLED', 'MiniLED', 'MicroLED', '显示技术'], index: /电子(?!商务)/, exclude: /消费电子|电子政务|传媒/, scope: 'broad' },
  { id: 'game', label: '游戏 / 传媒', boards: ['游戏Ⅱ', '游戏概念', '电子竞技', '短剧互动游戏', '影视院线', '影视概念', '数字媒体', '广告营销', '出版', '电视广播Ⅱ', '文娱消费', '数字阅读'], index: /游戏|动漫|传媒|影视/, exclude: /电子信息|科技传媒通信/, scope: 'exact' },
  { id: 'coal', label: '煤炭', boards: ['煤炭开采', '焦炭Ⅱ', '煤化工概念'], index: /煤炭/, scope: 'exact' },
  { id: 'nonferrous', label: '有色金属', boards: ['工业金属', '金属新材料', '金属铜', '金属锌', '金属铅', '金属镍', '金属钴', '小金属', '小金属概念', '能源金属'], index: /有色|稀有金属|工业金属|矿业/, scope: 'exact' },
  { id: 'rareEarth', label: '稀土', boards: ['稀土永磁'], index: /稀土/, scope: 'exact' },
  { id: 'gold', label: '黄金股', boards: ['贵金属', '黄金概念'], index: /黄金股|黄金产业|黄金矿业|金矿|贵金属/, scope: 'exact' },
  { id: 'steel', label: '钢铁', boards: ['普钢', '特钢Ⅱ', '冶钢原料'], index: /钢铁/, scope: 'exact' },
  { id: 'chem', label: '化工', boards: ['化学原料', '化学制品', '化学纤维', '塑料', '橡胶', '化工原料', '氟化工概念', '磷化工', '有机硅概念', '农化制品', '钛白粉概念'], index: /化工|化学/, exclude: /化学药|化学制药/, scope: 'exact' },
  { id: 'oil', label: '石油石化', boards: ['油气开采Ⅱ', '油服工程', '炼化及贸易', '油气设服', '油气资源', '页岩气', '天然气', '燃气Ⅱ'], index: /石油|油气|石化|天然气/, scope: 'exact' },
  { id: 'realEstate', label: '房地产', boards: ['房地产开发', '房地产服务'], index: /地产/, exclude: /金融地产/, scope: 'exact' },
  { id: 'buildMat', label: '建材', boards: ['水泥', '玻璃玻纤', '装修建材'], index: /建材|建筑材料/, scope: 'exact' },
  { id: 'infra', label: '基建', boards: ['基础建设', '专业工程', '房屋建设Ⅱ', '工程建设', '装配建筑', '铁路基建', '水利建设'], index: /基建|建筑(?!材料)/, scope: 'exact' },
  { id: 'machinery', label: '机械 / 高端装备', boards: ['工程机械', '工程机械概念', '专用设备', '通用设备', '工业母机', '高端装备', '轨交设备Ⅱ'], index: /机械|高端装备|装备制造|装备产业|工业母机|机床/, scope: 'exact' },
  { id: 'appliance', label: '家电', boards: ['白色家电', '黑色家电', '小家电', '厨卫电器', '家电零部件Ⅱ', '其他家电Ⅱ', '智能家居'], index: /家电|家用电器/, scope: 'exact' },
  { id: 'farm', label: '农牧', boards: ['养殖业', '饲料', '种植业', '渔业', '农产品加工', '动物保健Ⅱ', '猪肉概念', '鸡肉概念', '农业种植', '粮食概念', '转基因'], index: /养殖|畜牧|农业|农牧|粮食/, scope: 'exact' },
  { id: 'transport', label: '交通运输 / 物流', boards: ['物流', '航运港口', '铁路公路', '航空机场', '快递概念', '冷链物流'], index: /物流|交通运输|运输|航运|港口/, scope: 'exact' },
  { id: 'tourism', label: '旅游', boards: ['旅游及景区', '酒店餐饮', '旅游零售Ⅱ', '旅游酒店', '旅游概念', '免税概念'], index: /旅游/, scope: 'exact' },
  { id: 'env', label: '环保', boards: ['环境治理', '环保设备Ⅱ', '节能环保'], index: /环保|环境/, scope: 'exact' },
  { id: 'cosmetic', label: '美容护理', boards: ['化妆品', '医疗美容', '医美概念', '化妆品概念', '个护用品'], index: /美容|化妆品|个护/, scope: 'exact' },
  { id: 'hydrogen', label: '氢能', boards: ['氢能源', '燃料电池概念'], index: /氢/, scope: 'exact' },
  { id: 'fintech', label: '金融科技', boards: ['互联网金融', '跨境支付', '移动支付', '数字货币', '区块链'], index: /金融科技|区块链/, scope: 'exact' },
  { id: 'iot', label: '物联网', boards: ['物联网', '传感器', '工业互联网'], index: /物联网|工业互联/, scope: 'exact' },
  { id: 'ship', label: '船舶', boards: ['航海装备Ⅱ', '船舶制造'], index: /船舶/, scope: 'exact' },
  { id: 'vr', label: '虚拟现实', boards: ['虚拟现实', '元宇宙概念', '增强现实', '混合现实'], index: /虚拟现实|元宇宙/, scope: 'exact' },
  { id: 'newMaterial', label: '新材料', boards: ['新材料'], index: /新材料/, scope: 'exact' },
  { id: 'elderly', label: '养老', boards: ['养老概念'], index: /养老/, scope: 'exact' },
  { id: 'newEnergy', label: '新能源', boards: ['新能源'], index: /新能源(?!车|汽车)/, scope: 'broad' },
  { id: 'soe', label: '央国企', boards: ['中特估', '央国企改革', '中字头'], index: /央企|国企|国有企业/, scope: 'exact' },
  { id: 'dividend', label: '红利', boards: ['红利股', '红利破净股'], index: /红利/, scope: 'exact' },
].map((r) => ({ ...r, exclude: r.exclude ? new RegExp(`${r.exclude.source}|${OVERSEAS.source}`) : OVERSEAS }))

/** 板块名 → 命中的规则；没有为 null（同一板块名只出现在一条规则里，测试里检查） */
export function etfRuleOf(boardName) {
  return ETF_RULES.find((r) => r.boards.includes(boardName)) ?? null
}

/** 规则的关键词（给页面展示匹配依据用）：去掉否定前瞻 (?!…) 后按 | 拆开 */
export const keywordsOf = (rule) => rule.index.source.replace(/\(\?![^)]*\)/g, '').split('|').filter(Boolean)

/** 规则是否接受某个跟踪指数名称 */
export const ruleAccepts = (rule, indexName) => !!indexName && rule.index.test(indexName) && !rule.exclude.test(indexName)

/**
 * 板块 → 关联 ETF。
 *  · boards：[{ code, name, kind }]；etfs：当日 ETF 行情（parseEtfRow）；indexOf(code) → { indexCode, indexName, basis } | null；
 *  · 每个板块列出成交额最大的 top 只，另给关联 ETF 总数、平均涨幅（简单平均，涨幅缺失的不计）、成交额合计；
 *  · 没有规则或规则下没有 ETF 的板块 count 为 0，页面显示「暂无对应 ETF」。
 */
export function linkBoardEtfs(boards, etfs, indexOf, { top = 5 } = {}) {
  const withIndex = etfs.map((e) => ({ ...e, idx: indexOf(e.code) })).filter((e) => e.idx?.indexName)
  return boards.map((b) => {
    const rule = etfRuleOf(b.name)
    const hits = rule ? withIndex.filter((e) => ruleAccepts(rule, e.idx.indexName)).sort((x, y) => (y.amount ?? -1) - (x.amount ?? -1)) : []
    const pcts = hits.map((e) => e.pct).filter((x) => x !== null)
    const amts = hits.map((e) => e.amount).filter((x) => x !== null)
    return {
      code: b.code, name: b.name, kind: b.kind,
      rule: rule ? { id: rule.id, label: rule.label, keywords: keywordsOf(rule), scope: rule.scope } : null,
      count: hits.length,
      avgPct: pcts.length ? round(mean(pcts), 2) : null,
      amount: amts.length ? round(amts.reduce((s, x) => s + x, 0), 2) : null,
      indexes: [...new Set(hits.map((e) => e.idx.indexName))].slice(0, 6),
      etfs: hits.slice(0, top).map((e) => ({ code: e.code, name: e.name, pct: e.pct, amount: e.amount, indexCode: e.idx.indexCode ?? null, indexName: e.idx.indexName, basis: e.idx.basis })),
    }
  })
}

/** 站内人工核验目录（index-etf-catalog.json）→ Map(code → { indexCode, indexName })，只取 relationship = tracks 的 */
export function catalogIndexMap(catalog) {
  const m = new Map()
  for (const r of Array.isArray(catalog?.relations) ? catalog.relations : []) {
    if (r?.relationship === 'tracks' && /^\d{6}$/.test(r.code ?? '') && str(r.indexName)) m.set(r.code, { indexCode: str(r.indexCode), indexName: r.indexName.trim() })
  }
  return m
}

/** 上一份输出里同一交易日的附加模块：本次失败时沿用（不同日期一律不沿用） */
export function keepSameDay(prev, date, key) {
  return prev && prev.asOf === date && prev[key] ? prev[key] : null
}
