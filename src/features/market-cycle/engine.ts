export const RULE_VERSION = 'cycle-observation-v1.1-auto'
export const MARKETS = [{ id: 'csi300', label: 'A股 · 沪深300' }, { id: 'hsi', label: '港股 · 恒生指数' }, { id: 'hstech', label: '港股 · 恒生科技' }] as const
export type Market = typeof MARKETS[number]['id']
export type Signal = 'bottom' | 'positive' | 'risk' | 'neutral' | 'missing'
export type ManualDimension = 'valuation' | 'funding' | 'breadth'
export interface Bar { date: string; close: number; volume: number }
export interface TechnicalPoint extends Bar { rsi: number | null; dif: number | null; dea: number | null; histogram: number | null; mid: number | null; upper: number | null; lower: number | null; bandwidth: number | null }
export interface Observation { date: string; source: string; values: Record<string, number> }
export interface Evidence { id: string; name: string; signal: Signal; detail: string; date?: string; source?: string; available: boolean }
export interface PriceData { week: Bar[]; month: Bar[]; source: string; fetchedAt: string }
export interface CycleSnapshot { schemaVersion: 1; generatedAt: string; markets: Partial<Record<Market, PriceData>>; warnings: string[] }
export interface ContextSeries { latest: { date: string; value: number }; history: [string, number][]; source?: string }
export interface MacroContext { series: Record<string, ContextSeries> }
export const SIGNAL_LABEL: Record<Signal, string> = { bottom: '底部候选', positive: '修复 / 持有', risk: '风险', neutral: '中性', missing: '等待数据' }
const DAY = 86400000
export const validDate = (d: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d
export const safeUrl = (s: string): boolean => { try { return ['https:', 'http:'].includes(new URL(s).protocol) } catch { return false } }
const monthEnd = (d: string) => new Date(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)), 0)).toISOString().slice(0, 10)
const weekEnd = (d: string) => { const t = new Date(`${d}T00:00:00Z`); return new Date(t.getTime() + ((6 - t.getUTCDay() + 7) % 7) * DAY).toISOString().slice(0, 10) }
const fresh = (d: string | undefined, asOf: string, days: number) => !!d && validDate(d) && d <= asOf && (Date.parse(asOf) - Date.parse(d)) / DAY <= days
const mean = (v: number[]) => v.reduce((s, n) => s + n, 0) / v.length
const missing = (id: string, name: string, detail: string): Evidence => ({ id, name, signal: 'missing', detail, available: false })
const evidence = (id: string, name: string, signal: Signal, detail: string, date: string, source: string): Evidence => ({ id, name, signal, detail, date, source, available: true })

/** Conservatively exclude the current calendar week/month, even after Friday's close. */
export function completedBars(input: Bar[], period: 'week' | 'month', asOf: string): Bar[] {
  const byPeriod = new Map<string, Bar>()
  for (const b of [...input].sort((a, b) => a.date.localeCompare(b.date))) {
    if (!validDate(b.date) || !Number.isFinite(b.close) || b.close <= 0 || !Number.isFinite(b.volume) || b.volume < 0) continue
    const end = period === 'week' ? weekEnd(b.date) : monthEnd(b.date)
    if (end <= asOf && b.date <= asOf && (period !== 'month' || b.date.slice(0, 7) < asOf.slice(0, 7))) byPeriod.set(end, { ...b })
  }
  return [...byPeriod.values()]
}

