// 开盘啦 · 异动监管数据模型：读 public/data/kpl-abnormal.json（scripts/kpl-abnormal.mjs 每个交易日收盘后生成）。
// 偏离值、下一交易日触发条件、龙虎榜规则判断都按沪深交易所公开规则机械计算（见 scripts/kpl-abnormal-lib.mjs），不是预测。

export type Board = 'sh' | 'kcb' | 'sz' | 'cyb'
export const BOARD_LABEL: Record<Board, string> = { sh: '沪主板', kcb: '科创板', sz: '深主板', cyb: '创业板' }

export type Need = { need: number; price: number }
export type BaseRow = {
  code: string; name: string; board: Board; close: number | null; pct: number | null; dev1: number | null
  dev3: number | null; dev3Days: number | null; dev10: number | null; dev10Days: number | null; dev30: number | null; dev30Days: number | null
}
export type TriggeredRow = BaseRow & {
  trig: string[]; trigDev: number | null; trigDays: number | null
  /** 当日实际龙虎榜：d3up / d3down 已公布 3 日异常波动，severe 严重异常波动，none 未公布，null 龙虎榜尚未发布 */
  official: 'd3up' | 'd3down' | 'severe' | 'none' | null
}
export type NearRow = BaseRow & { up3: Need | null; down3: Need | null; sameUp: number; sameDown: number }
export type SevereRow = BaseRow & { up10: Need | null; down10: Need | null; up30: Need | null; down30: Need | null; sameUp: number; sameDown: number; sameNext: boolean }
export type LhbRow = { code: string; name: string; board: Board; cat: string; value: number | null; hit: boolean | null }
export type LhbMissed = { code: string; name: string; board: Board | null; cat: string }
export type LhbStats = { predicted: number; actual: number; hit: number; precision: number | null; recall: number | null }
export type Backtest = { days: number; calc: number; actual: number; hit: number; from: string | null; to: string | null; precision: number | null; recall: number | null }
export type SuspendRow = {
  code: string; name: string; market: string; start: string; startTime: string | null; end: string | null; endTime?: string | null
  kind: string; reason: string; resume: string | null; days?: number | null; nth?: number; suspendedDays?: number | null; since?: number | null; dev3?: number | null
}
export type Suspend = { today: SuspendRow[]; intraday: SuspendRow[]; resumed: SuspendRow[] }
export type RadarType = { id: number; name: string; dir: number; count: number }
export type RadarStock = { code: string; name: string; n: number; first: string; last: string; amount: number | null }
export type Radar = {
  date: string; total: number; types: RadarType[]
  buckets: Array<{ t: string; c: Record<string, number> }>
  top: Record<string, RadarStock[]>
  timeline: Array<{ time: string; code: string; name: string; type: number; price: number | null }>
}
export type HistoryDay = {
  date: string; d3up: number; d3down: number; severe: number; nearUp: number; nearDown: number
  suspended: number | null; resumed?: number | null; lhbPredicted?: number; lhbHit?: number | null; radarTotal: number | null; kline?: boolean
}
export type Summary = {
  universe: number; d3up: number; d3down: number; severe: number; nearUp: number; nearDown: number
  suspended: number | null; resumed: number | null; lhbPredicted: number; lhbHit: number | null; radarTotal: number | null
}

export type KplAbnormal = {
  version: 1
  generatedAt: string
  date: string
  note: string
  indices: Array<{ board: Board; code: string; name: string; pct: number | null }>
  summary: Summary
  triggered: TriggeredRow[]
  nearUp: NearRow[]
  nearDown: NearRow[]
  severeWatch: SevereRow[]
  lhb: { available: boolean; rows: LhbRow[]; missed: LhbMissed[]; stats: LhbStats | null; backtest: Backtest | null }
  suspend: Suspend | null
  radar: Radar | null
  history: HistoryDay[]
  archive: { from: string | null; to: string; days: number; backfilled: number } | null
  sources: Array<{ id: string; label: string; url: string }>
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const isDate = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x)
const rowsOk = (x: unknown): boolean => Array.isArray(x) && x.every(r => isObj(r) && typeof r.code === 'string' && typeof r.name === 'string')
const list = <T,>(x: unknown, ok = rowsOk): T[] => (ok(x) ? (x as T[]) : [])

