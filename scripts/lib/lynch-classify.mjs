// 林奇六类 + 同类关注度：与 ResearchNotes「分组规则」同口径。
// 增速/护城河仍用既有研究输入；本模块只按规则重判类型与关注度（PE/股息/PB 可换新值）。

export const LYNCH_TYPES = ['困境反转型', '周期型', '资产型', '快速增长型', '稳健型', '缓慢增长型', '数据不足']

/** 有效增速 = min(近一年利润增速, 两年年化) */
export function effectiveGrowth(entry) {
  const g = num(entry?.g)
  const c = num(entry?.c)
  if (g == null || c == null) return null
  return Math.min(g, c)
}

/**
 * 类型判定顺序：困境反转 → 周期 → 资产 → 快速 → 稳健 → 缓慢。
 * 缺 TTM 窗口/行业标签时，困境/周期/资产保留既有类型，不降级到增速桶。
 */
export function classifyLynchType(entry) {
  const preserved = entry?.t
  if (preserved === '困境反转型' || preserved === '周期型' || preserved === '资产型') return preserved

  const eg = effectiveGrowth(entry)
  const rg = num(entry?.rg)
  // 快速需利润有效增速与营收同时达标；营收不足时不因 eg≥20 掉进「数据不足」，归稳健
  if (eg != null && rg != null && eg >= 20 && rg >= 10) return '快速增长型'
  if (eg != null && eg >= 8) return '稳健型'
  if (eg != null && eg < 8) return '缓慢增长型'
  if (LYNCH_TYPES.includes(preserved)) return preserved
  return '数据不足'
}

/** 同类关注度：只在同类型内比价，不是买卖评级。 */
export function classifyLynchAttention(type, entry) {
  const pe = num(entry?.pe)
  const eg = effectiveGrowth(entry)
  const dy = num(entry?.dy)
  const pb = num(entry?.pb)

  if (type === '快速增长型') {
    if (pe == null || eg == null || eg <= 0) return '低'
    const peg = pe / Math.min(eg, 50)
    if (peg < 1) return '高'
    if (peg <= 1.5) return '中'
    return '低'
  }
  if (type === '稳健型') {
    if (pe == null) return '低'
    if (pe <= 15) return '高'
    if (pe <= 22) return '中'
    return '低'
  }
  if (type === '缓慢增长型') {
    // 只在低 PE 或高股息时给「中」
    if ((pe != null && pe <= 15) || (dy != null && dy >= 3)) return '中'
    return '低'
  }
  if (type === '资产型') {
    if (pb == null) return entry?.r === '高' || entry?.r === '中' || entry?.r === '低' ? entry.r : '低'
    if (pb < 0.7) return '高'
    if (pb < 1) return '中'
    return '低'
  }
  // 周期 / 困境反转：缺盈利位置与杠杆序列时保留原档，避免伪信号
  if (entry?.r === '高' || entry?.r === '中' || entry?.r === '低') return entry.r
  return '低'
}

export function computePeg(type, entry) {
  if (type !== '快速增长型') return null
  const pe = num(entry?.pe)
  const eg = effectiveGrowth(entry)
  if (pe == null || eg == null || eg <= 0) return null
  return round2(pe / Math.min(eg, 50))
}

export function attentionAssessment(type, attention, entry) {
  const pe = num(entry?.pe)
  const eg = effectiveGrowth(entry)
  const peTxt = pe == null ? 'PE 缺失' : `PE ${round1(pe)}×`
  if (type === '快速增长型') {
    const peg = computePeg(type, entry)
    if (peg == null) return `${peTxt}：增速不足，PEG 不适用`
    if (attention === '高') return `PEG ${peg}<1：增速支撑估值`
    if (attention === '中') return `PEG ${peg}：估值与增速大体匹配`
    return `PEG ${peg}>1.5：估值偏贵于增速`
  }
  if (type === '稳健型') {
    if (attention === '高') return `${peTxt} 不高，稳健增长`
    if (attention === '中') return `${peTxt} 尚可，稳健型可观察`
    return `${peTxt} 偏高，稳健型不宜为高估值付费`
  }
  if (type === '缓慢增长型') {
    if (attention === '中') return `${peTxt}，低增长只在低估值/高股息时有意义`
    return `${peTxt}，缓慢增长型价格未达关注门槛`
  }
  return entry?.historicalAssessment || `${type} · 关注度${attention}`
}

export function applyLynchReclassification(entry, { asOf, source } = {}) {
  const type = classifyLynchType(entry)
  const attention = classifyLynchAttention(type, entry)
  const peg = computePeg(type, entry)
  const next = {
    ...entry,
    t: type,
    r: attention,
    peg,
    historicalAssessment: attentionAssessment(type, attention, entry),
    classificationAsOf: asOf ?? null,
  }
  if (source) next.source = source
  const peNote = entry.checkedAt
    ? `PE行情字段于${entry.checkedAt}核验`
    : 'PE 行情字段已核验'
  next.v = `${peNote}；类型与同类关注度于${asOf || '本轮'}按站内规则重算（增速/护城河输入仍为原研究，未按新报表重取）。PEG 仅快速增长型按新 PE 与有效增速重算。`
  return next
}

function num(v) {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function round1(n) {
  return Math.round(n * 10) / 10
}

function round2(n) {
  return Math.round(n * 100) / 100
}
