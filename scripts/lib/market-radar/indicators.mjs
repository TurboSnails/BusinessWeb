import { scoreMarket } from '../macro-posture-market/components.mjs'
import { formatDate, formatReading } from '../macro-posture/format.mjs'
import { average, baseTier, TIERS } from '../macro-posture/model.mjs'
import { ageDays, clean, percentile, valueAt } from '../macro-posture/panel.mjs'

export const DIMENSIONS = [
  ['liquidity', '流动性'],
  ['valuation', '估值'],
  ['crowding', '仓位与拥挤度'],
  ['trading', '交易结构'],
  ['earnings', '盈利'],
]

const band = (value, low, high, lowScore = -1) => value <= low ? lowScore : value >= high ? -lowScore : 0
const percent = n => formatReading(n, '%', 2)
const pp = n => formatReading(n, '百分点', 2)
const times = n => formatReading(n, '倍', 2)
const bp = n => `${Math.round(n).toLocaleString('en-US').replace('-', '−')} 个基点`
const signed = (n, format) => (n > 0 ? '+' : '') + format(n)
const bottom = '第 20 百分位'
const top = '第 80 百分位'
const highExpensive = `达到${top}扣 1 分，不高于${bottom}加 1 分，其余 0 分。`
const highSupportive = `不高于${bottom}扣 1 分，达到${top}加 1 分，其余 0 分。`
const factset = 'FactSet Earnings Insight 公开周报存档自 2016 年 12 月起（早年按月末取一期，个别月份缺档），不足 25 年，只展示。'
const survey = '美银调查只有零星已发布读数，完整历史受授权限制。'