/** SMA-seeded EMA(12,26,9), histogram = DIF−DEA; Wilder RSI(14); population σ for BOLL(20,2). */
export function technicalSeries(bars: Bar[]): TechnicalPoint[] {
  let fast: number | null = null, slow: number | null = null, dea: number | null = null
  let gain = 0, loss = 0
  const difs: number[] = []
  return bars.map((bar, i) => {
    if (i > 0) {
      const change = bar.close - bars[i - 1].close
      if (i <= 14) { gain += Math.max(0, change) / 14; loss += Math.max(0, -change) / 14 }
      else { gain = (gain * 13 + Math.max(0, change)) / 14; loss = (loss * 13 + Math.max(0, -change)) / 14 }
    }
    fast = i === 11 ? mean(bars.slice(0, 12).map(b => b.close)) : fast === null ? null : fast + (bar.close - fast) * 2 / 13
    slow = i === 25 ? mean(bars.slice(0, 26).map(b => b.close)) : slow === null ? null : slow + (bar.close - slow) * 2 / 27
    const dif: number | null = fast !== null && slow !== null ? fast - slow : null
    if (dif !== null) {
      difs.push(dif)
      dea = difs.length === 9 ? mean(difs) : dea === null ? null : dea + (dif - dea) * 2 / 10
    }
    const window = bars.slice(Math.max(0, i - 19), i + 1).map(b => b.close)
    const mid = i >= 19 ? mean(window) : null
    const sigma = mid === null ? null : Math.sqrt(mean(window.map(v => (v - mid) ** 2)))
    return { ...bar, rsi: i < 14 ? null : loss === 0 ? gain === 0 ? 50 : 100 : 100 - 100 / (1 + gain / loss), dif, dea,
      histogram: dif !== null && dea !== null ? dif - dea : null, mid,
      upper: mid !== null && sigma !== null ? mid + 2 * sigma : null,
      lower: mid !== null && sigma !== null ? mid - 2 * sigma : null,
      bandwidth: mid !== null && sigma !== null ? 4 * sigma / mid * 100 : null }
  })
}

export const MANUAL_NAMES: Record<ManualDimension, string> = { valuation: '估值与赔率', funding: '资金与杠杆', breadth: '市场宽度' }
export function manualFields(id: ManualDimension, market: Market): { key: string; label: string; min: number; max: number }[] {
  if (id === 'valuation') return market === 'csi300' ? [{ key: 'erpZ', label: 'ERP z-score（同口径至少5年窗口）', min: -10, max: 10 }] : [{ key: 'pePercentile', label: '该指数TTM PE历史分位（%，同口径至少5年）', min: 0, max: 100 }]
  if (id === 'breadth') return [{ key: 'breadth', label: '本期站上MA200占比（%）', min: 0, max: 100 }, { key: 'priorBreadth', label: '4周前同一股票池占比（%）', min: 0, max: 100 }]
  return [{ key: 'volumeRatio', label: '完整周日均成交额 / 前52周日均成交额', min: 0, max: 30 }, market === 'csi300' ? { key: 'financing', label: '同覆盖市场融资买入占成交额（%）', min: 0, max: 100 } : { key: 'south', label: '南向近20日净买入（亿元人民币，背景代理）', min: -100000, max: 100000 }]
}

export function assessManual(id: ManualDimension, market: Market, o: Observation | undefined, asOf: string, indexNewHigh = false): Evidence {
  const name = MANUAL_NAMES[id]
  if (!o || !fresh(o.date, asOf, 14) || !safeUrl(o.source) || !manualFields(id, market).every(f => Number.isFinite(o.values[f.key]) && o.values[f.key] >= f.min && o.values[f.key] <= f.max)) return missing(id, name, '需补齐数值、14天内的观测日期与公开来源链接；空白、未来或过期数据不计票。')
  const v = o.values
  let signal: Signal = 'neutral', detail = ''
  if (id === 'valuation') {
    const x = market === 'csi300' ? v.erpZ : v.pePercentile
    signal = market === 'csi300' ? x >= 1.5 ? 'bottom' : x <= -1 ? 'risk' : 'neutral' : x <= 10 ? 'bottom' : x >= 90 ? 'risk' : 'neutral'
    detail = market === 'csi300' ? `简化ERP z-score ${x.toFixed(2)}；≥1.5为便宜候选，≤−1为昂贵预警。需在来源记录PE类型、国债期限与历史窗口。` : `该指数TTM PE分位 ${x.toFixed(1)}%；≤10%为便宜候选，≥90%为昂贵预警。不能用沪深300 ERP替代。`
  } else if (id === 'funding') {
    signal = market === 'csi300' ? v.financing >= 10 ? 'risk' : v.volumeRatio <= 0.5 && v.financing < 6 ? 'bottom' : v.volumeRatio >= 1.5 && v.financing < 10 ? 'positive' : 'neutral'
      : v.volumeRatio >= 1.5 ? v.south > 0 ? 'positive' : v.south < 0 ? 'risk' : 'neutral' : v.volumeRatio <= 0.5 ? 'bottom' : 'neutral'
    detail = `周成交额相对52周基准 ${v.volumeRatio.toFixed(2)}倍；${market === 'csi300' ? `融资买入占比 ${v.financing.toFixed(1)}%` : `南向净买入 ${v.south.toFixed(1)}亿元（全港股背景，不能证明本指数获流入）`}。放量本身不确定方向，需技术维度确认。`
  } else {
    signal = v.breadth <= 10 ? 'bottom' : v.priorBreadth >= 85 && v.breadth < 60 && indexNewHigh ? 'risk' : v.breadth >= 40 && v.priorBreadth < 40 ? 'positive' : 'neutral'
    detail = `站上MA200 ${v.breadth.toFixed(1)}%，4周前 ${v.priorBreadth.toFixed(1)}%；${indexNewHigh ? '周收盘创52周新高' : '无周收盘52周新高确认'}。需保持股票池与复权口径一致。`
  }
  return evidence(id, name, signal, detail, o.date, o.source)
}

