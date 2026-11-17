// 开盘啦「时间线」页签的纯计算（scripts/kpl-timeline.mjs 调用，scripts/kpl-timeline.test.mjs 覆盖）。
// 收盘后还原当日盘面时间线，不是盘中直播。口径（2026-11-18 实测核对）：
// - 指数分时：东财 push2his trends2（fields2=f51,f53,f54,f55 → 时间,收,高,低；ndays=5 每根带日期）。昨收 = 上一交易日 15:00 那根收盘。
// - 板块异动：东财 push2ex getAllBKChanges（quote.eastmoney.com/changes 页面「板块异动」用的接口）。返回 data.dt（YYYYMMDDHHMMSS，
//   收盘后为当日 150000）和 allbk[]：c 板块代码、n 名称、u 涨跌幅（字符串，%）、zjl 主力净流入（万元，已与 clist f62 元口径核对）、
//   ct 当日异动总次数、ms 最频繁个股 {c,n,t 异动类型}、ydl [{t 类型, ct 次数}]。只有当日累计数，没有逐次异动的时间。
//   ydl 中 8217–8222 六个类型东财页面没有公开名称（页面也不显示），这里不单列，只计入总次数。
// - 涨停首封时间：东财涨停池 fbt（读 public/data/kpl-daban.json 的 firstSeal；缺失时直接取带日期的涨停池）。
// - 个股盘口异动：读 public/data/kpl-abnormal.json 的 radar（东财 getAllStockChanges，无日期，只在收盘后当天采集）。
import { CHANGE_TYPES } from './kpl-abnormal-lib.mjs'

export const INDICES = [
  { id: 'sh', secid: '1.000001', code: '000001', name: '上证指数', short: '上证' },
  { id: 'sz', secid: '0.399001', code: '399001', name: '深证成指', short: '深成' },
  { id: 'cyb', secid: '0.399006', code: '399006', name: '创业板指', short: '创业板' },
]
/** 指数「整点 / 半点」关键时刻（取该分钟收盘） */
export const CHECKPOINTS = ['10:00', '10:30', '11:00', '11:30', '13:30', '14:00', '14:30']
/** 半小时时段：竞价（09:30 前）+ 8 个连续竞价时段；11:30 归上午最后一段，15:00 归 14:30 段 */
export const SLOTS = [
  { id: '09:25', label: '集合竞价' }, { id: '09:30', label: '09:30–10:00' }, { id: '10:00', label: '10:00–10:30' },
  { id: '10:30', label: '10:30–11:00' }, { id: '11:00', label: '11:00–11:30' }, { id: '13:00', label: '13:00–13:30' },
  { id: '13:30', label: '13:30–14:00' }, { id: '14:00', label: '14:00–14:30' }, { id: '14:30', label: '14:30–15:00' },
]
export const BOARD_KINDS = { concept: '概念', industry1: '行业（申万一级）', industry2: '行业（申万二级）', region: '地域' }
export const CONCEPT_MIN_ZT = 3 // 概念板块当日涨停 ≥ 3 只才进时间线（概念重叠多，少于 3 只噪声大）
export const INDUSTRY_MIN_ZT = 2 // 申万二级行业 ≥ 2 只
export const BOARD_KEEP = 300 // 板块异动表最多保留的板块数（按异动次数）
export const HISTORY_KEEP = 120

const num = (x) => (x === null || x === undefined || String(x).trim() === '' || String(x).trim() === '-' || !Number.isFinite(Number(x)) ? null : Number(x))
const round = (v, d = 2) => (v === null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d)
const pctOf = (v, base) => (v === null || !base ? null : round((v / base - 1) * 100))
export const hms = (x) => {
  if (typeof x === 'string' && /^\d{2}:\d{2}(:\d{2})?$/.test(x)) return x.length === 5 ? `${x}:00` : x
  const n = num(x)
  if (n === null || n < 0 || n > 235959) return null
  const s = String(Math.round(n)).padStart(6, '0')
  return `${s.slice(0, 2)}:${s.slice(2, 4)}:${s.slice(4, 6)}`
}

