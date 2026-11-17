// 开盘啦 · 时间线数据模型：读 public/data/kpl-timeline.json（scripts/kpl-timeline.mjs 每个交易日收盘后生成）。
// 收盘后用公开数据还原的当日盘面时间线，不是盘中直播。口径见 scripts/kpl-timeline-lib.mjs 顶部与下方 METHOD。

export type IndexId = 'sh' | 'sz' | 'cyb'
export type IndexDay = {
  id: IndexId; code: string; name: string
  prevClose: number; open: number; openPct: number | null; close: number; pct: number | null
  high: { t: string; v: number; pct: number | null }
  low: { t: string; v: number; pct: number | null }
  amp: number | null
  checkpoints: Array<{ t: string; pct: number | null }>
  series: Array<number | null>
}
export type Hint = { name: string; zt: number }
export type EventKind = 'index' | 'board' | 'zt' | 'touch' | 'radar' | 'bigbuy'
export type TimelineEvent = { t: string; kind: EventKind; title: string; detail?: string; code?: string; board?: string; hint?: Hint[]; dir?: number }
export type Slot = {
  id: string; label: string; ztNew: number; ztCum: number; touchNew: number
  shChange: number | null; shEnd: number | null
  topIndustry: Hint | null; topConcept: Hint | null
  radar: number | null; sealEv: number | null; openEv: number | null
  stocks: string[]
}
export type BoardKind = 'concept' | 'industry1' | 'industry2' | 'region'
export type BoardRow = {
  code: string; name: string; kind: BoardKind; pct: number | null; flow: number | null; count: number | null
  up: number; down: number; types: Array<[number, number]>
  ms: { code: string; name: string; type: number | null } | null
  zt: number | null; firstZt: { time: string; code: string; name: string } | null; hint: Hint[]
}
export type HistoryDay = { date: string; zt: number | null; shPct: number | null; shAmp: number | null; boardTop: string | null; boardTopCount: number | null; radarTotal: number | null }

export type KplTimeline = {
  version: 1
  generatedAt: string
  date: string
  prevDate: string
  note: string
  times: string[]
  indices: IndexDay[]
  parts: { index: boolean; pools: 'daban' | 'pool' | null; boards: string | null; concepts: boolean; radar: number | null }
  summary: { zt: number | null; touch: number | null; firstZt: string | null; boardTop: { name: string; count: number | null } | null; radarTotal: number | null; events: number }
  slots: Slot[]
  events: TimelineEvent[]
  boards: { asOf: string; total: number; kept: number; rows: BoardRow[] } | null
  history: HistoryDay[]
  sources: Array<{ id: string; label: string; url: string }>
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const isDate = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x)
const KINDS = new Set<EventKind>(['index', 'board', 'zt', 'touch', 'radar', 'bigbuy'])
const isIndex = (x: unknown): boolean => isObj(x) && typeof x.name === 'string' && Array.isArray(x.series) && isObj(x.high) && isObj(x.low) && Array.isArray(x.checkpoints)
const isEvent = (x: unknown): boolean => isObj(x) && typeof x.t === 'string' && typeof x.title === 'string' && KINDS.has(x.kind as EventKind)
const isBoard = (x: unknown): boolean => isObj(x) && typeof x.code === 'string' && typeof x.name === 'string' && typeof x.kind === 'string'

/** 结构校验：日期、指数、时间线缺失时返回 null（页面显示「数据文件格式不对」）；板块异动、历史等次要部分缺失按空显示 */
export function asKplTimeline(body: unknown): KplTimeline | null {
  if (!isObj(body) || body.version !== 1 || !isDate(body.date)) return null
  if (!Array.isArray(body.indices) || !body.indices.length || !body.indices.every(isIndex)) return null
  if (!Array.isArray(body.events) || !Array.isArray(body.times)) return null
  const parts = isObj(body.parts) ? body.parts : {}
  const summary = isObj(body.summary) ? body.summary : {}
  const b = isObj(body.boards) && Array.isArray(body.boards.rows) ? body.boards : null
  return {
    ...(body as unknown as KplTimeline),
    note: typeof body.note === 'string' ? body.note : '',
    events: (body.events as unknown[]).filter(isEvent) as TimelineEvent[],
    slots: Array.isArray(body.slots) ? (body.slots as unknown[]).filter(s => isObj(s) && typeof s.label === 'string') as Slot[] : [],
    parts: {
      index: parts.index === true,
      pools: parts.pools === 'daban' || parts.pools === 'pool' ? parts.pools : null,
      boards: typeof parts.boards === 'string' ? parts.boards : null,
      concepts: parts.concepts === true,
      radar: typeof parts.radar === 'number' ? parts.radar : null,
    },
    summary: {
      zt: typeof summary.zt === 'number' ? summary.zt : null,
      touch: typeof summary.touch === 'number' ? summary.touch : null,
      firstZt: typeof summary.firstZt === 'string' ? summary.firstZt : null,
      boardTop: isObj(summary.boardTop) && typeof summary.boardTop.name === 'string' ? (summary.boardTop as KplTimeline['summary']['boardTop']) : null,
      radarTotal: typeof summary.radarTotal === 'number' ? summary.radarTotal : null,
      events: typeof summary.events === 'number' ? summary.events : 0,
    },
    boards: b ? { asOf: String(b.asOf ?? ''), total: Number(b.total) || 0, kept: Number(b.kept) || 0, rows: (b.rows as unknown[]).filter(isBoard).map(r => ({ ...(r as BoardRow), types: Array.isArray((r as BoardRow).types) ? (r as BoardRow).types : [], hint: Array.isArray((r as BoardRow).hint) ? (r as BoardRow).hint : [] })) } : null,
    history: Array.isArray(body.history) ? (body.history as unknown[]).filter(h => isObj(h) && isDate(h.date)) as HistoryDay[] : [],
    sources: Array.isArray(body.sources) ? (body.sources as KplTimeline['sources']) : [],
  }
}