const DEFINITIONS = {
  netLiquidity: {
    dimension: 'liquidity', label: '美元净流动性 13 周变化', frequency: 'weekly',
    display: p => `联储资产扣除财政部存款和隔夜逆回购后，近 13 周变化 ${signed(p.value, percent)}，` +
      (p.value >= 2 ? '流动性偏强。' : p.value <= -2 ? '流动性偏弱。' : '未达偏强或偏弱的阈值。'),
    rule: '历史不足 25 年，只展示。13 周升幅达到 2% 为偏强，降幅达到 2% 为偏弱。',
  },
  hy: {
    inverse: true,
    dimension: 'liquidity', label: '高收益债利差',
    display: p => `高收益债利差 ${bp(p.value)}` +
      (p.change == null ? '，四周变化暂缺。' : `，近 4 周变化 ${signed(p.change, bp)}。`) +
      (p.value >= 500 || p.change >= 50 ? '已达信用压力阈值。' : ''),
    rule: 'FRED 受 ICE 授权限制只公开最近 3 年，站内从 2023 年 11 月起逐日累积，只展示。利差达到 500 个基点，或 4 周内扩大至少 50 个基点，为信用压力信号。',
  },
  baaChange: {
    inverse: true,
    dimension: 'liquidity', label: '企业债利差半年变化', frequency: 'monthly',
    display: p => `Baa 与 Aaa 企业债利差近 6 个月变化 ${signed(p.value, pp)}。`,
    rule: '扩大至少 0.20 个百分点扣 1 分，收窄至少 0.15 个百分点加 1 分，其余 0 分。',
    score: p => band(p.value, -0.15, 0.20, 1),
  },
  goldSilver: {
    inverse: true, fullHistory: true,
    dimension: 'liquidity', label: '金银比',
    display: p => `COMEX 黄金 ÷ 白银 ${formatReading(p.value, '', 1)}（金 ${formatReading(p.gold, '', 0)}、银 ${formatReading(p.silver, '', 2)} 美元/盎司）` +
      (p.change == null ? '' : `，较 20 个交易日前 ${signed(p.change, n => formatReading(n, '', 1))}`) + '。',
    rule: '1960 年 1 月至 2000 年 8 月用世界银行 Pink Sheet 金、银月均价之比（银价只有一位小数，1960 年代单月误差可达约 5%）；之后用 Yahoo COMEX 连续合约日线的月均价之比，最新读数为最近一个交易日。百分位以月度为样本。1971 年以前金价由布雷顿森林体系固定在每盎司 35 美元，比值只反映银价。事后新增，只展示，不计分。比值走高说明资金偏向避险属性更强的黄金、白银代表的工业与投机需求转弱，常见于避险和增长担忧阶段；回落常伴随风险偏好回升。',
  },
  erp: {
    inverse: true,
    dimension: 'valuation', label: '股债利差', frequency: 'monthly',
    display: p => `过去 12 个月盈利收益率 ${percent(100 / p.pe.value)}，` +
      `${formatDate(p.gs10.observedOn, 'monthly')}的 10 年期美债月均收益率 ${percent(p.gs10.value)}，相差 ${pp(p.value)}。`,
    rule: highSupportive,
    score: (_, rank) => rank == null ? null : band(rank, 20, 80),
  },
  pe: {
    dimension: 'valuation', label: '过去 12 个月市盈率', frequency: 'monthly',
    display: p => `按过去 12 个月实际盈利计，标普 500 市盈率为 ${times(p.value)}。`,
    rule: highExpensive,
    score: (_, rank) => rank == null ? null : band(rank, 20, 80, 1),
  },
  cape: {
    dimension: 'valuation', label: '周期调整市盈率（CAPE）', frequency: 'monthly',
    display: p => `按长期实际盈利平滑后，标普 500 市盈率为 ${times(p.value)}。`,
    rule: highExpensive,
    score: (_, rank) => scoreMarket('cape', 'b', { cape: { value: rank } }),
  },
  forwardPe: {
    dimension: 'valuation', label: '前瞻市盈率',
    display: p => `按未来 12 个月预期盈利计，标普 500 市盈率为 ${times(p.value)}。`,
    rule: factset,
  },
  equityShare: {
    staleDays: 280,
    dimension: 'crowding', label: '家庭股票占金融资产比例', frequency: 'monthly',
    display: p => `股票占家庭和非营利组织金融资产的 ${percent(p.value)}。`,
    rule: highExpensive,
    score: (_, rank) => rank == null ? null : band(rank, 20, 80, 1),
  },
  cashShare: {
    staleDays: 280,
    inverse: true,
    dimension: 'crowding', label: '家庭现金占金融资产比例', frequency: 'monthly',
    display: p => `现金、存款和货币基金占家庭和非营利组织金融资产的 ${percent(p.value)}。`,
    rule: highSupportive,
    score: (_, rank) => rank == null ? null : band(rank, 20, 80),
  },
  finraDebtYoy: {
    dimension: 'crowding', label: '融资余额同比', frequency: 'monthly',
    display: p => `证券保证金借方余额较去年同月变化 ${signed(p.value, percent)}。`,
    rule: '同比升幅达到 30% 扣 1 分，降幅达到 20% 加 1 分，其余 0 分。',
    score: p => band(p.value, -20, 30, 1),
  },
  managerCash: {
    inverse: true,
    dimension: 'crowding', label: '基金经理现金比例',
    display: p => `美银调查中，基金经理持有的现金比例为 ${percent(p.value)}。`,
    rule: survey,
  },
  managerUsOverweight: {
    dimension: 'crowding', label: '基金经理美股净超配',
    display: p => `美银调查中，基金经理美股净超配为 ${percent(p.value)}。`,
    rule: survey,
  },
  managerTechOverweight: {
    dimension: 'crowding', label: '基金经理科技股净超配',
    display: p => `美银调查中，基金经理科技股净超配为 ${percent(p.value)}。`,
    rule: survey + '数值越高说明机构在科技股上越拥挤；美银回看历史，科技股较好的买点多出现在转为净低配之后。',
  },
  naaim: {
    dimension: 'crowding', label: 'NAAIM 主动经理敞口', frequency: 'weekly',
    display: p => `受访主动投资经理平均美股敞口为 ${percent(p.value)}` +
      (p.value >= 90 ? '，敞口偏高。' : p.value <= 30 ? '，敞口偏低。' : '。'),
    rule: 'NAAIM 官方全历史自 2006 年 7 月起，不足 25 年，只展示。NAAIM 自 2026 年 8 月 1 日起改为订阅制，公开表停在 8 月 19 日，订阅前读数不再更新。敞口达到 90 为偏高，不高于 30 为偏低。',
  },
  aaiiSpread: {
    dimension: 'crowding', label: 'AAII 散户多空差', frequency: 'weekly',
    display: p => `AAII 调查中看多 ${percent(p.bull)}、看空 ${percent(p.bear)}，多空差 ${signed(p.value, pp)}。`,
    rule: '美银基金经理调查的同维度平替。AAII 官方情绪表自 1987 年 7 月起；因是事后新增，不进入事先固定的计分与回测，只展示。',
  },
  cftcAsset: {
    dimension: 'crowding', label: 'CFTC 资管机构标普期货净多', frequency: 'weekly',
    display: p => `资产管理机构在标普 500 期货上的净多头占未平仓合约的 ${percent(p.value)}。`,
    rule: 'NAAIM 的同维度平替，取自 CFTC 交易者持仓报告（TFF），自 2010 年 6 月起，不足 25 年，只展示。',
  },
  cftcNdxAsset: {
    dimension: 'crowding', label: 'CFTC 资管机构纳指期货净多', frequency: 'weekly',
    display: p => `资产管理机构在纳指 100 期货上的净多头占未平仓合约的 ${percent(p.value)}。`,
    rule: '科技股机构仓位的自动跟踪口径，取自 CFTC 交易者持仓报告（TFF），自 2010 年 6 月起，事后新增，只展示。',
  },
  breadth: {
    dimension: 'trading', label: '行业宽度（10 个月均线）', frequency: 'monthly',
    display: p => `${percent(p.value)} 的可用行业站上各自的 10 个月均线。`,
    rule: '宽度不高于 40% 扣 1 分，达到 60% 加 1 分，其余 0 分。',
    score: p => scoreMarket('breadth', 'b', { breadth: p }),
  },
  volume: {
    dimension: 'trading', label: '量价（3 月 / 12 月均量）', frequency: 'monthly',
    display: p => `近 3 个月日均量是近 12 个月的 ${times(p.value)}，标普月均价${p.below ? '低于' : '不低于'} 10 个月均线。`,
    rule: '量比达到 1.10 倍时，标普月均价低于 10 个月均线扣 1 分，不低于均线加 1 分，其余 0 分。',
    score: p => scoreMarket('volume', 'a', { volume: p }),
  },
  vixTerm: {
    inverse: true,
    dimension: 'trading', label: 'VIX 期限结构',
    display: p => `VIX ${formatReading(p.vix, '点')}，三个月 VIX ${formatReading(p.vix3m, '点')}，两者之比为 ${times(p.value)}。` +
      (p.value >= 1.05 ? '短期波动预期显著高于三个月预期。' : ''),
    rule: '历史不足 25 年，只展示。比值达到 1.05 倍表示近端波动预期显著高于三个月预期。',
  },
  impliedCorr: {
    inverse: true,
    dimension: 'trading', label: '隐含相关性（1 个月）',
    display: p => `标普 500 一个月隐含相关性 ${formatReading(p.value, '', 2)}` +
      (p.change == null ? '' : `，较 5 个交易日前 ${signed(p.change, n => formatReading(n, '', 2))}`) +
      (p.cor3m == null ? '' : `；三个月隐含相关性 ${formatReading(p.cor3m, '', 2)}`) + '。',
    rule: 'Cboe 隐含相关性指数自 2006 年起，不足 25 年，只展示。数值越高，期权市场越预期成分股同涨同跌；短期急升常见于离散度交易（卖指数期权、买个股期权）平仓、指数波动被放大的阶段。',
  },
  gex: {
    dimension: 'trading', label: '做市商 Gamma 敞口（GEX）',
    display: p => `SqueezeMetrics 估算的做市商 Gamma 敞口 ${signed(p.value, n => formatReading(n, '', 1))} 亿美元，` +
      (p.value < 0 ? '为负，做市商对冲顺势而行，容易放大涨跌' : '为正，做市商对冲逆势而行，倾向于平抑波动') +
      `；近 5 个交易日有 ${p.negativeDays} 天为负。`,
    rule: 'SqueezeMetrics 按期权未平仓量和做市商持仓方向的假设估算，不是官方数据，不同机构口径差异较大，宜看正负与相对高低。自 2011 年 5 月起，不足 25 年，只展示。',
  },
  breadth200: {
    dimension: 'trading', label: '成分股站上 200 日线比例',
    display: p => `${percent(p.value)} 的可用标普成分股站上自己的 200 日均线。`,
    rule: '站内历史约一年，按当前成分名单回算的部分存在幸存者偏差，只展示。长历史见下一项「行业站上 200 日线比例」。',
  },
  industry200: {
    dimension: 'trading', label: '行业站上 200 日线比例（49 行业）', staleDays: 120,
    display: p => `${percent(p.value)} 的可用行业站上各自的 200 日均线。`,
    rule: 'Ken French 49 个市值加权行业（CRSP，按当时的行业成分，没有幸存者偏差）日收益自 1926 年 7 月起累积成指数，统计站上各自 200 日均线的行业占比，是成分股 200 日线比例的长历史对照。French 数据约滞后 1–2 个月更新。事后新增，只展示。',
  },
  volumeRatio: {
    dimension: 'trading', label: '美股 20 日量比',
    display: p => `全美股票当日成交量为前 20 个完整交易日均量的 ${times(p.value)}。`,
    rule: '2010 年 8 月起为 Cboe 全美股票成交（核心交易场所齐全后，涵盖全美交易所及场外申报成交）；此前回补为 Yahoo 标普 500 指数日成交量（1950 年起），量比不受成交量口径影响，但早年按周六、12 月 24 日、7 月 3 日和感恩节次日近似剔除半日市。事后回补，只展示。',
  },
  industryMomentum: {
    dimension: 'trading', label: '行业 12 个月正收益占比', frequency: 'monthly',
    display: p => `${percent(p.value)} 的可用行业近 12 个月累计收益为正。`,
    rule: '同一份 Ken French 49 行业数据的另一种宽度口径，自 1927 年起。事后新增，不进入事先固定的计分与回测，只展示。',
  },
  industryHighs: {
    dimension: 'trading', label: '行业处于 12 个月新高占比', frequency: 'monthly',
    display: p => `${percent(p.value)} 的可用行业月末点位处于近 12 个月新高。`,
    rule: '同一份 Ken French 49 行业数据，自 1927 年起。事后新增，不进入事先固定的计分与回测，只展示。',
  },
  sectorBreadth: {
    dimension: 'trading', label: '板块宽度（过半站上 200 日线的板块数）',
    display: p => `11 个 GICS 板块中，有 ${p.value} 个板块过半成分股站上 200 日均线。`,
    rule: '按当前成分名单回算，历史约一年且存在幸存者偏差，只展示。',
  },
  netHighs: {
    dimension: 'trading', label: '成分股 52 周新高减新低',
    display: p => `创 52 周新高的标普成分股减去创新低的，占可用成分股的 ${signed(p.value, percent)}。`,
    rule: '按当前成分名单回算，历史约一年且存在幸存者偏差，只展示。长历史见下一项「行业 52 周新高减新低」。',
  },
  industryNetHighs: {
    dimension: 'trading', label: '行业 52 周新高减新低（49 行业）', staleDays: 120,
    display: p => `处于 252 个交易日新高的行业减去处于新低的，占可比行业的 ${signed(p.value, percent)}。`,
    rule: 'Ken French 49 个市值加权行业（CRSP，按当时的行业成分，没有幸存者偏差）日收益自 1926 年 7 月起累积成指数，按收盘指数计 252 个交易日新高与新低，是成分股新高减新低的长历史对照。French 数据约滞后 1–2 个月更新。事后新增，只展示。',
  },
  advDec: {
    dimension: 'trading', label: '10 日涨跌比',
    display: p => `近 10 个交易日标普成分股上涨 ${p.up} 家次、下跌 ${p.down} 家次，涨跌比 ${times(p.value)}。`,
    rule: '按当前成分名单统计，历史约一年，只展示。',
  },
  industryAdvDec: {
    dimension: 'trading', label: '行业 10 日涨跌比（49 行业）', staleDays: 120,
    display: p => `近 10 个交易日上涨行业次数是下跌行业次数的 ${times(p.value)}。`,
    rule: 'Ken French 49 个市值加权行业（CRSP，按当时的行业成分，没有幸存者偏差）日收益自 1926 年 7 月起累积成指数，按日统计上涨与下跌的行业数，取近 10 个交易日合计之比，是成分股涨跌比的长历史对照。French 数据约滞后 1–2 个月更新。事后新增，只展示。',
  },
  above50: {
    dimension: 'trading', label: '成分股站上 50 日线比例',
    display: p => `${percent(p.value)} 的可用标普成分股站上自己的 50 日均线。`,
    rule: '站内只保存最新读数，没有历史，只展示。',
  },
  equalWeight: {
    dimension: 'trading', label: '等权相对市值加权（12 个月）', frequency: 'monthly',
    display: p => `标普 500 等权指数近 12 个月相对市值加权标普 500 ${p.value >= 0 ? '跑赢' : '跑输'} ${percent(Math.abs(p.value))}。`,
    rule: '两者均为价格指数，自 2007 年起，不足 25 年，只展示。为正说明涨幅更分散，为负说明集中在大市值股票。',
  },
  epsYoy: {
    staleDays: 160,
    dimension: 'earnings', label: '标普过去 12 个月每股盈利同比', frequency: 'monthly',
    display: p => `过去 12 个月每股盈利较去年同期变化 ${signed(p.value, percent)}。`,
    rule: '同比降幅达到 10% 扣 1 分，升幅达到 10% 加 1 分，其余 0 分。',
    score: p => band(p.value, -10, 10),
  },
  forwardEps: {
    dimension: 'earnings', label: '前瞻每股盈利修正',
    display: p => `未来 12 个月预期每股盈利（标普收盘 ÷ FactSet 前瞻市盈率推算）较 ${formatDate(p.priorOn, 'daily')}变化 ${signed(p.value, percent)}。`,
    rule: factset.replace('只展示。', '只展示。按约 3 个月前的同口径读数计算；前瞻市盈率只有一位小数，变化值误差约 ±0.5 个百分点。'),
  },
}

