import { average, baseTier, TIERS } from '../macro-posture/model.mjs'
import { clean, monthEnd, percentile, valueAt } from '../macro-posture/panel.mjs'
import { month } from './data.mjs'

const BREADTH = { a: [30, 70], b: [40, 60] }
const VOLUME = { a: 1.10, b: 1.20 }
const ERP = { a: [0, 3], b: [1, 4] }
const CAPE = { a: [30, 90], b: [20, 80] }
const VARIANT_TEXT = {
  breadth: { a: '宽度 30%/70%', b: '宽度 40%/60%' },
  volume: { a: '量比 1.10', b: '量比 1.20' },
  erp: { a: '股债利差 0/3', b: '股债利差 1/4' },
  cape: { a: 'CAPE 30/90 百分位', b: 'CAPE 20/80 百分位' },
}
const CONSTRUCTIONS = {
  A: { label: '市场内部', variants: ['breadth', 'volume'] },
  B: { label: '市场内部与股债利差', variants: ['breadth', 'volume', 'erp'] },
  C: { label: '市场内部与 CAPE', variants: ['breadth', 'volume', 'cape'] },
  D: { label: '市场内部、股债利差与 CAPE', variants: ['breadth', 'volume', 'erp', 'cape'] },
}

export function configurations() {
  return Object.entries(CONSTRUCTIONS).flatMap(([construction, { label, variants }]) => {
    const combos = variants.reduce((rows, id) =>
      rows.flatMap(row => ['a', 'b'].map(variant => ({ ...row, [id]: variant }))), [{}])
    return combos.map(variantById => ({
      construction, variantById,
      label: `${label}（${Object.entries(variantById).map(([id, variant]) => VARIANT_TEXT[id][variant]).join('；')}）`,
      id: construction + ':' + Object.entries(variantById).map(([id, variant]) => id + '-' + variant).join(','),
    }))
  })
}

function exactMonth(series, d, asOf) {
  const point = valueAt(series, d < asOf ? d : asOf)
  return point && month(point.observedOn) === month(d) ? point : null
}

function windowValues(series, d, asOf, length) {
  const points = Array.from({ length }, (_, i) => exactMonth(series, monthEnd(d, -i), asOf))
  return points.every(Boolean) ? points.map(p => p.value) : null
}

export function readMarket(data, panel, asOf, { priceThrough = asOf } = {}) {
  const price = valueAt(panel.price, priceThrough)
  const breadth = valueAt(data.breadth, asOf)
  const pe = valueAt(data.pe, asOf)
  const cape = valueAt(data.cape, asOf)
  const gs10 = valueAt(panel.GS10, asOf)
  const reference = cape
    ? [...new Map(data.cape.filter(p => p.availableOn <= asOf)
      .map(p => [month(p.observedOn), p.value])).values()]
    : []
  const priceDate = price ? monthEnd(price.observedOn) : null
  const p12 = priceDate ? windowValues(panel.price, priceDate, priceThrough, 12) : null
  const p10 = p12?.slice(0, 10) ?? (priceDate ? windowValues(panel.price, priceDate, priceThrough, 10) : null)
  const below = p10 ? price.value < average(p10) : null
  const volumes = priceDate ? windowValues(data.volume, priceDate, priceThrough, 12) : null
  return {
    below,
    breadth,
    narrow: breadth && p12 ? {
      observedOn: priceDate, value: clean((1 - price.value / Math.max(...p12)) * 100), breadth: breadth.value,
    } : null,
    volume: volumes ? { observedOn: priceDate, value: clean(average(volumes.slice(0, 3)) / average(volumes)), below } : null,
    erp: pe && gs10 ? {
      observedOn: pe.observedOn > gs10.observedOn ? pe.observedOn : gs10.observedOn,
      value: clean(100 / pe.value - gs10.value), pe, gs10,
    } : null,
    cape: cape ? { observedOn: cape.observedOn, value: clean(percentile(cape.value, reference)), ratio: cape.value } : null,
  }
}

function band(value, [low, high]) {
  return value <= low ? -1 : value >= high ? 1 : 0
}

