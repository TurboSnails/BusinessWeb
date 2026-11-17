// 开盘啦 · 互动问答页数据模型：读 public/data/kpl-irm.json（索引）与 public/data/kpl-irm-<星期>.json（某一回复日的问答明细），
// 均由 scripts/kpl-irm.mjs 盘后生成。功能对照开盘啦 App「互动易」与「重点监控 / 问询函」；分类、关键词口径为本站自定（见 scripts/kpl-irm-lib.mjs）。

export type Platform = 'sz' | 'sh'
export type CatId = 'clarify' | 'risk' | 'dividend' | 'order' | 'capacity' | 'progress' | 'other'
export type HotCompany = { code: string; name: string; p: Platform; n: number; cats: Partial<Record<CatId, number>>; chg: number | null; next: number | null; ind: string | null }
export type DaySummary = {
  date: string; total: number; sz: number; sh: number; companies: number
  cats: Partial<Record<CatId, number>>
  hot: HotCompany[]
  keywords: Array<{ kw: string; n: number; companies: number }>
  file: string; quoteDay: string | null; quoteNext: string | null
  platforms?: Partial<Record<Platform, { ok: boolean; capped?: boolean }>>
}
export type Letter = { ex: Platform; code: string | null; name: string; date: string; type: string; group: string; title: string; url: string | null; reply?: string; replyTitle?: string }
export type Rule = { id: CatId; label: string; scope: 'head' | 'all'; words: string[] }
export type KplIrm = {
  version: 1
  generatedAt: string
  asOf: string
  note: string
  days: DaySummary[]
  history: Array<{ date: string; total: number; sz: number; sh: number }>
  letters: { from: string; to: string; items: Letter[]; errors: string[]; counts: Record<string, number> } | null
  rules: { headChars: number; cats: Array<{ id: CatId; label: string }>; list: Rule[]; keywords: Array<{ kw: string; words: string[] }> }
  sources: Array<{ id: string; label: string; url: string }>
}
export type QaItem = { id: string; p: Platform; code: string; name: string; q: string; a: string; cut?: 1; at: string; qt: string | null; cat: CatId; url: string }
export type IrmDay = {
  version: 1
  date: string
  quotes: { day: string | null; next: string | null; d: Record<string, [number | null, string | null]> | null; n: Record<string, [number | null, string | null]> | null }
  items: QaItem[]
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const isDate = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x)
const isFile = (x: unknown): x is string => typeof x === 'string' && /^kpl-irm-[a-z]{3}\.json$/.test(x)

/** 索引结构校验：关键字段缺失返回 null；次要部分缺失按空处理 */
export function asKplIrm(body: unknown): KplIrm | null {
  if (!isObj(body) || body.version !== 1 || !isDate(body.asOf)) return null
  const days = body.days
  if (!Array.isArray(days) || !days.length || !days.every(d => isObj(d) && isDate(d.date) && typeof d.total === 'number' && isFile(d.file) && Array.isArray(d.hot) && isObj(d.cats))) return null
  const r = isObj(body.rules) ? body.rules : {}
  const L = body.letters
  return {
    ...(body as unknown as KplIrm),
    days: (days as DaySummary[]).map(d => ({ ...d, keywords: Array.isArray(d.keywords) ? d.keywords : [] })),
    history: Array.isArray(body.history) && body.history.every(h => isObj(h) && isDate(h.date)) ? (body.history as KplIrm['history']) : [],
    letters: isObj(L) && Array.isArray(L.items) && L.items.every(x => isObj(x) && isDate(x.date) && typeof x.title === 'string')
      ? { from: String(L.from ?? ''), to: String(L.to ?? ''), items: L.items as Letter[], errors: Array.isArray(L.errors) ? (L.errors as string[]) : [], counts: isObj(L.counts) ? (L.counts as Record<string, number>) : {} }
      : null,
    rules: {
      headChars: typeof r.headChars === 'number' ? r.headChars : 80,
      cats: Array.isArray(r.cats) ? (r.cats as KplIrm['rules']['cats']) : [],
      list: Array.isArray(r.list) ? (r.list as Rule[]) : [],
      keywords: Array.isArray(r.keywords) ? (r.keywords as KplIrm['rules']['keywords']) : [],
    },
    sources: Array.isArray(body.sources) ? (body.sources as KplIrm['sources']) : [],
    note: typeof body.note === 'string' ? body.note : '',
  }
}

