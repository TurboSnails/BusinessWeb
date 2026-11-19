import type { Point, Reading } from './model'

/** Which way a high reading leans for someone deciding between offence and defence. */
export type Lean = 'offense' | 'defense' | 'neutral'
export type Level = 'very-low' | 'low' | 'normal' | 'high' | 'very-high' | 'unknown'

export interface Guide {
  /** One plain sentence: what the number measures. */
  what: string
  /** Lean when the reading is high; low readings lean the other way. */
  high: Lean
  /** Contrarian readings: the crowd being extreme is itself the signal. */
  contrarian?: boolean
  /** Rule-of-thumb cut-offs: very low < a ≤ low < b ≤ normal ≤ c < high ≤ d < very high. */
  bands?: [number, number, number, number]
  /** Use bands even when a long history is available. */
  preferBands?: boolean
  /** A published long-run average to compare with when history is short. */
  benchmark?: { value: number; label: string }
  highText: string
  lowText: string
  midText?: string
}

const fpe = (subject: string): Guide => ({
  what: `${subject}股价 ÷ 分析师预计的未来 12 个月每股盈利，数字越大越贵。`,
  high: 'defense', bands: [12, 15, 19, 23], preferBands: true,
  highText: '估值偏贵，未来几年的回报空间相对有限，追高要谨慎。',
  lowText: '估值不贵，长期买入的性价比较好。',
})
const growth = (subject: string): Guide => ({
  what: `${subject}，正数越大说明公司赚钱越快。`,
  high: 'offense', bands: [-5, 0, 8, 15],
  highText: '盈利增长强劲，是股价的基本面支撑。', lowText: '盈利在放缓或下滑，股价缺少基本面支撑。',
})
const breadth = (days: number): Guide => ({
  what: `成分股里股价高于自身 ${days} 日均线的比例，衡量有多少股票处在上升趋势，而不只看几只大公司。`,
  high: 'offense', bands: [30, 45, 60, 75], preferBands: true,
  highText: '多数股票都在涨，行情健康、参与面广。',
  lowText: '多数股票走弱，指数可能只靠少数大公司撑着，风险较高。',
})
const volumeRatio: Guide = {
  what: '当天成交量 ÷ 过去 20 个交易日的平均成交量，大于 1 表示比平时活跃。',
  high: 'neutral', bands: [0.8, 0.95, 1.1, 1.3], preferBands: true,
  highText: '成交明显放大：上涨时放量说明买盘积极，下跌时放量说明抛压重。',
  lowText: '成交清淡，大家都在观望，行情的可信度较低。',
}
const hedgeLs: Guide = {
  what: '对冲基金的股票多头 ÷ 空头。数字越大，说明专业资金押注上涨越多。',
  high: 'defense', contrarian: true,
  highText: '专业资金已经很看多，仓位拥挤，一旦出坏消息容易集中卖出。',
  lowText: '专业资金很谨慎，空头多；行情好转时空头回补会推动上涨。',
}
const leveredFutures: Guide = {
  what: '杠杆基金（主要是对冲基金）在股指期货上的净多仓占全部持仓的比例，负数代表净空。注意：其中一部分空单是给现货持仓做对冲或套利，不全是看空，极端值才有参考意义。',
  high: 'defense', contrarian: true,
  highText: '杠杆资金大举做多，仓位拥挤，下跌时会被迫平仓放大跌幅。',
  lowText: '杠杆资金大举做空，市场一旦反弹，空头被迫回补会推高指数。',
}
const assetFutures: Guide = {
  what: '养老金、共同基金等资产管理机构在股指期货上的净多仓比例。',
  high: 'defense', contrarian: true,
  highText: '长线机构已经很满仓，继续加仓的空间有限。', lowText: '长线机构仓位偏轻，后续还有加仓空间。',
}
// Nominal balances grow with the economy, so their percentile says little about positioning.
const moneyFund = (subject: string): Guide => ({
  what: `${subject}，是场外随时可以买股票的现金。规模会随经济长期增长，更适合看近几周的变化方向。`,
  high: 'neutral',
  highText: '规模处于高位；看最近几期是增加（资金在观望）还是减少（资金在进场或流出）。', lowText: '规模较小。',
})
const fearHigh = (what: string, highText: string, lowText: string, bands?: Guide['bands']): Guide => ({ what, high: 'offense', contrarian: true, bands, highText, lowText })