export function rankAt(series, date) {
  const point = valueAt(series, date)
  if (!point) return null
  const known = series.filter(row => row.availableOn <= date)
  return {
    point, known,
    percentile: known.length < 2 ? null : percentile(point.value, known.map(row => row.value)),
  }
}

export function scoreIndicator(id, point, rank) {
  return Number.isFinite(point?.value) ? DEFINITIONS[id].score?.(point, rank) ?? null : null
}

/** 冷热按「风险偏好与拥挤程度」定：数值越高越代表恐慌、便宜或现金多的指标（inverse）反向。 */
function heatFor(raw, inverse) {
  const rank = raw == null ? null : inverse ? 100 - raw : raw
  if (rank == null) return 'na'
  if (rank >= 80) return 'hot'
  if (rank >= 60) return 'warm'
  if (rank <= 20) return 'cold'
  if (rank <= 40) return 'cool'
  return 'neutral'
}

/**
 * 迷你图用的历史：交易结构与金银比带全部历史——月度及更稀的序列、以及跨度不超过 3 年的序列原样保留；日频序列跨度不超过 30 年时按周取最后一个观测，
 * 更长时按月取，并始终保留最新观测。其余指标沿用最近 120 个观测。
 */
export function chartHistory(known, def) {
  const rows = known.map(row => [row.observedOn, row.value])
  if (def.dimension !== 'trading' && !def.fullHistory) return rows.slice(-120)
  if (rows.length < 2) return rows
  const years = ageDays(rows.at(-1)[0], rows[0][0]) / 365.2425
  if (years <= 3 || rows.length / years <= 13) return rows
  const bucket = years > 30 ? d => d.slice(0, 7) : d => {
    const date = new Date(d + 'T00:00:00Z')
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7))
    return date.toISOString().slice(0, 10)
  }
  const last = new Map()
  for (const row of rows) last.set(bucket(row[0]), row)
  return [...last.values()]
}

