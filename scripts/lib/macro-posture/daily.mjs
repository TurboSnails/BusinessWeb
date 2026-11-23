import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BREAKERS, COMPONENTS, evaluate, PILLARS, TIERS } from './model.mjs'
import { monthEnd, panelAt, valueAt } from './panel.mjs'
import { remainingSessions } from './calendar.mjs'
import { formatDate, formatReading } from './format.mjs'

// 设计第 14 节：每个交易日按当日已可得数据定档，月末最后一个交易日为正式定档。
export const DAILY_START = '1973-01-02'
export const DAILY_MAX_CHANGES = 200
export const DAILY_CACHE = fileURLToPath(new URL('../../../data-raw/macro-posture-daily', import.meta.url))
export const DAILY_CACHE_FILE = 'spx-daily.json'
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const month = date => date.slice(0, 7)
const round2 = value => Math.round(value * 100) / 100
const tierIndex = id => TIERS.findIndex(tier => tier.id === id)
export const tierCode = id => tierIndex(id)
const tierLabel = code => TIERS[code]?.label ?? '证据不足'

function validRows(rows) {
  return (Array.isArray(rows) ? rows : []).filter(row => Array.isArray(row) && typeof row[0] === 'string' &&
    ISO_DATE.test(row[0]) && Number.isFinite(row[1]) && row[1] > 0)
}

/** 本地缓存的日收盘为底，最近的 FRED / 站内收盘覆盖重叠日期（与当前读数的月内均价同源）。 */
export function mergeDailyCloses(cached = [], recent = []) {
  const merged = new Map(validRows(cached))
  for (const [date, value] of validRows(recent)) merged.set(date, value)
  return [...merged].sort(([a], [b]) => a.localeCompare(b))
}

/** 只把缓存最后一天之后的新收盘追加进缓存，历史部分保持不变。 */
export function extendDailyCache(cached = [], recent = []) {
  const rows = validRows(cached)
  const last = rows.at(-1)?.[0] ?? ''
  const added = validRows(recent).filter(([date]) => date > last).map(([date, value]) => [date, round2(value)])
  return { rows: [...rows, ...added], added: added.length }
}

export function serializeDailyCache({ source, fetchedAt, updatedAt, rows }) {
  const head = JSON.stringify({ source, fetchedAt, ...(updatedAt ? { updatedAt } : {}) }).slice(0, -1)
  return `${head},"rows":[\n${rows.map(row => JSON.stringify(row)).join(',\n')}\n]}\n`
}

async function atomicWrite(path, body) {
  const temporary = path + '.' + randomUUID() + '.tmp'
  try {
    await writeFile(temporary, body)
    await rename(temporary, path)
  } finally {
    await unlink(temporary).catch(() => {})
  }
}

/**
 * 读本地日线缓存（不发任何网络请求），用最近收盘增量补齐并写回缓存。
 * 缓存不存在时只用最近收盘，不新建缓存（避免用短历史冒充完整缓存）。
 */
export async function loadDailyCloses(recent, { directory = DAILY_CACHE, today, appendBefore } = {}) {
  const path = resolve(directory, DAILY_CACHE_FILE)
  let cache
  try {
    cache = JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    return { closes: mergeDailyCloses([], recent), cached: false, added: 0 }
  }
  // 当天收盘可能尚未定格，只把更早的交易日写入缓存；内存合并仍使用全部最近收盘。
  const settled = appendBefore ? validRows(recent).filter(([date]) => date < appendBefore) : recent
  const { rows, added } = extendDailyCache(cache.rows, settled)
  if (added) {
    await mkdir(directory, { recursive: true })
    await atomicWrite(path, serializeDailyCache({ ...cache, ...(today ? { updatedAt: today } : {}), rows }))
  }
  return { closes: mergeDailyCloses(rows, recent), cached: true, added, firstCached: rows[0]?.[0] }
}

