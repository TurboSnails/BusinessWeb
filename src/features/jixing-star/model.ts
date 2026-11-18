// 今天几星 · 今日星级：运行时校验与口径说明。星级为本站自定，与银行螺丝钉官方星级无关；缺值为 null。
export type StarInput = { value: number | null; median: number | null; pct: number | null; start: string | null; n: number; sub: number | null }
export type StarBand = { min: number; max: number; label: string }
export type StarCheck = { date: string; ref: string; refMin?: number | null; refMax?: number; star: number | null; band: string | null; pe: number | null; pb: number | null; erp: number | null }
type IndustryMetric = { value: number | null; pct: number | null; start: string | null; n: number }
type NeutralIndustry = { code: string; oldCode: string; name: string; pe: IndustryMetric; pb: IndustryMetric; cheapness: number | null }
export type NeutralCheckWindow = { start: string; latestStart: string; min: number; max: number }
export type NeutralStar = {
  asOf: string; star: number; raw: number; cheapness: number; count: number; band: string
  prevDate: string; prevStar: number | null; change: number | null
  industries: NeutralIndustry[]
  history: Array<[string, number, number]>
  minWeeks: number
  checks: Array<{ date: string; star: number | null; window: NeutralCheckWindow | null }>
}
export type JixingStarData = {
  version: 1; asOf: string; prevDate: string | null; generatedAt: string
  star: number; raw: number; band: string; prevStar: number | null; change: number | null
  inputs: { pe: StarInput; pb: StarInput; erp: StarInput & { y10: number | null; ey: number | null } }
  params: { min: number; max: number; center: number; drop: number; windowYears: number; minYears: number; step: number }
  bands: StarBand[]
  since: { star: string | null; pe: string | null; pb: string | null; threeInputs: string | null }
  history: Array<[string, number | null]>
  inputsWeekly: Array<[string, number | null, number | null, number | null]>
  checks: StarCheck[]
  neutral?: NeutralStar
  sources: Array<{ label: string; url: string }>
}

const obj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const date = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && Number.isFinite(Date.parse(x)) && new Date(x).toISOString().slice(0, 10) === x
const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const nullable = (x: unknown): boolean => x === null || num(x)
const nullDate = (x: unknown): boolean => x === null || date(x)
const starNum = (x: unknown): boolean => num(x) && x >= 1 && x <= 5.9
const pctOk = (x: unknown): boolean => x === null || (num(x) && x >= 0 && x <= 100)
const series = (x: unknown, asOf: string, width: number, check: (p: unknown[]) => boolean = () => true): boolean => Array.isArray(x) && x.length > 0 &&
  x.every((p, i, a) => Array.isArray(p) && p.length === width && date(p[0]) && p[0] <= asOf && (!i || p[0] > (a[i - 1] as string[])[0]) && p.slice(1).every(nullable) && check(p))
const input = (x: unknown): boolean => obj(x) && ['value', 'median', 'sub'].every(k => nullable(x[k])) && pctOk(x.pct) && nullDate(x.start) && Number.isInteger(x.n) && (x.n as number) >= 0

const count = (x: unknown, min: number, max: number): boolean => num(x) && Number.isInteger(x) && x >= min && x <= max
const fraction = (x: unknown): boolean => num(x) && x >= 0 && x <= 1
const metric = (x: unknown, asOf: string, minWeeks: number): boolean => obj(x) && (x.value === null || (num(x.value) && x.value > 0)) &&
  pctOk(x.pct) && num(x.n) && (x.value === null || x.n < minWeeks) === (x.pct === null) &&
  count(x.n, 0, 530) && (x.n === 0 ? x.start === null && x.value === null : date(x.start) && x.start <= asOf)