const fearGreedGuide = (what: string): Guide => ({
  what, high: 'defense', contrarian: true, bands: [25, 45, 55, 75], preferBands: true,
  highText: '市场偏贪婪，乐观情绪浓时追高风险更大。', lowText: '市场偏恐惧，历史上极度恐惧时分批买入的长期回报往往不错。',
})

export const GUIDES: Record<string, Guide> = {
  shillerCape: {
    what: '标普 500 价格 ÷ 过去 10 年经通胀调整的平均盈利（席勒市盈率），用来看长期贵不贵；1900 年以来的长期平均约 17 倍。', high: 'defense',
    highText: '按长期盈利看非常贵，历史上这种位置之后 10 年的平均回报偏低（但不能用来判断短期涨跌）。',
    lowText: '按长期盈利看便宜，长期回报预期较好。',
  },
  spxPe: {
    what: '标普 500 价格 ÷ 过去 12 个月的实际每股盈利（按会计准则口径），用 1900 年以来的历史比较。', high: 'defense',
    highText: '按已经赚到的钱算偏贵。', lowText: '按已经赚到的钱算便宜。',
  },
  spxDividendYield: {
    what: '标普 500 过去 12 个月的股息 ÷ 价格。股价越贵，股息率越低。', high: 'offense',
    highText: '股息率高，说明价格相对便宜。', lowText: '股息率很低，说明价格相对公司分红偏贵。',
  },
  fearGreed: fearGreedGuide('CNN 恐惧与贪婪指数：把动量、新高新低、涨跌成交、期权、波动率、避险需求、垃圾债需求 7 项合成 0–100 分。25 以下为极度恐惧，75 以上为极度贪婪。'),
  cnnMomentum: fearGreedGuide('标普 500 比 125 日均线高出多少，换算成 0–100 分。'),
  cnnStrength: fearGreedGuide('纽交所创 52 周新高与新低的股票数量对比，换算成 0–100 分。'),
  cnnBreadth: fearGreedGuide('上涨股票与下跌股票的成交量对比，换算成 0–100 分。'),
  cnnPutCall: fearGreedGuide('看跌与看涨期权成交量之比，换算成 0–100 分（分越低越多人买下跌保险）。'),
  cnnVolatility: fearGreedGuide('VIX 相对其 50 日均值的高低，换算成 0–100 分（分越低越恐慌）。'),
  cnnSafeHaven: fearGreedGuide('近 20 个交易日股票与国债的回报差，换算成 0–100 分（分越低越多人躲进国债）。'),
  cnnJunkBond: fearGreedGuide('垃圾债与投资级债的收益率差，换算成 0–100 分（分越低越多人回避高风险债）。'),
  skew: {
    what: 'Cboe SKEW 指数：从标普 500 深度虚值期权价格推算市场为“暴跌”付的保险费。100 表示没有额外担心，越高说明机构越在防范尾部风险。',
    high: 'defense', bands: [115, 125, 140, 150], preferBands: true,
    highText: '机构在为暴跌买较贵的保险。注意：这个指标对短期涨跌的预测力有限，只作为风险提示。', lowText: '市场对暴跌的担心较少。',
  },
  baaAaa: {
    what: '穆迪 Baa 级与 Aaa 级公司债的收益率差，1919 年以来的月度数据，衡量市场对较弱企业违约的担心。数字越大越担心。', high: 'defense',
    highText: '信用风险溢价高，资金在回避风险，股市通常也承压。', lowText: '信用风险溢价很低，资金愿意承担风险，对股市有利；但过低也说明市场较为自满。',
  },
  naaim: {
    what: '美国主动投资经理协会会员的平均股票仓位：0 为空仓，100 为满仓，超过 100 表示加杠杆。公开数据约滞后 3 个月。',
    high: 'defense', contrarian: true, bands: [40, 60, 85, 100],
    highText: '专业经理几乎满仓甚至加杠杆，后续继续加仓的空间小。', lowText: '专业经理仓位很轻，行情好转时有补仓需求。',
  },
  netHighs: {
    what: '成分股中创 52 周新高的比例减去创 52 周新低的比例。正数说明创新高的股票更多，市场内部强势。',
    high: 'offense', bands: [-10, -2, 2, 10], preferBands: true,
    highText: '创新高的股票明显多于新低，上涨有广泛基础。', lowText: '创新低的股票多于新高，市场内部在走弱。',
  },
  spxFactSetFpe: { ...fpe('标普 500 '), preferBands: false },
  spxTrailingFpe: {
    what: '标普 500 股价 ÷ 过去 12 个月的实际每股盈利。', high: 'defense', bands: [14, 17, 21, 25],
    highText: '按已经赚到的钱算也偏贵。', lowText: '按已经赚到的钱算不贵。',
  },
  spxCape: {
    what: '用过去 10 年经通胀调整的平均盈利计算的市盈率，看长期贵不贵；历史长期平均约 17 倍。', high: 'defense', bands: [14, 20, 26, 32],
    highText: '按长期盈利看非常贵，历史上这种位置之后 10 年的平均回报偏低（但不能用来判断短期涨跌）。',
    lowText: '按长期盈利看便宜，长期回报预期较好。',
  },
  spread: {
    what: '股票的“盈利收益率”（1 ÷ 市盈率）减去 10 年期美债收益率，比较买股票和买国债哪个更划算。',
    high: 'offense', bands: [0, 1, 2, 3.5], preferBands: true,
    highText: '股票比国债明显更有吸引力。', lowText: '买国债拿到的收益已接近甚至超过股票的盈利收益率，股票的性价比低。',
  },
  spxEarningsNow: growth('标普 500 最新一个季度的盈利同比增速'),
  spxEarningsNextQuarter: growth('分析师预计标普 500 下个季度的盈利同比增速'),
  spxEarningsThisYear: growth('分析师预计标普 500 今年全年的盈利同比增速'),
  spxEarningsNextYear: growth('分析师预计标普 500 明年全年的盈利同比增速'),
  spxForwardEpsChange: {
    what: '分析师对未来 12 个月每股盈利的预测，近期是上调还是下调。', high: 'offense', bands: [-3, -1, 1, 3],
    highText: '分析师在上调盈利预期，基本面在改善。', lowText: '分析师在下调盈利预期，基本面在转弱。',
  },
  sectorFpe: fpe('该行业'),
  fundFpe: fpe('该 ETF 持仓的'),
  aggregateFpe: fpe('成分股汇总'),
  'fact-fwd_pe': fpe(''),
  'fact-fwd_pe_5y_percentile': {
    what: '当前预期市盈率在近 5 年里的位置，0 是最便宜，100 是最贵。', high: 'defense', bands: [20, 40, 60, 80], preferBands: true,
    highText: '比近 5 年大部分时间都贵。', lowText: '比近 5 年大部分时间都便宜。',
  },
  fundGrowth: { ...growth('ETF 发行商汇总的持仓公司未来 3–5 年预计年均盈利增速'), bands: [0, 5, 10, 15] },
  breadth200: breadth(200),
  breadth50: breadth(50),
  volumeRatio,
  ownVolume: volumeRatio,
  volume: {
    what: '美国所有交易所和场外交易设施当天成交的股票数量。', high: 'neutral',
    highText: '成交活跃。', lowText: '成交清淡。',
  },
  vix: fearHigh('“恐慌指数”：期权市场预期标普 500 未来 30 天的波动幅度。15 以下很平静，30 以上算恐慌。',
    '市场恐慌、波动大。短期风险高，但历史上恐慌时往往是分批买入的好时机。',
    '市场很平静甚至有些自满，此时坏消息的冲击往往更大。', [13, 17, 22, 30]),
  retailBull: {
    what: 'AAII 调查中认为未来 6 个月股市会涨的美国散户比例，长期平均约 37.5%。', high: 'defense', contrarian: true,
    benchmark: { value: 37.5, label: 'AAII 长期平均' },
    highText: '散户普遍乐观，乐观过头时往往离阶段高点不远。', lowText: '散户看多的人少，情绪偏冷，逆向看反而是机会。',
  },
  retailBear: {
    ...fearHigh('AAII 调查中认为未来 6 个月股市会跌的美国散户比例，长期平均约 31%。',
      '散户普遍悲观，历史上悲观情绪很重之后，股市往往有不错的回报。', '散户很少看空，情绪偏乐观，需要防范回调。'),
    benchmark: { value: 31, label: 'AAII 长期平均' },
  },
  putCall: fearHigh('期权市场里看跌期权 ÷ 看涨期权的成交量，越高说明买“下跌保险”的人越多。',
    '避险情绪重，大家在买保险；逆向看，过度悲观时常接近短期底部。', '很少人买保险，情绪偏乐观，需要防范回调。'),
  hfEquityLs: hedgeLs,
  ofrCashEquityLs: hedgeLs,
  primeEquityLs: hedgeLs,
  primeTechLs: { ...hedgeLs, what: '高盛样本中对冲基金在美国科技股上的多头 ÷ 空头。' },
  primeGross: {
    what: '高盛样本中对冲基金多头加空头的总仓位占自有资金的比例，越高说明杠杆越大。', high: 'defense',
    highText: '整体杠杆高，市场急跌时可能被迫同时卖出。', lowText: '整体杠杆不高。',
  },
  primeNet: {
    what: '高盛样本中对冲基金多头减空头的净仓位占自有资金的比例，越高越看多。', high: 'defense', contrarian: true,
    highText: '专业资金净多仓位高，拥挤。', lowText: '专业资金净多仓位低，比较谨慎，后续有加仓空间。',
  },
  ofrEquityGross: {
    what: '大型对冲基金持有的股票相关仓位（多头加空头）的总规模。', high: 'neutral',
    highText: '规模处于高位；规模会随市场长期增长，更适合看变化方向。', lowText: '规模较小。',
  },
  finraDebt: {
    what: '投资者向券商借钱买股票的总额（融资余额）。规模随市场长期增长，看同比更有意义。', high: 'neutral',
    highText: '借钱买股的总额处于历史高位。', lowText: '借钱买股的总额不高。',
  },
  finraDebtYoy: {
    what: '融资余额比去年同期增长了多少。增长过快说明大家在加杠杆追涨。', high: 'defense', bands: [-10, 0, 15, 30], preferBands: true,
    highText: '杠杆增长很快，市场偏热；下跌时容易出现强制平仓的连锁反应。', lowText: '杠杆在下降，市场情绪偏冷、泡沫较少。',
  },
  marginGdp: {
    what: '融资余额 ÷ 美国 GDP，衡量借钱炒股相对于经济规模有多大。', high: 'defense',
    highText: '杠杆相对经济规模偏高，下跌时的连锁风险更大。', lowText: '杠杆相对经济规模不高。',
  },
  finraCashDebt: {
    what: '券商客户账户里的闲置现金 ÷ 融资余额，越高说明手里的现金相对借款越多。', high: 'offense',
    highText: '账户里闲钱多，“子弹”充足。', lowText: '账户里闲钱少、借款多，“子弹”不足。',
  },
  cashDebt: {
    what: '券商客户账户里的闲置现金 ÷ 融资余额，越高说明手里的现金相对借款越多。', high: 'offense',
    highText: '账户里闲钱多，“子弹”充足。', lowText: '账户里闲钱少、借款多，“子弹”不足。',
  },
  cftcSpxLev: leveredFutures,
  cftcNdxLev: leveredFutures,
  cftcSpxAsset: assetFutures,
  cftcNdxAsset: assetFutures,
  retailCash: {
    what: 'AAII 美国散户会员的投资组合里现金的比例，长期平均约 22%。', high: 'offense',
    benchmark: { value: 22, label: 'AAII 长期平均' },
    highText: '散户手里现金多，“子弹”充足。', lowText: '散户现金很少，大部分钱已经在股市里，继续买入的力量有限。',
  },
  retailStocks: {
    what: 'AAII 美国散户会员的投资组合里股票（含股票基金）的比例，长期平均约 62%。', high: 'defense',
    benchmark: { value: 62, label: 'AAII 长期平均' },
    highText: '散户仓位很重，嘴上悲观但并没有卖。', lowText: '散户仓位较轻，有加仓空间。',
  },
  managerCash: {
    what: '美银调查中全球基金经理组合里现金的比例。美银的经验：低于 4% 是卖出信号，高于 5% 是买入信号。', high: 'offense', bands: [4, 4.5, 5, 6],
    highText: '基金经理手里现金多，“子弹”充足，常见于悲观期。', lowText: '基金经理几乎满仓，“子弹”不足，按美银经验属于偏卖出信号。',
  },
  fundLiquidity: {
    what: '美国股票共同基金资产中现金等流动资产的比例，越低说明基金越满仓。', high: 'offense', bands: [2, 3, 4, 5],
    highText: '基金留有较多现金。', lowText: '基金几乎满仓，可用于加仓的现金很少。',
  },
  mmfTotal: moneyFund('美国货币市场基金的总资产'),
  mmfRetail: moneyFund('个人投资者持有的货币基金资产'),
  mmfInstitutional: moneyFund('机构持有的货币基金资产'),
  domesticFlows: {
    what: '一周内流入（正）或流出（负）美国股票基金和 ETF 的钱。', high: 'offense', bands: [-200, -50, 50, 200],
    highText: '资金在净流入股票基金。', lowText: '资金在净流出股票基金。',
  },
  managerUsOverweight: {
    what: '美银调查中超配美股的基金经理比例减去低配的比例。', high: 'defense', contrarian: true, bands: [-20, -5, 5, 20],
    highText: '基金经理普遍超配美股，仓位拥挤。', lowText: '基金经理普遍低配美股，后续有回补空间。',
  },
  hy: {
    what: '高收益（垃圾）债比国债多出的利率，反映市场对企业违约的担心。数字越大越担心。', high: 'defense', bands: [300, 380, 500, 700], preferBands: true,
    highText: '信用风险上升，资金在回避风险，股市通常也承压。', lowText: '信用环境宽松，资金愿意承担风险，对股市有利。',
  },
  tenYear: {
    what: '美国 10 年期国债收益率，是全球资产定价的“锚”。越高，股票估值受到的压力越大。', high: 'defense', bands: [2.5, 3.5, 4.5, 5], preferBands: true,
    highText: '利率很高，压制股票估值，买国债的吸引力也更大。', lowText: '利率较低，对股票估值友好。',
  },
  nfci: {
    what: '芝加哥联储金融条件指数，0 代表历史平均，负数越大越宽松，正数代表收紧。', high: 'defense', bands: [-0.6, -0.3, 0, 0.3], preferBands: true,
    highText: '金融环境偏紧，借钱难、风险偏好低。', lowText: '金融环境宽松，资金充裕。',
  },
}

