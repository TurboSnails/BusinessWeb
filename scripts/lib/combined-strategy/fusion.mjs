import { monthAfter, TEST_START, tierEquity } from '../macro-posture-market/backtest.mjs'
import { EXECUTION_LAG, performance } from '../macro-posture/backtest.mjs'
import { formatReading } from '../macro-posture/format.mjs'
import { TIERS } from '../macro-posture/model.mjs'
import { alignRadar, blendEquity } from '../market-radar/backtest.mjs'

const TIER_IDS = TIERS.map(row => row.id)
const tierIndex = id => TIER_IDS.indexOf(id)
const shift = (i, k) => Math.max(0, Math.min(TIER_IDS.length - 1, i + k))

/** 与 r3.mjs RULES 一致：以宏观最终档位为起点。 */
export function fusionTier(id, { masters, radar, heat, below }) {
  if (masters == null) return null
  const i = tierIndex(masters)
  if (i < 0) return null
  if (id === 'macro') return masters
  if (id === 'radar') return radar
  if (id === 'm2') return heat === 'hot' ? TIER_IDS[Math.max(i, 1)] : masters
  if (id === 'm3') return heat === 'hot' && below === true ? TIER_IDS[shift(i, 1)] : masters
  if (id === 'm4') return heat === 'cold' && below !== true ? TIER_IDS[shift(i, -1)] : masters
  if (id === 'm5') {
    let idx = i
    if (heat === 'hot') {
      idx = Math.max(idx, 1)
      if (below === true) idx = shift(idx, 1)
    } else if (heat === 'cold' && below !== true) {
      idx = shift(idx, -1)
    }
    return TIER_IDS[idx]
  }
  if (id === 'm6') {
    return radar === 'lean-defense' || radar === 'defense' ? TIER_IDS[shift(i, 1)] : masters
  }
  return null
}

export function fusionEquity(id, row) {
  if (id === 'm1') return blendEquity(row.radar, row.masters)
  return tierEquity(fusionTier(id, row))
}

export const FUSION_META = [
  { id: 'macro', label: '宏观攻守 v2.2', rule: '只按宏观攻守的最终档位定仓位。' },
  { id: 'radar', label: '市场雷达', rule: '只按雷达综合档位定仓位。' },
  { id: 'm1', label: 'M1 平均仓位', rule: '雷达仓位与宏观仓位取平均。' },
  { id: 'm2', label: 'M2 热度上限', rule: '偏热时档位最高到偏进攻。' },
  { id: 'm3', label: 'M3 偏热且破位再降一档', rule: '偏热且标普月均价低于十个月均线时，再下调一档。' },
  { id: 'm4', label: 'M4 偏冷加码', rule: '偏冷且标普月均价不低于十个月均线时，上调一档。' },
  { id: 'm5', label: 'M5 全套热度修正', rule: 'M2 + M3 + M4。' },
  { id: 'm6', label: 'M6 雷达否决', rule: '雷达综合档位为偏防守或防守时，再下调一档。' },
]

const strategyMetrics = rows => {
  const { cagr, maxDd, sharpe, avgEquity, switchesPerYear } = performance(rows)
  return { cagr, maxDd, sharpe, avgEquity, switchesPerYear }
}

const DD_TOL = 0.01
const TRAIN_SHARPE = 0.01
const TEST_SHARPE = 0.02
const CAGR_TOL = 0.003

export function passTrainGate(candidate, macro) {
  return candidate.sharpe - macro.sharpe >= TRAIN_SHARPE
    && candidate.maxDd >= macro.maxDd - DD_TOL
}

export function passAdoptGate(row, macro) {
  return row.test.sharpe - macro.test.sharpe >= TEST_SHARPE
    && row.test.maxDd >= macro.test.maxDd - DD_TOL
    && row.train.sharpe >= macro.train.sharpe
    && row.full.cagr >= macro.full.cagr - CAGR_TOL
}

/** 过线者中取训练期夏普最高；再过采用门槛才返回 id，否则 null。 */
export function pickAdopted(rows) {
  const macro = rows.find(row => row.id === 'macro')
  const candidates = rows
    .filter(row => /^m\d$/.test(row.id) && passTrainGate(row.train, macro.train))
    .sort((a, b) => b.train.sharpe - a.train.sharpe)
  if (!candidates.length) return null
  return passAdoptGate(candidates[0], macro) ? candidates[0].id : null
}