const neutral = (x: unknown): boolean => {
  if (!obj(x) || !date(x.asOf) || !date(x.prevDate) || x.prevDate >= x.asOf || !starNum(x.star) ||
    !starNum(x.raw) || !fraction(x.cheapness) || typeof x.band !== 'string' || !x.band ||
    !(x.prevStar === null || starNum(x.prevStar)) || !nullable(x.change)) return false
  const { asOf, minWeeks } = x
  if (!num(minWeeks) || !count(minWeeks, 1, 530)) return false
  if (!Array.isArray(x.industries) || x.industries.length !== 9 || !x.industries.every(r => obj(r) &&
    typeof r.code === 'string' && /^\d{2}$/.test(r.code) && typeof r.oldCode === 'string' && /^\d{2}$/.test(r.oldCode) &&
    typeof r.name === 'string' && r.name.length > 0 && metric(r.pe, asOf, minWeeks) && metric(r.pb, asOf, minWeeks) &&
    (r.cheapness === null || fraction(r.cheapness)) && obj(r.pe) && obj(r.pb) &&
    (r.cheapness === null) === (r.pe.pct === null || r.pb.pct === null))) return false
  if (new Set(x.industries.map(r => r.code)).size !== x.industries.length ||
    !count(x.count, 1, x.industries.length) || x.count !== x.industries.filter(r => r.cheapness !== null).length) return false
  if (!series(x.history, asOf, 3, r => starNum(r[1]) && count(r[2], 1, 9))) return false
  const last = (x.history as unknown[][]).at(-1)
  return last?.[0] === asOf && last[1] === x.star && last[2] === x.count &&
    Array.isArray(x.checks) && x.checks.every(c => {
      if (!obj(c) || !date(c.date)) return false
      const window = c.window
      if (window === null) return c.star === null
      return obj(window) && date(window.start) && date(window.latestStart) && window.start <= window.latestStart &&
        window.latestStart <= c.date && num(window.min) && count(window.min, 1, 530) &&
        count(window.max, window.min, 530) && (c.star === null || (c.date <= asOf && starNum(c.star) && window.min >= minWeeks))
    })
}

