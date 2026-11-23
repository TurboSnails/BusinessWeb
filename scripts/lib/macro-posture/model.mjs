import { clean } from './panel.mjs'
import { formatDate, formatReading as format, readingPrecision } from './format.mjs'

export const RULE_VERSION = 'v2.1'
export const TIERS = [
  { id: 'offense', label: '进攻', equityShare: 1, min: 0.50, meaning: '多数宏观信号支持承担股票风险。' },
  { id: 'lean-offense', label: '偏进攻', equityShare: 0.85, min: 0.15, meaning: '宏观信号整体有利，可以保留较高的股票敞口。' },
  { id: 'neutral', label: '中性', equityShare: 0.7, meaning: '宏观信号有好有坏，股票仓位维持中档。' },
  { id: 'lean-defense', label: '偏防守', equityShare: 0.5, max: -0.25, meaning: '风险开始积累，股票仓位降低一档。' },
  { id: 'defense', label: '防守', equityShare: 0.3, max: -0.75, meaning: '风险信号集中出现，股票仓位维持最低档。' },
]

export const TIER_DEFS = TIERS.map(({ min, max, ...tier }) => ({
  ...tier,
  range: tier.id === 'offense' ? `R ≥ ${min.toFixed(2)}`
    : tier.id === 'lean-offense' ? `${min.toFixed(2)} ≤ R < ${TIERS[0].min.toFixed(2)}`
      : tier.id === 'neutral' ? `${TIERS[3].max.toFixed(2)} < R < ${TIERS[1].min.toFixed(2)}`
        : tier.id === 'lean-defense' ? `${TIERS[4].max.toFixed(2)} < R ≤ ${max.toFixed(2)}`
          : `R ≤ ${max.toFixed(2)}`,
}))

export const PILLARS = [
  { id: 'growth', title: '增长与就业', weight: 0.35, masters: ['德鲁肯米勒', '达利欧', '都铎·琼斯'], summary: ['就业和生产走弱', '就业与生产暂未形成同向信号', '就业或生产有支撑'] },
  { id: 'credit', title: '信用', weight: 0.30, masters: ['霍华德·马克斯', '德鲁肯米勒', '达利欧'], summary: ['借钱成本的风险溢价偏高或在走阔', '信用压力处在中间地带', '信用市场压力偏低'] },
  { id: 'liquidity', title: '货币与流动性', weight: 0.20, masters: ['德鲁肯米勒', '都铎·琼斯', '达利欧'], summary: ['利率或金融条件偏紧', '资金松紧信号有好有坏', '利率或金融条件提供支撑'] },
  { id: 'inflation', title: '通胀', weight: 0.15, masters: ['达利欧', '都铎·琼斯'], summary: ['核心通胀偏高或仍在升温', '核心通胀仍需观察', '核心通胀有所降温'] },
]

const test = (axis, op, bound) => ({ axis, op, bound })
const v = (op, bound) => test('value', op, bound)
const axis = name => ({ axis: name, offset: 0 })
const relative = (name, offset) => ({ axis: name, offset })
const simple = (bad, caution, good) => [
  ...(bad ? [{ score: -2, any: [[v(...bad)]] }] : []),
  { score: -1, any: [[v(...caution)]] },
  { score: 1, any: [[v(...good)]] },
]