export function buildIndicators(series, sources, date) {
  return Object.entries(DEFINITIONS).map(([id, def]) => {
    const reading = rankAt(series[id] ?? [], date)
    const { point, known, percentile: rawRank } = reading ?? { known: [], percentile: null }
    const first = known[0]?.observedOn ?? null
    const years = first && point ? ageDays(point.observedOn, first) / 365.2425 : 0
    // 历史不足 3 年不给百分位（样本太少，百分位没有意义）
    const rank = years >= 3 ? rawRank : null
    const stale = point ? ageDays(date, point.observedOn) > (def.staleDays ?? (def.frequency === 'monthly' ? 75 : 45)) : false
    const notes = [
      rawRank != null && rank == null ? '历史不足 3 年，不给百分位' : '',
      rank != null && years < 25 ? `百分位只基于约 ${Math.round(years)} 年历史` : '',
      stale ? '读数较旧' : '',
    ].filter(Boolean)
    return {
      id, dimension: def.dimension, label: def.label,
      display: point ? `${def.display(point).replace(/。$/, '')}（${formatDate(point.observedOn, def.frequency)}）。` : '读数暂缺。',
      observedOn: point?.observedOn ?? null, percentile: rank, percentileSince: rawRank == null ? null : first,
      heat: heatFor(rank, def.inverse), score: scoreIndicator(id, point, rawRank), rule: def.rule,
      historyYears: first ? clean(ageDays(point.observedOn, first) / 365.2425) : null,
      inScore: Boolean(def.score), source: sources[id] ?? '站内市场快照',
      history: chartHistory(known, def),
      ...(notes.length ? { note: notes.join('；') } : {}),
    }
  })
}

