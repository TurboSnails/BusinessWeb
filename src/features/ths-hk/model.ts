// 同花顺 · 港股通与AH 数据模型。四个数据块各带自己的日期（港股日历与 A 股不同）；缺值为 null。
// 金额单位：南向成交历史为百万港元；十大成交股、持股市值、卖空金额为港元。
export type SouthDay = { date: string; net: number | null; netSh: number | null; netSz: number | null; buy: number | null; sell: number | null; turnover: number | null }
export type TopTrade = { rank: number; code: string; name: string; buy: number | null; sell: number | null; total: number | null; net: number | null }
export type South = { asOf: string; history: SouthDay[]; top10: { sh: TopTrade[] | null; sz: TopTrade[] | null } }
export type AhRow = { name: string; aCode: string; hCode: string; aPrice: number | null; aPct: number | null; hPrice: number | null; hPct: number | null; premium: number | null }
export type IndexStat = { mean: number | null; pctile: number | null; n: number }
export type Ah = { asOf: string; fx: { date: string; rate: number }; rows: AhRow[]; index: { asOf: string; history: Array<{ date: string; close: number }>; stats: { close: number; y1: IndexStat; y3: IndexStat } } }
export type HoldRow = { code: string; name: string; ratio: number | null; ratioChg: number | null; cap: number | null; capChg: number | null; shareChg: number | null; close: number | null; pct: number | null; industry: string | null }
export type Holdings = { asOf: string; count: number; top: HoldRow[]; ratioUp: HoldRow[]; ratioDown: HoldRow[] }
export type ShortRow = { code: string; name: string; short: number; turnover: number; ratio: number; pctile: number | null; label: '较高' | '正常' | '较低' | null; n: number }
export type Short = { asOf: string; market: { short: number; turnover: number; ratio: number }; history: Array<{ date: string; ratio: number; short: number; turnover: number }>; since: string; top: ShortRow[] }
export type ThsHkData = { version: 1; generatedAt: string; asOf: string; south: South | null; ah: Ah | null; holdings: Holdings | null; short: Short | null; sources: Array<{ label: string; url: string }> }

const obj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const date = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && Number.isFinite(Date.parse(x)) && new Date(x).toISOString().slice(0, 10) === x
const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const nullable = (x: unknown): boolean => x === null || num(x)
const text = (x: unknown): x is string => typeof x === 'string' && !!x.trim()
const ascending = (rows: unknown[], last: string): boolean => rows.length > 0 && rows.every((r, i) => obj(r) && date(r.date) && (!i || r.date > (rows[i - 1] as { date: string }).date)) && (rows.at(-1) as { date: string }).date === last
const uniqueBy = (rows: unknown[], key: string): boolean => new Set(rows.map(r => (obj(r) ? r[key] : null))).size === rows.length

