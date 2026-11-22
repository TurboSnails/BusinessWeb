import { MASTERS } from './masters'
import { dateLabel, formatsAsZero, number } from './format'
import type {
  CycleView, DimensionId, DimensionView, Horizon, Lean, MasterTake, PhaseId, Posture, Reading, ReadingKey, TakeItem,
} from './types'

type Readings = Partial<Record<ReadingKey, Reading | null>>
type Usable = (key: ReadingKey) => Reading | undefined
type Status = [lean: Lean, state: string]

const MISSING = '本站暂无可用读数。'
const UNKNOWN: Status = ['unknown', '数据不足']
const PHASE_RULE = '按两条轴划分。市场趋势：标普 500 是否在 200 日均线下方。基本面：盈利预期下修、萨姆规则达到 0.5 个百分点、高收益债利差达到 500 个基点，任一出现算转差。趋势未转弱且基本面未转差是扩张；趋势转弱而基本面未转差是修正；两者都转差是熊市；趋势未转弱而基本面仍差是修复。趋势或盈利与就业数据不足时暂不判定。本站口径。'
const POSTURE_RULE = '偏防守：标普 500 在 200 日均线下方，并且宽度、信用、货币政策里至少一项偏谨慎。偏进攻：标普 500 达到或高于均线且回撤不到 5%，这三项都不偏谨慎，并且宽度或货币政策至少一项偏积极。趋势数据不足时暂不判定，其余为中性。四个短线维度里至少三项同向、并且盈利与就业也同向时，置信度为中，否则为低。本站口径，未经回测证实。'

const POSTURES: Record<Posture, { label: string; meaning: string }> = {
  defense: { label: '短线偏防守', meaning: '价格趋势已经转弱，新增仓位宜慢、宜分批。这描述的是风险状态，不是清仓指令。' },
  offense: { label: '短线偏进攻', meaning: '价格趋势向上，宽度或货币政策至少一项偏积极，四个短线维度里没有偏谨慎的。这不等于估值便宜。' },
  neutral: { label: '短线中性', meaning: '短线证据互相抵消，不必因为它调整仓位。' },
  unknown: { label: '数据不足', meaning: '缺少可用的价格趋势读数，暂时无法判断短线攻守。' },
}

const PHASES: Record<PhaseId, string> = {
  expansion: '扩张',
  correction: '修正（扩张中的调整）',
  bear: '熊市（基本面下行）',
  repair: '修复',
  unknown: '数据不足',
}

function formattedValue(reading: Reading, value = reading.value) {
  return number(value, reading.key === 'hySpread' ? 'bp' : reading.unit)
}

function earningsChange(reading: Reading) {
  if (reading.value === 0) return '持平'
  return `${reading.value < 0 ? '下修' : '上修'} ${formattedValue(reading, Math.abs(reading.value))}`
}

function drawdownLevel(reading: Reading) {
  return `较近 52 周最高收盘回撤 ${formattedValue(reading, Math.abs(reading.value))}`
}

function level(reading: Reading, withDate = true) {
  const date = withDate ? `（${dateLabel(reading.date, reading.frequency)}）` : ''
  if (reading.key === 'spxVs200dma') {
    if (reading.value === 0 || formatsAsZero(Math.abs(reading.value), reading.unit)) {
      return `标普 500 基本贴着 200 日均线${date}`
    }
    const distance = formattedValue(reading, Math.abs(reading.value))
    const position = reading.value < 0 ? '低于' : '高于'
    return `标普 500 ${position} 200 日均线 ${distance}${date}`
  }
  if (reading.key === 'spxDrawdown') return `标普 500 ${drawdownLevel(reading)}${date}`
  if (reading.key === 'epsRevision') return `标普 500 未来 12 个月盈利预期${earningsChange(reading)}${date}`
  if (reading.key === 'netLiquidity') return `净流动性约 ${formattedValue(reading)}${date}`
  return `${reading.label} ${formattedValue(reading)}${date}`
}

function evidenceText(reading: Reading) {
  if (reading.key === 'policyRate' && reading.lastMove) {
    const overdue = policyMoveNote(reading)
    if (overdue) return `${reading.label} ${formattedValue(reading)}，${overdue}`
    const { date, from, to } = reading.lastMove
    const verb = to > from ? '上调' : to < from ? '下调' : '调整'
    return `${reading.label} ${formattedValue(reading)}，最近一次调整在 ${dateLabel(date)}，由 ${formattedValue(reading, from)} ${verb}到 ${formattedValue(reading, to)}`
  }
  const text = level(reading)
  if ((reading.key === 'cape' || reading.key === 'baaAaa') && reading.longPercentile !== undefined) {
    const since = reading.longPercentileSince ? `自 ${reading.longPercentileSince} 年以来` : '长历史'
    return `${text}，处于${since}第 ${number(reading.longPercentile)} 百分位`
  }
  if (reading.key === 'hySpread' && reading.prior) {
    return `${text}，一个月前 ${number(reading.prior.value, 'bp')}`
  }
  if (reading.key === 'netLiquidity') {
    const change = direction(reading)
    if (change === 'up') return `${text}，近一月上升`
    if (change === 'down') return `${text}，近一月下降`
    if (change === 'flat') return `${text}，近一月持平`
  }
  return text
}