/* ---------------- 指数分时 ---------------- */

/** trends2 响应（fields2=f51,f53,f54,f55）→ { code, name, days: { 日期: [{ t, close, high, low }] } } */
export function parseIndexTrends(body) {
  const d = body?.data
  if (body?.rc !== 0 || !d || !Array.isArray(d.trends) || !d.trends.length) throw new Error('东财分时数据异常')
  const days = {}
  for (const s of d.trends) {
    const f = String(s).split(',')
    const [date, t] = (f[0] ?? '').split(' ')
    const [close, high, low] = [num(f[1]), num(f[2]), num(f[3])]
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(t ?? '') || close === null) continue
    ;(days[date] ??= []).push({ t, close, high: high ?? close, low: low ?? close })
  }
  return { code: String(d.code ?? ''), name: String(d.name ?? '').trim(), days }
}

/**
 * 某指数某日的关键点。要求当日 241 根齐全、上一交易日在窗口内（昨收），否则抛错（不画半截）。
 * 返回 { prevClose, open, close, pct, high:{t,v,pct}, low:{t,v,pct}, amp, checkpoints:[{t,pct}], series:[pct,…] }
 */
export function indexDay(parsed, date, prevDate) {
  const bars = parsed.days[date]
  const prev = parsed.days[prevDate]
  if (!bars || bars.length < 241) throw new Error(`${parsed.name || parsed.code} ${date} 分时不完整（${bars?.length ?? 0}/241）`)
  if (!prev?.length) throw new Error(`${parsed.name || parsed.code} 缺上一交易日 ${prevDate} 分时，无法确定昨收`)
  const prevClose = prev.at(-1).close
  let hi = bars[0], lo = bars[0]
  for (const b of bars) { if (b.high > hi.high) hi = b; if (b.low < lo.low) lo = b }
  const at = new Map(bars.map((b) => [b.t, b]))
  const close = bars.at(-1).close
  return {
    prevClose, open: bars[0].close, openPct: pctOf(bars[0].close, prevClose), close, pct: pctOf(close, prevClose),
    high: { t: hi.t, v: hi.high, pct: pctOf(hi.high, prevClose) },
    low: { t: lo.t, v: lo.low, pct: pctOf(lo.low, prevClose) },
    amp: round(((hi.high - lo.low) / prevClose) * 100),
    checkpoints: CHECKPOINTS.map((t) => ({ t, pct: at.has(t) ? pctOf(at.get(t).close, prevClose) : null })),
    times: bars.map((b) => b.t),
    series: bars.map((b) => pctOf(b.close, prevClose)),
  }
}

/* ---------------- 板块异动 ---------------- */

const KNOWN = new Set(Object.keys(CHANGE_TYPES).map(Number))