function south(x: unknown): boolean {
  if (!obj(x) || !date(x.asOf) || !Array.isArray(x.history) || !ascending(x.history, x.asOf)) return false
  if (!x.history.every(r => obj(r) && ['net', 'netSh', 'netSz', 'buy', 'sell', 'turnover'].every(k => nullable(r[k]))) || !num((x.history.at(-1) as SouthDay).net)) return false
  if (!obj(x.top10)) return false
  const t = x.top10
  return (t.sh !== null || t.sz !== null) && [t.sh, t.sz].every(list => list === null || (Array.isArray(list) && list.length === 10 && uniqueBy(list, 'code') && list.every(r => obj(r) && num(r.rank) && typeof r.code === 'string' && /^\d{5}$/.test(r.code) && text(r.name) && ['buy', 'sell', 'total', 'net'].every(k => nullable(r[k])))))
}
function ah(x: unknown): boolean {
  if (!obj(x) || !date(x.asOf) || !obj(x.fx) || x.fx.date !== x.asOf || !num(x.fx.rate) || !Array.isArray(x.rows) || x.rows.length < 50 || !uniqueBy(x.rows, 'hCode')) return false
  if (!x.rows.every(r => obj(r) && text(r.name) && typeof r.aCode === 'string' && /^\d{6}$/.test(r.aCode) && typeof r.hCode === 'string' && /^\d{5}$/.test(r.hCode) && ['aPrice', 'aPct', 'hPrice', 'hPct', 'premium'].every(k => nullable(r[k])))) return false
  const idx = x.index
  if (!obj(idx) || !date(idx.asOf) || !Array.isArray(idx.history) || !ascending(idx.history, idx.asOf) || !idx.history.every(r => obj(r) && num(r.close))) return false
  const s = idx.stats
  return obj(s) && num(s.close) && [s.y1, s.y3].every(v => obj(v) && nullable(v.mean) && nullable(v.pctile) && num(v.n))
}
const holdRows = (rows: unknown, sign: 0 | 1 | -1): boolean => Array.isArray(rows) && uniqueBy(rows, 'code') && rows.every(r => obj(r) && typeof r.code === 'string' && /^\d{5}$/.test(r.code) && text(r.name) && ['ratio', 'ratioChg', 'cap', 'capChg', 'shareChg', 'close', 'pct'].every(k => nullable(r[k])) && (r.industry === null || typeof r.industry === 'string') && (sign === 0 || (num(r.ratioChg) && r.ratioChg * sign > 0)))
function holdings(x: unknown): boolean {
  return obj(x) && date(x.asOf) && num(x.count) && Array.isArray(x.top) && x.top.length > 0 && holdRows(x.top, 0) && holdRows(x.ratioUp, 1) && holdRows(x.ratioDown, -1)
}
function short(x: unknown): boolean {
  if (!obj(x) || !date(x.asOf) || !date(x.since) || !obj(x.market) || !['short', 'turnover', 'ratio'].every(k => num((x.market as Record<string, unknown>)[k]))) return false
  if (!Array.isArray(x.history) || !ascending(x.history, x.asOf) || !x.history.every(r => obj(r) && num(r.ratio) && num(r.short) && num(r.turnover))) return false
  return Array.isArray(x.top) && x.top.length > 0 && uniqueBy(x.top, 'code') && x.top.every((r, i, rows) => obj(r) && typeof r.code === 'string' && /^\d{5}$/.test(r.code) && text(r.name) && num(r.short) && num(r.turnover) && num(r.ratio) && (!i || r.ratio <= (rows[i - 1] as ShortRow).ratio) && nullable(r.pctile) && (r.label === null || r.label === '较高' || r.label === '正常' || r.label === '较低') && num(r.n))
}

