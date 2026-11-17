// 开盘啦 · 打板页数据模型：读 public/data/kpl-daban.json（scripts/kpl-daban.mjs 每个交易日收盘后生成）。
// 功能对照开盘啦 App「打板」区；自然涨停、曾跌停、竞价（盘后版）与溢价基因的口径为本站自定（见 scripts/kpl-daban-lib.mjs 与页面说明）。

export type Streak = { days: number; ct: number }
export type Gene = {
  zt: number; nextN: number; p5: number; red: number; firstTry: number; firstSeal: number; lbBase: number; lb: number
  redRate: number | null; firstSealRate: number | null; firstBreakRate: number | null; lbRate: number | null
}
export type ZtRow = {
  code: string; name: string; pct: number | null; price: number | null; boards: number | null; streak: Streak | null
  firstSeal: string | null; lastSeal: string | null; opens: number | null; fund: number | null; amount: number | null
  turnover: number | null; floatCap: number | null; sector: string; shape: '一字' | 'T字' | '换手' | null; natural: boolean | null; gene: Gene | null
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
    zt: (body.zt as ZtRow[]).map(r => ({ ...r, gene: isObj(r.gene) ? r.gene : null, sector: r.sector ?? '' })),
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
  skipped: '「即将涨停」需要盘中实时行情，本页只做收盘后统计，不提供；「风向标」（涨停最集中的行业）见市场情绪页。',
} as const