export const COMPONENTS = [
  { id: 'sahm', pillar: 'growth', label: '萨姆规则', unit: '百分点', fred: 'SAHMREALTIME', name: '失业率较低点抬升', rules: simple(['≥', 0.50], ['≥', 0.30], ['<', 0.20]) },
  { id: 'claims', pillar: 'growth', label: '初请失业救济', unit: '%', fred: 'IC4WSA', name: '较一年低点的升幅', rules: simple(['≥', 30], ['≥', 15], ['≤', 5]) },
  { id: 'payrolls', pillar: 'growth', label: '非农就业', unit: '%', fred: 'PAYEMS', name: '近三个月平均月增幅', rules: simple(['<', 0], ['<', 0.05], ['>', 0.12]) },
  { id: 'indpro', pillar: 'growth', label: '工业生产', unit: '%', fred: 'INDPRO', name: '半年年化增速', rules: simple(null, ['<', -2], ['>', 2]) },
  { id: 'baaLevel', pillar: 'credit', label: '企业债利差位置', unit: '百分位', fred: 'BAA', name: '十年内的利差百分位', rules: simple(['≥', 90], ['≥', 75], ['≤', 35]) },
  { id: 'baaChange', pillar: 'credit', label: '企业债利差变化', unit: '百分点', fred: 'BAA', name: '半年内的利差变化', rules: simple(['≥', 0.40], ['≥', 0.20], ['≤', -0.15]) },
  { id: 'nfciCredit', pillar: 'credit', label: '信贷条件', unit: '点', fred: 'NFCICREDIT', name: '信用分项水平', fields: { delta: ['十三周变化', '点'] }, rules: [
    { score: -2, any: [[v('>', 0.75)]] },
    { score: -1, any: [[v('>', 0.25)], [test('delta', '≥', 0.25)]] },
    { score: 1, any: [[v('<', -0.50), test('delta', '≤', 0)]] },
  ] },
  { id: 'fedPath', pillar: 'liquidity', label: '联储利率路径', unit: '百分点', fred: 'FEDFUNDS', name: '一年内的利率变化', fields: { delta6: ['半年内的利率变化', '百分点'] }, rules: [
    { score: -2, any: [[v('≥', 3)]] },
    { score: -1, any: [[v('≥', 1.5)]] },
    { score: 1, any: [[test('delta6', '≤', -0.50)]] },
  ] },
  { id: 'curve', pillar: 'liquidity', label: '长短利率差', unit: '百分点', fred: 'GS10', name: '十年期与三个月利率之差', fields: { inverted12: ['过去一年曾倒挂', ''], inverted24: ['过去两年曾倒挂', ''] }, rules: [
    { score: -1, any: [[v('<', 0)], [test('inverted12', '=', true)]] },
    { score: 1, any: [[v('>', 1), test('inverted24', '=', false)]] },
  ] },
  { id: 'nfci', pillar: 'liquidity', label: '整体金融条件', unit: '点', fred: 'NFCI', name: '金融条件水平', fields: { delta: ['十三周变化', '点'] }, rules: [
    { score: -2, any: [[v('>', 0)]] },
    { score: -1, any: [[v('>', -0.30), test('delta', '>', 0.15)]] },
    { score: 1, any: [[v('<', -0.40), test('delta', '≤', 0)]] },
  ] },
  { id: 'realRate', pillar: 'liquidity', label: '实际政策利率', unit: '百分点', fred: 'FEDFUNDS', name: '联储政策利率减核心通胀', rules: simple(null, ['>', 2], ['<', 0]) },
  { id: 'corePce', pillar: 'inflation', label: '核心消费通胀', unit: '%', fred: 'PCEPILFE', name: '半年年化增速', fields: { yoy: ['同比增速', '%'] }, rules: [
    { score: -2, any: [[test('yoy', '≥', 4), v('≥', axis('yoy'))]] },
    { score: -1, any: [[v('≥', 3.5)], [test('yoy', '≥', 3), v('>', relative('yoy', 0.3))]] },
    { score: 1, any: [[v('≤', 2.5), v('≤', axis('yoy'))]] },
  ] },
]

const compare = {
  '≥': (a, b) => a >= b,
  '≤': (a, b) => a <= b,
  '>': (a, b) => a > b,
  '<': (a, b) => a < b,
  '=': (a, b) => a === b,
}
const boundAt = (bound, reading) => typeof bound === 'object'
  ? reading[bound.axis] == null ? null : clean(reading[bound.axis] + bound.offset)
  : bound

export function scoreComponent(def, reading) {
  if (!Number.isFinite(reading?.value)) return null
  for (const { score, any } of def.rules) {
    const groups = any.map(group => group.map(({ axis, op, bound }) => {
      const right = boundAt(bound, reading)
      return reading[axis] == null || right == null ? null : compare[op](reading[axis], right)
    }))
    if (groups.some(group => group.every(result => result === true))) return score
    if (groups.some(group => !group.includes(false) && group.includes(null))) return null
  }
  return 0
}