/** 拒绝 HTML 回退页、字符串数字、非有限数、乱序日期和半份数据；每个存在的数据块都必须完整 */
export function asThsHk(x: unknown): ThsHkData | null {
  if (!obj(x) || x.version !== 1 || typeof x.generatedAt !== 'string' || !Number.isFinite(Date.parse(x.generatedAt)) || !date(x.asOf)) return null
  const checks: Array<[unknown, (v: unknown) => boolean]> = [[x.south, south], [x.ah, ah], [x.holdings, holdings], [x.short, short]]
  if (checks.every(([v]) => v === null) || !checks.every(([v, ok]) => v === null || ok(v))) return null
  if (!Array.isArray(x.sources) || !x.sources.length || !x.sources.every(s => obj(s) && text(s.label) && typeof s.url === 'string' && /^https:\/\/[a-z0-9.-]+\.(eastmoney\.com|hkex\.com\.hk|hkexnews\.hk|gtimg\.cn)\//.test(s.url))) return null
  return x as unknown as ThsHkData
}

// ---------- 格式 ----------
const minus = (s: string): string => s.replace('-', '−')
export const signed = (x: number | null, d = 2, unit = ''): string => (x === null ? '—' : `${x > 0 ? '+' : ''}${minus(x.toFixed(d))}${unit}`)
/** 百万港元 → 亿港元 */
export const hkdMillion = (x: number | null, sign = true): string => (x === null ? '—' : sign ? signed(x / 100, 2, ' 亿') : `${(x / 100).toFixed(2)} 亿`)
/** 港元 → 亿 / 万港元 */
export const hkd = (x: number | null, sign = false): string => {
  if (x === null) return '—'
  const [v, u] = Math.abs(x) >= 1e8 ? [x / 1e8, ' 亿'] : [x / 1e4, ' 万']
  return sign ? signed(v, 2, u) : `${minus(v.toFixed(2))}${u}`
}
export const tone = (x: number | null): string => (x === null || x === 0 ? '' : x > 0 ? 'mm-up' : 'mm-down')
/** 最近 n 天净买入合计（任一天缺失则不给结果，避免少算） */
export function sumLast(history: SouthDay[], n: number): number | null {
  const xs = history.slice(-n).map(d => d.net)
  return xs.length < n || xs.some(v => v === null) ? null : Math.round((xs as number[]).reduce((s, v) => s + v, 0) * 100) / 100
}

export const METHOD = {
  south: '南向资金 = 港股通（沪）+ 港股通（深）的买入成交额 − 卖出成交额，单位百万港元（展示换算成亿港元）。东方财富历史与 HKEX 每日统计逐数一致，脚本会核对两边的当日成交额。南向数据只在内地与香港都开市的日子产生；香港假期没有新日期，不补零。',
  top10: '十大成交股来自 HKEX 每日统计，按买入 + 卖出成交额排名；净买入 = 买入 − 卖出。沪、深两条通道分开排名，同一股票可同时出现在两张表里。',
  ah: 'AH 溢价率 =（A 股收盘价 ÷（H 股收盘价 × 港元兑人民币中间价）− 1）× 100%。正值表示 A 股比 H 股贵。汇率用中国外汇交易中心当日港元兑人民币中间价（经东方财富），A、H 收盘价取腾讯行情并核对报价日期；停牌或报价日期不符的个股溢价留空。AH 名单来自东方财富 AH 股比价板块。',
  ahIndex: '恒生沪深港通 AH 股溢价指数（HSAHP）由恒生指数公司编制，100 表示 A、H 同价，高于 100 表示 A 股整体溢价。分位 = 近 1 年或近 3 年里收盘不高于当前值的交易日占比。东方财富的 HSAHP 在部分香港假期也有 K 线，已按恒生指数的交易日剔除。',
  holdings: '港股通持股为 HKEX 披露的中央结算系统（CCASS）持股，沪深两条通道合计（东方财富数据，与 HKEX 港股通持股披露核对一致）。持股是交收口径：港股 T+2 交收，持股日的变化大致反映两个交易日前的成交，与当日南向成交不能直接相减。持股比例 = 港股通持股 ÷ 已发行股份；比例变化（百分点）= 持股比例 × 当日持股变动 ÷ 持股数。持股市值低于 1 亿港元的个股不进变化排行，以免小数值噪音。',
  short: '卖空数据来自 HKEX 日报表的「賣空成交-每日報表」（当日原始数据；HKEX 次日会公布经修正的上日卖空数，本页不回填修正值）。全市场卖空占比 = 全部指定证券的港元卖空成交额 ÷ 市场总成交额。个股卖空比例 = 卖空成交额 ÷ 该股成交额。排行只含港元交易的股票（按腾讯行情的证券类型去掉 ETF 及杠杆、反向产品），且当日成交额不少于 1 亿港元。',
  shortLabel: '较高 / 正常 / 较低为本站自定义标签：取该股最近 90 个港股交易日里出现在卖空报表的日子（含当天）作样本，当天卖空比例的分位 ≥ 80 记「较高」，≤ 20 记「较低」，其余「正常」；样本少于 20 日不标。没有卖空成交的日子不进样本（不当作 0）。HKEX 日报表存档只保留约两个月，本页从最早可得的日期开始累积，样本数会逐日增加到 90。',
}
export const SKIPPED = [
  ['港股竞价资金、竞价异动', '需要盘中逐笔与竞价数据'],
  ['港股通机会（新纳入 / 预期纳入）', '需要整理上交所、深交所名单变更公告和恒指季检规则，后续单独做'],
  ['单股 AH 溢价历史走势', '需要逐只拉 A、H 两边日 K，本页只给当日截面与 AH 溢价指数'],
  ['暗盘资金、经纪商席位、窝轮牛熊', '需要券商席位、暗盘或衍生品行情，没有稳定的公开来源'],
  ['早盘卖空名单、盘中卖空状态', '需要盘中数据；本页只用收盘后的日报表'],
  ['恒指、国指等指数行情', '站内「全球行情」「宏观温度」已有，不重复'],
] as const