export interface Assessment {
  level: Level
  lean: Lean
  /** Short chip text such as 偏高. */
  label: string
  /** How the level was judged, e.g. 近 25 年 82% 分位. */
  basis?: string
  percentile?: number
  sentence: string
}

const LABELS: Record<Level, string> = { 'very-low': '很低', low: '偏低', normal: '正常', high: '偏高', 'very-high': '很高', unknown: '仅有近期数据' }
const DAY = 86_400_000

export function percentileOf(values: number[], value: number): number {
  const below = values.filter(v => v < value).length
  const equal = values.filter(v => v === value).length
  return Math.round(((below + equal / 2) / values.length) * 100)
}

function fromPercentile(pct: number): Level {
  return pct < 10 ? 'very-low' : pct < 30 ? 'low' : pct <= 70 ? 'normal' : pct <= 90 ? 'high' : 'very-high'
}

function fromBands(value: number, [a, b, c, d]: [number, number, number, number]): Level {
  return value < a ? 'very-low' : value < b ? 'low' : value <= c ? 'normal' : value <= d ? 'high' : 'very-high'
}

function fromBenchmark(value: number, base: number): Level {
  const gap = (value - base) / Math.abs(base || 1)
  return gap <= -0.25 ? 'very-low' : gap <= -0.1 ? 'low' : gap < 0.1 ? 'normal' : gap < 0.25 ? 'high' : 'very-high'
}