const field = (def, key) => key === 'value' ? [def.name, def.unit] : def.fields[key]
const distanceNames = {
  sahm: '失业率较低点的升幅', claims: '初请人数较一年低点的升幅', payrolls: '非农近三个月月均增幅',
  indpro: '工业生产半年年化增速', baaLevel: '企业债利差的十年历史位置', baaChange: '企业债利差半年变化',
  nfciCredit: '信用条件水平', fedPath: '联储利率一年变化', curve: '长短利率差',
  nfci: '整体金融条件水平', realRate: '实际政策利率', corePce: '核心通胀半年年化增速',
}
const changeNames = {
  nfciCredit: '信用条件十三周变化', nfci: '整体金融条件十三周变化',
  fedPath: '联储利率半年变化', corePce: '核心通胀同比',
}
const scoreText = score => String(score).replace('-', '−')
function ruleText(def) {
  return '按顺序取第一条符合的规则。' + def.rules.map(({ score, any }) => any.map(group => group.map(({ axis, op, bound }) => {
    const [name, unit] = field(def, axis)
    if (typeof bound === 'boolean') return bound ? name : name.replace('曾倒挂', '无倒挂')
    const right = typeof bound === 'object'
      ? field(def, bound.axis)[0] + (bound.offset ? '加 ' + format(bound.offset, '百分点') : '')
      : format(bound, unit)
    return `${name} ${op} ${right}`
  }).join('且')).join('，或') + `，记 ${score > 0 ? '+' : ''}${score} 分`).join('；') + '；其余记 0 分。'
}

function thresholdPrecision(value, cutoff, unit) {
  const precision = Math.max(readingPrecision(value, unit), readingPrecision(cutoff, unit))
  if (clean(Math.abs(value - cutoff)) >= 10 ** -precision) return undefined
  let extra = precision + 1
  while (value !== cutoff && extra < 10 && format(value, unit, extra) === format(cutoff, unit, extra)) extra += 1
  return extra
}

function crossings(def, reading, score, historical) {
  const candidates = new Map()
  const thresholds = new Map()
  for (const { any } of def.rules) for (const { axis, bound } of any.flat()) {
    const cutoff = boundAt(bound, reading)
    if (Number.isFinite(reading[axis]) && Number.isFinite(cutoff)) {
      thresholds.set(axis, [...(thresholds.get(axis) ?? []), cutoff])
    }
    if (typeof bound === 'object' && Number.isFinite(reading[axis]) && Number.isFinite(reading[bound.axis])) {
      thresholds.set(bound.axis, [...(thresholds.get(bound.axis) ?? []), clean(reading[axis] - bound.offset)])
    }
  }

  function scaleFor(key, value, cutoff, cuts) {
    const index = cuts.indexOf(cutoff)
    const neighbor = value < cutoff ? cuts[index - 1] ?? cuts[index + 1] : cuts[index + 1] ?? cuts[index - 1]
    if (neighbor != null) return Math.abs(neighbor - cutoff)
    const values = historical.flatMap(row => {
      const point = row.components[def.id]?.[key]
      return Number.isFinite(point) ? [point] : []
    })
    if (values.length < 2) return null
    const mean = average(values)
    return Math.sqrt(average(values.map(point => (point - mean) ** 2))) || null
  }

  function add(key, cutoff, cuts) {
    const value = reading[key]
    const scale = scaleFor(key, value, cutoff, cuts)
    for (const shift of [0, -1e-8, 1e-8]) {
      const next = scoreComponent(def, { ...reading, [key]: clean(cutoff + shift) })
      if (next == null || next === score) continue
      const side = next < score ? 'worse' : 'better'
      const gap = clean(Math.abs(cutoff + shift - value))
      const normalizedGap = scale ? gap / scale : Infinity
      const [, unit] = field(def, key)
      const name = key === 'value' ? distanceNames[def.id] : changeNames[def.id]
      const phrasing = shift < 0 ? '降到' : shift > 0 ? '升到' : reading[key] > cutoff ? '降至' : '升至'
      const suffix = shift < 0 ? '以下' : shift > 0 ? '以上' : ''
      const precision = thresholdPrecision(value, cutoff, unit)
      const text = `${name}${phrasing} ${format(cutoff, unit, precision)}${suffix}，${def.label}由 ${scoreText(score)} 分${next === 0 ? '回到' : '变为'} ${scoreText(next)} 分。`
      const existing = candidates.get(side)
      if (!existing || normalizedGap < existing.normalizedGap || (normalizedGap === existing.normalizedGap && gap < existing.gap)) {
        candidates.set(side, { key, gap, normalizedGap, precision, threshold: { threshold: cutoff, score: next, text } })
      }
    }
  }
  for (const [key, values] of thresholds) {
    const cuts = [...new Set(values)].sort((a, b) => a - b)
    for (const cutoff of cuts) add(key, cutoff, cuts)
  }
  return candidates
}