const sharpeText = n => Number(n).toFixed(3).replace('-', '−')
const ddText = n => formatReading(n * 100, '%', 1)

export function buildFusionVerdict(rows, adopted) {
  const macro = rows.find(row => row.id === 'macro')
  if (adopted) {
    const row = rows.find(item => item.id === adopted)
    const delta = row.test.sharpe - macro.test.sharpe
    return `六种融合规则里，采用了「${row.label}」：验证期夏普相对单用宏观攻守提高 ${sharpeText(delta)}（${sharpeText(row.test.sharpe)} 对 ${sharpeText(macro.test.sharpe)}），验证期最大回撤 ${ddText(row.test.maxDd)}（宏观攻守为 ${ddText(macro.test.maxDd)}）。综合策略的仓位按该规则定。`
  }
  const deltas = rows.filter(row => /^m\d$/.test(row.id)).map(row => row.train.sharpe - macro.train.sharpe)
  const lo = Math.min(...deltas)
  const hi = Math.max(...deltas)
  return `六种融合规则里，训练期夏普相对单用宏观攻守的变化在 ${sharpeText(lo)} 到 ${sharpeText(hi)} 之间，没有一个达到采用门槛。综合策略的仓位只按宏观攻守的档位定；雷达不改变仓位，用来判断所处的状态和调整组合结构。`
}

export const FUSION_DISCLOSURES = [
  '融合规则与采用门槛在算结果之前写下（2026 年 11 月 24 日），但平均仓位的结果、热度在 2000 年前后的差异事先已知，验证期也在此前两轮检验中用过，不是干净的样本外。',
  '月末信号用于两个月后的收益。标普月总回报用月均价变化加月股息近似，现金按 3 个月国库券利率折算，未计税费和交易成本，口径同雷达页。',
  '宏观档位直接取宏观攻守页的月度时间线；该时间线用实时数据口径——非农就业、工业生产、核心个人消费支出价格、初请失业救济及制造业周工时取每个月末已发布的最新版本，缺少当时版本的月份沿用修订值并按发布滞后取数；金融条件指数在 2011 年 5 月之前为事后回推。',
  '热度是雷达估值维度分与拥挤度维度分的等权平均（缺一个就用另一个，都缺为空）；不高于 −0.5 为偏热，达到 +0.5 为偏冷，其余居中。',
  '平均仓位每月取雷达和宏观股票仓位的算术平均。',
  '「市场综合作为第五根支柱并入」是更早的一次融合检验，见本页下方，结果同样未采用。',
  '状态矩阵是历史统计不是交易规则；各格的做法是操作建议，没有单独回测。',
]

export function buildFusion({ signals, returns, end }) {
  const start = monthAfter(signals[0].d, EXECUTION_LAG)
  const rows = FUSION_META.map(({ id, label, rule }) => {
    const fullAligned = alignRadar(signals, returns, row => fusionEquity(id, row))
    const train = fullAligned.filter(row => row.d < TEST_START)
    const test = fullAligned.filter(row => row.d >= TEST_START)
    return {
      id, label, rule,
      train: strategyMetrics(train),
      test: strategyMetrics(test),
      full: strategyMetrics(fullAligned),
      passTrain: null,
    }
  })

  const macro = rows.find(row => row.id === 'macro')
  for (const row of rows) {
    row.passTrain = row.id === 'macro' || row.id === 'radar'
      ? null
      : passTrainGate(row.train, macro.train)
  }

  const adopted = pickAdopted(rows)
  const rangeEnd = end ?? alignRadar(signals, returns, row => fusionEquity('macro', row)).at(-1)?.d
  return {
    start,
    end: rangeEnd,
    trainRange: `${start} 至 ${monthAfter(TEST_START, -1)}`,
    testRange: `${TEST_START} 至 ${rangeEnd}`,
    rows,
    adopted,
    verdict: buildFusionVerdict(rows, adopted),
    disclosures: FUSION_DISCLOSURES,
  }
}
