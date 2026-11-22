import { QUADRANTS } from '../macro/cycle'
import { buildPostureReview } from './review'
import type { Market, MarketData, Metric, MacroView, Signal, SubIndex, Window } from './types'

type Metrics = MarketData['metrics']
type Inputs = readonly (readonly [key: string, label: string])[]

export const POSTURE_RULE_VERSION = '宏观攻守观察版 v1'

const unknown: Signal = { label: '证据不足', tone: 'unknown', detail: '关键读数缺失、过期或比较历史不足。' }
const signal = (label: string, tone: Signal['tone'], detail: string): Signal => ({ label, tone, detail })
const current = (metrics: Metrics, key: string): Metric | undefined => {
  const metric = metrics[key]
  return metric && !metric.stale ? metric : undefined
}
const change = (metric: Metric | undefined, window: Window) => metric?.changes[window]?.difference
const compare = (value: number | undefined, threshold: number): number | undefined =>
  value === undefined ? undefined : value >= threshold - 1e-9 ? 1 : value <= -threshold + 1e-9 ? -1 : 0
const reverse = (value: number | undefined) => value === undefined ? undefined : -value
const direction = (values: (number | undefined)[]) => {
  const known = values.filter((value): value is number => value !== undefined)
  return known.length ? Math.sign(known.reduce((sum, value) => sum + value, 0)) : undefined
}

function index(id: string, title: string, metrics: Metrics, inputs: Inputs, score: number | undefined, status: Signal = unknown): SubIndex {
  return { id, title, score: score ?? null, ...status, evidence: inputs.map(([key, label]) => ({ key, label, metric: metrics[key] })) }
}

function growth(metrics: Metrics, market: 'us' | 'cn'): SubIndex {
  const inputs: Inputs = market === 'us'
    ? [['gdp', '实际 GDP 环比折年'], ['unrate', '失业率'], ['claims', '初请失业金四周均值'], ['sahm', '实时萨姆规则']]
    : [['pmi', '制造业 PMI'], ['nmpmi', '非制造业 PMI'], ['ip', '工业增加值同比'], ['gdp', '实际 GDP 累计同比']]
  let score: number | undefined
  if (market === 'us') {
    const claims = current(metrics, 'claims')?.changes.twelveWeeks
    const labor = (current(metrics, 'sahm')?.value ?? 0) >= 0.5 ? -1 : direction([
      reverse(compare(change(current(metrics, 'unrate'), 'threeMonths'), 0.1)),
      claims && claims.before.value > 0 ? reverse(compare(claims.difference / claims.before.value, 0.05)) : undefined,
    ])
    const output = compare(change(current(metrics, 'gdp'), 'lastQuarter'), 0.3)
    score = labor === undefined || output === undefined ? undefined : direction([labor, output])
  } else {
    const manufacturing = current(metrics, 'pmi')
    const services = current(metrics, 'nmpmi')
    const surveys = manufacturing && services ? compare((manufacturing.value + services.value) / 2 - 50, 0.25) : undefined
    const production = compare(change(current(metrics, 'ip'), 'threeMonths'), 0.25)
    score = surveys === undefined || production === undefined ? undefined : direction([surveys, production])
  }
  const rule = market === 'us'
    ? '产出和就业各占一票。GDP 环比折年变化死区为 0.3 个百分点，失业率三个月变化为 0.1 个百分点，初请十二周相对变化为 5%。萨姆规则达到 0.5 时，就业票转弱。'
    : '两项 PMI 的均值相对 50 计一个调查方向，工业增加值同比的三个月变化计一个生产方向，两项的死区均为 0.25。'
  const status = score === undefined ? unknown : score > 0 ? signal('增长回升', 'positive', rule)
    : score < 0 ? signal('增长放缓', 'caution', rule) : signal('增长平稳或分歧', 'neutral', rule)
  return index('growth', '增长与就业', metrics, inputs, score, status)
}