function describeCurrent(reading: Reading | undefined, missing: string) {
  return reading ? evidenceText(reading) : missing
}

function missingText(reading: Reading | null | undefined) {
  return reading?.stale ? `读数已过期（${dateLabel(reading.date, reading.frequency)}）。` : MISSING
}

function policyDirection(reading: Reading) {
  const move = reading.lastMove
  if (!move) return undefined
  if (move.to > move.from) return 'up'
  if (move.to < move.from) return 'down'
  return 'flat'
}

function direction(reading: Reading) {
  if (reading.direction) return reading.direction
  if (!reading.prior) return undefined
  if (reading.value > reading.prior.value) return 'up'
  if (reading.value < reading.prior.value) return 'down'
  return 'flat'
}

function directionText(reading: Reading) {
  const change = direction(reading)
  if (change === 'up') return '近一月上升'
  if (change === 'down') return '近一月下降'
  if (change === 'flat') return '近一月持平'
  return '近一月方向暂无可用读数'
}

/** 与「货币政策」维度同一套：一年内的最近一次调整才给方向，否则中性 */
function policyMoveLean(reading: Reading, rising: Lean, falling: Lean): Lean {
  if (!reading.lastMove) return 'unknown'
  const elapsedDays = (Date.parse(reading.date) - Date.parse(reading.lastMove.date)) / 86_400_000
  if (elapsedDays < 0 || elapsedDays > 365) return 'neutral'
  return directionLean(policyDirection(reading), rising, falling)
}

function policyMoveNote(reading: Reading): string {
  if (!reading.lastMove) return ''
  const elapsedDays = (Date.parse(reading.date) - Date.parse(reading.lastMove.date)) / 86_400_000
  if (elapsedDays < 0 || elapsedDays > 365) return '一年以上没有调整'
  return ''
}

function sentimentNote(lean: Lean): string {
  if (lean === 'support') return '这是逆向线索，恐慌只说明抛压已经较重，本身不构成买点。'
  if (lean === 'caution') return '这是逆向线索，贪婪只说明追涨已经较多，本身不是卖点。'
  return '这是逆向线索，只在极端时才有参考价值。'
}

function horizonTag(horizon: Horizon): string {
  if (horizon === 'medium') return '（中期）'
  if (horizon === 'long') return '（长期背景）'
  if (horizon === 'contrarian') return '（逆向线索）'
  return ''
}