export const KIND_LABEL: Record<EventKind, string> = {
  index: '指数', board: '板块', zt: '首次封涨停', touch: '触板未封', radar: '封板 / 开板', bigbuy: '大笔买入',
}
export const BOARD_KIND_LABEL: Record<BoardKind, string> = { concept: '概念', industry1: '申万一级', industry2: '申万二级', region: '地域' }

/** 东财盘口异动类型名（与 scripts/kpl-abnormal-lib.mjs CHANGE_TYPES 一致；dir 1 偏多、−1 偏空） */
export const CHANGE_NAME: Record<number, [string, number]> = {
  4: ['封涨停板', 1], 8: ['封跌停板', -1], 16: ['打开涨停板', -1], 32: ['打开跌停板', 1],
  64: ['有大买盘', 1], 128: ['有大卖盘', -1], 8193: ['大笔买入', 1], 8194: ['大笔卖出', -1],
  8201: ['火箭发射', 1], 8202: ['快速反弹', 1], 8203: ['高台跳水', -1], 8204: ['加速下跌', -1],
  8207: ['竞价上涨', 1], 8208: ['竞价下跌', -1], 8209: ['高开5日线', 1], 8210: ['低开5日线', -1],
  8211: ['向上缺口', 1], 8212: ['向下缺口', -1], 8213: ['60日新高', 1], 8214: ['60日新低', -1],
  8215: ['60日大幅上涨', 1], 8216: ['60日大幅下跌', -1],
}

/** 页面上写明的口径（与 scripts/kpl-timeline-lib.mjs 一致） */
export const METHOD = {
  live: '这是收盘后用公开数据还原的「当日盘面时间线」，不是盘中直播：每个交易日收盘后（北京 15:40 左右起）生成一次，盘中不更新。',
  index: '指数关键点：东财指数分时（每分钟收盘价，带日期）。涨跌幅以上一交易日 15:00 收盘为基数；日内最高 / 最低取分钟线最高 / 最低价；整点 / 半点涨跌取该分钟收盘。',
  zt: '首次封涨停：东财涨停股池的「首次封板时间」（09:25 为集合竞价封板）。只有收盘仍封住的股票在涨停池里；盘中封过但收盘没封住的在炸板池，时间线里记为「首次触及涨停（收盘未封住）」，时间同样是首次封板时间。打开 / 回封的每一次时间东财股池不提供，只给开板次数和最后封板时间。',
  board: '板块涨停扩散：把当日涨停股按申万二级行业（涨停池所属行业）和东财概念（个股 f103 概念）分组，按首次封板时间排序，记下每个板块「首只涨停」和「第 3 只涨停」的时刻。只列行业 ≥ 2 只、概念 ≥ 3 只涨停的板块（概念最多 20 个、行业最多 30 个），融资融券、深股通、昨日涨停等东财统计类概念不算。',
  hint: '概念提示（代替「爆发原因」）：本站不做文字归因。提示的是该板块首只涨停股所属的东财概念，按「当日涨停股中有几只属于该概念」排序，只列 ≥ 2 只的前 3 个。它只说明当天涨停股集中在哪些概念，不代表上涨原因。概念归属取运行当时东财的个股概念（历史日期可能与当时略有不同）。',
  slots: '半小时小结：按首次封板时间把涨停股分到 9 个时段（09:30 前算集合竞价；11:30 归上午最后一段；15:00 归 14:30 段）。「最活跃板块」= 该时段新增涨停最多的申万二级行业 / 东财概念（至少 2 只才列）；上证时段涨跌 = 时段末减时段初的涨跌幅（百分点），集合竞价段为开盘涨跌幅。盘口异动数在当日收盘后采集到时才有。',
  bk: '板块异动：东财「板块异动」当日累计数据（接口自带日期和截至时间，收盘后为 15:00）。异动次数 = 板块成分股当天触发东财盘口异动的总次数（火箭发射、快速反弹、大笔买入、封涨停等）；偏多 / 偏空 = 按东财给出的方向把各类型次数相加（有 6 个类型东财页面没有公开名称，只计入总次数，所以偏多 + 偏空会小于总数）；偏多占比 = 偏多 ÷（偏多 + 偏空）。主力净流入为东财口径（亿元）。最频繁个股为东财给出的该板块异动最多的股票及其主要异动类型。该接口只有当日累计，没有每一次板块异动的时间，所以表里的「首只涨停」时间来自涨停池（只有申万二级行业和概念能对应，地域与一级行业不对应）。统计类板块（融资融券、昨日涨停、机构重仓等）和申万三级等其他板块已去掉；成分股多的大板块异动次数天然更多。',
  radar: '个股盘口异动（封涨停板 / 打开涨停板 / 大笔买入）：读本站「异动监管」页收盘后当天采集的东财盘口异动（接口没有日期，只能当天采集）。封板 / 开板事件取前 400 条；大笔买入只列当日次数最多的 10 只股票的首笔时间。',
  skipped: '未做：盘中实时推送与 AI 解读（开盘啦「大盘直播」的 AI 文字需要其自有模型和实时数据，本页只做收盘后还原，也不写原因解读）；每一次板块异动的发生时刻（东财公开接口只给当日累计次数）；「爆发原因」的新闻归因（需要新闻文本与人工判断，改为概念提示）；集合竞价逐笔异动（需要竞价逐笔数据）；炸板 / 回封的逐次时间（股池只给次数）。',
} as const
