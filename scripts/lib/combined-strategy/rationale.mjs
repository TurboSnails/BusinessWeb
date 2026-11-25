import { readFileSync } from 'node:fs'
import { formatReading } from '../macro-posture/format.mjs'
import { findMatrixCell } from './matrix.mjs'

const pct1 = n => formatReading(n * 100, '%', 1)
const pct0 = n => `${Math.round(n * 100)}%`.replace('-', '−')
const sharpeText = n => Number(n).toFixed(3).replace('-', '−')

/** 设计第 9 节「四条道理」：title = 第一句去句号，theory = 其余部分。 */
export const RATIONALE_THEORY = [
  {
    title: '仓位跟着宏观周期走',
    theory: '股市的大跌多数发生在经济衰退、信用收紧的时候，这些会先后反映在就业、信用利差、货币条件和通胀上。',
  },
  {
    title: '贵不是减仓的理由',
    theory: '估值和拥挤度影响的是未来多年的回报，决定不了明年的涨跌；贵的市场可以继续贵很久。',
  },
  {
    title: '贵加上宏观转差才危险',
    theory: '所以市场偏热时的对策是不加码、不上杠杆、不提高集中度，把减仓留给宏观档位下降的时候，并且那时严格执行。',
  },
  {
    title: '按月操作，不追日线',
    theory: '规则按月末定档、隔一个月生效。按日执行和「月中跌了就减仓」都专门检验过：急跌里能少亏几个点，但反弹里又少赚回去，扣成本后都不比按月好，所以月中只看、不动。',
  },
]

function evidence1({ macroFull, buyholdFull }) {
  const x = pct1(macroFull.maxDd)
  const y = pct1(buyholdFull.maxDd)
  const a = pct1(macroFull.cagr)
  const b = pct1(buyholdFull.cagr)
  return `1973 年以来按宏观档位调仓，最大回撤 ${x}，全程持有标普是 ${y}；年化收益 ${a} 对 ${b}。`
}

function evidence2({ matrix, fusion }) {
  const cell = findMatrixCell(matrix, 'offense', 'hot')
  const n = cell?.all?.months ?? 0
  const fwd = cell?.all?.fwd12 ?? 0
  const returnPhrase = fwd > 0
    ? `平均仍涨 ${pct1(fwd)}`
    : `平均 ${pct1(fwd)}`
  const first = `宏观在进攻侧而市场偏热的 ${n} 个月，之后 12 个月标普${returnPhrase}。`

  const macro = fusion.rows.find(row => row.id === 'macro')
  const deltas = fusion.rows
    .filter(row => /^m\d$/.test(row.id))
    .map(row => row.train.sharpe - macro.train.sharpe)
  const lo = Math.min(...deltas)
  const hi = Math.max(...deltas)
  return `${first}按冷热调仓位的六种规则，训练期夏普相对不调的变化在 ${sharpeText(lo)} 到 ${sharpeText(hi)} 之间，没有一种更好。`
}

function evidence3({ matrix }) {
  const cell = findMatrixCell(matrix, 'defense', 'hot')
  const all = cell?.all
  const since = cell?.since2000
  if (!all || all.months === 0) {
    return '宏观在防守侧而市场偏热的月份历史上没有出现过。'
  }
  let text = `宏观在防守侧而市场偏热的 ${all.months} 个月，之后 12 个月标普平均 ${pct1(all.fwd12)}，${pct0(all.neg12)} 的时候为负`
  if (since && since.months > 0) {
    text += `；2000 年以后 ${since.months} 个月，平均 ${pct1(since.fwd12)}`
  }
  return `${text}。`
}

/** 按日执行检验（docs/research/daily-execution-2026-11-25，预注册）的结果；读不到时只给月度换档次数。 */
export function loadDailyStudy(path = new URL('../../../docs/research/daily-execution-2026-11-25/results.json', import.meta.url)) {
  try {
    const r = JSON.parse(readFileSync(path, 'utf8'))
    return { monthly: r.full.M, daily: r.full.D1 }
  } catch {
    return null
  }
}

function evidence4({ macroFull, dailyStudy }) {
  const s = Number(macroFull.switchesPerYear).toFixed(1)
  const base = `回测里信号在月末生成、隔一个月才生效；平均每年换档 ${s} 次。`
  if (!dailyStudy) return base
  const { monthly: m, daily: d } = dailyStudy
  return `${base}改成每天按档位调仓（2026-11-25 预注册检验）：每年调仓 ${m.tradesPerYear.toFixed(1)} → ${d.tradesPerYear.toFixed(1)} 次，扣成本后夏普 ${sharpeText(m.sharpeNet)} → ${sharpeText(d.sharpeNet)}；按日最大回撤 ${pct0(m.dailyMaxDd)} → ${pct0(d.dailyMaxDd)} 的改善只来自 2020 年一次，2020 年以外反而略深。月中按跌幅或跌破均线减仓的 4 种写法同样没通过。`
}

export function buildRationale({ matrix, fusion, buyholdFull, dailyStudy = loadDailyStudy() }) {
  const macroFull = fusion.rows.find(row => row.id === 'macro').full
  const evidences = [
    evidence1({ macroFull, buyholdFull }),
    evidence2({ matrix, fusion }),
    evidence3({ matrix }),
    evidence4({ macroFull, dailyStudy }),
  ]
  return RATIONALE_THEORY.map((row, i) => ({
    title: row.title,
    theory: row.theory,
    evidence: evidences[i],
  }))
}