export const BREAKERS = [
  { id: 'recessionCredit', label: '经济与信用同时恶化', cap: 'defense', when: { growth: ['≤', -1.25], credit: ['≤', -0.75] } },
  { id: 'creditStress', label: '信用压力过大', cap: 'lean-defense', when: { credit: ['≤', -1.25] } },
  { id: 'sahmTrigger', label: '失业率发出衰退预警', cap: 'lean-defense', when: { sahm: ['=', -2] } },
  { id: 'inflationSqueeze', label: '通胀偏高且资金收紧', cap: 'neutral', when: { inflation: ['=', -2], liquidity: ['≤', -1] } },
]

const tierIndex = id => TIERS.findIndex(t => t.id === id)
export const average = numbers => numbers.length ? numbers.reduce((a, b) => a + b, 0) / numbers.length : null
export function pillarScore(scores) {
  const known = scores.filter(s => s != null)
  return known.length >= scores.length / 2 ? average(known) : null
}
export function baseTier(score) {
  if (score == null) return null
  return TIERS[score >= TIERS[0].min ? 0 : score >= TIERS[1].min ? 1
    : score <= TIERS[4].max ? 4 : score <= TIERS[3].max ? 3 : 2].id
}
export function applyTactical(tier, below) {
  return tier == null ? null : TIERS[Math.min(tierIndex(tier) + Number(below === true), TIERS.length - 1)].id
}

const REPAIR_RULE = '如果档位已到偏防守或防守（包括经济与信用同时转弱触发的防守），且标普月均价不低于 10 个月均线、企业债利差半年扩大少于 0.2 个百分点、信贷条件过去 13 周没有变紧，档位上调一档。'

export function classify(pillars, scores, below, creditDelta) {
  const known = PILLARS.filter(p => pillars[p.id] != null)
  const R = pillars.growth == null || pillars.credit == null ? null
    : clean(known.reduce((sum, p) => sum + p.weight * pillars[p.id], 0) / known.reduce((sum, p) => sum + p.weight, 0))
  const baseline = baseTier(R)
  const states = { ...pillars, sahm: scores.sahm }
  const breakers = BREAKERS.map(({ id, label, cap, when }) => {
    const checks = Object.entries(when)
    const effect = '最多' + TIERS[tierIndex(cap)].label
    return {
      id, label, effect,
      active: checks.every(([key, [op, cutoff]]) => states[key] != null && compare[op](states[key], cutoff)),
      rule: checks.map(([key, [op, cutoff]]) =>
        `${PILLARS.find(p => p.id === key)?.title ?? '萨姆规则'} ${op} ${cutoff} 分`).join('且') + '，' + effect + '。',
    }
  })
  const regimeIndex = baseline == null ? -1 : Math.max(tierIndex(baseline), ...BREAKERS.map((b, i) => breakers[i].active ? tierIndex(b.cap) : -1))
  const regime = TIERS[regimeIndex]?.id ?? null
  const tactical = applyTactical(regime, below)
  const eligible = tierIndex(tactical) >= 3
  const missing = below == null || !Number.isFinite(scores.baaChange) || !Number.isFinite(creditDelta)
  const repaired = eligible && !missing && below === false && scores.baaChange >= 0 && creditDelta <= 0
  const final = repaired ? TIERS[tierIndex(tactical) - 1].id : tactical
  const repair = {
    active: repaired, rule: REPAIR_RULE,
    display: repaired ? `标普月均价不低于均线，企业债利差和信贷条件达到修复要求，档位由${TIERS[tierIndex(tactical)].label}上调至${TIERS[tierIndex(final)].label}。`
      : tactical == null ? '核心读数不足，暂时无法确认档位是否需要修复。'
        : !eligible ? '当前未进入偏防守或防守档，暂不需要修复确认。'
        : missing ? '月均线或信用读数不足，暂时无法确认修复。'
          : '标普月均价或信用条件尚未达到修复要求，档位维持原判。',
  }
  return {
    regime: { score: R, tier: regime }, final: { tier: final, equityShare: TIERS[tierIndex(final)]?.equityShare ?? null },
    breakers, repair,
    driver: final == null ? 'insufficient' : repaired ? 'repair' : tactical !== regime ? 'tactical' : regime !== baseline ? 'breaker' : 'macro',
  }
}

