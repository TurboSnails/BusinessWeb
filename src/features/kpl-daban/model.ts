// 开盘啦 · 打板页数据模型：读 public/data/kpl-daban.json（scripts/kpl-daban.mjs 每个交易日收盘后生成）。
// 功能对照开盘啦 App「打板」区；自然涨停、曾跌停、竞价（盘后版）与溢价基因的口径为本站自定（见 scripts/kpl-daban-lib.mjs 与页面说明）。

export type Streak = { days: number; ct: number }
export type Gene = {
  zt: number; nextN: number; p5: number; red: number; firstTry: number; firstSeal: number; lbBase: number; lb: number
  redRate: number | null; firstSealRate: number | null; firstBreakRate: number | null; lbRate: number | null
}
/** 东财 F10 核心题材要点：c 分类、k 关键词、t 内容（公司资料，不是当日涨停原因） */
export type TopicPoint = { c: string; k: string; t: string }
export type Topics = { at: string; points: TopicPoint[] }
export type ZtRow = {
  code: string; name: string; pct: number | null; price: number | null; boards: number | null; streak: Streak | null
  firstSeal: string | null; lastSeal: string | null; opens: number | null; fund: number | null; amount: number | null
  turnover: number | null; floatCap: number | null; sector: string; shape: '一字' | 'T字' | '换手' | null; natural: boolean | null; gene: Gene | null
  /** 题材要点；没抓到为 null */
  topics: Topics | null
}
export type ZbRow = {
  code: string; name: string; pct: number | null; price: number | null; limitPrice: number | null; streak: Streak | null
  firstSeal: string | null; opens: number | null; amplitude: number | null; amount: number | null; turnover: number | null; floatCap: number | null; sector: string
}
export type DtRow = {
  code: string; name: string; pct: number | null; price: number | null; days: number | null; lastSeal: string | null; opens: number | null
  fund: number | null; boardAmount: number | null; amount: number | null; turnover: number | null; floatCap: number | null; sector: string
}
export type TouchedRow = {
  code: string; name: string; pct: number | null; price: number | null; limitDown: number | null; lowPct: number | null; rebound: number | null
  amount: number | null; sector: string; limitUpToo: boolean
}
export type AuctionRow = {
  code: string; name: string; yBoards: number | null; yFirstSeal: string | null; openPct: number | null; pct: number | null
  closeVsOpen: number | null; sealed: boolean; amount: number | null; sector: string
}
export type NewRow = {
  code: string; name: string; pct: number | null; price: number | null; listDate: string | null; days: number | null
  turnover: number | null; amount: number | null; floatCap: number | null; newHigh: boolean | null; noLimit: boolean; sector: string
}
export type HistoryDay = {
  date: string; seeded?: boolean; zt: number; zb: number | null; dt: number | null; natural: number | null
  touched: number | null; auctionAvg: number | null; sealRate: number | null
}
export type Summary = {
  zt: number; zb: number; dt: number; natural: number; touched: number; auctionAvg: number | null; sealRate: number | null
  newStocks: number; oneWord: number; auction: { n: number; avgOpen: number | null; highOpen: number; lowOpen: number; sealed: number }
}
export type GeneWindow = { from: string | null; to: string | null; days: number; fullFrom: string | null; fullDays: number }

export type KplDaban = {
  version: 1
  generatedAt: string
  asOf: string
  note: string
  summary: Summary
  zt: ZtRow[]
  zb: ZbRow[]
  dt: DtRow[]
  touched: TouchedRow[]
  auction: AuctionRow[]
  newStocks: NewRow[]
  gene: GeneWindow
  history: HistoryDay[]
  /** F10 题材要点抓取情况；旧数据没有为 null */
  f10: { label: string; ttl: number; fetched: number; failed: number; cached: number } | null
  sources: Array<{ id: string; label: string; url: string }>
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const isDate = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x)
const rowsOk = (x: unknown): boolean => Array.isArray(x) && x.every(r => isObj(r) && typeof r.code === 'string' && typeof r.name === 'string')
const list = <T,>(x: unknown, ok = rowsOk): T[] => (ok(x) ? (x as T[]) : [])

/** 结构校验：关键字段缺失时返回 null，页面显示「数据文件格式不对」；次要列表缺失时按空列表显示 */
export function asKplDaban(body: unknown): KplDaban | null {
  if (!isObj(body) || body.version !== 1 || !isDate(body.asOf)) return null
  const s = body.summary
  if (!isObj(s) || typeof s.zt !== 'number' || typeof s.zb !== 'number' || typeof s.dt !== 'number' || !isObj(s.auction)) return null
  if (!rowsOk(body.zt) || !isObj(body.gene)) return null
  return {
    ...(body as unknown as KplDaban),
    zt: (body.zt as ZtRow[]).map(r => ({ ...r, gene: isObj(r.gene) ? r.gene : null, sector: r.sector ?? '', topics: asTopics(r.topics) })),
    f10: isObj(body.f10) && typeof body.f10.cached === 'number' ? (body.f10 as KplDaban['f10']) : null,
    zb: list<ZbRow>(body.zb),
    dt: list<DtRow>(body.dt),
    touched: list<TouchedRow>(body.touched),
    auction: list<AuctionRow>(body.auction),
    newStocks: list<NewRow>(body.newStocks),
    history: list<HistoryDay>(body.history, x => Array.isArray(x) && x.every(d => isObj(d) && isDate(d.date))),
    sources: Array.isArray(body.sources) ? (body.sources as KplDaban['sources']) : [],
    note: typeof body.note === 'string' ? body.note : '',
  }
}