function makeDimensions(get: Usable): DimensionView[] {
  const spx = get('spxVs200dma')
  const drawdown = get('spxDrawdown')
  const above = get('spxAbove200')
  const highs = get('netNewHighs')
  const credit = get('hySpread')
  const policy = get('policyRate')
  const nfci = get('nfci')
  const cash = get('netLiquidity')
  const eps = get('epsRevision')
  const sahm = get('sahm')
  const cape = get('cape')
  const fear = get('fearGreed')
  const vix = get('vix')

  function dimension(
    id: DimensionId,
    name: string,
    horizon: DimensionView['horizon'],
    [lean, state]: Status,
    rule: string,
    keys: ReadingKey[],
    interpretation?: string,
  ): DimensionView {
    const observations: Array<{ key: ReadingKey; text: string }> = []
    const skipped: ReadingKey[] = []
    for (const key of keys) {
      const reading = get(key)
      if (reading) observations.push({ key, text: evidenceText(reading) })
      else skipped.push(key)
    }
    const evidence = observations.map(({ key, text }) => ({ key, text: `${text}。` }))
    const sameTrendDate = id === 'trend' && spx && drawdown && spx.date === drawdown.date
    const readings = sameTrendDate
      ? `${level(spx, false)}，${drawdownLevel(drawdown)}（${dateLabel(drawdown.date, drawdown.frequency)}）。`
      : observations.length ? `${observations.slice(0, 2).map(({ text }) => text).join('，')}。` : MISSING
    const summary = interpretation ? readings + interpretation : readings
    return { id, name, horizon, lean, state, summary, rule, evidence, skipped }
  }

  let trend: Status = UNKNOWN
  if (spx) {
    if (spx.value < 0) trend = ['caution', '跌破 200 日线']
    else if (drawdown && Math.abs(drawdown.value) < 5) trend = ['support', '趋势向上']
    else trend = ['neutral', '均线上方回撤']
  }

  let breadth: Status = UNKNOWN
  if (above || highs) {
    if (above && above.value < 50 && highs && highs.value < 0) breadth = ['caution', '多数个股走弱']
    else if (above && above.value >= 60 && highs && highs.value > 0) breadth = ['support', '上涨扩散']
    else breadth = ['neutral', '分化']
  }

  let creditStatus: Status = UNKNOWN
  if (credit) {
    const change = credit.prior ? credit.value - credit.prior.value : 0
    if (credit.value >= 500) creditStatus = ['caution', '信用承压']
    else if (change >= 50) creditStatus = ['caution', '利差快速走阔']
    else if (change <= -25) creditStatus = ['support', '利差收窄']
    else if (change > 0) creditStatus = ['neutral', '小幅走阔，未到压力区']
    else creditStatus = ['neutral', '平稳']
  }

  let policyStatus: Status = UNKNOWN
  if (policy?.lastMove) {
    const elapsedDays = (Date.parse(policy.date) - Date.parse(policy.lastMove.date)) / 86_400_000
    const move = policyDirection(policy)
    if (elapsedDays >= 0 && elapsedDays <= 365 && move === 'up') policyStatus = ['caution', '转向收紧']
    else if (elapsedDays >= 0 && elapsedDays <= 365 && move === 'down') policyStatus = ['support', '降息周期']
    else if (elapsedDays > 365) policyStatus = ['neutral', '一年以上没有调整']
    else policyStatus = ['neutral', '按兵不动']
  }

  let liquidity: Status = UNKNOWN
  if (nfci || cash) {
    const prior = cash?.prior?.value
    // 用前值减去绝对幅度，净流动性为负时也能正确判断下降。
    const fallingFast = cash && prior !== undefined && prior !== 0 && cash.value <= prior - Math.abs(prior) * 0.02
    if ((nfci && nfci.value > 0) || fallingFast) liquidity = ['caution', '流动性收紧']
    else if (nfci && nfci.value < 0 && cash && direction(cash) !== 'down') liquidity = ['support', '金融条件偏松']
    else liquidity = ['neutral', '松紧未明']
  }

  let fundamentals: Status = UNKNOWN
  if (eps || sahm) {
    if ((sahm && sahm.value >= 0.5) || (eps && eps.value < 0)) fundamentals = ['caution', '基本面转弱']
    else if (eps && eps.value > 0 && sahm && sahm.value < 0.3) fundamentals = ['support', '盈利与就业稳']
    else fundamentals = ['neutral', '强弱未明']
  }

  let valuation: Status = UNKNOWN
  if (cape?.longPercentile !== undefined) {
    if (cape.longPercentile >= 80) valuation = ['caution', '历史高位']
    else if (cape.longPercentile <= 30) valuation = ['support', '历史低位']
    else valuation = ['neutral', '历史中段']
  }

  let sentiment: Status = UNKNOWN
  if (fear || vix) {
    if (fear && fear.value >= 75 && vix && vix.value < 15) sentiment = ['caution', '极度贪婪']
    else if (fear && fear.value <= 25 && vix && vix.value >= 30) sentiment = ['support', '极度恐慌']
    else sentiment = ['neutral', '未见极端']
  }

  return [
    dimension('trend', '趋势', 'short', trend,
      '标普 500 低于 200 日均线偏谨慎，达到或高于均线且回撤小于 5% 偏积极，其余可判断情形为中性。',
      ['spxVs200dma', 'spxDrawdown']),
    dimension('breadth', '宽度', 'short', breadth,
      '标普 500 高于 200 日均线的成分股占比低于 50% 且净新高为负偏谨慎，占比达到 60% 且净新高为正偏积极，其余可判断情形为中性。',
      ['spxAbove200', 'netNewHighs']),
    dimension('credit', '信用', 'short', creditStatus,
      '高收益债利差达到 500 个基点或较前值走阔至少 50 个基点偏谨慎，低于 500 个基点且收窄至少 25 个基点偏积极，其余可判断情形为中性。',
      ['hySpread', 'baaAaa']),
    dimension('policy', '货币政策', 'short', policyStatus,
      '距政策利率观测日不超过 365 天的最近一次加息偏谨慎、降息偏积极，超过 365 天为中性，缺少最近一次调整记录时未知。',
      ['policyRate', 'realYield10', 'tenYear']),
    dimension('liquidity', '流动性', 'medium', liquidity,
      '金融条件指数高于零或净流动性较前值下降至少 2% 偏谨慎，金融条件指数低于零且净流动性方向未向下偏积极，其余可判断情形为中性。',
      ['nfci', 'netLiquidity']),
    dimension('fundamentals', '盈利与就业', 'medium', fundamentals,
      '萨姆规则达到 0.5 个百分点或盈利预期下修偏谨慎，盈利预期上修且萨姆规则低于 0.3 个百分点偏积极，其余可判断情形为中性。',
      ['epsRevision', 'sahm', 'unrate']),
    dimension('valuation', '估值', 'long', valuation,
      '席勒市盈率达到长历史第 80 百分位偏谨慎，处于或低于第 30 百分位偏积极，介于两者之间为中性，缺少长历史分位时未知。',
      ['cape', 'forwardPe', 'buffett'], '估值反映未来数年的回报空间，不用于判断入场时机。'),
    dimension('sentiment', '情绪', 'contrarian', sentiment,
      '恐慌贪婪指数达到 75 点且 VIX 低于 15 点偏谨慎，恐慌贪婪指数不高于 25 点且 VIX 达到 30 点偏积极，其余可判断情形为中性。',
      ['fearGreed', 'vix', 'putCall', 'retailBullBear'], sentimentNote(sentiment[0])),
  ]
}