export function scoreAt(series, date) {
  const indicators = Object.entries(DEFINITIONS).flatMap(([id, def]) => {
    if (!def.score) return []
    const rows = series[id] ?? []
    const reading = ['erp', 'pe', 'cape', 'equityShare', 'cashShare'].includes(id) ? rankAt(rows, date) : null
    const point = reading?.point ?? valueAt(rows, date)
    return [{ dimension: def.dimension, inScore: true, score: scoreIndicator(id, point, reading?.percentile ?? null) }]
  })
  return aggregateScores(indicators).score
}

export function aggregateScores(indicators) {
  const dimensions = DIMENSIONS.map(([id, title]) => {
    const scored = indicators.filter(row => row.dimension === id && row.inScore && Number.isFinite(row.score))
    const score = average(scored.map(row => row.score))
    const summary = score == null ? '暂无可计分读数。' :
      `${scored.length} 项计分，${scored.filter(row => row.score > 0).length} 项加分、${scored.filter(row => row.score < 0).length} 项扣分。`
    return { id, title, score, summary }
  })
  const mean = average(dimensions.flatMap(row => row.score == null ? [] : [row.score]))
  const score = mean == null ? null : clean(mean)
  return { dimensions, score, tier: baseTier(score) }
}

export function buildCurrent(indicators) {
  const current = aggregateScores(indicators)
  const tier = TIERS.find(row => row.id === current.tier)
  return {
    ...current,
    headline: tier
      ? `雷达为${tier.label}档，五维综合分 ${formatReading(current.score, '', 2)}，对应股票仓位上限的 ${formatReading(tier.equityShare * 100, '%', 0)}。`
      : '计分读数暂缺，雷达档位待定。',
  }
}