export function spanYears(history: Point[]): number {
  if (history.length < 2) return 0
  return (Date.parse(history.at(-1)![0]) - Date.parse(history[0][0])) / (365.25 * DAY)
}

const flip = (lean: Lean): Lean => lean === 'offense' ? 'defense' : lean === 'defense' ? 'offense' : 'neutral'

/** Turns a reading into a plain-language level, lean and one-line comment. */
export function assess(reading: Reading | undefined, guide: Guide | undefined): Assessment | undefined {
  const last = reading?.history.at(-1)
  if (!reading || !last || !guide) return undefined
  const value = last[1]
  const years = spanYears(reading.history)
  const longEnough = years >= 2 && reading.history.length >= 20
  const benchmark = guide.benchmark ?? (reading.benchmark10y !== undefined ? { value: reading.benchmark10y, label: '10 年均值' }
    : reading.benchmark5y !== undefined ? { value: reading.benchmark5y, label: '5 年均值' } : undefined)
  let level: Level = 'unknown'
  let basis: string | undefined
  let percentile: number | undefined
  if (longEnough) percentile = percentileOf(reading.history.map(([, v]) => v), value)
  if (guide.bands && guide.preferBands) {
    level = fromBands(value, guide.bands)
    basis = '按经验区间'
  } else if (longEnough && percentile !== undefined) {
    level = fromPercentile(percentile)
    basis = `近 ${Math.round(years)} 年 ${percentile}% 分位`
  } else if (benchmark) {
    level = fromBenchmark(value, benchmark.value)
    basis = `${benchmark.label} ${benchmark.value}${reading.unit === '%' ? '%' : reading.unit === '倍' ? ' 倍' : ''}`
  } else if (guide.bands) {
    level = fromBands(value, guide.bands)
    basis = '按经验区间'
  }
  const isHigh = level === 'high' || level === 'very-high'
  const isLow = level === 'low' || level === 'very-low'
  const lean: Lean = isHigh ? guide.high : isLow ? flip(guide.high) : 'neutral'
  const meaning = isHigh ? guide.highText : isLow ? guide.lowText
    : level === 'normal' ? guide.midText ?? '处于常见区间，单看这一项没有明显信号。'
      : '历史数据还不够长，暂时只能看数值本身和来源说明。'
  return { level, lean, label: LABELS[level], basis, percentile, sentence: (guide.contrarian && level !== 'normal' && level !== 'unknown' ? '（逆向指标）' : '') + meaning }
}

