import { addDays, ageDays, clean, percentile, valueAt } from './panel.mjs'
import { formatDate, formatReading } from './format.mjs'

const LOCAL_SOURCE_NAMES = {
  'us-market-data': '美股市场快照',
  'macro-masters-fred': '大师宏观序列',
  'us-market-breadth': '美股市场宽度',
  'macro-us': '美国宏观快照',
  'us-equity-bond-spread': '美股股债利差',
}
export const LOCAL_SOURCES = Object.keys(LOCAL_SOURCE_NAMES)

const MARKS = '霍华德·马克斯'
const DALIO = '达利欧'
const DRUCK = '德鲁肯米勒'
const JONES = '都铎·琼斯'
const SHILLER = '罗伯特·席勒'
const BUFFETT = '巴菲特'
const BERNSTEIN = '理查德·伯恩斯坦'
const PROMOTE = '积累至少 20 年同口径历史并覆盖至少两次衰退。加入后需降低最大回撤或误报，且年化收益不下降。'
const HISTORICAL_POSITION = { high: 80, low: 20 }
const POSITION_LABELS = { high: '偏高', low: '偏低', neutral: '居中' }
const validDate = day => /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(day))
  && new Date(day).toISOString().slice(0, 10) === day

function series(input, asOf) {
  const rows = Array.isArray(input?.history) ? input.history : []
  return rows.filter(row => Array.isArray(row) && validDate(row[0]) &&
    row[0] <= asOf && Number.isFinite(row[1])).sort((a, b) => a[0].localeCompare(b[0]))
}

function near(rows, date, tolerance = 7) {
  const point = rows.findLast(([day]) => day <= date)
  return point && ageDays(date, point[0]) <= tolerance ? point : null
}

function pairedSpread(ccc, hy) {
  const hyByDate = new Map(hy)
  return ccc.flatMap(([date, cccValue]) => hyByDate.has(date) ? [[date, clean(cccValue - hyByDate.get(date))]] : [])
}

function netLiquidity(assets, cash, rrp) {
  const cashByDate = new Map(cash)
  return assets.flatMap(([date, amount]) => {
    const overnight = near(rrp, date)
    return overnight && cashByDate.has(date) ? [[date, amount - cashByDate.get(date) - overnight[1]]] : []
  })
}

function b(name, id, category, masters, why, source, read, kind = '历史太短') {
  return { id, name, grade: 'B', category, masters, uncertainty: { kind, text: why }, source, read }
}

function c(name, id, category, masters, why, source, read) {
  return { id, name, grade: 'C', category, masters, uncertainty: { kind: '择时力弱', text: why }, source, read }
}

const d = (id, name, category, masters, kind, why, prerequisite) => ({
  id, name, grade: 'D', category, masters, uncertainty: { kind, text: why },
  promote: prerequisite + ' ' + PROMOTE, status: 'na',
})
const waiting = [
  d('ismPmi', 'ISM 制造业采购经理指数', '增长', [DRUCK, DALIO], '授权受限', '连续、可发布的历史数据受授权限制。', '取得可长期使用和展示的授权。'),
  d('alfred', '宏观数据的首次发布版本', '数据质量', [DALIO], '修订偏差', '本版回测中的多数宏观数据含后来修订。', '取得并核对各核心序列的历史版本和真实发布日期。'),
  d('epsVintage', '当时可得的盈利修正历史', '盈利', [DRUCK, BERNSTEIN], '尚未接入', '还缺少按实际发布日期保存的长历史。', '取得记录发布时间和原始口径的历史估计。'),
  d('sloos', '银行放贷标准调查', '信用', [MARKS, DALIO], '尚未接入', '本版还未建立贷款标准与实际发布日期的历史面板。', '接入同口径调查值和发布日期。'),
  d('hyLong', '高收益债利差长历史', '信用', [MARKS, DRUCK], '授权受限', '公开快照的历史很短，完整历史受指数授权限制。', '取得可持续的长历史授权。'),
]