function inflation(metrics: Metrics, market: 'us' | 'cn'): SubIndex {
  const inputs: Inputs = market === 'us'
    ? [['corePce', '核心 PCE 同比'], ['tenYear', '10 年期美债收益率'], ['inflationExp', '10 年盈亏平衡通胀率']]
    : [['cpi', 'CPI 同比'], ['ppi', 'PPI 同比']]
  const pce = current(metrics, 'corePce')
  const pceChange = change(pce, 'threeMonths')
  const rateChange = change(current(metrics, 'tenYear'), 'twelveWeeks')
  const expected = change(current(metrics, 'inflationExp'), 'twelveWeeks')
  const price = market === 'us' ? compare(pceChange, 0.1) : direction(['cpi', 'ppi'].map(key => compare(change(current(metrics, key), 'threeMonths'), 0.2)))
  const shock = market === 'us' && (pce?.value ?? 0) >= 3 && (compare(pceChange, 0.2) ?? 0) > 0
    && ((compare(rateChange, 0.5) ?? 0) > 0 || (compare(expected, 0.3) ?? 0) > 0)
  const rule = market === 'us'
    ? '核心 PCE 同比三个月变化达到 0.1 个百分点标记方向。核心 PCE 至少 3%、同期升至少 0.2 个百分点，且长端利率或通胀预期十二周升至少 0.5 或 0.3 个百分点时，限制进攻。'
    : 'CPI 和 PPI 同比在各自三个月变化达到 0.2 个百分点后计方向。'
  const status = shock ? signal('通胀利率冲击', 'negative', rule)
    : price === undefined ? unknown : price > 0 ? signal('通胀上行', 'caution', rule)
      : price < 0 ? signal('通胀回落', 'positive', rule) : signal('通胀平稳或分歧', 'neutral', rule)
  return index('inflation', '通胀与利率', metrics, inputs, shock ? -2 : reverse(price), status)
}

function credit(metrics: Metrics): SubIndex {
  const inputs: Inputs = [['hy', '美国高收益债利差'], ['cccSpread', 'CCC 及以下高收益债利差'], ['baaAaa', '穆迪 Baa–Aaa 利差']]
  const hy = current(metrics, 'hy')
  const fast = change(hy, 'fourWeeks')
  const slow = change(hy, 'twelveWeeks')
  const ccc = change(current(metrics, 'cccSpread'), 'twelveWeeks')
  const gap = ccc !== undefined && slow !== undefined ? ccc - slow : undefined
  const severe = hy && (hy.value >= 600 || (slow ?? 0) >= 200)
  const stressed = hy && (hy.value >= 500 || (fast ?? 0) >= 50 || (slow ?? 0) >= 100)
  const divergence = gap !== undefined && gap >= 200
  const rule = 'HY 达 600 或十二周扩大 200 个基点触发重度压力。HY 达 500、四周扩大 50、十二周扩大 100，或十二周 CCC 相对 HY 多扩大 200 个基点，进入信用观察。'
  const score = severe ? -2 : stressed || divergence ? -1 : fast === undefined || slow === undefined || ccc === undefined ? undefined
    : slow <= -25 && fast <= 0 ? 1 : 0
  const observation = divergence ? `十二周 CCC 利差比 HY 多扩大 ${Number(gap.toFixed(1))} 个基点。${rule}` : rule
  const status = score === undefined ? unknown : score === -2 ? signal('信用压力高', 'negative', observation)
    : score === -1 ? signal('信用观察', 'caution', observation) : score === 1 ? signal('信用改善', 'positive', rule) : signal('信用暂稳', 'neutral', rule)
  return index('credit', '信用压力', metrics, inputs, score, status)
}

function liquidity(metrics: Metrics): SubIndex {
  const inputs: Inputs = [
    ['netLiquidity', '美元净流动性（近似）'], ['bankReserves', '银行准备金'],
    ['fedAssets', '美联储总资产'], ['tga', '财政部一般账户（TGA）'], ['rrp', '隔夜逆回购'],
  ]
  const net = current(metrics, 'netLiquidity')
  const prior = net?.changes.twelveWeeks
  const fast = change(net, 'fourWeeks')
  const reserves = change(current(metrics, 'bankReserves'), 'twelveWeeks')
  const slow = prior && prior.before.value > 0 ? compare(prior.difference / prior.before.value, 0.005) : undefined
  const score = slow === undefined || fast === undefined || reserves === undefined ? undefined
    : slow > 0 && fast >= 0 && reserves >= 0 ? 1 : slow < 0 && fast <= 0 && reserves <= 0 ? -1 : 0
  const rule = '联储总资产减 TGA 和隔夜逆回购。十二周变化至少 0.5%，且四周方向与银行准备金确认后，判改善或收紧。'
  const status = score === undefined ? unknown : score === 1 ? signal('资金改善', 'positive', rule)
    : score === -1 ? signal('资金收紧', 'caution', rule) : signal('资金平稳或分歧', 'neutral', rule)
  return index('liquidity', '美元流动性', metrics, inputs, score, status)
}