function buildPosture(dimensions: DimensionView[]): CycleView['posture'] {
  const [trend, breadth, credit, policy, , fundamentals] = dimensions
  const rest = [breadth, credit, policy]
  const short = [trend, ...rest]
  let value: Posture = 'neutral'
  if (trend.lean === 'unknown') value = 'unknown'
  else if (trend.lean === 'caution' && rest.some(({ lean }) => lean === 'caution')) value = 'defense'
  else if (trend.lean === 'support' && rest.every(({ lean }) => lean !== 'caution')
    && (breadth.lean === 'support' || policy.lean === 'support')) value = 'offense'

  const missing = rest.filter(({ lean }) => lean === 'unknown')
  const missingNames = missing.map(({ name }) => name).join('、')

  if (trend.lean !== 'unknown' && value === 'neutral' && missing.length >= 2) {
    return {
      value: 'unknown',
      confidence: 'low',
      label: '数据不足',
      meaning: `趋势以外的短线读数不全（缺：${missingNames}），暂不判定短线攻守。`,
      rule: POSTURE_RULE,
    }
  }

  const aligned = value === 'offense' ? 'support' : 'caution'
  const directional = value === 'offense' || value === 'defense'
  const confirmed = directional && fundamentals.lean === aligned && short.filter(({ lean }) => lean === aligned).length >= 3
  let meaning = POSTURES[value].meaning
  if (trend.lean !== 'unknown' && missing.length > 0) {
    meaning = `${meaning.replace(/。$/, '')}（${missingNames}读数暂缺，未参与判定。）`
  }
  return {
    value,
    confidence: confirmed ? 'medium' : 'low',
    label: POSTURES[value].label,
    meaning,
    rule: POSTURE_RULE,
  }
}

function axisPhrase(
  usable: Reading | undefined,
  raw: Reading | null | undefined,
  present: (reading: Reading) => string,
  label: string,
): { text: string; missingName?: string } {
  if (usable) return { text: present(usable) }
  if (raw?.stale) return { text: `${label}已过期（${dateLabel(raw.date, raw.frequency)}）`, missingName: label }
  return { text: `${label}暂无可用读数`, missingName: label }
}

function buildPhase(dimensions: DimensionView[], get: Usable, readings: Readings): CycleView['phase'] {
  const [trend, , , , , fundamentals] = dimensions
  const credit = get('hySpread')
  const creditStress = credit !== undefined && credit.value >= 500
  const deteriorating = fundamentals.lean === 'caution' || creditStress
  let id: PhaseId = 'unknown'
  if (trend.lean !== 'unknown' && fundamentals.lean !== 'unknown') {
    if (trend.lean === 'caution') id = deteriorating ? 'bear' : 'correction'
    else id = deteriorating ? 'repair' : 'expansion'
  }

  const spx = get('spxVs200dma')
  const eps = axisPhrase(get('epsRevision'), readings.epsRevision, (reading) => `盈利预期${earningsChange(reading)}`, '盈利预期修正')
  const jobs = axisPhrase(get('sahm'), readings.sahm, (reading) => `萨姆规则 ${number(reading.value)}`, '萨姆规则')
  const creditAxis = axisPhrase(credit, readings.hySpread, (reading) => level(reading, false), '高收益债利差')
  const trendAxis = spx ? level(spx, false) : '标普 500 与 200 日均线的距离暂无可用读数'
  const missing = [eps, jobs, creditAxis].flatMap(({ missingName }) => missingName ? [missingName] : [])
  const detail = `${eps.text}，${jobs.text}，${creditAxis.text}`
  const missingNote = missing.length ? `（缺：${missing.join('、')}）` : ''
  const noDeterioration = `已有的读数里没有看到转差：${detail}${missingNote}`
  const opening: Record<PhaseId, string> = {
    expansion: missing.length
      ? `趋势尚未转弱（${trendAxis}），${noDeterioration}`
      : `趋势尚未转弱（${trendAxis}），基本面也没有转差：${detail}`,
    correction: missing.length
      ? `趋势已经转弱（${trendAxis}），${noDeterioration}`
      : `趋势已经转弱（${trendAxis}），但基本面还没有转差：${detail}`,
    bear: `趋势已经转弱（${trendAxis}），基本面也已转差：${detail}${missingNote}`,
    repair: `趋势目前不弱（${trendAxis}），但基本面已经转差：${detail}${missingNote}`,
    unknown: `趋势或盈利与就业数据不足，暂不判定阶段。${trendAxis}。基本面读数：${detail}${missingNote}`,
  }
  return { id, name: PHASES[id], summary: `${opening[id]}。`, rule: PHASE_RULE }
}

function postureEvidence(posture: Posture, dimensions: DimensionView[]) {
  const summarize = ({ name, state, summary, horizon }: DimensionView) =>
    `${name}${horizonTag(horizon)}：${state}。${summary}`
  const summaries = (lean: Lean, limit: number) =>
    dimensions.filter((dimension) => dimension.lean === lean).slice(0, limit).map(summarize)
  if (posture === 'unknown') return { supports: [], counters: [] }
  if (posture === 'neutral') return { supports: summaries('caution', 2), counters: summaries('support', 2) }
  const aligned = posture === 'defense' ? 'caution' : 'support'
  const opposed = aligned === 'caution' ? 'support' : 'caution'
  const opposition = dimensions.filter(({ lean }) => lean === opposed)
  const longTermOrContrarian = opposition.filter(({ horizon }) => horizon === 'long' || horizon === 'contrarian')
  const nearTerm = opposition.filter(({ horizon }) => horizon === 'short' || horizon === 'medium')
  return {
    supports: summaries(aligned, 4),
    counters: [...nearTerm.slice(0, 4 - longTermOrContrarian.length), ...longTermOrContrarian].map(summarize),
  }
}