/** 拒绝半份数据、字符串数字、越界星级与 HTML 回退页。 */
export function asJixingStar(x: unknown): JixingStarData | null {
  if (!obj(x) || x.version !== 1 || !date(x.asOf) || !nullDate(x.prevDate) || typeof x.generatedAt !== 'string' || !Number.isFinite(Date.parse(x.generatedAt))) return null
  const asOf = x.asOf
  if (!starNum(x.star) || !num(x.raw) || typeof x.band !== 'string' || !x.band || !(x.prevStar === null || starNum(x.prevStar)) || !nullable(x.change)) return null
  const i = x.inputs
  if (!obj(i) || !input(i.pe) || !input(i.pb) || !input(i.erp) || !obj(i.erp) || !nullable(i.erp.y10) || !nullable(i.erp.ey)) return null
  const p = x.params
  if (!obj(p) || !['min', 'max', 'center', 'drop', 'windowYears', 'minYears', 'step'].every(k => num(p[k]))) return null
  if (!Array.isArray(x.bands) || x.bands.length !== 5 || !x.bands.every(b => obj(b) && num(b.min) && num(b.max) && typeof b.label === 'string')) return null
  const s = x.since
  if (!obj(s) || !['star', 'pe', 'pb', 'threeInputs'].every(k => nullDate(s[k]))) return null
  if (!series(x.history, asOf, 2, q => q[1] === null || starNum(q[1])) || (x.history as Array<[string]>).at(-1)?.[0] !== asOf) return null
  if (!series(x.inputsWeekly, asOf, 4)) return null
  if (!Array.isArray(x.checks) || !x.checks.every(c => obj(c) && date(c.date) && typeof c.ref === 'string' && (c.refMin === undefined || c.refMin === null || num(c.refMin)) && (c.refMax === undefined || num(c.refMax)) && (c.star === null || starNum(c.star)) && (c.band === null || typeof c.band === 'string') && ['pe', 'pb', 'erp'].every(k => nullable(c[k])))) return null
  if (!Array.isArray(x.sources) || !x.sources.length || !x.sources.every(r => obj(r) && typeof r.label === 'string' && typeof r.url === 'string' && /^https:\/\/(www\.csindex\.com\.cn|datacenter-web\.eastmoney\.com)\//.test(r.url))) return null
  const { neutral: industry, ...legacy } = x
  return (neutral(industry) ? x : legacy) as unknown as JixingStarData
}

const sign = (s: string): string => s.replace('-', '−')
export const fix = (x: number | null, d = 2): string => (x === null ? '—' : sign(x.toFixed(d)))
export const pct = (x: number | null): string => (x === null ? '—' : `${x.toFixed(1)}%`)
export const signed = (x: number | null, d = 1): string => (x === null ? '—' : `${x > 0 ? '+' : ''}${sign(x.toFixed(d))}`)
/** 星级色调：越便宜越绿（A 股绿 = 跌），越贵越红；中段用暖色。始终与文字标签同时出现。 */
export const starTone = (star: number | null): 'down' | 'warm' | 'up' | 'neutral' => (star === null ? 'neutral' : star >= 4 ? 'down' : star >= 3 ? 'warm' : 'up')
export const bandOf = (bands: StarBand[], star: number | null): string | null => (star === null ? null : (bands.find(b => star >= b.min) ?? bands[bands.length - 1]).label)

/** 页面口径文字（与 scripts/jixing-star-lib.mjs 保持一致）。 */
export const METHOD = {
  neutral: '每个一级行业分别计算滚动 PE 和 PB 的近 10 年周分位。每周使用截至计算日的最后一个可用交易日，含当期样本。分位 =（低于当前值的样本数 + 0.5 × 等于当前值的样本数）÷ 有效样本数。历史不足 10 年时用自 2014 年以来已有的周样本。',
  neutralScore: (minWeeks: number): string => `每项指标至少有 ${minWeeks} 个有效周样本（约 3 年），行业才参与计算。行业便宜度 = 1 −（PE 分位 + PB 分位）÷ 2。市场便宜度是可计算行业的等权平均。滚动 PE 为 0、为负或缺失时视为缺值，PB 缺值也跳过该行业。星级 = 1.0 + 4.9 × 市场便宜度，显示到 1 位小数。`,
  neutralScope: '金融（含银行、非银）和房地产不计入。金融业的利润占比高于市值占比，会压低整体 PE。银行 PB 长期下行，也会拉低含金融的市场 PB。旧版 06 金融地产整体剔除，新版剔除 40 金融和 60 房地产。',
  neutralErp: '股债性价比继续单独展示，因为它的盈利收益率使用含金融的中证全指 PE。',
  formula: (p: JixingStarData['params']): string => `星级 = ${p.center} + （PE 分项 + PB 分项 + 股债性价比分项）÷ 3，截断到 ${p.min.toFixed(1)}–${p.max} 星，保留 1 位小数；越高越便宜。${p.center} 是 ${p.min.toFixed(1)}–${p.max} 的中点，对应三项都恰好等于各自近 ${p.windowYears} 年中位数。`,
  subs: (p: JixingStarData['params']): string => `PE 分项 = ln(近 ${p.windowYears} 年中位数 ÷ 当前 PE) ÷ ln(1.25)；PB 分项同理。即估值比中位数低 ${Math.round(p.drop * 100)}%（× ${1 - p.drop}）记 +1 星、高 25% 记 −1 星——对应「估值每下跌约 20% 约多 1 星」的经验口径。股债性价比分项 = （当前 − 近 ${p.windowYears} 年中位数）÷（0.25 × 100 ÷ PE 中位数），分母是 PE 从中位数下跌 20% 时盈利收益率增加的百分点数，使三项的「1 星」大致等价。`,
  window: (p: JixingStarData['params'], since: JixingStarData['since']): string => `中位数与分位都只用当日及以前的数据（滚动近 ${p.windowYears} 年，不看未来）；某项历史不足 ${p.minYears} 年时不参与。中证全指 PE 自 ${since.pe ?? '—'} 起有数据，所以历史星级自 ${since.star ?? '—'} 起；沪深市场 PB 自 ${since.pb ?? '—'} 起，${since.threeInputs ?? '—'} 之后三项齐全，此前星级只由 PE 与股债性价比两项计算。历史不足 ${p.windowYears} 年时窗口为「已有全部历史」，表中给出窗口起点和样本数。`,
  inputs: '输入：① 中证全指（000985）滚动市盈率 PE(TTM)，中证指数官网行情接口（官网「滚动市盈率」）；② 市净率 PB：中证全指没有公开的逐日 PB 历史，改用中证指数官网「行业市盈率」中的板块口径「沪深市场」整体市净率，覆盖范围与中证全指接近但不完全相同；③ 10 年期国债收益率（中债口径，经东方财富「中美国债收益率」）。股债性价比 = 100 ÷ PE − 10 年国债收益率（百分点）。三项必须是同一交易日的数据。',
  pct: '分位 = （窗口内低于当前值的天数 + 0.5 × 等于当前值的天数）÷ 样本数。PE、PB 分位越低越便宜；股债性价比分位越高越便宜。',
  update: '只在收盘后计算、每天一次，不做盘中更新。中证指数官网的估值数据通常在当晚发布，发布前本页仍显示上一交易日的星级。',
  differ: '本站星级的公式、输入口径与银行螺丝钉不同，对照表展示两套本站公式与参考值的差异。参考值为近似区间时，偏差也以区间或界限呈现。',
  bands: '星级区间的文字是对历史估值位置的描述：5–5.9 星 估值很低，4–4.9 星 部分低估，3–3.9 星 正常偏低，2–2.9 星 偏高，1–1.9 星 很高。不预示涨跌，不构成投资建议。',
}