/** 结构校验：关键字段缺失时返回 null，页面显示「数据文件格式不对」；次要部分缺失时按空显示 */
export function asKplAbnormal(body: unknown): KplAbnormal | null {
  if (!isObj(body) || body.version !== 1 || !isDate(body.date)) return null
  const s = body.summary
  if (!isObj(s) || typeof s.d3up !== 'number' || typeof s.d3down !== 'number' || typeof s.nearUp !== 'number') return null
  if (!rowsOk(body.triggered) || !rowsOk(body.nearUp) || !rowsOk(body.nearDown)) return null
  const lhb = isObj(body.lhb) ? body.lhb : {}
  const sp = isObj(body.suspend) ? body.suspend : null
  const radar = isObj(body.radar) && isDate(body.radar.date) && Array.isArray(body.radar.types) ? (body.radar as unknown as Radar) : null
  return {
    ...(body as unknown as KplAbnormal),
    triggered: (body.triggered as TriggeredRow[]).map(r => ({ ...r, trig: Array.isArray(r.trig) ? r.trig : [] })),
    severeWatch: list<SevereRow>(body.severeWatch),
    lhb: {
      available: lhb.available === true,
      rows: list<LhbRow>(lhb.rows),
      missed: list<LhbMissed>(lhb.missed),
      stats: isObj(lhb.stats) ? (lhb.stats as LhbStats) : null,
      backtest: isObj(lhb.backtest) ? (lhb.backtest as Backtest) : null,
    },
    suspend: sp ? { today: list<SuspendRow>(sp.today), intraday: list<SuspendRow>(sp.intraday), resumed: list<SuspendRow>(sp.resumed) } : null,
    radar: radar ? { ...radar, buckets: Array.isArray(radar.buckets) ? radar.buckets : [], top: isObj(radar.top) ? radar.top : {}, timeline: Array.isArray(radar.timeline) ? radar.timeline : [] } : null,
    indices: Array.isArray(body.indices) ? (body.indices as KplAbnormal['indices']) : [],
    history: list<HistoryDay>(body.history, x => Array.isArray(x) && x.every(d => isObj(d) && isDate(d.date))),
    archive: isObj(body.archive) ? (body.archive as KplAbnormal['archive']) : null,
    sources: Array.isArray(body.sources) ? (body.sources as KplAbnormal['sources']) : [],
    note: typeof body.note === 'string' ? body.note : '',
  }
}

export const TRIG_LABEL: Record<string, string> = {
  d3up: '3 日涨幅偏离', d3down: '3 日跌幅偏离', d10up: '10 日 +100%', d10down: '10 日 −50%', d30up: '30 日 +200%', d30down: '30 日 −70%', same3: '10 日内 3 次同向',
}
export const CAT_LABEL: Record<string, string> = {
  devup: '日涨幅偏离 7%', devdown: '日跌幅偏离 7%', pctup: '日涨幅 15%', pctdown: '日跌幅 15%', amp: '日振幅', turn: '日换手率',
  d3up: '3 日涨幅偏离累计', d3down: '3 日跌幅偏离累计', severe: '严重异常波动', other: '其他',
}

/** 规则表（2026-11 查证，来源见 RULE_SOURCES） */
export const RULES: Array<{ board: string; index: string; d3: string; daily: string; amp: string; turn: string }> = [
  { board: '沪市主板（含 ST）', index: '上证指数', d3: '±20%', daily: '日偏离值 ±7%', amp: '15%', turn: '20%' },
  { board: '深市主板（含 ST）', index: '深证A股指数', d3: '±20%', daily: '日偏离值 ±7%', amp: '15%', turn: '20%' },
  { board: '创业板', index: '创业板综合指数', d3: '±30%', daily: '日涨跌幅 ±15%', amp: '30%', turn: '30%' },
  { board: '科创板', index: '科创50', d3: '±30%', daily: '日涨跌幅 ±15%', amp: '30%', turn: '30%' },
]
export const RULE_SOURCES: Array<{ label: string; url: string }> = [
  { label: '深交所交易规则（2021 年修订对照表：偏离值公式、对应分类指数、龙虎榜三项前五）', url: 'https://docs.static.szse.cn/www/lawrules/rule/fund/trade/W020210331716400676919.pdf' },
  { label: '深交所创业板交易特别规定（3 日 ±30%、严重异常波动 100% / −50%、200% / −70%、自公布之日起重新计算；现已并入交易规则）', url: 'https://www.szse.cn/lawrules/rule/repeal/rules/P020231230545310237980.pdf' },
  { label: '上交所：主板风险警示股票涨跌幅限制调整为 10%，异常波动指标与主板其他股票一致（2026-07-06 起施行）', url: 'https://www.sse.com.cn/aboutus/mediacenter/hotandd/c/c_20250627_10783267.shtml' },
  { label: '上交所每日交易公开信息（用于核对偏离值与基准指数）', url: 'https://www.sse.com.cn/disclosure/diclosure/public/' },
  { label: '深交所主板交易公开信息（示例：2026-11-17）', url: 'http://reportdocs.static.szse.cn/files/text/jy/jy261117.txt' },
]