function primeStart(run: NonNullable<Reading['moveRun']>) {
  return run.startLevel + 3.1
}

function flipNow(
  usable: Reading | undefined,
  raw: Reading | null | undefined,
  present: (reading: Reading) => string,
  label: string,
): string {
  if (usable) return present(usable)
  if (raw?.stale) return `${label}已过期（${dateLabel(raw.date, raw.frequency)}）`
  return `${label}暂无可用读数`
}

function flips(posture: Posture, phase: PhaseId, get: Usable, readings: Readings): string[] {
  const spx = get('spxVs200dma')
  const trend = describeCurrent(spx, '标普 500 与 200 日均线的距离暂无可用读数')
  const drawdown = describeCurrent(get('spxDrawdown'), '近 52 周回撤暂无可用读数')
  const epsReading = get('epsRevision')
  const sahmReading = get('sahm')
  const creditReading = get('hySpread')
  const eps = flipNow(epsReading, readings.epsRevision, evidenceText, '盈利预期修正')
  const sahm = flipNow(sahmReading, readings.sahm, evidenceText, '萨姆规则')
  const credit = flipNow(creditReading, readings.hySpread, evidenceText, '高收益债利差')
  const epsNow = flipNow(epsReading, readings.epsRevision, (reading) => `现在${earningsChange(reading)}`, '盈利预期修正')
  const sahmNow = flipNow(sahmReading, readings.sahm, (reading) => `现在 ${number(reading.value)}`, '萨姆规则')
  const creditNow = flipNow(creditReading, readings.hySpread, (reading) => `现在 ${number(reading.value)}`, '高收益债利差')
  const improvement = `盈利预期停止下修、萨姆规则低于 0.5 个百分点，且高收益债利差低于 500 个基点（目前${credit}，${eps}，${sahm}）`
  const postureFlip: Record<Posture, string> = {
    defense: `标普 500 收盘重新站上 200 日均线（现在低 ${spx ? formattedValue(spx, Math.abs(spx.value)) : '幅度未知'}）→ 不再是防守；之后是中性还是进攻，看回撤是否小于 5%，以及宽度、信用、货币政策当时的状态。`,
    offense: `标普 500 收盘跌破 200 日均线（目前${trend}） → 短线先转为中性；若同时宽度、信用或货币政策任一项偏谨慎 → 转为防守。`,
    neutral: `标普 500 低于 200 日均线，且宽度、信用或货币政策任一项偏谨慎（目前${trend}） → 短线转为防守。`,
    unknown: `补齐标普 500 与 200 日均线的距离（目前${trend}） → 恢复短线档位判定。`,
  }
  const phaseFlip: Record<PhaseId, string> = {
    correction: `趋势仍弱时出现下面任何一条 → 改判熊市（基本面下行）：盈利预期转为下修（${epsNow}）；萨姆规则升到 0.5 个百分点或以上（${sahmNow}）；高收益债利差达到或超过 500 个基点（${creditNow}）。`,
    expansion: `若基本面未转差，标普 500 跌破 200 日均线（目前${trend}） → 改判修正（扩张中的调整）。`,
    bear: `若趋势仍弱，${improvement} → 改判修正（扩张中的调整）。`,
    repair: `若趋势仍未转弱，${improvement} → 改判扩张。`,
    unknown: `趋势与盈利就业维度都可以判断（目前${trend}，${eps}，${sahm}） → 恢复周期阶段判定。`,
  }
  const result = [postureFlip[posture], phaseFlip[phase]]
  if (posture === 'neutral') {
    result.push(`标普 500 达到或高于 200 日均线且回撤小于 5%，宽度、信用、货币政策均无偏谨慎，并且宽度或货币政策至少一项偏积极（目前${trend}，${drawdown}） → 短线转为进攻。`)
  }
  const run = get('policyRate')?.moveRun
  if (run?.direction === 'up' && run.count === 1 && run.total < 1 && primeStart(run) < 8) {
    result.push(`美联储再加息一次（本轮已加息 ${run.count} 次、累计 ${number(run.total, 'pp')}）→ 茨威格的优惠利率规则给出卖出。`)
  }
  return result
}

function directionLean(change: Reading['direction'], rising: Lean, falling: Lean): Lean {
  if (change === 'up') return rising
  if (change === 'down') return falling
  return change === 'flat' ? 'neutral' : 'unknown'
}

function highPercentile(reading: Reading, cutoff: number): Lean {
  if (reading.longPercentile === undefined) return 'unknown'
  return reading.longPercentile >= cutoff ? 'caution' : 'neutral'
}

