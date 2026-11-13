// 林奇六类 + 同类关注度：与 ResearchNotes「分组规则」同口径。
// 增速/护城河仍用既有研究输入；本模块只按规则重判类型与关注度（PE/股息/PB 可换新值）。

export const LYNCH_TYPES = ['周期型', '困境反转型', '资产型', '快速增长型', '稳健型', '缓慢增长型', '数据不足']
/** 「待定」= 判定所需的估值/周期位置输入缺失，不等于「低」 */
export const LYNCH_ATTENTION = ['高', '中', '低', '待定']

const VALID_ATTENTION = new Set(LYNCH_ATTENTION)
const CYCLICAL_W = '行业属强周期' // 生成器：行业属强周期 → 周期型
const CYCLICAL_F = '所属行业有周期属性' // 生成器：强周期行业但连续两年单边高增（旧规则仍放进了增速桶）

/** 有效增速 = min(近一年利润增速, 两年年化) */
export function effectiveGrowth(entry) {
  const g = num(entry?.g)
  const c = num(entry?.c)
  if (g == null || c == null) return null
  return Math.min(g, c)
}

/**
 * 是否属强周期行业。优先级：显式 `cyclical` 布尔（数据层纠错用，见 lynch-overrides.mjs）
 * > 行业上下文明确非周期 ctx.nonCyclicalIndustry（如化学药：生成器的强周期文字标记视为误判）
 * > 生成器行业标记（w「行业属强周期」/ f「所属行业有周期属性」）> 行业上下文 ctx.cyclicalIndustry。
 */
export function isCyclical(entry, ctx = {}) {
  if (typeof entry?.cyclical === 'boolean') return entry.cyclical
  if (ctx?.nonCyclicalIndustry === true) return false
  if (hasText(entry?.w, CYCLICAL_W) || hasText(entry?.f, CYCLICAL_F)) return true
  return ctx?.cyclicalIndustry === true
}

/**
 * 三个 TTM 利润窗口（旧→新，间隔一年）。优先结构化字段 `ttm`；
 * 否则读生成器护城河证据「盈利持续：三个 TTM 窗口利润 新/中/旧」。缺失返回 null。
 */
export function turnaroundWindows(entry) {
  if (Array.isArray(entry?.ttm) && entry.ttm.length === 3) {
    const xs = entry.ttm.map(num)
    return xs.every(x => x != null) ? xs : null
  }
  const item = entry?.m?.i?.find?.(x => Array.isArray(x) && x[0] === '盈利持续')
  const m = typeof item?.[2] === 'string' ? item[2].match(/三个 TTM 窗口利润\s*([-+\d.eE/]+)/) : null
  if (!m) return null
  const xs = m[1].split('/').map(num)
  if (xs.length !== 3 || xs.some(x => x == null)) return null
  return xs.reverse()
}

/** 仍处困境/反转途中：最新仍亏、刚由亏转盈，或已从谷底回升但未回到谷底前水平 */
function turnaroundActive([p0, p1, p2]) {
  if (p2 <= 0 || p1 <= 0) return true
  return p1 < p0 && p2 < p0
}

function growthBucket(entry) {
  const eg = effectiveGrowth(entry)
  const rg = num(entry?.rg)
  // 快速需利润有效增速与营收同时达标；营收不足时不因 eg≥20 掉进「数据不足」，归稳健
  if (eg != null && rg != null && eg >= 20 && rg >= 10) return '快速增长型'
  if (eg != null && eg >= 8) return '稳健型'
  if (eg != null && eg < 8) return '缓慢增长型'
  return null
}

/**
 * 类型判定顺序：周期 → 困境反转 → 资产 → 快速 → 稳健 → 缓慢。
 * - 周期：强周期行业一律周期型（高增不改判，避免周期顶部的低 PE 陷阱）；
 *   既有周期型若不是行业标记来的（TTM 波动判定），因波动序列不在结构化字段里，保留。
 * - 困境反转：有 TTM 窗口时重判（反转完成、有效增速 ≤80% → 增速桶），缺窗口才保留。
 * - 资产：PB 折价型在 PB ≥1 时重判；PB 缺失或 REIT 保留。
 */