function monthlyPoint(series, date) {
  const point = valueAt(series, monthEnd(date))
  return point && month(point.observedOn) === month(date) ? point : null
}

/** 前 9 个完整月的月均价（与月度回测同一张月均价表）的平均值；缺任何一个月则为 null。 */
export function priorNine(panel, date) {
  const points = Array.from({ length: 9 }, (_, i) => monthlyPoint(panel.price, monthEnd(date, -i - 1)))
  return points.every(Boolean) ? points.reduce((sum, point) => sum + point.value, 0) / 9 : null
}

/** 按日的战术修正：本月至今收盘均价 vs（前 9 个完整月月均价 × 9 + 本月至今均价）/ 10。 */
export function dailyTactical(average, prior9) {
  if (!Number.isFinite(average) || !Number.isFinite(prior9)) return { below: null, sma10: null }
  const sma10 = (prior9 * 9 + average) / 10
  return { below: average < sma10, sma10 }
}

function isOfficial(days, i) {
  if (i < days.length - 1) return month(days[i + 1][0]) !== month(days[i][0])
  const date = days[i][0]
  return remainingSessions(date, monthEnd(date)) === 0
}

function snapshot(result, frame, below) {
  return {
    regime: tierCode(result.regime.tier),
    final: tierCode(result.final.tier),
    below,
    repair: result.repair.active,
    breakers: new Set(result.breakers.filter(b => b.active).map(b => b.id)),
    scores: result.scores,
    pillars: result.pillars,
    values: Object.fromEntries(COMPONENTS.map(def => [def.id, frame.components[def.id]?.value ?? null])),
  }
}

const READING_NAMES = {
  sahm: '萨姆规则读数', claims: '初请失业救济较一年低点升幅', payrolls: '非农近三个月月均增幅', indpro: '工业生产半年年化增速',
  hours: '制造业周工时半年变化', baaLevel: '企业债利差处于十年来', baaChange: '企业债利差半年变化', nfciCredit: '信贷条件水平',
  fedPath: '联储利率一年变化', curve: '长短利率差', nfci: '整体金融条件水平', realRate: '实际政策利率', corePce: '核心通胀半年年化增速',
}
const pillarTitle = Object.fromEntries(PILLARS.map(p => [p.id, p.title]))
const pillarWeight = Object.fromEntries(PILLARS.map(p => [p.id, p.weight / COMPONENTS.filter(c => c.pillar === p.id).length]))
const breakerDefs = Object.fromEntries(BREAKERS.map(b => [b.id, b]))

function componentReason(previous, current, worse) {
  const changed = COMPONENTS.filter(def => previous.scores[def.id] !== current.scores[def.id])
  if (!changed.length) return null
  const delta = def => (current.scores[def.id] ?? 0) - (previous.scores[def.id] ?? 0)
  const ranked = changed.map(def => ({ def, impact: delta(def) * pillarWeight[def.pillar] }))
    .sort((a, b) => (worse ? a.impact - b.impact : b.impact - a.impact))
  const { def } = ranked[0]
  const value = current.values[def.id]
  const now = current.scores[def.id]
  const before = previous.scores[def.id]
  const reading = Number.isFinite(value) ? ` ${def.id === 'hours' && value > 0 ? '+' : ''}${formatReading(value, def.unit)}` : ' 读数暂缺'
  const weaker = now != null && before != null && now < before
  const direction = now == null || before == null ? ''
    : def.pillar === 'inflation' ? (weaker ? '，通胀压力上升' : '，通胀压力缓解')
      : `，${pillarTitle[def.pillar]}${weaker ? '转弱' : '转强'}`
  const others = changed.length > 1 ? `（另有 ${changed.length - 1} 项读数变化）` : ''
  return `${READING_NAMES[def.id]}${reading}${direction}${others}`
}