function asTopics(x: unknown): Topics | null {
  if (!isObj(x) || !isDate(x.at) || !Array.isArray(x.points)) return null
  return { at: x.at, points: x.points.filter(p => isObj(p) && typeof p.k === 'string' && typeof p.t === 'string') as TopicPoint[] }
}

/* ---------- 涨停历史检索：public/data/kpl-daban-history.json ---------- */
export type HistoryExport = {
  version: 1
  from: string | null
  to: string | null
  fullFrom: string | null
  /** 代码 → [名称, 行业 | null] */
  stocks: Record<string, [string, string | null]>
  /** [日期, 是否补算 1/0, [[代码, 连板数 | null]]] */
  days: Array<[string, number, Array<[string, number | null]>]>
}
export type HitStock = { code: string; name: string; industry: string | null; hits: Array<{ date: string; boards: number | null; seeded: boolean }> }

export function asHistoryExport(body: unknown): HistoryExport | null {
  if (!isObj(body) || body.version !== 1 || !isObj(body.stocks) || !Array.isArray(body.days)) return null
  const days = body.days.filter(d => Array.isArray(d) && isDate(d[0]) && Array.isArray(d[2])) as HistoryExport['days']
  return { version: 1, from: isDate(body.from) ? body.from : null, to: isDate(body.to) ? body.to : null, fullFrom: isDate(body.fullFrom) ? body.fullFrom : null, stocks: body.stocks as HistoryExport['stocks'], days }
}

/**
 * 检索：q 匹配名称、代码或行业（不区分大小写，子串）；date 不为空时只看该日涨停的股票（但仍列出它的全部涨停日期）。
 * 两者都为空时返回空（不默认列全部）。结果按涨停次数、最近涨停日期排序。
 */
export function searchHistory(h: HistoryExport, q: string, date = ''): HitStock[] {
  const needle = q.trim().toLowerCase()
  if (!needle && !date) return []
  const by = new Map<string, HitStock>()
  for (const [d, seeded, list] of h.days) {
    for (const [code, boards] of list) {
      const [name, industry] = h.stocks[code] ?? [code, null]
      const s = by.get(code) ?? { code, name, industry, hits: [] }
      s.hits.push({ date: d, boards, seeded: seeded === 1 })
      by.set(code, s)
    }
  }
  const onDate = date ? new Set(h.days.find(d => d[0] === date)?.[2].map(x => x[0]) ?? []) : null
  return [...by.values()]
    .filter(s => (!onDate || onDate.has(s.code)) && (!needle || s.code.includes(needle) || s.name.toLowerCase().includes(needle) || (s.industry ?? '').toLowerCase().includes(needle)))
    .map(s => ({ ...s, hits: [...s.hits].sort((a, b) => b.date.localeCompare(a.date)) }))
    .sort((a, b) => b.hits.length - a.hits.length || b.hits[0].date.localeCompare(a.hits[0].date) || a.code.localeCompare(b.code))
}

/** 页面上写明的口径（与 scripts/kpl-daban-lib.mjs 一致） */
export const METHOD = {
  auction: '竞价（盘后版）：昨日涨停股今日开盘价较昨收的涨跌（即集合竞价成交价），以及收盘涨幅、收盘较开盘。本站拿不到盘中竞价成交量、竞价大单等明细，只做收盘后的对照。',
  zt: '涨停：东财涨停股池。板型按全天开高低收判断：一字（全天一个价）、T字（开盘即涨停、盘中开过板）、换手（盘中封上）。封板资金为收盘封单金额。',
  zb: '炸板：当日触及涨停价但收盘未封住的股票（东财炸板股池）。',
  dt: '跌停：收盘封在跌停价的股票（东财跌停股池）；开板次数为盘中打开跌停的次数，板上成交额为跌停价上的成交。',
  natural: '自然涨停：涨停股中剔除一字板和上市首日等新股（N / C 开头）后的部分，即盘中有过低于涨停价的成交、靠换手封上的涨停（含 T 字板）。',
  touched: '曾跌停：盘中最低价触及当日跌停价（以腾讯报价给出的跌停价为准），收盘高于跌停价的股票；收盘仍在跌停的计入「跌停」。反弹 = （收盘 − 最低）÷ 昨收。',
  newStocks: '新股：东财次新股池（近一年内上市），上市天数按交易日计。无涨跌幅限制的标「不设限」。',
  gene: '溢价基因：在样本窗口内统计。涨停次数；溢价 5% 次数 = 涨停次日最高价较涨停收盘价涨 ≥ 5% 的次数；次日红盘率 = 次日收盘上涨的比例（分母为有次日记录的涨停次数）；首板封板率 / 破板率 = 首板尝试（当日首板涨停，或炸板且上一交易日未涨停）中封住 / 未封住的比例；连板率 = 涨停后下一交易日仍涨停的比例。「次日」只认下一交易日，缺数据的日子不计入分母。',
  topics: '题材要点：取自东方财富 F10「核心题材」（公司资料里的主营业务、公司事项、核心竞争力摘要），每只股票最多 3 条，是公司资料而不是当日涨停原因，也不注明资料日期；按抓取日期缓存，同一股票 30 天内不重复抓取。',
  search: '涨停历史检索：在本页涨停历史（每日涨停名单与连板数）里按名称、代码、行业或日期查找。名称为最近一次见到的名称；行业优先用东方财富股池的行业，只在每日复盘归档里出现过的股票用东方财富个股所属行业（现在的分类）补。补算日（来自每日复盘归档）只有涨停名单和连板数。',
  skipped: '「即将涨停」需要盘中实时行情，本页只做收盘后统计，不提供；「风向标」（涨停最集中的行业）见市场情绪页。',
} as const