function primeRate(reading: Reading): Pick<TakeItem, 'lean' | 'text'> {
  const calculation = '（优惠利率 = 联邦基金目标区间上限 + 3 个百分点，本站按政策利率的变动推算。）'
  const run = reading.moveRun
  if (!run) return { lean: 'unknown', text: `本站暂无连续调整记录。${calculation}` }
  const startingRate = primeStart(run)
  const low = startingRate < 8
  const repeated = run.count >= 2 || (run.direction === 'up' ? run.total >= 1 : Math.abs(run.total) >= 1)
  const leaning = run.direction === 'up' ? 'caution' : 'support'
  let lean: Lean = 'neutral'
  let explanation: string
  if (run.direction === 'up') {
    if (!low || repeated) {
      lean = leaning
      explanation = low ? '按他的规则已满足第二次加息或累计加满 1 个百分点的卖出条件' : '按他的规则首次加息即给出卖出'
    } else {
      explanation = '按他的规则要等第二次加息或累计加满 1 个百分点才卖出，目前没有触发'
    }
  } else if (low || repeated) {
    lean = leaning
    explanation = low ? '按他的规则首次降息即给出买入' : '按他的规则已满足第二次降息或累计降满 1 个百分点的买入条件'
  } else {
    explanation = '按他的规则要等第二次降息或累计降满 1 个百分点才买入，目前没有触发'
  }
  const adjustment = run.direction === 'up' ? '加息' : '降息'
  return {
    lean,
    text: `本轮从 ${run.since} 开始${adjustment} ${run.count} 次、累计 ${number(Math.abs(run.total), 'pp')}。推算的优惠利率起点约 ${number(startingRate, '%')}，${low ? '低于' : '达到或超过'} 8%，${explanation}。${calculation}`,
  }
}

const TEMPERATURE: Record<Lean, string> = {
  caution: '过热一侧', support: '过冷一侧', neutral: '居中', unknown: '缺少判定所需读数',
}