export function classifyLynchType(entry, ctx = {}) {
  const prev = entry?.t
  if (isCyclical(entry, ctx)) return '周期型'
  if (prev === '周期型' && entry?.cyclical !== false) return prev

  if (prev === '困境反转型') {
    const win = turnaroundWindows(entry)
    if (!win || turnaroundActive(win)) return prev
    // 已回到谷底前水平，但有效增速仍 >80%：多为低基数/一次性收益，增速不可外推，暂不移出困境反转
    const eg = effectiveGrowth(entry)
    if (eg != null && eg > 80) return prev
    return growthBucket(entry) ?? prev
  }
  if (prev === '资产型') {
    const pb = num(entry?.pb)
    if (hasText(entry?.w, 'REIT') || pb == null || pb < 1) return prev
    return growthBucket(entry) ?? prev
  }
  const bucket = growthBucket(entry)
  if (bucket) return bucket
  if (LYNCH_TYPES.includes(prev) && prev !== '周期型') return prev
  return '数据不足'
}

const CYCLE_PHASE_ATTENTION = { 盈利高位: '低', 盈利下行: '低', 盈利低位: '中', 盈利回升初期: '中' }

/** 周期型关注度：按盈利位置，不看 PEG。原已是周期型则保留生成器按位置给的档。 */
function cyclicalAttention(entry) {
  if (entry?.t === '周期型' && VALID_ATTENTION.has(entry?.r)) return entry.r
  const byPhase = CYCLE_PHASE_ATTENTION[entry?.ph]
  if (byPhase) return byPhase
  const eg = effectiveGrowth(entry)
  if (eg != null && eg >= 20) return '低' // 连续高增 ≈ 盈利高位：低 PE 往往是顶部信号
  return '待定'
}

/** 同类关注度：只在同类型内比价，不是买卖评级。 */
export function classifyLynchAttention(type, entry) {
  const pe = num(entry?.pe)
  const eg = effectiveGrowth(entry)
  const dy = num(entry?.dy)
  const pb = num(entry?.pb)

  if (type === '周期型') return cyclicalAttention(entry)
  if (type === '快速增长型') {
    if (pe == null) return '待定'
    if (eg == null || eg <= 0) return '低'
    const peg = pe / Math.min(eg, 50)
    if (peg < 1) return '高'
    if (peg <= 1.5) return '中'
    return '低'
  }
  if (type === '稳健型') {
    if (pe == null) return '待定'
    if (pe <= 15) return '高'
    if (pe <= 22) return '中'
    return '低'
  }
  if (type === '缓慢增长型') {
    // 只在低 PE 或高股息时给「中」
    if ((pe != null && pe <= 15) || (dy != null && dy >= 3)) return '中'
    if (pe == null) return '待定'
    return '低'
  }
  if (type === '资产型') {
    if (pb == null) return VALID_ATTENTION.has(entry?.r) ? entry.r : '待定'
    if (pb < 0.7) return '高'
    if (pb < 1) return '中'
    return '低'
  }
  // 困境反转 / 数据不足：缺杠杆与季度序列时保留原档，避免伪信号
  return VALID_ATTENTION.has(entry?.r) ? entry.r : '待定'
}

/** 历史口径 PEG（PE ÷ 有效增速，封顶 50），只用于关注度与说明文字，不写入 `peg` 字段 */
export function computePeg(type, entry) {
  if (type !== '快速增长型') return null
  const pe = num(entry?.pe)
  const eg = effectiveGrowth(entry)
  if (pe == null || eg == null || eg <= 0) return null
  return round2(pe / Math.min(eg, 50))
}

/** `peg` 字段：仅在有同口径预测增速 forecastGrowth 时计算（站内口径：不沿用旧增速） */
export function forecastPeg(type, entry) {
  if (type !== '快速增长型') return null
  const pe = num(entry?.pe)
  const fg = num(entry?.forecastGrowth)
  if (pe == null || fg == null || fg <= 0) return null
  return round2(pe / Math.min(fg, 50))
}