/** getAllBKChanges 响应 → { time, boards }。dt 日期必须是目标交易日、时间 ≥ 14:59，条数要齐，否则抛错 */
export function parseBkChanges(body, date) {
  const d = body?.data
  if (body?.rc !== 0 || !d || !Array.isArray(d.allbk) || !Number.isInteger(d.tc)) throw new Error('板块异动返回结构异常')
  const dt = String(d.dt ?? '')
  if (!/^\d{14}$/.test(dt)) throw new Error('板块异动缺少日期')
  const day = `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}`
  if (day !== date) throw new Error(`板块异动日期 ${day} 不是 ${date}`)
  const time = `${dt.slice(8, 10)}:${dt.slice(10, 12)}:${dt.slice(12, 14)}`
  if (time < '14:59:00') throw new Error(`板块异动截至 ${time}，还不是收盘后的全天数据`)
  if (d.allbk.length !== d.tc) throw new Error(`板块异动条数不完整（${d.allbk.length}/${d.tc}）`)
  const boards = d.allbk.map((b) => {
    if (!/^BK\d{4}$/.test(String(b?.c)) || typeof b.n !== 'string') throw new Error('板块异动字段异常')
    const types = []
    let up = 0, down = 0
    for (const y of Array.isArray(b.ydl) ? b.ydl : []) {
      const t = num(y?.t), c = num(y?.ct)
      if (t === null || c === null || !KNOWN.has(t)) continue
      types.push([t, c])
      if (CHANGE_TYPES[t][1] > 0) up += c
      else down += c
    }
    const ms = b.ms && typeof b.ms === 'object' && /^\d{6}$/.test(String(b.ms.c)) ? { code: String(b.ms.c), name: String(b.ms.n ?? '').trim(), type: num(b.ms.t) } : null
    const flow = num(b.zjl)
    // types：已知类型按次数降序取前 5，[类型, 次数]
    return { code: String(b.c), name: b.n.trim(), pct: round(num(b.u)), flow: flow === null ? null : round(flow / 10000), count: num(b.ct), up, down, types: types.sort((x, y) => y[1] - x[1]).slice(0, 5), ms }
  })
  return { time, boards }
}

/** 板块分类：kinds = { concept, industry1, industry2, region, stat }（各为板块代码 Set）；统计类（e:4）和三级行业等其他板块去掉 */
export function classifyBoards(boards, kinds) {
  const kindOf = (code) => {
    if (kinds.stat.has(code)) return null
    if (kinds.industry2.has(code)) return 'industry2'
    if (kinds.industry1.has(code)) return 'industry1'
    if (kinds.region.has(code)) return 'region'
    if (kinds.concept.has(code)) return 'concept'
    return null
  }
  return boards.map((b) => ({ ...b, kind: kindOf(b.code) })).filter((b) => b.kind)
}

/* ---------------- 涨停股 → 板块 ---------------- */

/** 东财 ulist f100 / f103 → Map(code → { industry, concepts })；statNames 为统计类概念名（融资融券、深股通等），从概念里去掉 */
export function parseStockMeta(body, statNames = new Set()) {
  const rows = body?.data?.diff
  if (body?.rc !== 0 || !Array.isArray(rows)) throw new Error('个股所属板块返回异常')
  const out = new Map()
  for (const r of rows) {
    if (!/^\d{6}$/.test(String(r?.f12))) continue
    const industry = typeof r.f100 === 'string' && r.f100.trim() && r.f100.trim() !== '-' ? r.f100.trim() : null
    const concepts = typeof r.f103 === 'string' ? r.f103.split(',').map((s) => s.trim()).filter((s) => s && s !== '-' && !statNames.has(s)) : []
    out.set(String(r.f12), { industry, concepts })
  }
  return out
}

/** 每个概念当日有几只涨停股（用来给「概念提示」排序） */
export function conceptCounts(zt, meta) {
  const c = new Map()
  for (const s of zt) for (const k of meta.get(s.code)?.concepts ?? []) c.set(k, (c.get(k) ?? 0) + 1)
  return c
}

/** 概念提示：该股所属概念按「当日涨停股中属于该概念的只数」降序取前 n 个（只数 ≥ 2 才算），不做文字归因 */
export function conceptHint(code, meta, counts, { exclude = '', n = 3 } = {}) {
  const list = (meta.get(code)?.concepts ?? []).filter((k) => k !== exclude && (counts.get(k) ?? 0) >= 2)
  return list.sort((a, b) => counts.get(b) - counts.get(a) || a.localeCompare(b, 'zh')).slice(0, n).map((k) => ({ name: k, zt: counts.get(k) }))
}