function buildMasters(readings: Readings, get: Usable): MasterTake[] {
  function item(
    label: string,
    basis: TakeItem['basis'],
    keys: [ReadingKey, ...ReadingKey[]],
    classify: (reading: Reading) => Lean,
    context?: (reading: Reading, lean: Lean) => string,
    separator = '，',
  ): TakeItem {
    const [primary, ...additional] = keys
    const reading = get(primary)
    if (!reading) return { label, basis, keys, lean: 'unknown', text: missingText(readings[primary]) }
    const lean = classify(reading)
    const supplement = additional.flatMap((key) => {
      const reading = get(key)
      return reading ? [evidenceText(reading)] : []
    })
    const text = [evidenceText(reading), ...supplement].join('，')
    const explanation = context?.(reading, lean)
    return { label, basis, keys, lean, text: `${text}${explanation ? separator + explanation : ''}。` }
  }

  function referenceItem(label: string, keys: ReadingKey[]): TakeItem {
    const available = keys.flatMap((key) => {
      const reading = get(key)
      return reading ? [evidenceText(reading)] : []
    })
    const stale = keys.map((key) => readings[key]).find((reading) => reading?.stale)
    return {
      label, keys, basis: 'site',
      lean: available.length ? 'neutral' : 'unknown',
      text: available.length ? `${available.join('，')}。` : missingText(stale),
    }
  }

  function temperature(
    label: string,
    keys: [ReadingKey, ...ReadingKey[]],
    classify: (reading: Reading) => Lean,
  ) {
    return item(label, 'site', keys, classify, (_, lean) => TEMPERATURE[lean])
  }

  function creditTemperature(): TakeItem {
    const keys: ReadingKey[] = ['hySpread', 'baaAaa']
    const hy = get('hySpread')
    const baa = get('baaAaa')
    const base = { label: '信用利差', basis: 'site' as const, keys }
    if (!hy && !baa) {
      const stale = keys.map((key) => readings[key]).find((reading) => reading?.stale)
      return { ...base, lean: 'unknown', text: missingText(stale) }
    }
    const percentile = baa?.longPercentile
    const hot = (hy !== undefined && hy.value < 350) || (percentile !== undefined && percentile <= 20)
    const cold = (hy !== undefined && hy.value > 600) || (percentile !== undefined && percentile >= 80)
    const lean = hot === cold ? 'neutral' : hot ? 'caution' : 'support'
    const text = [hy, baa].flatMap((reading) => reading ? [evidenceText(reading)] : []).join('，')
    return { ...base, lean, text: `${text}，${TEMPERATURE[lean]}。` }
  }

  function granthamBreadth(): TakeItem {
    const reading = get('equalWeightRel')
    const take = item('市场变窄', 'site', ['equalWeightRel'], ({ value }) => value < -3 ? 'caution' : 'neutral',
      (_, lean) => lean === 'caution' ? '少数大市值股票在领涨，市场在变窄' : '', '。')
    if (!reading || reading.value <= 3) return take
    return {
      ...take,
      text: `等权跑赢市值加权 ${formattedValue(reading)}，上涨没有集中在少数大市值股票（${dateLabel(reading.date, reading.frequency)}）。`,
    }
  }

  function checklist(slug: MasterTake['slug'], items: TakeItem[], missing: string): MasterTake {
    const caution = items.filter(({ lean }) => lean === 'caution').length
    const support = items.filter(({ lean }) => lean === 'support').length
    const unknown = items.filter(({ lean }) => lean === 'unknown').length
    const neutral = items.length - caution - support - unknown
    const counts = [
      caution && `${caution} 项偏谨慎`, support && `${support} 项偏积极`,
      neutral && `${neutral} 项中性`, unknown && `${unknown} 项缺数据`,
    ].filter(Boolean).join('、')
    let headline = `${items.length} 项里 ${counts}；他没有给过合成规则，不能据此给档。`
    if (slug === 'marks') {
      let balance = '没有一边倒'
      if (caution && !support) balance = '偏离居中的项目都在过热一侧'
      if (support && !caution) balance = '偏离居中的项目都在过冷一侧'
      if (unknown === items.length) balance = '没有可用的体温判断'
      const temperatures = [
        caution && `过热一侧 ${caution} 项`, support && `过冷一侧 ${support} 项`,
        neutral && `居中 ${neutral} 项`, unknown && `缺数据 ${unknown} 项`,
      ].filter(Boolean).join('、')
      headline = `${temperatures}，${balance}；他只在极端时调整攻守。`
    }
    return { slug, mode: 'checklist', headline, items, missing }
  }

  const spx = get('spxVs200dma')
  const tudorPosture = spx ? (spx.value < 0 ? 'defense' : 'neutral') : 'unknown'
  let tudorHeadline = '本站暂无可用的标普 500 均线读数，无法按他的规则判断。'
  if (spx) {
    tudorHeadline = spx.value < 0
      ? `${level(spx)}，按他的规则应当离场或不持有。`
      : `${level(spx)}，他的离场规则没有触发。`
  }

  const policy = get('policyRate')
  const primeItem: TakeItem = {
    label: '优惠利率规则', basis: 'own', keys: ['policyRate'],
    ...(policy ? primeRate(policy) : { lean: 'unknown', text: missingText(readings.policyRate) }),
  }

  const takes: Record<MasterTake['slug'], MasterTake> = {
    'tudor-jones': {
      slug: 'tudor-jones', mode: 'rule', posture: tudorPosture, headline: tudorHeadline, missing: '',
      items: [
        item('200 日均线', 'own', ['spxVs200dma'], ({ value }) => value < 0 ? 'caution' : 'neutral',
          (_, lean) => lean === 'caution' ? '按他的规则应当离场或不持有' : '他的离场规则没有触发'),
        item('金融条件', 'site', ['nfci'], ({ value }) => value > 0 ? 'caution' : 'neutral',
          (_, lean) => lean === 'caution' ? '本站口径下金融条件偏紧' : '本站口径下保持中性'),
        item('政策利率方向', 'own', ['policyRate'], (reading) => policyMoveLean(reading, 'caution', 'neutral'),
          (reading) => policyMoveNote(reading) ? '' : '他说衰退期间短端利率往往先转降，股市随后才见底', '。'),
        item('10 年期实际收益率', 'own', ['realYield10'], () => 'neutral'),
      ],
    },
    zweig: checklist('zweig', [
      primeItem,
      item('盘面趋势', 'site', ['spxVs200dma', 'spxAbove200', 'netNewHighs'],
        ({ value }) => value < 0 ? 'caution' : value > 0 ? 'support' : 'neutral',
        () => '本站用标普 500 指数与成分股宽度近似他的盘面指标'),
      { label: '宽度推力与 10 日涨跌比', lean: 'unknown', basis: 'own', keys: [],
        text: '需要纽交所全部股票的涨跌家数，本站没有同口径数据。' },
      item('情绪反向', 'site', ['fearGreed'],
        ({ value }) => value <= 25 ? 'support' : value >= 75 ? 'caution' : 'neutral',
        () => '本站用恐慌贪婪指数作逆向观察，他没有指定具体指数'),
    ], '贴现率与准备金子模型、纽交所涨跌家数、价值线指数周线'),
    druckenmiller: checklist('druckenmiller', [
      item('政策方向', 'own', ['policyRate'], (reading) => policyMoveLean(reading, 'caution', 'support')),
      item('信用利差', 'own', ['hySpread'], (reading) => directionLean(direction(reading), 'caution', 'support'), directionText),
      item('涨跌线', 'site', ['advDecLine'], (reading) => directionLean(direction(reading), 'support', 'caution'),
        (reading) => `本站用标普 500 成分股近似，涨跌线${directionText(reading)}`),
      item('铜', 'own', ['copper'], (reading) => directionLean(direction(reading), 'support', 'caution'), directionText),
      item('领先行业相对强弱', 'site', ['cyclicalDefensive', 'smallCapRel'],
        ({ value }) => value < 0 ? 'caution' : value > 0 ? 'support' : 'neutral'),
      item('净流动性', 'site', ['netLiquidity'], (reading) => directionLean(direction(reading), 'support', 'caution')),
    ], '名义增速对政策利率、点阵图、人工智能资本开支'),
    dalio: checklist('dalio', [
      item('央行收紧', 'own', ['policyRate'], (reading) => policyMoveLean(reading, 'caution', 'neutral')),
      item('收益率曲线', 'site', ['curve10y2y'], ({ value }) => value < 0 ? 'caution' : 'neutral',
        ({ value }) => value < 0 ? '曲线倒挂符合他关注的走弱方向' : value <= 0.5 ? '按本站口径曲线偏平' : '期限利差为正'),
      item('信用利差', 'own', ['hySpread'], (reading) => directionLean(direction(reading), 'caution', 'neutral'), directionText),
      item('泡沫清单·估值', 'site', ['cape'], (reading) => highPercentile(reading, 80),
        (_, lean) => lean === 'unknown' ? '本站暂无可用的长历史分位' : ''),
      item('泡沫清单·杠杆', 'site', ['marginDebtYoy'], ({ value }) => value >= 20 ? 'caution' : 'neutral'),
      item('偿债负担', 'site', ['debtService'], ({ percentile }) => (percentile ?? 0) >= 80 ? 'caution' : 'neutral',
        ({ percentile, percentileYears }) => percentile === undefined ? '' : `近 ${percentileYears ?? 10} 年第 ${number(percentile)} 百分位`),
    ], '三年债务占 GDP 的变化、增长与通胀相对预期的偏差；他的泡沫指标公式没有公开'),
    marks: checklist('marks', [
      creditTemperature(),
      temperature('资本市场松紧', ['nfci'], ({ value }) => value <= -0.4 ? 'caution' : value >= 0.4 ? 'support' : 'neutral'),
      temperature('资产价格', ['cape'], ({ longPercentile }) => {
        if (longPercentile === undefined) return 'unknown'
        return longPercentile >= 80 ? 'caution' : longPercentile <= 30 ? 'support' : 'neutral'
      }),
      temperature('投资者情绪', ['fearGreed'], ({ value }) => value >= 75 ? 'caution' : value <= 25 ? 'support' : 'neutral'),
      temperature('恐慌与涌向现金', ['vix', 'putCall'], ({ value }) => value >= 30 ? 'support' : 'neutral'),
    ], '新发交易质量与契约条款、不良债数量、高收益债收益率'),
    grantham: checklist('grantham', [
      item('估值', 'site', ['cape'], (reading) => highPercentile(reading, 90),
        (_, lean) => `格兰瑟姆以实际价格偏离长期趋势 2 个标准差定义泡沫，本站这里仅看市盈率分位${lean === 'unknown' ? '，长历史分位暂无可用读数' : ''}`),
      granthamBreadth(),
      item('投机股先跌、质量股跑赢', 'site', ['growthValueRel'], ({ value }) => value < -5 ? 'caution' : 'neutral',
        () => '成长相对价值的表现只是粗略近似'),
      item('杠杆', 'site', ['marginDebtYoy'], ({ value }) => value >= 20 ? 'caution' : 'neutral'),
    ], '实际价格偏离长期趋势的标准差（他定义泡沫的口径，本站还没有算）、GMO 七年预测'),
    soros: {
      slug: 'soros', mode: 'reference', headline: '只列出波动、趋势回调和杠杆，供观察市场是否经受住回调检验。',
      items: [
        referenceItem('波动', ['vix']),
        referenceItem('趋势回调', ['spxVs200dma', 'spxDrawdown']),
        referenceItem('杠杆', ['marginDebtYoy']),
      ],
      missing: '市场能否通过检验事先不可知，无法机械判定所处阶段。',
    },
    templeton: {
      slug: 'templeton', mode: 'reference', headline: '只列出投资者的悲观程度和美股估值，作为观察线索。',
      items: [
        referenceItem('悲观的广度', ['fearGreed', 'retailBullBear']),
        referenceItem('美股估值', ['cape']),
      ],
      missing: '最大悲观点只能事后确认，而且他的做法是在全球选股。',
    },
    kostolany: {
      slug: 'kostolany', mode: 'reference', headline: '只列出政策利率、净流动性和情绪，供观察资金和心理的变化。',
      items: [
        referenceItem('钱', ['policyRate', 'netLiquidity']),
        referenceItem('心理', ['fearGreed']),
      ],
      missing: '鸡蛋模型没有量化阈值，无法从这些读数机械判定阶段。',
    },
  }
  return MASTERS.map(({ slug }) => takes[slug])
}

export function buildCycleView(readings: Readings): CycleView {
  const get: Usable = (key) => {
    const reading = readings[key]
    return reading && !reading.stale ? reading : undefined
  }
  const dimensions = makeDimensions(get)
  const posture = buildPosture(dimensions)
  const phase = buildPhase(dimensions, get, readings)
  const participating: ReadingKey[] = [
    'spxVs200dma', 'spxAbove200', 'netNewHighs', 'hySpread', 'nfci', 'netLiquidity',
    'epsRevision', 'sahm', 'fearGreed', 'vix',
  ]
  const spx = get('spxVs200dma')
  if (spx && spx.value >= 0) participating.push('spxDrawdown')
  if (get('cape')?.longPercentile !== undefined) participating.push('cape')
  const asOf = participating.reduce((latest, key) => {
    const date = get(key)?.date
    return date && date > latest ? date : latest
  }, '')
  return {
    asOf,
    posture,
    phase,
    ...postureEvidence(posture.value, dimensions),
    flips: flips(posture.value, phase.id, get, readings),
    dimensions,
    masters: buildMasters(readings, get),
  }
}