/** 页面上写明的口径（与 scripts/kpl-abnormal-lib.mjs 一致） */
export const METHOD = {
  dev: '偏离值 = 个股涨跌幅 − 对应基准指数涨跌幅。「连续三个交易日内偏离值累计」按窗口内个股累计涨跌幅 − 指数累计涨跌幅（复利）计算，窗口 1～3 天，取最短的达标窗口——这与交易所实际公布的数字一致（例：11-17 大东方 −25.21%、长虹美菱 24.22%、北鼎股份 44.62%；简单相加对不上）。10 日、30 日同样按复利累计。',
  reset: '交易所规定异常波动指标「自公布之日起重新计算」：触发后的窗口不再包含触发当日及之前的日子。本站逐日回放最近 40 个交易日来推算重新计算的起点；有本站龙虎榜数据的日子以实际公布为准。新股上市初期等无涨跌幅限制的交易日不计入。',
  near: '下一交易日触发条件为机械计算，不是预测：假设下一交易日基准指数持平（涨跌 0），求个股再涨 / 跌多少能让某个窗口的累计偏离值达到阈值，取最容易达到的窗口；超出涨跌幅限制（主板 10%、创业板 / 科创板 20%）的不列出。触发价按今日收盘价推算（向上取整到分 / 向下取整到分）。指数实际涨跌会改变门槛：指数涨 1%，需要的涨幅大约也多 1 个百分点。',
  severe: '严重异常波动：连续 10 个交易日内 3 次同向异常波动；或 10 日偏离值累计 +100% / −50%；或 30 日累计 +200% / −70%（创业板条文原文如此；主板、科创板按同一口径计算，本站未逐条核对两板条文原文）。严重异常波动后公司通常需停牌核查或公告，本站只做规则计算。',
  lhb: '会不会上龙虎榜（盘后版）：按交易公开信息规则，在每个板块分别取 日偏离值（主板）或日涨跌幅（创业板 / 科创板）、日振幅、日换手率达到门槛的前五只（相同时按成交额、成交量），再加上当日 3 日异常波动的全部股票，与本站龙虎榜数据（东财每日上榜明细）逐条对照。深交所在涨跌停时按涨跌幅限制比例计算（11-17 深市涨停股偏离值都是 10.90%），上交所按实际涨跌幅；振幅 =（最高 − 最低）÷ 最低；换手率用行情源的流通股换手率，与交易所「无限售条件股份」口径可能略有差别。',
  backtest: '回测：过去有本站龙虎榜数据的交易日，按规则计算的「3 日异常波动」与实际上榜逐只对照（计算本身不使用当天的实际结果，只用实际结果确定之前的重新计算起点）。',
  suspend: '停牌 / 复牌：东财数据中心停复牌信息。当日停牌 = 停牌开始日不晚于今日、且未在今日之前复牌的全天停牌；盘中停牌为当日盘中临时停牌（多为交易异常波动）；复牌 10 日内 = 复牌首日起算第 1～10 个交易日（含今日），复牌后涨跌按本站逐日存档复利计算。',
  radar: '盘中异动雷达（盘后回放）：东财「盘口异动」当日全部事件，按类型计数、按半小时统计分布，并列出事件最多的个股。该接口没有日期参数，只能在交易日收盘后当天采集，补不了历史；事件定义由东财给出（如火箭发射 = 短时快速拉升），本站不改动。',
  skipped: '未做：问询函 / 监管函（深交所接口默认不按日期排序、上交所需另行解析，后续再接）；重点监控名单（交易所不公开发布）；盘中实时触发提醒（需要盘中行情，本页只做收盘后）；北交所（异常波动规则不同，未纳入）；「3 日日均换手率是前 5 日 30 倍」类异常波动（需要更多换手数据，未建模）。',
} as const