export function evaluate(frame) {
  const scores = Object.fromEntries(COMPONENTS.map(def => [def.id, scoreComponent(def, frame.components[def.id])]))
  const pillars = Object.fromEntries(PILLARS.map(({ id }) => [id, pillarScore(COMPONENTS.filter(def => def.pillar === id).map(def => scores[def.id]))]))
  return { ...classify(pillars, scores, frame.tactical.below, frame.components.nfciCredit?.delta), scores, pillars }
}

function tacticalDistance(regime, mtd) {
  if (!mtd) return undefined
  const trend = mtd.display.replace(/。$/, '')
  if (!mtd.below) {
    const gap = clean((mtd.average / mtd.sma10 - 1) * 100)
    return `${trend}${gap > 0 ? `（高出 ${format(gap, '%')}）` : ''}，暂不触发战术下调。`
  }
  const tier = TIERS[tierIndex(applyTactical(regime, true))]
  const impact = tier?.id === regime ? '档位已在防守，维持原档'
    : tier ? `战术修正将把档位下调一档至${tier.label}` : '将满足战术下调条件'
  return `${trend}，若月底仍低于均线，${impact}。`
}

function distance({ regime }, nearest, frame) {
  const tactical = tacticalDistance(regime.tier, frame.tactical.mtd)
  const details = { nearest, ...(tactical ? { tactical: tactical + (frame.tacticalOutlook ?? '') } : {}) }
  const index = tierIndex(baseTier(regime.score))
  if (index === -1) return details
  const boundaries = [TIERS[0].min, TIERS[1].min, TIERS[3].max, TIERS[4].max]
  const move = (next, boundary, up) => ({
    tier: TIERS[next].id, scoreGap: clean(Math.abs(regime.score - boundary)),
    text: `综合分${up ? (next < 2 ? '升至至少' : '高于') : (next > 2 ? '降至至多' : '低于')} ${format(boundary, '分')}，宏观底子转为${TIERS[next].label}。`,
  })
  return {
    ...details,
    ...(index > 0 ? { up: move(index - 1, boundaries[index - 1], true) } : {}),
    ...(index < TIERS.length - 1 ? { down: move(index + 1, boundaries[index], false) } : {}),
  }
}

const CONFIDENCE = [['low', '低'], ['medium', '中'], ['high', '高']]

