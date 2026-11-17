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

/** 东财 ulist（个股）→ Map(code → { industry, concepts[] })；industry 为申万二级行业名，concepts 为所属概念名 */
export function parseStockMeta(body) {
  const d = body?.data
  if (body?.rc !== 0 || !d || !Array.isArray(d.diff)) throw new Error('东财个股所属板块结构异常')
  const out = new Map()
  for (const r of d.diff) {
    if (!/^\d{6}$/.test(r?.f12)) continue
    const concepts = typeof r.f103 === 'string' ? r.f103.split(',').map((s) => s.trim()).filter((s) => s && s !== '-') : []
    out.set(r.f12, { industry: str(r.f100), concepts })
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