/** 涨停股按板块分组：行业用涨停池 sector（申万二级），概念用 f103。返回 Map(板块名 → 按首封时间排序的涨停股) */
export function ztByBoard(zt, meta) {
  const ind = new Map(), con = new Map()
  const push = (m, k, s) => { const a = m.get(k) ?? []; a.push(s); m.set(k, a) }
  for (const s of zt) {
    if (!s.firstSeal) continue
    const sector = s.sector || meta.get(s.code)?.industry
    if (sector) push(ind, sector, s)
    for (const k of meta.get(s.code)?.concepts ?? []) push(con, k, s)
  }
  const sort = (m) => { for (const a of m.values()) a.sort((x, y) => x.firstSeal.localeCompare(y.firstSeal) || x.code.localeCompare(y.code)); return m }
  return { industry: sort(ind), concept: sort(con) }
}

/** 板块异动表：按异动次数排序，附当日涨停只数、首只涨停时间和股票、概念提示 */
export function boardTable(boards, groups, meta, counts) {
  const rows = boards.map((b) => {
    const g = b.kind === 'industry2' ? groups.industry.get(b.name) : b.kind === 'concept' ? groups.concept.get(b.name) : undefined
    const mapped = b.kind === 'industry2' || b.kind === 'concept'
    const first = g?.[0]
    return {
      ...b,
      zt: mapped ? g?.length ?? 0 : null,
      firstZt: first ? { time: first.firstSeal, code: first.code, name: first.name } : null,
      hint: first ? conceptHint(first.code, meta, counts, { exclude: b.name }) : [],
    }
  })
  return rows.sort((a, b) => (b.count ?? -1) - (a.count ?? -1) || a.code.localeCompare(b.code)).slice(0, BOARD_KEEP)
}

/* ---------------- 时间线与半小时小结 ---------------- */