function confidenceFor(pillars, finalTier, warnings) {
  const known = pillars.filter(p => p.score != null)
  const index = tierIndex(finalTier)
  const agree = index === -1 ? 0 : known.filter(p => index < 2 ? p.score > 0 : index > 2 ? p.score < 0 : Math.abs(p.score) < 0.5).length
  const contrary = index >= 0 && index <= 2 ? warnings.names : []
  const stale = pillars.flatMap(p => p.components).filter(c => c.stale)
  const notes = []
  if (index === -1) notes.push('增长与就业或信用的有效读数不足。')
  if (known.length < pillars.length) notes.push(`四根支柱中有 ${pillars.length - known.length} 根读数不足。`)
  if (stale.length) notes.push(`读数更新时间偏久：${stale.map(c => c.label).join('、')}。`)
  const base = agree >= 3 ? 2 : agree === 2 ? 1 : 0
  const adjusted = Math.max(0, base - (contrary.length >= 3 ? 2 : Number(contrary.length > 0)))
  if (contrary.length) {
    const reason = `${contrary.length} 项短线预警亮灯（${contrary.join('、')}）`
    notes.push(base > adjusted && !stale.length
      ? `${reason}，置信度由${CONFIDENCE[base][1]}降为${CONFIDENCE[adjusted][1]}。`
      : `${reason}，置信度维持低档。`)
  }
  if (!notes.length) notes.push(`${known.length} 根有读数的支柱中，${agree} 根与最终档位同向。`)
  const [level] = CONFIDENCE[stale.length || index === -1 ? 0 : adjusted]
  return { level, agree, total: known.length, notes }
}

const reasonDetails = {
  sahm: ['就业仍有支撑', '失业率有所抬升', '失业率发出预警'],
  claims: ['裁员压力较低', '新增失业申领已有回升', '裁员压力上升'],
  payrolls: ['就业增长有支撑', '就业增长平缓', '就业降温'],
  indpro: ['生产有支撑', '生产增速处在中间区间', '生产走弱'],
  baaLevel: ['信用风险溢价偏低', '信用风险溢价居中', '信用风险溢价偏高'],
  baaChange: ['信用利差在收窄', '利差变化较温和', '借钱的风险溢价在上升'],
  nfciCredit: ['信贷环境宽松', '信贷松紧信号居中', '信贷条件偏紧或在收紧'],
  fedPath: ['近期降息缓解资金压力', '利率变化未达到评分阈值', '过去一年加息增加资金压力'],
  curve: ['长短利率关系支持增长', '利率曲线的信号较弱', '当前或近期的曲线倒挂提示增长风险'],
  nfci: ['整体金融条件宽松', '金融条件信号居中', '金融条件偏紧或在收紧'],
  realRate: ['扣除通胀后的政策利率较低', '政策利率有一定约束', '扣除通胀后的政策利率偏高'],
  corePce: ['核心通胀有所降温', '通胀变化仍需观察', '核心通胀偏高或仍在升温'],
}

function leadingReasons(pillars, frame, readingPrecisions) {
  const candidates = pillars.flatMap(pillar => pillar.components
    .filter(component => component.score != null)
    .map(component => ({ ...component, contribution: Math.abs(pillar.weight * component.score / pillar.components.length) })))
    .sort((a, b) => b.contribution - a.contribution)
  const chosen = candidates.slice(0, 4)
  for (const sign of [1, -1]) {
    if (chosen.some(component => Math.sign(component.score) === sign)) continue
    const other = candidates.find(component => Math.sign(component.score) === sign)
    if (other) chosen[chosen.length - 1] = other
  }
  const reasons = chosen.map(({ id, value, score, unit }) => {
    const reading = frame.components[id]
    const context = id === 'fedPath' && score > 0 ? `（半年变化 ${format(reading.delta6, '百分点')}）`
      : ['nfciCredit', 'nfci'].includes(id) && Number.isFinite(reading.delta) ? `（十三周变化 ${format(reading.delta, '点')}）`
        : id === 'corePce' && Number.isFinite(reading.yoy) ? `（同比 ${format(reading.yoy, '%')}）` : ''
    const name = id === 'baaLevel' ? '企业债利差处于十年来' : distanceNames[id] + ' '
    const sign = id === 'indpro' && value > 0 ? '+' : ''
    return `${name}${sign}${format(value, unit, readingPrecisions.get(id))}${context}，${reasonDetails[id][1 - Math.sign(score)]}。`
  })
  if (reasons.length === 0) reasons.push(frame.tactical.display ?? '已完结月份的趋势读数暂缺。')
  if (reasons.length < 2) reasons.push('可评分的宏观读数偏少，仓位档位仍需更多依据。')
  return reasons
}