function regimeReason(previous, current) {
  if (current.regime === -1) return '增长与就业或信用的有效读数不足，暂无法定档'
  const parts = []
  if (previous.regime === -1) parts.push('核心读数补齐，恢复定档')
  for (const id of current.breakers) if (!previous.breakers.has(id)) parts.push(`触发熔断「${breakerDefs[id].label}」`)
  for (const id of previous.breakers) if (!current.breakers.has(id)) parts.push(`熔断「${breakerDefs[id].label}」解除`)
  const components = componentReason(previous, current, current.regime > previous.regime)
  if (components) parts.push(components)
  return parts.length ? parts.join('；') : '宏观综合分跨过档位阈值'
}

function finalReason(previous, current, official) {
  const parts = []
  if (current.regime !== previous.regime) parts.push(`周期档位转为${tierLabel(current.regime)}：${regimeReason(previous, current)}`)
  if (current.below !== previous.below && current.below != null && previous.below != null) {
    parts.push(current.below
      ? official ? '月均价收在 10 个月均线下方，战术下调一档' : '月内均价跌破 10 个月均线预估，战术下调一档'
      : official ? '月均价收回 10 个月均线上方，战术下调取消' : '月内均价回到 10 个月均线预估上方，战术下调取消')
  }
  if (current.repair !== previous.repair) parts.push(current.repair ? '修复确认生效，上调一档' : '修复确认条件不再满足')
  if (!parts.length && current.final === -1) parts.push('有效读数不足，暂无法定档')
  return parts.length ? parts.join('；') : '战术修正与修复确认共同作用'
}

function recessionLookup(panel, timeline) {
  const marks = new Map((timeline ?? []).map(row => [row.d, row.rec]))
  for (const point of panel.USREC ?? []) {
    const key = month(point.observedOn)
    if (!marks.has(key)) marks.set(key, point.value === 1 ? 1 : 0)
  }
  return date => marks.get(month(date)) === 1 ? 1 : 0
}

const monthText = d => `${d.slice(0, 4)} 年 ${Number(d.slice(5, 7))} 月`
const fullDate = d => `${d.slice(0, 4)} 年 ${formatDate(d)}`

/**
 * 每日档位。
 * - closes：[日期, 收盘] 升序日线（1950 起缓存 + 最近 FRED / 站内收盘）
 * - panel：回测同一套发布滞后的面板；currentFrame：当前读数口径的帧（最后一个交易日使用）
 * - timeline：月度回测时间线，用于月末一致性核对
 */
