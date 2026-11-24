import { monthAfter } from '../macro-posture-market/backtest.mjs'
import { compound, drawdown, EXECUTION_LAG } from '../macro-posture/backtest.mjs'
import { average } from '../macro-posture/model.mjs'
import { formatReading } from '../macro-posture/format.mjs'

export function macroSide(tier) {
  if (tier === 'offense' || tier === 'lean-offense') return 'offense'
  if (tier === 'neutral') return 'neutral'
  if (tier === 'lean-defense' || tier === 'defense') return 'defense'
  return null
}

export const MATRIX_ORDER = [
  ['offense', 'cold'], ['offense', 'mid'], ['offense', 'hot'],
  ['neutral', 'cold'], ['neutral', 'mid'], ['neutral', 'hot'],
  ['defense', 'cold'], ['defense', 'mid'], ['defense', 'hot'],
]

/** 设计文档第 9 节九格名字，原样使用。 */
export const CELL_NAMES = {
  'offense|cold': '复苏初期',
  'offense|mid': '扩张期',
  'offense|hot': '扩张后段',
  'neutral|cold': '低位观望',
  'neutral|mid': '平稳期',
  'neutral|hot': '高位转平',
  'defense|cold': '衰退底部区',
  'defense|mid': '下行期',
  'defense|hot': '高位下行',
}

/** 设计文档第 9 节九格含义，原样使用。 */
export const CELL_MEANINGS = {
  'offense|cold': '经济和信用转好，市场还便宜、没什么人挤。',
  'offense|mid': '经济和信用向好，市场估值和持仓都在正常范围。',
  'offense|hot': '经济和信用还好，但市场已经偏贵、偏挤。',
  'neutral|cold': '宏观信号好坏参半，市场便宜。',
  'neutral|mid': '宏观信号好坏参半，市场不贵也不便宜。',
  'neutral|hot': '宏观信号开始转平，市场仍然偏贵、偏挤。',
  'defense|cold': '经济或信用很差，但市场已经便宜。历史上之后回报最好。',
  'defense|mid': '经济或信用转差，市场估值正常。',
  'defense|hot': '经济或信用转差，市场却还贵。历史上之后回报最差。',
}

/** 设计文档第 4 节做法文字，原样使用。 */
export const CELL_ACTIONS = {
  'offense|cold': '按档位持有。这一格历史上极少出现。',
  'offense|mid': '按档位持有，按月正常再平衡。',
  'offense|hot': '按档位持有，不因为贵提前减仓。不加杠杆；新增资金分批投入；不再提高单一行业或个股的集中度。',
  'neutral|cold': '按档位持有。需要补仓时可以在这个阶段完成。',
  'neutral|mid': '按档位持有，按月正常再平衡。',
  'neutral|hot': '按档位持有。减仓时先减估值高、杠杆高的部分，留下现金流好的。',
  'defense|cold': '按档位持有，不再继续砍仓。这是历史上之后回报最好的一格；档位一旦上调（修复确认），当月就回补到位，不拖延。',
  'defense|mid': '按档位持有，等档位上调再回补。',
  'defense|hot': '历史上最差的一格。严格减到档位对应的仓位，不抄底，不以「已经跌了不少」为由少减。',
}

/** 信号月 d 之后第 2 至第 13 个月的标普月回报；不足 12 个月返回 null。 */
export function forward12(returns, signalMonth) {
  const months = Array.from({ length: 12 }, (_, i) => returns.get(monthAfter(signalMonth, EXECUTION_LAG + i))?.spx)
  if (months.some(r => r == null)) return null
  return {
    fwd12: compound(months) - 1,
    maxDd12: drawdown(months),
  }
}

function emptyStats() {
  return { months: 0, fwd12: null, neg12: null, maxDd12: null }
}

function summarize(samples) {
  if (!samples.length) return emptyStats()
  return {
    months: samples.length,
    fwd12: average(samples.map(row => row.fwd12)),
    neg12: average(samples.map(row => Number(row.fwd12 < 0))),
    maxDd12: average(samples.map(row => row.maxDd12)),
  }
}

const pct1 = n => formatReading(n * 100, '%', 1)
const pct0 = n => `${Math.round(n * 100)}%`.replace('-', '−')

export function buildEvidence(all, since2000) {
  if (all.months === 0) return '这一格历史上没有出现过。'
  let text = `这一格历史上有 ${all.months} 个月，之后 12 个月标普平均 ${pct1(all.fwd12)}，${pct0(all.neg12)} 的时候为负，期间平均最大回撤 ${pct1(all.maxDd12)}`
  if (since2000.months > 0) {
    text += `；2000 年以后 ${since2000.months} 个月，平均 ${pct1(since2000.fwd12)}`
  }
  text += '。'
  if (all.months < 30) text += '样本少，仅供参考。'
  return text
}

export function buildMatrix(signals, returns) {
  const buckets = Object.fromEntries(MATRIX_ORDER.map(([side, heat]) => [`${side}|${heat}`, []]))
  for (const row of signals) {
    const side = macroSide(row.masters)
    if (side == null || row.heat == null) continue
    const fwd = forward12(returns, row.d)
    if (!fwd) continue
    buckets[`${side}|${row.heat}`].push({ d: row.d, ...fwd })
  }

  return MATRIX_ORDER.map(([side, heat]) => {
    const key = `${side}|${heat}`
    const samples = buckets[key]
    const all = summarize(samples)
    const since2000 = summarize(samples.filter(row => row.d >= '2000-01'))
    const thin = all.months < 30
    return {
      macroSide: side,
      heat,
      all,
      since2000,
      name: CELL_NAMES[key],
      meaning: CELL_MEANINGS[key],
      action: CELL_ACTIONS[key],
      evidence: buildEvidence(all, since2000),
      thin,
    }
  })
}

export function findMatrixCell(matrix, side, heat) {
  if (side == null || heat == null) return null
  return matrix.find(cell => cell.macroSide === side && cell.heat === heat) ?? null
}