function economy(growthScore: number | null, inflationScore: number | null): Signal {
  if (growthScore === null || inflationScore === null) return unknown
  if (!growthScore || !inflationScore) return signal('周期信号分歧', 'neutral', '增长或通胀方向未形成明确合力。')
  const key = growthScore > 0 ? inflationScore > 0 ? 'upDown' : 'upUp' : inflationScore > 0 ? 'downDown' : 'downUp'
  return signal(QUADRANTS[key].name, key === 'upDown' ? 'positive' : 'caution', '用增长与通胀的方向描述当前宏观阶段。')
}

function posture(g: SubIndex, i: SubIndex, c: SubIndex, f: SubIndex, hasRates: boolean): Signal {
  if (c.score === -2 || (g.score === -1 && (c.score === -1 || f.score === -1))) {
    return signal('偏防守', 'negative', '信用压力高，或增长放缓同时受到信用或资金收紧。')
  }
  if (c.score === -1) {
    const detail = f.score === 1 ? '资金改善，信用警戒仍限制进攻。' : '信用利差走阔或低评级债分化，限制进攻。'
    return signal('信用观察', 'caution', detail)
  }
  if (i.score === -2) return signal('通胀利率观察', 'caution', '通胀和长端利率冲击限制进攻。')
  if ([g, i, c, f].some(item => item.score === null) || !hasRates) return unknown
  if (g.score === 1 && f.score === 1 && (i.score ?? -1) >= 0) {
    return signal('进攻候选', 'positive', '增长与流动性同步改善，信用与通胀利率未触发限制。')
  }
  return signal('中性观察', 'neutral', '增长、资金和风险约束尚未形成一致的进攻条件。')
}

function localViews(market: 'cn' | 'hk', metrics: Metrics): Pick<MacroView, 'economy' | 'posture' | 'indices'> {
  const incomplete = signal('仅作观察', 'unknown', '当地信用和盈利修正历史待补，当前展示已有宏观证据。')
  const missingCredit = index('credit', '信用压力', metrics, [], undefined,
    signal('待补信用数据', 'unknown', '需要同口径信用历史及可核验的发布日期。'))
  if (market === 'cn') {
    const g = growth(metrics, 'cn')
    const i = inflation(metrics, 'cn')
    const funds = index('liquidity', '货币与融资', metrics, [['m1m2', 'M1–M2 增速差'], ['lpr', '1 年期 LPR']], undefined,
      signal('资金环境观察', 'neutral', 'M1 统计口径切换前后的历史需核对。'))
    return { economy: economy(g.score, i.score), posture: incomplete, indices: [g, i, missingCredit, funds] }
  }
  const demand = index('growth', '内地需求', metrics, [['cnPmi', '内地制造业 PMI'], ['cnNmpmi', '内地非制造业 PMI']], undefined,
    signal('外生需求观察', 'neutral', '内地景气提供需求背景。本地增长和就业数据待补。'))
  const overseas = index('inflation', '外部美元利率', metrics, [['fed', '联邦基金有效利率']], undefined,
    signal('美元环境观察', 'neutral', '关注外部贴现率对港股的影响。'))
  const funds = index('liquidity', '本地港元融资', metrics, [['hkd', '每美元兑港元'], ['south', '南向资金近 20 日净买入']], undefined,
    signal('港元资金观察', 'neutral', '港元汇率反映联系汇率区间的位置。HIBOR 和银行体系总结余待补，南向资金提供市场资金背景。'))
  return { economy: unknown, posture: incomplete, indices: [demand, overseas, missingCredit, funds] }
}

export function buildMacroView(market: Market, data: MarketData): MacroView {
  const base = { market, asOf: data.asOf, failedSources: data.failedSources }
  if (market !== 'us') return { ...base, ...localViews(market, data.metrics) }
  const g = growth(data.metrics, market)
  const i = inflation(data.metrics, market)
  const c = credit(data.metrics)
  const f = liquidity(data.metrics)
  const rates = change(current(data.metrics, 'tenYear'), 'twelveWeeks') !== undefined
    || change(current(data.metrics, 'inflationExp'), 'twelveWeeks') !== undefined
  const decision = posture(g, i, c, f, rates)
  return {
    ...base, economy: economy(g.score, i.score), posture: decision, indices: [g, i, c, f],
    review: buildPostureReview(data.metrics, decision, g, i, c),
  }
}