export function buildDaily({
  closes, panel, currentFrame, timeline = [], start = DAILY_START, generatedAt, ruleVersion, maxChanges = DAILY_MAX_CHANGES,
}) {
  const clock = Date.now()
  const all = validRows(closes)
  const firstIndex = all.findIndex(([date]) => date >= start)
  if (firstIndex === -1) throw new Error('没有可用的标普日收盘')
  const recession = recessionLookup(panel, timeline)
  const monthly = new Map(timeline.map(row => [row.d, row]))
  const rows = []
  const changes = []
  const mismatches = []
  let officialCount = 0
  let previous = null
  let mtd = { key: null, sum: 0, count: 0, prior9: null }
  // 月内均价需要从月初累计，即使月初早于 start。
  let cursor = firstIndex
  while (cursor > 0 && month(all[cursor - 1][0]) === month(all[firstIndex][0])) cursor -= 1
  for (let i = cursor; i < all.length; i += 1) {
    const [date, close] = all[i]
    const key = month(date)
    if (mtd.key !== key) mtd = { key, sum: 0, count: 0, prior9: priorNine(panel, date) }
    mtd.sum += close
    mtd.count += 1
    if (i < firstIndex) continue
    const official = isOfficial(all, i)
    const last = i === all.length - 1 && currentFrame
    const { below } = dailyTactical(mtd.sum / mtd.count, mtd.prior9)
    // 月度序列按自然月末可得；月末逢周末或假日时，当月最后一个交易日按月末数据正式定档。
    const frame = last ? currentFrame : panelAt(panel, official ? monthEnd(date) : date, null)
    const tactical = last ? frame.tactical.below : below
    const result = evaluate({ components: frame.components, tactical: { below: tactical } })
    const state = snapshot(result, frame, tactical)
    if (previous) {
      for (const layer of ['regime', 'final']) {
        if (state[layer] === previous[layer]) continue
        const reason = layer === 'regime' ? regimeReason(previous, state) : finalReason(previous, state, official)
        changes.push({ d: date, from: previous[layer], to: state[layer], layer, reason: (last ? '改用最新已发布数据：' : '') + reason })
      }
    }
    if (official && !last) {
      const reference = monthly.get(key)
      if (reference) {
        officialCount += 1
        if (tierCode(reference.final) !== state.final) {
          const monthlyFrame = panelAt(panel, monthEnd(date), null)
          const cause = monthlyFrame.tactical.below !== below
            ? '价格源差异：日收盘均价与月均价表相对 10 个月均线的位置不同'
            : tierCode(reference.regime) !== state.regime ? '宏观读数差异' : '修复确认条件差异'
          mismatches.push({ d: key, daily: state.final, monthly: tierCode(reference.final), cause,
            average: mtd.sum / mtd.count, monthlyPrice: monthlyFrame.tactical.price, prior9: mtd.prior9 })
        }
      }
    }
    rows.push([date, round2(close), state.regime, state.final, official ? 1 : 0, recession(date)])
    previous = state
  }
  const end = rows.at(-1)[0]
  const share = officialCount ? mismatches.length / officialCount : 0
  const disclosures = [
    `每个交易日只用当天已可得的数据定档，发布滞后与月度回测相同：就业、生产和周工时按次月月末可得，核心个人消费支出价格按再下个月月末可得，周度数据按观测日后 5 天可得。月度数据按自然月末可得，月末逢周末或假日时，该月最后一个交易日即按月末数据正式定档。`,
    '战术修正按日计算：本月至今的收盘均价与「前 9 个完整月的月均价加本月至今均价」的 10 个月均价比较。月中为预估，月末最后一个交易日为正式定档。修复确认与熔断按日用同样规则。前 9 个月用与月度回测相同的月均价表。',
    `最后一个交易日（${fullDate(end)}）改用当前读数口径：已发布的数据即可用，不再套用回测的保守发布滞后，战术修正沿用最近一个完整月的判定，与页面当前结论一致。`,
    officialCount
      ? `月末核对：${officialCount} 个月末交易日中，${mismatches.length} 个月的最终档位与月度回测不同（占 ${formatReading(share * 100, '%', 1)}）${mismatches.length
        ? `，原因均为${[...new Set(mismatches.map(m => m.cause.split('：')[0]))].join('、')}：${mismatches.slice(0, 10).map(m => monthText(m.d)).join('、')}${mismatches.length > 10 ? ' 等' : ''}` : ''}。`
      : '月度回测时间线暂缺，未做月末核对。',
    '标普日收盘来自 Yahoo Finance（1950 年起的本地缓存），最近日期用 FRED 与站内行情补齐，两者重叠时采用后者。衰退标记来自美国经济研究局的衰退划分，只用于对照，不进入信号。回测收益仍按月计算。',
  ]
  return {
    file: { generatedAt, ruleVersion, start: rows[0][0], end, rows, changes: changes.slice(-maxChanges), disclosures },
    stats: { rows: rows.length, officialCount, mismatches, share, changes: changes.length, ms: Date.now() - clock },
  }
}

export function serializeDaily(file) {
  const head = JSON.stringify({ generatedAt: file.generatedAt, ruleVersion: file.ruleVersion, start: file.start, end: file.end }).slice(0, -1)
  return `${head},"rows":${JSON.stringify(file.rows)},"changes":${JSON.stringify(file.changes)},"disclosures":${JSON.stringify(file.disclosures)}}\n`
}

export async function writeDaily(path, file) {
  const body = serializeDaily(file)
  await atomicWrite(path, body)
  return Buffer.byteLength(body)
}