export function buildCurrent(asOf, frame, historical, outer) {
  const { scores, pillars: pillarScores, ...classified } = evaluate(frame)
  const nearest = []
  const readingPrecisions = new Map()
  const recent = historical.slice(-60)
  const pillars = PILLARS.map(({ id, title, weight, masters, summary }) => {
    const score = pillarScores[id]
    return {
      id, title, weight, score,
      tone: score == null ? 'unknown' : score <= -1 ? 'negative' : score < 0 ? 'caution' : score > 0 ? 'positive' : 'neutral',
      summary: score == null ? '有效读数不足，暂时无法判断。' : summary[Math.sign(score) + 1] + '。',
      history: recent.map(row => [row.d, row.pillars[id]]),
      components: COMPONENTS.filter(def => def.pillar === id).map(def => {
        const reading = frame.components[def.id]
        const score = scores[def.id]
        const edges = score == null ? new Map() : crossings(def, reading, score, historical)
        const closest = [...edges.values()].sort((a, b) => a.normalizedGap - b.normalizedGap)[0]
        if (Number.isFinite(closest?.normalizedGap)) {
          nearest.push({ componentId: def.id, text: closest.threshold.text, gap: closest.normalizedGap })
        }
        const precisionFor = key => Math.max(0, ...[...edges.values()].filter(edge => edge.key === key).map(edge => edge.precision ?? 0)) || undefined
        const valuePrecision = precisionFor('value')
        if (valuePrecision !== undefined) readingPrecisions.set(def.id, valuePrecision)
        const value = reading?.value ?? null
        const context = Object.keys(def.fields ?? {}).flatMap(key => Number.isFinite(reading?.[key]) ? [
          `${field(def, key)[0]} ${format(reading[key], field(def, key)[1], precisionFor(key))}`,
        ] : [])
        return {
          id: def.id, pillar: id, label: def.label, masters, value, unit: def.unit,
          display: value == null ? '暂无足够读数' : `${def.name} ${format(value, def.unit, valuePrecision)}（${[formatDate(reading.observedOn,
            ['IC4WSA', 'NFCICREDIT', 'NFCI'].includes(def.fred) ? 'weekly' : 'monthly'), ...context].join('，')}）`,
          observedOn: reading?.observedOn ?? null, availableOn: reading?.availableOn ?? null,
          stale: reading?.stale ?? false, score, rule: ruleText(def),
          ...Object.fromEntries([...edges].map(([side, edge]) => [side, edge.threshold])),
          source: `https://fred.stlouisfed.org/series/${def.fred}`,
          history: recent.flatMap(row => Number.isFinite(row.components[def.id]?.value) ? [[row.d, row.components[def.id].value]] : []),
        }
      }),
    }
  })
  const finalTier = classified.final.tier
  const tier = TIERS[tierIndex(finalTier)]
  const macroTier = TIERS[tierIndex(classified.regime.tier)]
  const shortTerm = classified.driver === 'repair' ? `，趋势和信用出现修复，最终为${tier.label}`
    : classified.driver === 'tactical' ? `，标普月均价跌在均线下方，最终为${tier.label}` : ''
  const posture = tier ? `宏观底子${macroTier.label}${shortTerm}，股票仓位约为自设上限的 ${Math.round(tier.equityShare * 100)}%`
    : '核心读数不足，暂无法确定股票仓位档位'
  const watched = outer.filter(item => item.grade === 'B')
  const names = watched.filter(item => item.status === 'warn').map(item => item.name)
  const warnings = { on: names.length, total: watched.length, names }
  const shortRisk = warnings.on ? `短线有 ${warnings.on} 项预警亮灯`
    : watched.some(item => item.status === 'clear') ? '短线已取得的预警读数均未亮灯' : '短线预警读数暂缺'
  const confidence = confidenceFor(pillars, finalTier, warnings)
  const closest = nearest.sort((a, b) => a.gap - b.gap).slice(0, 3).map(({ componentId, text }) => ({ componentId, text }))
  return {
    asOf, ...classified, tactical: frame.tactical,
    headline: `${posture}，${shortRisk}，置信度${{ high: '高', medium: '中', low: '低' }[confidence.level]}。`,
    reasons: leadingReasons(pillars, frame, readingPrecisions), confidence, warnings, distance: distance(classified, closest, frame), pillars,
  }
}