export const slotOf = (time) => {
  if (!time) return null
  if (time < '09:30:00') return '09:25'
  if (time >= '11:30:00' && time < '13:00:00') return '11:00'
  if (time >= '14:30:00') return '14:30'
  const [h, m] = time.split(':').map(Number)
  return `${String(h).padStart(2, '0')}:${m < 30 ? '00' : '30'}`
}
const sign = (v) => (v === null ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)}%`)

/**
 * 合并时间线。入参都可缺（null / []），缺的部分就不出现。
 * kind：index 指数关键点、board 板块涨停扩散、zt 首次封涨停、touch 触及涨停未封住、radar 盘口异动（封 / 开涨停）、bigbuy 大笔买入
 */
export function buildEvents({ indices = null, zt = [], zb = [], groups = null, meta = new Map(), counts = new Map(), radar = null }) {
  const ev = []
  if (indices) {
    const list = INDICES.filter((x) => indices[x.id])
    const line = (pick) => list.map((x) => `${x.short} ${sign(pick(indices[x.id]))}`).join(' · ')
    if (list.length) {
      ev.push({ t: '09:30:00', kind: 'index', title: '开盘', detail: line((d) => d.openPct), dir: Math.sign(indices[list[0].id].openPct ?? 0) })
      CHECKPOINTS.forEach((t, i) => {
        const main = indices[list[0].id].checkpoints[i]?.pct ?? null
        ev.push({ t: `${t}:00`, kind: 'index', title: t === '11:30' ? '午间收盘' : `${t} 盘面`, detail: line((d) => d.checkpoints[i]?.pct ?? null), dir: Math.sign(main ?? 0) })
      })
      ev.push({ t: '15:00:00', kind: 'index', title: '收盘', detail: line((d) => d.pct), dir: Math.sign(indices[list[0].id].pct ?? 0) })
      for (const x of list) {
        const d = indices[x.id]
        ev.push({ t: `${d.high.t}:00`, kind: 'index', title: `${x.name}日内最高`, detail: `${d.high.v.toFixed(2)}（${sign(d.high.pct)}）`, dir: 1 })
        ev.push({ t: `${d.low.t}:00`, kind: 'index', title: `${x.name}日内最低`, detail: `${d.low.v.toFixed(2)}（${sign(d.low.pct)}）`, dir: -1 })
      }
    }
  }
  if (groups) {
    const add = (m, kind, min, cap) => {
      const list = [...m.entries()].filter(([, a]) => a.length >= min).sort((a, b) => b[1].length - a[1].length || a[1][0].firstSeal.localeCompare(b[1][0].firstSeal)).slice(0, cap)
      for (const [name, a] of list) {
        const hint = conceptHint(a[0].code, meta, counts, { exclude: name })
        ev.push({ t: a[0].firstSeal, kind: 'board', title: `${name} 首只涨停：${a[0].name}`, detail: `${kind}，当日共 ${a.length} 只涨停`, board: name, code: a[0].code, hint, dir: 1 })
        if (a.length >= 3) ev.push({ t: a[2].firstSeal, kind: 'board', title: `${name} 涨停扩散到 3 只`, detail: a.slice(0, 3).map((s) => s.name).join('、'), board: name, dir: 1 })
      }
    }
    add(groups.industry, '申万二级行业', INDUSTRY_MIN_ZT, 30)
    add(groups.concept, '概念', CONCEPT_MIN_ZT, 20)
  }
  for (const s of zt) {
    if (!s.firstSeal) continue
    const bits = [s.sector || null, s.boards ? `${s.boards} 板` : null, s.opens ? `开板 ${s.opens} 次` : null, s.lastSeal && s.lastSeal !== s.firstSeal ? `最后封板 ${s.lastSeal}` : null].filter(Boolean)
    ev.push({ t: s.firstSeal, kind: 'zt', title: `${s.name} 首次封涨停`, detail: bits.join(' · '), code: s.code, hint: conceptHint(s.code, meta, counts), dir: 1 })
  }
  for (const s of zb) {
    if (!s.firstSeal) continue
    const bits = [s.sector || null, s.opens ? `开板 ${s.opens} 次` : null, s.pct === null || s.pct === undefined ? null : `收盘 ${sign(s.pct)}`].filter(Boolean)
    ev.push({ t: s.firstSeal, kind: 'touch', title: `${s.name} 首次触及涨停（收盘未封住）`, detail: bits.join(' · '), code: s.code, dir: -1 })
  }
  if (radar) {
    for (const e of radar.timeline ?? []) {
      if (!/^\d{2}:\d{2}:\d{2}$/.test(e.time ?? '')) continue
      const open = e.type === 16
      ev.push({ t: e.time, kind: 'radar', title: `${e.name} ${open ? '打开涨停板' : '封涨停板'}`, detail: e.price == null ? '' : `${Number(e.price).toFixed(2)} 元`, code: e.code, dir: open ? -1 : 1 })
    }
    for (const s of radar.top?.['8193'] ?? []) {
      if (!/^\d{2}:\d{2}:\d{2}$/.test(s.first ?? '')) continue
      ev.push({ t: s.first, kind: 'bigbuy', title: `${s.name} 首笔大笔买入`, detail: `全天大笔买入 ${s.n} 次（最后 ${s.last}）`, code: s.code, dir: 1 })
    }
  }
  const order = { index: 0, board: 1, zt: 2, touch: 3, radar: 4, bigbuy: 5 }
  return ev.sort((a, b) => a.t.localeCompare(b.t) || order[a.kind] - order[b.kind] || a.title.localeCompare(b.title, 'zh'))
}

/** 每 30 分钟小结：涨停新增 / 累计、触板未封新增、上证该时段涨跌、新增涨停最多的行业与概念、盘口异动数（有则填） */
export function buildSlots({ zt = [], zb = [], meta = new Map(), sh = null, radar = null }) {
  const startOf = { '09:25': null, '09:30': null, '10:00': '10:00', '10:30': '10:30', '11:00': '11:00', '13:00': '11:30', '13:30': '13:30', '14:00': '14:00', '14:30': '14:30' }
  const endOf = { '09:25': null, '09:30': '10:00', '10:00': '10:30', '10:30': '11:00', '11:00': '11:30', '13:00': '13:30', '13:30': '14:00', '14:00': '14:30', '14:30': '15:00' }
  const shAt = sh ? new Map(sh.times.map((t, i) => [t, sh.series[i]])) : null
  const shPct = (t) => (shAt && t ? shAt.get(t) ?? null : null)
  let cum = 0
  return SLOTS.map(({ id, label }) => {
    const nz = zt.filter((s) => slotOf(s.firstSeal) === id)
    cum += nz.length
    const top = (keyOf) => {
      const c = new Map()
      for (const s of nz) for (const k of keyOf(s)) c.set(k, (c.get(k) ?? 0) + 1)
      const best = [...c.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh'))[0]
      return best && best[1] >= 2 ? { name: best[0], zt: best[1] } : null
    }
    let shChange = null
    if (sh && id === '09:25') shChange = sh.openPct
    else if (sh && id === '09:30') shChange = shPct('10:00') === null || sh.openPct === null ? null : round(shPct('10:00') - sh.openPct)
    else if (sh) { const a = shPct(startOf[id]), b = shPct(endOf[id]); shChange = a === null || b === null ? null : round(b - a) }
    const bucket = radar ? radar.buckets?.find((b) => b.t === (id === '09:25' ? '09:15' : id))?.c ?? {} : null
    const radarCount = bucket ? Object.values(bucket).reduce((s, v) => s + (Number(v) || 0), 0) : null
    return {
      id, label, ztNew: nz.length, ztCum: cum,
      touchNew: zb.filter((s) => slotOf(s.firstSeal) === id).length,
      shChange, shEnd: id === '09:25' ? sh?.openPct ?? null : shPct(endOf[id]),
      topIndustry: top((s) => [s.sector || meta.get(s.code)?.industry].filter(Boolean)),
      topConcept: top((s) => meta.get(s.code)?.concepts ?? []),
      radar: radarCount, sealEv: bucket ? bucket['4'] ?? 0 : null, openEv: bucket ? bucket['16'] ?? 0 : null,
      stocks: nz.slice(0, 8).map((s) => s.name),
    }
  })
}

/** 每日一行的历史，按日期去重、保留最近 HISTORY_KEEP 天 */
export function mergeHistory(history, row, keep = HISTORY_KEEP) {
  const m = new Map((Array.isArray(history) ? history : []).filter((h) => h && /^\d{4}-\d{2}-\d{2}$/.test(h.date)).map((h) => [h.date, h]))
  m.set(row.date, row)
  return [...m.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-keep)
}

/** kpl-daban.json 的 zt / zb 行 → 时间线用的精简行；asOf 不是目标日就返回 null */
export function fromDaban(body, date) {
  if (!body || body.asOf !== date || !Array.isArray(body.zt) || !body.zt.length) return null
  const zt = body.zt.filter((r) => /^\d{6}$/.test(r?.code)).map((r) => ({ code: r.code, name: String(r.name ?? ''), sector: r.sector || '', boards: num(r.boards), firstSeal: hms(r.firstSeal), lastSeal: hms(r.lastSeal), opens: num(r.opens) }))
  const zb = (Array.isArray(body.zb) ? body.zb : []).filter((r) => /^\d{6}$/.test(r?.code)).map((r) => ({ code: r.code, name: String(r.name ?? ''), sector: r.sector || '', firstSeal: hms(r.firstSeal), opens: num(r.opens), pct: num(r.pct) }))
  return { zt, zb }
}

/** market-mood-lib parsePool 的行 → 时间线用的精简行（涨停池兜底时用） */
export const fromPoolRow = (r) => ({ code: r.code, name: r.name, sector: r.sector || '', boards: r.boards, firstSeal: hms(r.firstSeal), lastSeal: null, opens: r.opens, pct: r.pct })

/** kpl-abnormal.json 的 radar，日期对得上才用 */
export const radarOf = (body, date) => (body?.radar && body.radar.date === date && Array.isArray(body.radar.timeline) ? body.radar : null)