export const LEAN_LABEL: Record<Lean, string> = { offense: '偏进攻', defense: '偏防守', neutral: '中性' }

/** Keeps points within the last `years` years of the series; `null` keeps everything. */
export function withinYears(history: Point[], years: number | null): Point[] {
  if (years === null || !history.length) return history
  const end = Date.parse(history.at(-1)![0])
  return history.filter(([date]) => end - Date.parse(date) <= years * 365.25 * DAY)
}

/**
 * Readings drawn from the same survey or the same underlying series. The summary
 * lets each family cast one vote per question so one source cannot outvote others.
 */
export const FAMILY: Record<string, string> = {
  spxFactSetFpe: 'factset', spxTrailingFpe: 'factset', spxEarningsNow: 'factset', spxEarningsNextQuarter: 'factset',
  spxEarningsThisYear: 'factset', spxEarningsNextYear: 'factset', spxForwardEpsChange: 'factset',
  shillerCape: 'shiller', spxPe: 'shiller', spxDividendYield: 'shiller', spxCape: 'shiller', spread: 'erp',
  retailCash: 'aaii', retailStocks: 'aaii', retailBull: 'aaii', retailBear: 'aaii',
  managerCash: 'bofa', managerUsOverweight: 'bofa', fundLiquidity: 'ici', mmfTotal: 'ici', mmfRetail: 'ici', mmfInstitutional: 'ici', domesticFlows: 'ici',
  finraDebt: 'finra', finraDebtYoy: 'finra', marginGdp: 'finra', finraCashDebt: 'finra', cashDebt: 'finra',
  hfEquityLs: 'ofr', ofrCashEquityLs: 'ofr', ofrEquityGross: 'ofr', primeEquityLs: 'goldman', primeTechLs: 'goldman', primeGross: 'goldman', primeNet: 'goldman',
  cftcSpxLev: 'cftc', cftcNdxLev: 'cftc', cftcSpxAsset: 'cftc', cftcNdxAsset: 'cftc',
  hy: 'credit', baaAaa: 'credit', tenYear: 'rates', nfci: 'nfci', fearGreed: 'cnn', vix: 'vix', putCall: 'putcall', skew: 'skew',
  breadth200: 'breadth', netHighs: 'highs', volumeRatio: 'volume', naaim: 'naaim',
}

/** −2…+2: how far from normal, signed toward offence (+) or defence (−). */
export function voteOf(verdict: Assessment): number {
  const size = verdict.level === 'very-high' || verdict.level === 'very-low' ? 2 : verdict.level === 'high' || verdict.level === 'low' ? 1 : 0
  return verdict.lean === 'offense' ? size : verdict.lean === 'defense' ? -size : 0
}