export function scoreMarket(id, variant, readings) {
  const reading = readings[id]
  if (!Number.isFinite(reading?.value)) return null
  const { value } = reading
  switch (id) {
    case 'breadth': return band(value, BREADTH[variant])
    case 'narrow': return value <= 5 && reading.breadth < 50 ? -1 : 0
    case 'volume':
      if (reading.below == null) return null
      return value < VOLUME[variant] ? 0 : reading.below ? -1 : 1
    case 'erp': return band(value, ERP[variant])
    case 'cape': return -band(value, CAPE[variant]) || 0
    default: return null
  }
}

export function marketScore(config, readings) {
  const ids = ['breadth', 'narrow', 'volume', ...['erp', 'cape'].filter(id => config.variantById[id])]
  const scores = ids.map(id => scoreMarket(id, config.variantById[id], readings))
  return average(scores.filter(score => score != null))
}

const n = value => value.toFixed(2)
const details = {
  breadth: {
    label: '行业宽度',
    display: r => `${n(r.value)}% 的行业站上自身 10 个月均线。`,
    rule: v => `宽度不高于 ${BREADTH[v][0]}% 扣 1 分，达到 ${BREADTH[v][1]}% 加 1 分。`,
    note: '行业月回报在历史检验中按观察月后第二个月月底可得',
  },
  narrow: {
    label: '窄幅领涨',
    display: r => `标普月均价距 12 个月高点 ${n(r.value)}%，可得行业宽度为 ${n(r.breadth)}%。`,
    rule: () => '距高点不超过 5% 且行业宽度低于 50% 时扣 1 分。',
  },
  volume: {
    label: '量价',
    display: r => `近 3 个月日均量为近 12 个月的 ${n(r.value)} 倍，标普月均价${r.below ? '低于' : '不低于'} 10 个月均线。`,
    rule: v => `达到 ${VOLUME[v].toFixed(2)} 倍时，价格低于均线扣 1 分，否则加 1 分。`,
    note: '采用 Yahoo 标普指数成分总成交量',
  },
  erp: {
    label: '股债利差',
    display: r => `过去 12 个月市盈率为 ${n(r.pe.value)} 倍（${month(r.pe.observedOn)}），10 年期美债收益率 ${n(r.gs10.value)}%（${month(r.gs10.observedOn)}），利差 ${n(r.value)} 个百分点。`,
    rule: v => `利差不高于 ${ERP[v][0]} 个百分点扣 1 分，达到 ${ERP[v][1]} 个百分点加 1 分。`,
  },
  cape: {
    label: '周期调整市盈率（CAPE）',
    display: r => `CAPE 为 ${n(r.ratio)} 倍，处于 1900 年以来第 ${n(r.value)} 百分位。`,
    rule: v => `达到第 ${CAPE[v][1]} 百分位扣 1 分，不高于第 ${CAPE[v][0]} 百分位加 1 分。`,
  },
}

export function currentMarket(config, readings, forwardPe) {
  const score = marketScore(config, readings)
  const tier = baseTier(score)
  const label = TIERS.find(row => row.id === tier)
  const components = Object.entries(details).map(([id, def]) => {
    const reading = readings[id]
    const variant = config.variantById[id]
    const inBacktest = id === 'narrow' || Boolean(variant)
    return {
      id, label: def.label, observedOn: reading?.observedOn ?? null,
      display: reading ? def.display(reading) : '读数暂缺',
      score: inBacktest ? scoreMarket(id, variant, readings) : null,
      rule: inBacktest ? def.rule(variant) : '独立展示，所选组合未纳入这项读数。',
      inBacktest,
      ...(!inBacktest ? { note: '参与过回测，但未被选入最优组合，只展示' } : def.note ? { note: def.note } : {}),
    }
  })
  components.push({
    id: 'forwardPe', label: '前瞻市盈率（FactSet）', observedOn: forwardPe?.observedOn ?? null,
    display: forwardPe ? `未来 12 个月预期市盈率为 ${n(forwardPe.value)} 倍。` : '读数暂缺',
    score: null, rule: 'D 级（授权受限）', inBacktest: false, note: '无免费历史，只展示',
  })
  return {
    score, tier, components,
    headline: label ? `市场综合为${label.label}，得分 ${n(score)}，对应股票仓位上限的 ${Math.round(label.equityShare * 100)}%。` : '市场读数暂缺，无法判断档位。',
  }
}
