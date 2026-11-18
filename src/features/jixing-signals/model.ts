// 今天几星 · 牛熊信号板：运行时校验与口径说明。信号规则为本站自定（脚本 RULES 原样写入数据文件）；缺值为 null。
export type Signal = '低估' | '正常' | '高估' | '偏牛' | '中性' | '偏熊'
export type Indicator = {
  id: string; group: 'valuation' | 'mood'; name: string; unit: string; digits: number
  value: number | null; date: string; month?: string
  pct: number | null; window: string | null; start: string | null; n: number
  signal: Signal | null; rule: string; note: string | null
  extra: Array<{ label: string; value: string }>
  history: Array<[string, number | null]>
}
export type Summary = Record<Signal | 'none', number>
export type NewsItem = { date: string; title: string; url: string; source: string }
export type JixingSignalsData = {
  version: 1; asOf: string; generatedAt: string
  indicators: Indicator[]; summary: Summary; missing: string[]; errors: string[]
  news?: NewsItem[]
  sources: Array<{ label: string; url: string }>
}

export const SIGNALS: Signal[] = ['低估', '正常', '高估', '偏牛', '中性', '偏熊']
const obj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const date = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && Number.isFinite(Date.parse(x)) && new Date(x).toISOString().slice(0, 10) === x
const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const nullable = (x: unknown): boolean => x === null || num(x)
const str = (x: unknown): x is string => typeof x === 'string' && x.length > 0
const int = (x: unknown): boolean => Number.isInteger(x) && (x as number) >= 0

function indicator(r: unknown, asOf: string): boolean {
  if (!obj(r) || !str(r.id) || !['valuation', 'mood'].includes(String(r.group)) || !str(r.name) || typeof r.unit !== 'string' || !int(r.digits)) return false
  if (!nullable(r.value) || !date(r.date) || r.date > asOf || !(r.month === undefined || (typeof r.month === 'string' && /^\d{4}-\d{2}$/.test(r.month)))) return false
  if (!(r.pct === null || (num(r.pct) && r.pct >= 0 && r.pct <= 100)) || !(r.window === null || typeof r.window === 'string') || !(r.start === null || date(r.start)) || !int(r.n)) return false
  if (!(r.signal === null || SIGNALS.includes(r.signal as Signal)) || !str(r.rule) || !(r.note === null || typeof r.note === 'string')) return false
  if (!Array.isArray(r.extra) || !r.extra.every(e => obj(e) && typeof e.label === 'string' && typeof e.value === 'string')) return false
  return Array.isArray(r.history) && r.history.every((p, i, a) => Array.isArray(p) && p.length === 2 && date(p[0]) && p[0] <= asOf && (!i || p[0] > (a[i - 1] as string[])[0]) && nullable(p[1]))
}

/** 拒绝半份数据、字符串数字、未知信号与 HTML 回退页。 */
export function asJixingSignals(x: unknown): JixingSignalsData | null {
  if (!obj(x) || x.version !== 1 || !date(x.asOf) || typeof x.generatedAt !== 'string' || !Number.isFinite(Date.parse(x.generatedAt))) return null
  const asOf = x.asOf
  if (!Array.isArray(x.indicators) || !x.indicators.length || !x.indicators.every(r => indicator(r, asOf))) return null
  if (new Set(x.indicators.map(r => (r as Indicator).id)).size !== x.indicators.length) return null
  const s = x.summary
  if (!obj(s) || ![...SIGNALS, 'none'].every(k => int(s[k]))) return null
  if (!Array.isArray(x.missing) || !x.missing.every(m => typeof m === 'string') || !Array.isArray(x.errors) || !x.errors.every(m => typeof m === 'string')) return null
  if (!Array.isArray(x.sources) || !x.sources.every(r => obj(r) && typeof r.label === 'string' && typeof r.url === 'string' && /^https:\/\/(www\.csindex\.com\.cn|datacenter-web\.eastmoney\.com|fund\.eastmoney\.com|query\.sse\.com\.cn)\//.test(r.url))) return null
  if (x.news !== undefined) {
    if (!Array.isArray(x.news) || !x.news.every(n => obj(n) && date(n.date) && typeof n.title === 'string' && n.title.length > 0
      && typeof n.url === 'string' && /^https?:\/\//.test(n.url) && typeof n.source === 'string')) return null
  }
  return x as unknown as JixingSignalsData
}

const sign = (s: string): string => s.replace('-', '−')
export const fmt = (x: number | null, digits: number): string => (x === null ? '—' : sign(x.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits })))
export const pct = (x: number | null): string => (x === null ? '—' : `${x.toFixed(1)}%`)
/** 信号色调：低估 / 偏熊 绿，高估 / 偏牛 红，正常 暖色，中性 灰。始终与文字同时出现。 */
export const signalTone = (s: Signal | null): 'down' | 'up' | 'warm' | 'neutral' => (s === '低估' || s === '偏熊' ? 'down' : s === '高估' || s === '偏牛' ? 'up' : s === '正常' ? 'warm' : 'neutral')

/** 页面口径文字。 */
export const METHOD = {
  pct: '分位 = （窗口内低于当前值的个数 + 0.5 × 等于当前值的个数）÷ 样本数，只用当日及以前的数据；窗口不足时注明实际起点与样本数。',
  signals: '每一项的信号都是本站按「规则」一栏自行判定的历史位置描述：估值类用「低估 / 正常 / 高估」，情绪类用「偏牛 / 中性 / 偏熊」（情绪越热越接近牛市特征）。各项口径不同，计数只是罗列，不合成综合结论，不构成投资建议。',
  update: '收盘后更新，每天一次。页面数据日为估值三项（中证全指 PE、沪深市场 PB、10 年国债）都已发布的最新交易日；其余指标截至该日，月度指标取最近一个已公布 / 已完整的月份，日期见各项。',
  news: '市场消息为本站人工整理的公开政策事件时间线（含官方来源链接），截至 2026-11、人工维护，按日期倒序；不做情绪解读，不构成投资建议。',
  skipped: [
    '老基金规模：存量偏股基金规模只有季报（季末后约 1 个月发布）和基金业协会月度汇总（PDF 公告），没有干净的结构化公开接口，暂缺。',
    '限购基金占比：需要逐只基金的申购状态与限额，公开页面只有单只基金的文字说明，无法可靠汇总，暂缺。',
    '中证全指 PB：中证指数官网只给少数主要指数的当日 PB 快照，没有中证全指的逐日 PB 历史，改用官网「行业市盈率」板块口径的沪深市场 PB。',
    '全市场新增开户数：中国结算自 2023 年 8 月起停止按月公布，改用上交所「一户通」月度新增投资者（2021 年起）。',
  ],
}