/** 明细文件校验：日期必须与索引里的那一天一致（星期轮换的文件可能还是上周的） */
export function asIrmDay(body: unknown, date: string): IrmDay | null {
  if (!isObj(body) || body.version !== 1 || body.date !== date || !Array.isArray(body.items)) return null
  const ok = body.items.every(x => isObj(x) && typeof x.id === 'string' && typeof x.code === 'string' && typeof x.q === 'string' && typeof x.a === 'string' && typeof x.at === 'string')
  if (!ok) return null
  const q = isObj(body.quotes) ? body.quotes : {}
  return {
    version: 1, date,
    items: body.items as QaItem[],
    quotes: { day: isDate(q.day) ? q.day : null, next: isDate(q.next) ? q.next : null, d: isObj(q.d) ? (q.d as IrmDay['quotes']['d']) : null, n: isObj(q.n) ? (q.n as IrmDay['quotes']['n']) : null },
  }
}

export const PLATFORM: Record<Platform, string> = { sz: '深交所互动易', sh: '上证 e 互动' }
export const LETTER_GROUP_LABEL: Record<string, string> = { inquiry: '问询函', attention: '关注函', supervision: '监管函 / 监管措施', discipline: '纪律处分' }

/** 页面上写明的口径（与 scripts/kpl-irm-lib.mjs 一致） */
export const METHOD = {
  qa: '问答按「公司回复时间」所在的北京日期归档（不是提问日期），每天收盘后抓取两所平台当天及前一交易日起的全部已回复问答：深交所互动易「已回复问答」列表、上证 e 互动「最新答复」列表，每个平台每次最多 4000 条，每页间隔 1.2 秒。提问最多保留 160 字、回复最多保留 300 字，超出的标「…」，点「原文」看全文（上证 e 互动没有单条链接，链到公司主页）。不保存提问人昵称。只保留最近 7 个自然日的明细。',
  cats: '分类是机械的关键词匹配，不是判断：按下表从上到下，回复里出现任一关键词就归入该类，命中第一条即停止；「澄清否认」只看去掉开头客套话（您好、感谢关注等）后的前 {head} 字，避免把结尾的免责语当成否认；都没命中归入「其他」。同一条回复可能同时谈到多件事，只归一类。',
  hot: '热门公司 = 当日回复条数最多的前 20 家（只统计已回复的问答，未回复的提问不计）。当日涨跌 = 回复日（交易日）的收盘涨跌幅；次一交易日涨跌 = 回复日之后第一个交易日的涨跌幅——收盘后或周末的回复，次一交易日才是第一个能反映的交易日。行情取自东方财富数据中心带日期的每日估值报表，日期不符不用；还没到的交易日显示「—」。涨跌只是同日行情的并列展示，不代表回复导致了涨跌。',
  keywords: '关键词热度 = 当日提问文本里出现该关键词（含同义词，见下）的问答条数与涉及公司数，只数提问，不数回复。',
  letters: '近 30 个自然日两所发出的问询函、关注函、监管函 / 监管工作函 / 监管措施和纪律处分（通报批评、公开谴责、公开认定等），按发函 / 处分日期。来源是交易所「监管信息公开」栏目，以交易所原文为准。深交所监管措施栏目部分条目不列公司代码（例如针对拟上市公司或个人），这里照原样显示。',
  skipped: '未提供：开盘啦 App 的「AI 提炼」（需要大模型摘要，本页只做关键词规则）；自选 / 订阅（需要登录）；未回复提问的「被问次数」（只统计已回复）；「重点监控股票」名单（交易所不公开发布）；北交所互动平台。',
} as const