export function attentionAssessment(type, attention, entry) {
  const pe = num(entry?.pe)
  const peTxt = pe == null ? 'PE 缺失' : `PE ${round1(pe)}×`
  if (attention === '待定' && pe == null && (type === '快速增长型' || type === '稳健型' || type === '缓慢增长型')) {
    return `PE 缺失：${type}关注度待定，补齐行情后再判断`
  }
  if (type === '周期型') {
    if (entry?.t === '周期型' && entry?.historicalAssessment) return entry.historicalAssessment
    if (attention === '待定') return '强周期行业：周期位置待确认，不按 PEG/普通 PE 判断'
    if (attention === '低') return '强周期行业：利润处于高位或下行，低 PE 往往是顶部信号，不按 PEG 判断'
    return `强周期行业：盈利位置${entry?.ph || '偏低'}，按周期位置而非 PEG 判断`
  }
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

function typeChangeReason(prev, next, entry) {
  if (next === '周期型') return '强周期行业优先于增速/反转判定'
  if (prev === '周期型' && entry?.cyclical === false) return '人工复核取消强周期标记（原生成器标记误判或不按强周期处理），按有效增速重判'
  if (prev === '周期型') return '已取消强周期标记，按有效增速重判'
  if (prev === '困境反转型') return '利润已回到谷底前水平之上，反转完成，按有效增速重判'
  if (prev === '资产型') return `PB ${num(entry?.pb)} 已不低于 1，按有效增速重判`
  return '按有效增速重判'
}

const NOTE_RE = /；?(?:\d{4}-\d{2}-\d{2}|本轮) 按站内规则调整：[^]*$/

/**
 * 按规则重判。只改实际变化的字段：
 * - 类型/关注度都未变（且无预测 PEG 变化）→ 原样返回，不动 v / classificationAsOf / historicalAssessment；
 * - 类型变化才写 classificationAsOf；类型或关注度变化才重写 historicalAssessment；
 * - 变化写入 classificationNote，并追加到 v 末尾（替换上一次追加的同类说明）。
 * ctx.cyclicalIndustry：调用方按行业判定的强周期标记（生成器标记缺失时补充）。
 */
export function applyLynchReclassification(entry, { asOf, ctx = {} } = {}) {
  const type = classifyLynchType(entry, ctx)
  const attention = classifyLynchAttention(type, entry)
  const typeChanged = type !== entry.t
  const attnChanged = attention !== entry.r
  const fPeg = forecastPeg(type, entry)
  const pegChanged = entry?.forecastGrowth != null && fPeg !== (entry.peg ?? null)
  if (!typeChanged && !attnChanged && !pegChanged) return { ...entry }

  const next = { ...entry, t: type, r: attention }
  if (pegChanged) next.peg = fPeg
  if (typeChanged) next.classificationAsOf = asOf ?? null
  if (typeChanged || attnChanged) next.historicalAssessment = attentionAssessment(type, attention, entry)

  const parts = []
  if (typeChanged) parts.push(`类型 ${entry.t ?? '未分类'}→${type}（${typeChangeReason(entry.t, type, entry)}）`)
  if (attnChanged) {
    const why = attention === '待定' && num(entry?.pe) == null && type !== '周期型' ? '（PE 缺失）' : type === '周期型' && typeChanged ? '（周期型按盈利位置，不看 PEG）' : ''
    parts.push(`关注度 ${entry.r ?? '无'}→${attention}${why}`)
  }
  if (pegChanged) parts.push(`PEG 按同口径预测增速 ${entry.forecastGrowth}% 计为 ${fPeg ?? '—'}`)
  if (parts.length) {
    const note = `${asOf || '本轮'} 按站内规则调整：${parts.join('；')}`
    next.classificationNote = note
    const base = typeof entry.v === 'string' ? entry.v.replace(NOTE_RE, '') : ''
    next.v = base ? `${base}${/[。；]$/.test(base) ? '' : '；'}${note}` : note
  }
  return next
}

function hasText(list, needle) {
  return Array.isArray(list) && list.some(x => typeof x === 'string' && x.includes(needle))
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