const reading = (point, unit, signal) => point && ({
  observedOn: point[0], value: formatReading(point[1], unit), signal,
})
const warning = (point, unit, warn, yes, no) => point && ({
  ...reading(point, unit, warn ? yes : no), status: warn ? 'warn' : 'clear',
})
const incompleteWarning = observedOn => ({ observedOn, status: 'na', signal: '暂缺可用读数。' })
const fred = id => `https://fred.stlouisfed.org/series/${id}`
const href = source => typeof source === 'string' && /^https?:\/\//.test(source) ? source : undefined

function historicalReading(rows, unit, meanings, render = value => formatReading(value, unit)) {
  if (rows.length < 2) return null
  const [observedOn, value, details] = rows.at(-1)
  const rank = percentile(value, rows.map(([, n]) => n))
  const level = rank >= HISTORICAL_POSITION.high ? 'high' : rank <= HISTORICAL_POSITION.low ? 'low' : 'neutral'
  return {
    observedOn, level, value: render(value, rank, details),
    signal: `处于可用历史的${POSITION_LABELS[level]}区间（${formatReading(rank, '百分位')}），${meanings[level]}。`,
  }
}

export function buildOuter(local, panel, asOf) {
  const market = local['us-market-data']?.series ?? {}
  const masters = local['macro-masters-fred']?.series ?? {}
  const breadth = local['us-market-breadth']?.breadth?.spx
  const macro = local['macro-us']?.series ?? {}
  const bond = local['us-equity-bond-spread']
  const get = obj => series(obj, asOf)
  const history = (obj, unit, high, low, neutral) => historicalReading(get(obj), unit, { high, low, neutral })
  const hy = get(market.hyDaily)
  const cccHy = pairedSpread(get(masters.cccSpread), hy)
  const net = netLiquidity(get(market.fedAssets), get(market.treasuryCash), get(market.overnightRrp))
  const inflation = get(masters.inflationExp)
  const changeWarning = (rows, days, threshold, unit, positive, yes, no, relative = false) => {
    const now = rows.at(-1)
    const before = now && near(rows, addDays(now[0], -days))
    if (!now) return null
    if (!before || (relative && before[1] <= 0)) return incompleteWarning(now[0])
    const change = clean(relative ? (now[1] / before[1] - 1) * 100 : now[1] - before[1])
    return warning([now[0], change], unit, positive ? change >= threshold : change <= threshold, yes, no)
  }

  const definitions = [
    b('高收益债信用利差', 'hyOas', '信用', [MARKS, DRUCK], '公开快照历史太短，难以检验历次衰退。', market.hyDaily?.source, () => {
      const now = hy.at(-1)
      const prior = now && near(hy, addDays(now[0], -28))
      if (!now) return null
      if (now[1] < 500 && !prior) return incompleteWarning(now[0])
      const change = prior && clean(now[1] - prior[1])
      return warning(now, '基点', now[1] >= 500 || change >= 50,
        '利差已达 500 个基点，或四周内已扩大至少 50 个基点。', '利差水平和四周升幅都未到预警线。')
    }),
    b('低评级债与高收益债利差背离', 'cccHy', '信用', [MARKS, DRUCK], '低评级债利差的公开长历史有限。', fred('BAMLH0A3HYC'), () =>
      changeWarning(cccHy, 84, 200, '基点', true, '过去十二周，低评级债相对整体高收益债的利差扩大至少 200 个基点。', '十二周的相对利差升幅未到 200 个基点。')),
    b('标普成分股站上 200 日线的占比', 'breadth200', '市场宽度', [JONES, BERNSTEIN], '公开回算使用当前名单，早期样本有幸存者偏差。', breadth?.source, () =>
      Number.isFinite(breadth?.above200) && validDate(breadth.date) && breadth.date <= asOf
        ? warning([breadth.date, breadth.above200], '%', breadth.above200 < 50, '少于一半成分股站在长期均线上。', '至少一半成分股站在长期均线上。') : null,
    '修订偏差'),
    b('标普波动率', 'vix', '市场波动', [JONES, MARKS], '波动率容易受短期事件影响，与信用压力有重叠。', market.vixDaily?.source, () => {
      const point = get(market.vixDaily).at(-1)
      return warning(point, '点', point?.[1] >= 30, '期权市场反映的波动预期达到 30 点。', '期权市场反映的波动预期低于 30 点。')
    }, '与核心重复'),
    b('标普日线与 200 日均线', 'spx200', '市场趋势', [JONES], '这个预警与月均线表达的趋势风险有重叠。', fred('SP500'), () => {
      const point = valueAt(panel.SP500, asOf)
      if (!point) return null
      const window = panel.SP500.filter(p => p.observedOn <= point.observedOn).slice(-200)
      if (window.length !== 200) return incompleteWarning(point.observedOn)
      const sma = window.reduce((sum, p) => sum + p.value, 0) / 200
      const below = point.value < sma
      return {
        observedOn: point.observedOn, value: `${formatReading(point.value, '指数')}，200 日线 ${formatReading(sma, '指数')}`,
        status: below ? 'warn' : 'clear',
        signal: `${formatDate(point.observedOn)}收盘价${below ? '低于' : '不低于'} 200 日均线。`,
      }
    }, '与核心重复'),
    b('美元净流动性', 'netLiquidity', '流动性', [DRUCK, DALIO], '联储资产扣除财政部存款和隔夜逆回购只是流动性的近似。', fred('WALCL'), () =>
      changeWarning(net, 91, -2, '%', false, '美元净流动性过去十三周下降至少 2%。', '过去十三周的降幅未到 2%。', true)),
    b('十年期盈亏平衡通胀', 'inflationExp', '通胀', [DALIO, JONES], '债券定价会受流动性和风险溢价影响，历史也较短。', fred('T10YIE'), () =>
      changeWarning(inflation, 84, 0.30, '百分点', true, '市场隐含通胀过去十二周上升至少 0.30 个百分点。', '过去十二周的升幅未到 0.30 个百分点。')),
    b('标普前瞻盈利预期', 'epsRevision', '盈利', [DRUCK, BERNSTEIN], '公开快照还缺少连续的历次盈利预期和发布日期。', market.spxForwardEpsChange?.source, () => {
      const point = get(market.spxForwardEpsChange).at(-1)
      return warning(point, '%', point?.[1] < 0, '标普未来十二个月的盈利预期较对照期下修。', '标普未来十二个月的盈利预期较对照期未下修。')
    }),
    c('周期调整市盈率百分位', 'cape', '估值', [SHILLER, MARKS], '估值能约束长期回报预期，高估值可能持续多年。', market.shillerCape?.source, () =>
      historicalReading(get(market.shillerCape), '倍', {
        high: '较贵的估值压低长期回报预期，可作为压低自设股票仓位上限的参考',
        low: '较便宜的估值给长期回报留出了更多空间',
        neutral: '当前估值给出的长期回报线索较中性',
      }, (value, rank) => `${formatReading(rank, '百分位')}（${formatReading(value, '倍')}）`)),
    c('巴菲特指标', 'buffett', '估值', [BUFFETT], '市值与经济规模的比值适合长期估值比较，转折时间不稳定。', fred('NCBEILQ027S'), () =>
      history(macro.buffett, '%', '股票市值相对经济规模偏贵，长期估值留给回报的空间较小', '市值相对经济规模偏低，长期估值压力较轻', '市值与经济规模的关系接近历史常态')),
    c('股债利差', 'equityBondSpread', '估值', [SHILLER, MARKS], '盈利收益率与国债利率的差距可能多年维持同一方向。', bond?.source, () =>
      history({ history: bond?.rows }, '百分点', '股票相对国债的盈利收益率优势较大', '股票相对国债的盈利收益率优势较小', '股票相对国债的盈利收益率优势接近历史常态')),
    c('证券融资余额同比', 'finraDebtYoy', '仓位', [MARKS, JONES], '融资增长常随行情变化，单靠它很难判断转折。', market.finraDebtYoy?.source, () =>
      history(market.finraDebtYoy, '%', '融资增长较快，遇到下跌时杠杆可能放大波动', '融资增速偏低，杠杆扩张压力较轻', '融资增长接近历史常态')),
    c('标普期货杠杆基金净仓', 'cftcSpxLev', '仓位', [JONES], '期货空仓可能用于对冲其他头寸。', market.cftcSpxLev?.source, () =>
      history(market.cftcSpxLev, '%', '杠杆基金净头寸较偏多，拥挤时减仓可能放大回落', '杠杆基金净头寸较偏空，回补可能放大反弹', '杠杆基金净头寸接近历史常态')),
    c('CNN 恐惧与贪婪指数', 'fearGreed', '情绪', [MARKS], '情绪极端时仍可能延续多周。', market.fearGreed?.source, () =>
      history(market.fearGreed, '分', '市场情绪偏贪婪，乐观预期较集中', '市场情绪偏恐惧，风险偏好较弱', '市场情绪接近历史中间水平')),
    c('AAII 散户调查', 'aaii', '情绪', [MARKS], '调查记录会员看法，样本和实际仓位可能不同。', market.retailBull?.source, () => {
      const bears = new Map(get(market.retailBear))
      const rows = get(market.retailBull).flatMap(([date, bull]) =>
        bears.has(date) ? [[date, clean(bull - bears.get(date)), [bull, bears.get(date)]]] : [])
      return historicalReading(rows, '百分点', {
        high: '看多与看空比例之差偏高，散户对未来半年较乐观',
        low: '看多与看空比例之差偏低，散户对未来半年较谨慎',
        neutral: '看多与看空比例之差接近历史常态',
      }, (_value, _rank, [bull, bear]) => `看多 ${formatReading(bull, '%')}，看空 ${formatReading(bear, '%')}`)
    }),
    c('NAAIM 主动经理股票敞口', 'naaim', '仓位', [JONES], '公开调查有滞后，且仅覆盖协会会员。', market.naaim?.source, () =>
      history(market.naaim, '%', '受访经理股票敞口较高，集中减仓时可能放大波动', '受访经理股票敞口较低，显示其风险偏好偏弱', '受访经理的股票敞口接近历史常态')),
    c('铜金比', 'copperGold', '跨资产', [DALIO, DRUCK], '工业需求、金价避险和期货换月都可能改变比值。', market.copperGold?.source, () =>
      historicalReading(get(market.copperGold), '‰', {
        high: '铜相对黄金偏强，工业需求或风险偏好较有支撑',
        low: '铜相对黄金偏弱，可能反映工业需求放缓或避险升温',
        neutral: '铜与黄金的相对强弱接近历史常态',
      }, value => formatReading(value * 1000, '‰'))),
    c('联邦债务占 GDP', 'govDebtGdp', '债务', [DALIO], '债务负担按季度缓慢变化，难以确定市场转折月份。', fred('GFDEGDQ188S'), () =>
      history(masters.govDebtGdp, '%', '联邦债务相对经济规模偏重，中长期对融资成本更敏感', '联邦债务相对经济规模的负担较轻', '联邦债务相对经济规模的负担接近历史常态')),
    c('家庭股票配置占比', 'equityShare', '仓位', [BUFFETT, MARKS], '家庭配置是季度数据，股票上涨也会被动推高占比。', fred('BOGZ1FL153064486Q'), () =>
      history(macro.equityShare, '%', '股票在家庭金融资产中的占比较高，股市回落对家庭财富影响更大', '股票在家庭金融资产中的占比较低，家庭财富对股价波动的直接敞口相对较小', '家庭的股票配置比例接近历史常态')),
  ]

  const failedSources = LOCAL_SOURCES.filter(id => local[id] == null).map(id => LOCAL_SOURCE_NAMES[id])
  const outer = definitions.map(({ read, source, ...item }) => {
    const result = read()
    if (!result || result.status === 'na') failedSources.push(item.name)
    const staleAfter = item.id === 'netLiquidity' ? 21 : 14
    const stale = item.grade === 'B' && result?.observedOn && ageDays(asOf, result.observedOn) > staleAfter
    return {
      ...item, promote: PROMOTE, status: result ? 'info' : 'na', ...result,
      ...(stale ? { status: 'na', signal: `读数过旧（最新为 ${formatDate(result.observedOn)}），暂不参与预警` } : {}),
      ...(href(source) ? { source } : {}),
    }
  })

  return { outer: [...outer, ...waiting], failedSources }
}