export function technicalEvidence(price: PriceData | undefined, asOf: string): { evidence: Evidence; weekly: TechnicalPoint[]; monthly: TechnicalPoint[]; newHigh: boolean } {
  const weekly = technicalSeries(completedBars(price?.week ?? [], 'week', asOf))
  const monthly = technicalSeries(completedBars(price?.month ?? [], 'month', asOf))
  const w = weekly.at(-1), prev = weekly.at(-2), m = monthly.at(-1)
  const newHigh = weekly.length >= 52 && !!w && w.close >= Math.max(...weekly.slice(-52).map(b => b.close))
  let e = missing('technical', '周 / 月技术', '需要至少60个月、52周完整K线；周数据21天内、月数据75天内。')
  if (weekly.length >= 52 && monthly.length >= 60 && w?.mid != null && prev?.mid != null && m?.histogram != null && m.rsi != null && fresh(w.date, asOf, 21) && fresh(m.date, asOf, 75)) {
    const broken = w.close < w.mid && prev.close < prev.mid
    const signal: Signal = broken ? 'risk' : m.rsi < 35 ? 'bottom' : m.histogram > 0 && m.rsi >= 50 && w.close >= w.mid ? 'positive' : 'neutral'
    e = evidence('technical', '周 / 月技术', signal, `月RSI ${m.rsi.toFixed(1)}；月MACD柱 ${m.histogram.toFixed(2)}；周收盘${w.close >= w.mid ? '高于' : '低于'}20周线 ${w.mid.toFixed(2)}。${broken ? '连续两周收于20周线下，独立触发防守复核。' : '多个价格指标合计只算一个维度。'}`, `${w.date} / ${m.date}`, price?.source ?? '')
  }
  return { evidence: e, weekly, monthly, newHigh }
}

export function macroEvidence(cn: MacroContext | null, asOf: string): Evidence {
  const s = cn?.series.m1m2
  // Existing macro snapshots label observations by month-start, not publication date.
  const h = (s?.history ?? []).filter(([d, v]) => validDate(d) && d >= '2025-01-01' && monthEnd(d) < asOf && Number.isFinite(v)).sort((a, b) => a[0].localeCompare(b[0])).slice(-4)
  if (h.length < 4 || !fresh(monthEnd(h[3][0]), asOf, 75)) return missing('macro', '国内流动性', '缺少2025年新口径下连续4个月可用M1−M2；不跨口径拼接。')
  const consecutive = h.every((p, i) => i === 0 || Number(p[0].slice(0, 4)) * 12 + Number(p[0].slice(5, 7)) === Number(h[i - 1][0].slice(0, 4)) * 12 + Number(h[i - 1][0].slice(5, 7)) + 1)
  if (!consecutive) return missing('macro', '国内流动性', 'M1−M2月份不连续，等待完整数据。')
  const up = h.every((p, i) => i === 0 || p[1] > h[i - 1][1]), down = h.every((p, i) => i === 0 || p[1] < h[i - 1][1])
  return evidence('macro', '国内流动性', up ? 'positive' : down ? 'risk' : 'neutral', `M1−M2近4个月：${h.map(p => p[1].toFixed(1)).join(' → ')}个百分点。连续3次改善 / 恶化才改变方向；月度统计为背景，不代表资金直接入市。快照缺原始发布日期，不用于历史交易回测。`, h[3][0].slice(0, 7), 'https://www.pbc.gov.cn/')
}

export function overseasEvidence(us: MacroContext | null, asOf: string): Evidence {
  const vix = us?.series.vix?.latest, rate = us?.series.tenYear
  const h = (rate?.history ?? []).filter(([d, v]) => validDate(d) && d <= asOf && Number.isFinite(v)).sort((a, b) => a[0].localeCompare(b[0])).slice(-4)
  if (!vix || !fresh(vix.date, asOf, 14) || !rate || !fresh(rate.latest.date, asOf, 14) || h.length < 4 || !Number.isFinite(vix.value) || !Number.isFinite(rate.latest.value)) return missing('overseas', '海外环境', '缺少14天内VIX或美债10年利率及4期利率历史；人民币与跨市场比值尚作人工复核。')
  const change = rate.latest.value - h[0][1]
  return evidence('overseas', '海外环境', vix.value >= 30 || change >= 0.5 ? 'risk' : change <= -0.25 && vix.value < 25 ? 'positive' : 'neutral', `VIX ${vix.value.toFixed(2)}（${vix.date}）；美债10年 ${rate.latest.value.toFixed(2)}%（${rate.latest.date}），相对近4期首值 ${change >= 0 ? '+' : ''}${change.toFixed(2)}个百分点。仅利率 / 波动代理；需另核人民币、港元与相对收益，不把恐慌当必然买点。`, `${vix.date} / ${rate.latest.date}`, 'https://fred.stlouisfed.org/series/DGS10')
}

export function summarize(rows: Evidence[]): { state: string; note: string; valid: number; bottom: number; positive: number; risk: number } {
  const active = rows.filter(r => r.available && r.signal !== 'missing')
  const count = (s: Signal) => active.filter(r => r.signal === s).length
  const bottom = count('bottom'), positive = count('positive'), risk = count('risk'), valid = active.length
  const technical = active.find(r => r.id === 'technical')?.signal
  let state = '震荡观察', note = '尚未形成共振；保持既定配置，下一完整周 / 月复核。'
  if (technical === 'risk') { state = '趋势防守'; note = '先复核策略风险预算与减仓条件；无需等待估值和杠杆同时极端。' }
  else if (valid < 4) { state = '等待证据'; note = '不足4个有效维度，暂停提高策略风险的建议；缺失维度不视为中性票。' }
  else if (risk >= 2 && positive + bottom >= 2) { state = '信号分歧'; note = '支持与风险信号并存，先核对冲突来源，不能靠多数票直接加仓。' }
  else if (risk >= 3) { state = '顶部风险候选'; note = '多维风险共振，复核分批退出条件；不承诺已经见顶。' }
  else if (bottom >= 3 && risk === 0) { state = '底部候选'; note = '赔率 / 悲观状态共振，研究分批建仓条件；低估可以持续，尚非右侧确认。' }
  else if (technical === 'positive' && positive >= 3 && positive + bottom >= 4 && risk === 0) { state = '右侧修复候选'; note = '趋势与多维证据支持修复；完成风险预算复核后再决定策略资金档位。' }
  else if (technical === 'positive' && risk === 0) { state = '趋势持有观察'; note = '趋势仍在，按周检查20周线与证伪条件；证据尚不满足提高风险的共振门槛。' }
  return { state, note, valid, bottom, positive, risk }
}

export function evaluate(market: Market, price: PriceData | undefined, manual: Partial<Record<ManualDimension, Observation>>, cn: MacroContext | null, us: MacroContext | null, asOf: string, automatic: Partial<Record<ManualDimension, Evidence>> = {}, manualOnly: ManualDimension[] = []) {
  const tech = technicalEvidence(price, asOf)
  const dimensions: ManualDimension[] = ['valuation', 'funding', 'breadth']
  const rows = [...dimensions.map(id => {
    const entered = assessManual(id, market, manual[id], asOf, tech.newHigh)
    if (manualOnly.includes(id)) return { ...entered, detail: `人工覆盖 · ${entered.detail}` }
    const collected = automatic[id]
    if (collected?.available) return collected
    if (entered.available) return { ...entered, detail: `人工补缺 · ${entered.detail}` }
    return collected ?? entered
  }), macroEvidence(cn, asOf), tech.evidence, overseasEvidence(us, asOf)]
  return { ...tech, rows, summary: summarize(rows) }
}
