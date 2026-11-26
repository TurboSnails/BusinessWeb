import { classifyHeat, heatScoreFromScores, HEAT_LABEL } from '../combined-strategy/heat.mjs'
import { scoreMarket } from '../macro-posture-market/components.mjs'
import { formatDate, formatReading } from '../macro-posture/format.mjs'
import { average, baseTier } from '../macro-posture/model.mjs'
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
const pts = n => formatReading(n, '点', 2)
const signed = (n, format) => (n > 0 ? '+' : '') + format(n)
const bottom = '第 20 百分位'
const top = '第 80 百分位'
const highExpensive = `达到${top}扣 1 分，不高于${bottom}加 1 分，其余 0 分。`
const highSupportive = `不高于${bottom}扣 1 分，达到${top}加 1 分，其余 0 分。`
const factset = 'FactSet Earnings Insight 公开周报存档自 2016 年 12 月起（早年按月末取一期，个别月份缺档），不足 25 年，只展示。'
const survey = '美银调查只有零星已发布读数，完整历史受授权限制。'
const displayOnly = '事后新增，只展示，不计分。'

const STALE_BY_FREQ = {
  daily: 10, weekly: 21, monthly: 75, quarterly: 200, irregular: 60,
}

/** A1 固定修正记录（数字已由 manager 独立核对，运行时不再重算旧口径）。 */
export const REVISION_A1 = '2026 年 11 月 24 日修正了回测里每股盈利与市盈率的取数时点：席勒表的非季末月是季末之间的插值，等于提前用了下一个季末的盈利；现在只用季末值，季末后第 3 个月末才可得。属于看过原结果后的数据修正：全样本夏普由 0.586 变为 0.591，最大回撤不变，646 个月里 35 个月的雷达档位、40 个月的估值维度分、50 个月的盈利维度分发生变化。'

const DEFINITIONS = {
  netLiquidity: {
    dimension: 'liquidity', group: '央行与资金', core: true,
    label: '美元净流动性 13 周变化', frequency: 'weekly', direction: 'hot', unit: '%',
    valueText: p => signed(p.value, percent),
    display: p => `联储资产扣除财政部存款和隔夜逆回购后，近 13 周变化 ${signed(p.value, percent)}，` +
      (p.value >= 2 ? '流动性偏强。' : p.value <= -2 ? '流动性偏弱。' : '未达偏强或偏弱的阈值。'),
    rule: '历史不足 25 年，只展示。13 周升幅达到 2% 为偏强，降幅达到 2% 为偏弱。隔夜逆回购工具 2013-09-23 启用前缺读数按 0 计。',
    thresholds: [{ value: 2, label: '偏强 +2%', kind: 'reference' }, { value: -2, label: '偏弱 −2%', kind: 'reference' }],
  },
  reserves: {
    dimension: 'liquidity', group: '央行与资金', core: false,
    label: '银行准备金 13 周变化', frequency: 'weekly', direction: 'hot', unit: '%',
    valueText: p => signed(p.value, percent),
    display: p => `银行准备金近 13 周变化 ${signed(p.value, percent)}。`,
    rule: `银行存放在美联储的准备金余额近 13 周的涨跌幅，2002 年 12 月起，取自 FRED（WRESBAL）。准备金增加表示银行体系流动性更宽裕。${displayOnly}`,
  },
  baaChange: {
    dimension: 'liquidity', group: '信用与金融条件', core: true,
    label: '企业债利差半年变化', frequency: 'monthly', direction: 'cold', unit: '个百分点',
    valueText: p => signed(p.value, pp),
    display: p => `Baa 与 Aaa 企业债利差近 6 个月变化 ${signed(p.value, pp)}。`,
    rule: '扩大至少 0.20 个百分点扣 1 分，收窄至少 0.15 个百分点加 1 分，其余 0 分。',
    score: p => band(p.value, -0.15, 0.20, 1),
    thresholds: [
      { value: 0.20, label: '扣分线 +0.20', kind: 'minus' },
      { value: -0.15, label: '加分线 −0.15', kind: 'plus' },
    ],
  },
  nfci: {
    dimension: 'liquidity', group: '信用与金融条件', core: true,
    label: '金融条件指数（芝加哥联储 NFCI）', frequency: 'weekly', direction: 'cold', unit: '',
    valueText: p => formatReading(p.value, '', 3),
    display: p => `芝加哥联储全国金融条件指数为 ${formatReading(p.value, '', 3)}（0 为 1971 年以来平均，正值偏紧）。`,
    rule: `芝加哥联储全国金融条件指数，综合货币市场、债市、股市与银行体系的一百多项读数；0 是 1971 年以来的平均水平，正值表示金融条件偏紧，负值偏松。每周更新，取自 FRED（NFCI）。${displayOnly}`,
    thresholds: [{ value: 0, label: '长期平均', kind: 'reference' }],
  },
  ofrCredit: {
    dimension: 'liquidity', group: '信用与金融条件', core: true,
    label: '金融压力指数·信用分项（OFR）', frequency: 'daily', direction: 'cold', unit: '',
    valueText: p => formatReading(p.value, '', 3),
    display: p => `OFR 金融压力指数信用分项为 ${formatReading(p.value, '', 3)}` +
      (p.fsi == null ? '。' : `（OFR FSI 总指数 ${formatReading(p.fsi, '', 3)}）。`),
    rule: `美国金融研究办公室（OFR）金融压力指数里的信用分项，由各类信用利差合成，2000 年起每日更新；0 是长期平均，正值表示信用压力高于平均。用来补高收益债利差只有三年历史的不足。${displayOnly}`,
    thresholds: [{ value: 0, label: '长期平均', kind: 'reference' }],
  },
  hy: {
    dimension: 'liquidity', group: '信用与金融条件', core: true,
    label: '高收益债利差', frequency: 'daily', direction: 'cold', unit: '个基点',
    valueText: p => bp(p.value),
    display: p => `高收益债利差 ${bp(p.value)}` +
      (p.change == null ? '，四周变化暂缺。' : `，近 4 周变化 ${signed(p.change, bp)}。`) +
      (p.value >= 500 || p.change >= 50 ? '已达信用压力阈值。' : ''),
    rule: 'FRED 受 ICE 授权限制只公开最近 3 年，站内从 2023 年 11 月起逐日累积，只展示。利差达到 500 个基点，或 4 周内扩大至少 50 个基点，为信用压力信号。',
    thresholds: [{ value: 500, label: '压力阈值 500', kind: 'reference' }],
  },
  realYield: {
    dimension: 'liquidity', group: '利率、美元与商品', core: true,
    label: '10 年期实际利率', frequency: 'daily', direction: 'cold', unit: '%',
    valueText: p => percent(p.value),
    display: p => `10 年期国债实际收益率（TIPS）为 ${percent(p.value)}。`,
    rule: `10 年期通胀保值国债（TIPS）收益率，2003 年起，取自 FRED（DFII10）。实际利率越高，股票估值承受的压力越大。${displayOnly}`,
  },
  dollar: {
    dimension: 'liquidity', group: '利率、美元与商品', core: false,
    label: '美元指数 13 周变化', frequency: 'daily', direction: 'cold', unit: '%',
    valueText: p => signed(p.value, percent),
    display: p => `贸易加权美元指数近 13 周变化 ${signed(p.value, percent)}` +
      (p.level == null ? '。' : `（指数水平 ${formatReading(p.level, '', 2)}）。`),
    rule: `美联储广义贸易加权美元指数近 13 周的涨跌幅，2006 年起，取自 FRED（DTWEXBGS）。美元走强通常意味着全球美元流动性收紧。${displayOnly}`,
  },
  goldSilver: {
    dimension: 'liquidity', group: '利率、美元与商品', core: false,
    label: '金银比', frequency: 'daily', direction: 'cold', unit: '',
    valueText: p => formatReading(p.value, '', 1),
    percentileMode: 'monthly',
    overlays: [
      { id: 'gold', key: 'gold', label: '黄金', unit: '美元/盎司' },
      { id: 'silver', key: 'silver', label: '白银', unit: '美元/盎司' },
      { id: 'spx', key: 'spx', label: '标普 500', unit: '点' },
    ],
    display: p => `COMEX 黄金 ÷ 白银 ${formatReading(p.value, '', 1)}（金 ${formatReading(p.gold, '', 0)}、银 ${formatReading(p.silver, '', 2)} 美元/盎司）` +
      (p.change == null ? '' : `，较 20 个交易日前 ${signed(p.change, n => formatReading(n, '', 1))}`) + '。',
    rule: '1960 年 1 月至 2000 年 8 月用世界银行 Pink Sheet 金、银月均价之比（银价只有一位小数，1960 年代单月误差可达约 5%）；之后用 Yahoo COMEX 连续合约日线的月均价之比，最新读数为最近一个交易日。百分位以月度为样本。1971 年以前金价由布雷顿森林体系固定在每盎司 35 美元，比值只反映银价。事后新增，只展示，不计分。比值走高说明资金偏向避险属性更强的黄金、白银代表的工业与投机需求转弱，常见于避险和增长担忧阶段；回落常伴随风险偏好回升。',
  },
  pe: {
    dimension: 'valuation', group: '盈利估值', core: true,
    label: '过去 12 个月市盈率', frequency: 'monthly', direction: 'hot', unit: '倍',
    valueText: p => times(p.value),
    display: p => `按过去 12 个月实际盈利计，标普 500 市盈率为 ${times(p.value)}。`,
    rule: highExpensive,
    score: (_, rank) => rank == null ? null : band(rank, 20, 80, 1),
    percentileThresholds: true,
  },
  forwardPe: {
    dimension: 'valuation', group: '盈利估值', core: true,
    label: '前瞻市盈率', frequency: 'weekly', direction: 'hot', unit: '倍',
    valueText: p => times(p.value),
    display: p => `按未来 12 个月预期盈利计，标普 500 市盈率为 ${times(p.value)}。`,
    rule: factset,
  },
  cape: {
    dimension: 'valuation', group: '盈利估值', core: true,
    label: '周期调整市盈率（CAPE）', frequency: 'monthly', direction: 'hot', unit: '倍',
    valueText: p => times(p.value),
    display: p => `按长期实际盈利平滑后，标普 500 市盈率为 ${times(p.value)}。`,
    rule: '按用户决定（2026-11-24）不纳入雷达打分与回测，只展示。CAPE 用 10 年平均实际盈利，盈利结构变化大时会长期偏高；估值维度由过去 12 个月市盈率与股债利差计分。',
  },
  erp: {
    dimension: 'valuation', group: '相对债券与股息', core: true,
    label: '股债利差', frequency: 'monthly', direction: 'cold', unit: '个百分点',
    valueText: p => pp(p.value),
    display: p => {
      const peDay = formatDate(p.pe.observedOn, 'daily')
      const bondMonth = formatDate(p.gs10.observedOn, 'monthly')
      let text = `市盈率截至 ${peDay}，10 年期美债用 ${bondMonth}月均收益率 ${percent(p.gs10.value)}，相差 ${pp(p.value)}`
      if (p.dailyYield != null && p.dailyOn) {
        const dailyErp = clean(100 / p.pe.value - p.dailyYield)
        text += `；按 ${formatDate(p.dailyOn, 'daily')}当日收益率 ${percent(p.dailyYield)} 计为 ${pp(dailyErp)}`
      }
      return text + '。'
    },
    rule: highSupportive,
    score: (_, rank) => rank == null ? null : band(rank, 20, 80),
    percentileThresholds: true,
  },
  dividendYield: {
    dimension: 'valuation', group: '相对债券与股息', core: false,
    label: '标普 500 股息率', frequency: 'monthly', direction: 'cold', unit: '%',
    valueText: p => percent(p.value),
    display: p => `标普 500 股息率为 ${percent(p.value)}。`,
    rule: `标普 500 过去 12 个月股息 ÷ 指数点位，1900 年起，取自 Multpl 月表。股息率越低，股价相对分红越贵；回购增多会让它长期偏低。${displayOnly}`,
  },
  buffett: {
    dimension: 'valuation', group: '总量', core: true,
    label: '巴菲特指标', frequency: 'quarterly', direction: 'hot', unit: '%',
    valueText: p => percent(p.value),
    display: p => `非金融企业股票市值 ÷ GDP 为 ${percent(p.value)}。`,
    rule: `非金融企业股票市值（美联储资金流量表）÷ 名义 GDP，1947 年起，按季更新，季末后约三个月可得。比值越高，股市相对经济体量越贵。${displayOnly}`,
  },
  equityShare: {
    dimension: 'crowding', group: '家庭与杠杆', core: true,
    label: '家庭股票占金融资产比例', frequency: 'quarterly', direction: 'hot', unit: '%',
    valueText: p => percent(p.value),
    display: p => `股票占家庭和非营利组织金融资产的 ${percent(p.value)}。`,
    rule: highExpensive,
    score: (_, rank) => rank == null ? null : band(rank, 20, 80, 1),
    percentileThresholds: true,
  },
  cashShare: {
    dimension: 'crowding', group: '家庭与杠杆', core: true,
    label: '家庭现金占金融资产比例', frequency: 'quarterly', direction: 'cold', unit: '%',
    valueText: p => percent(p.value),
    display: p => `现金、存款和货币基金占家庭和非营利组织金融资产的 ${percent(p.value)}。`,
    rule: highSupportive,
    score: (_, rank) => rank == null ? null : band(rank, 20, 80),
    percentileThresholds: true,
  },
  finraDebtYoy: {
    dimension: 'crowding', group: '家庭与杠杆', core: true,
    label: '融资余额同比', frequency: 'monthly', direction: 'hot', unit: '%',
    valueText: p => signed(p.value, percent),
    display: p => `证券保证金借方余额较去年同月变化 ${signed(p.value, percent)}。`,
    rule: '同比升幅达到 30% 扣 1 分，降幅达到 20% 加 1 分，其余 0 分。',
    score: p => band(p.value, -20, 30, 1),
    staleDays: 75,
    thresholds: [
      { value: 30, label: '扣分线 +30%', kind: 'minus' },
      { value: -20, label: '加分线 −20%', kind: 'plus' },
    ],
  },
  marginGdp: {
    dimension: 'crowding', group: '家庭与杠杆', core: false,
    label: '融资余额 ÷ GDP', frequency: 'monthly', direction: 'hot', unit: '%',
    valueText: p => percent(p.value),
    display: p => `融资余额占 GDP 的 ${percent(p.value)}。`,
    rule: `FINRA 客户保证金借方余额 ÷ 名义 GDP，按月更新（最近一期 GDP 未公布时沿用上一季）。1997 年以前用美联储资金流量表的券商应收客户款项（保证金贷款等）代用，按 1997 年两者的比值缩放，1947 年起（1952 年前为年度、之后为季度）。比值越高，场内杠杆相对经济体量越大。${displayOnly}`,
    staleDays: 75,
  },
  cftcAsset: {
    dimension: 'crowding', group: '机构仓位', core: true,
    label: 'CFTC 资管机构标普期货净多', frequency: 'weekly', direction: 'hot', unit: '%',
    valueText: p => percent(p.value),
    display: p => `资产管理机构在标普 500 期货上的净多头占未平仓合约的 ${percent(p.value)}。`,
    rule: 'NAAIM 的同维度平替，取自 CFTC 交易者持仓报告（TFF），自 2010 年 6 月起，不足 25 年，只展示。',
  },
  cftcNdxAsset: {
    dimension: 'crowding', group: '机构仓位', core: false,
    label: 'CFTC 资管机构纳指期货净多', frequency: 'weekly', direction: 'hot', unit: '%',
    valueText: p => percent(p.value),
    display: p => `资产管理机构在纳指 100 期货上的净多头占未平仓合约的 ${percent(p.value)}。`,
    rule: '科技股机构仓位的自动跟踪口径，取自 CFTC 交易者持仓报告（TFF），自 2010 年 6 月起，事后新增，只展示。',
  },
  cftcLev: {
    dimension: 'crowding', group: '机构仓位', core: false,
    label: 'CFTC 杠杆基金标普期货净仓', frequency: 'weekly', direction: 'none', unit: '%',
    valueText: p => percent(p.value),
    display: p => `杠杆基金在标普 500 期货上的净仓占未平仓合约的 ${percent(p.value)}。`,
    rule: `CFTC 交易者持仓报告（TFF）里杠杆基金的标普 500 期货净仓 ÷ 未平仓合约，2010 年 6 月起，每周更新。杠杆基金常因基差与对冲交易持有净空，方向含义不明确，所以不给冷热。${displayOnly}`,
  },
  hfEquityLs: {
    dimension: 'crowding', group: '机构仓位', core: false,
    label: '对冲基金股票多空比', frequency: 'quarterly', direction: 'hot', unit: '',
    valueText: p => formatReading(p.value, '', 3),
    display: p => `对冲基金股票多空比为 ${formatReading(p.value, '', 3)}。`,
    rule: `美国金融研究办公室根据 Form PF 汇总的合格对冲基金股票多头名义敞口 ÷ 空头名义敞口，2013 年起，按季更新，滞后数月。不是券商主经纪业务口径的仓位数据。${displayOnly}`,
    staleDays: 300,
  },
  naaim: {
    dimension: 'crowding', group: '机构仓位', core: false,
    label: 'NAAIM 主动经理敞口', frequency: 'weekly', direction: 'hot', unit: '%',
    valueText: p => percent(p.value),
    discontinued: true,
    display: p => `受访主动投资经理平均美股敞口为 ${percent(p.value)}` +
      (p.value >= 90 ? '，敞口偏高。' : p.value <= 30 ? '，敞口偏低。' : '。'),
    rule: 'NAAIM 官方全历史自 2006 年 7 月起，不足 25 年，只展示。NAAIM 自 2026 年 8 月 1 日起改为订阅制，公开表停在 8 月 19 日，订阅前读数不再更新。敞口达到 90 为偏高，不高于 30 为偏低。',
    thresholds: [
      { value: 90, label: '偏高 90', kind: 'reference' },
      { value: 30, label: '偏低 30', kind: 'reference' },
    ],
  },
  managerCash: {
    dimension: 'crowding', group: '机构仓位', core: false,
    label: '基金经理现金比例', frequency: 'irregular', direction: 'cold', unit: '%',
    valueText: p => percent(p.value),
    display: p => `美银调查中，基金经理持有的现金比例为 ${percent(p.value)}。`,
    rule: survey,
  },
  managerUsOverweight: {
    dimension: 'crowding', group: '机构仓位', core: false,
    label: '基金经理美股净超配', frequency: 'irregular', direction: 'hot', unit: '%',
    valueText: p => percent(p.value),
    display: p => `美银调查中，基金经理美股净超配为 ${percent(p.value)}。`,
    rule: survey,
  },
  managerTechOverweight: {
    dimension: 'crowding', group: '机构仓位', core: false,
    label: '基金经理科技股净超配', frequency: 'irregular', direction: 'hot', unit: '%',
    valueText: p => percent(p.value),
    display: p => `美银调查中，基金经理科技股净超配为 ${percent(p.value)}。`,
    rule: survey + '数值越高说明机构在科技股上越拥挤；美银回看历史，科技股较好的买点多出现在转为净低配之后。',
  },
  aaiiSpread: {
    dimension: 'crowding', group: '情绪与期权', core: true,
    label: 'AAII 散户多空差', frequency: 'weekly', direction: 'hot', unit: '个百分点',
    valueText: p => signed(p.value, pp),
    display: p => `AAII 调查中看多 ${percent(p.bull)}、看空 ${percent(p.bear)}，多空差 ${signed(p.value, pp)}。`,
    rule: '美银基金经理调查的同维度平替。AAII 官方情绪表自 1987 年 7 月起；因是事后新增，不进入事先固定的计分与回测，只展示。',
  },
  putCall: {
    dimension: 'crowding', group: '情绪与期权', core: true,
    label: 'Put/Call 成交量比', frequency: 'monthly', direction: 'cold', unit: '',
    valueText: p => formatReading(p.value, '', 2),
    display: p => `Cboe 全产品 Put/Call 成交量比为 ${formatReading(p.value, '', 2)}。`,
    rule: `Cboe 全部期权产品的看跌成交量 ÷ 看涨成交量，1995 年 9 月起（2006 年 10 月以前取 Cboe 早期存档的月末读数）；历史用月度样本（2019 年 10 月以后是每月末的日读数），最新为当日读数。比值高表示买保护的人多，情绪偏谨慎。${displayOnly}`,
    thresholds: [{ value: 1, label: '参考线 1.0', kind: 'reference' }],
  },
  skew: {
    dimension: 'crowding', group: '情绪与期权', core: false,
    label: 'Cboe SKEW 尾部风险指数', frequency: 'daily', direction: 'none', unit: '点',
    valueText: p => pts(p.value),
    display: p => `Cboe SKEW 为 ${pts(p.value)}。`,
    rule: `Cboe 用标普 500 虚值期权价格算出的尾部风险指数，1990 年起。数值高表示市场为大跌保护付的溢价高；它和后续涨跌没有稳定的方向关系，所以不给冷热。${displayOnly}`,
  },
  trend200: {
    dimension: 'trading', group: '趋势与波动', core: true,
    label: '标普相对 200 日均线', frequency: 'daily', direction: 'hot', unit: '%',
    valueText: p => signed(p.value, percent),
    display: p => `标普收盘相对 200 日均线 ${signed(p.value, percent)}。`,
    rule: `标普 500 收盘价相对自身 200 日均线的偏离，1973 年起。为正表示在均线上方，为负表示跌破均线。${displayOnly}`,
    thresholds: [{ value: 0, label: '均线', kind: 'reference' }],
  },
  drawdown: {
    dimension: 'trading', group: '趋势与波动', core: true,
    label: '标普距 52 周最高收盘', frequency: 'daily', direction: 'hot', unit: '%',
    valueText: p => percent(p.value),
    display: p => `标普收盘距近 252 个交易日最高收盘 ${percent(p.value)}。`,
    rule: `标普 500 收盘价距近 252 个交易日最高收盘价的跌幅，1973 年起。0 表示正处在一年新高。${displayOnly}`,
  },
  vix: {
    dimension: 'trading', group: '趋势与波动', core: true,
    label: 'VIX 水平', frequency: 'daily', direction: 'cold', unit: '点',
    valueText: p => pts(p.value),
    display: p => `VIX 为 ${pts(p.value)}。`,
    rule: `Cboe 用标普 500 期权价格算出的未来 30 天隐含波动率，1990 年起。20 以上一般视为紧张，30 以上视为恐慌。${displayOnly}`,
    thresholds: [
      { value: 20, label: '参考 20', kind: 'reference' },
      { value: 30, label: '参考 30', kind: 'reference' },
    ],
  },
  vixTrend: {
    dimension: 'trading', group: '趋势与波动', core: true,
    label: 'VIX 变化趋势', frequency: 'daily', direction: 'cold', unit: '%',
    valueText: p => signed(p.value, percent),
    display: p => `VIX 近 21 个交易日均值 ${pts(p.recent)}，比之前 126 个交易日均值 ${pts(p.base)}${p.value >= 0 ? '高' : '低'} ${percent(Math.abs(p.value))}。`,
    rule: `VIX 近 21 个交易日均值相对之前 126 个交易日（约 6 个月）均值的变化，1990 年起。看的是波动在升还是在降，不是 VIX 高低。2026 年 11 月 26 日检验过两种计分写法（并入流动性维度；企业债利差走阔时按它判断修复），验证期都比现行规则差，未采用（登记 L-022）。历史上企业债利差走阔且 VIX 明显上升的月份，之后 12 个月标普多数上涨，这是事后观察，不作信号。${displayOnly}`,
    thresholds: [
      { value: 20, label: '明显上升 +20%', kind: 'reference' },
      { value: -15, label: '明显回落 −15%', kind: 'reference' },
    ],
  },
  vixTerm: {
    dimension: 'trading', group: '趋势与波动', core: true,
    label: 'VIX 期限结构', frequency: 'daily', direction: 'cold', unit: '倍',
    valueText: p => times(p.value),
    display: p => `VIX ${formatReading(p.vix, '点')}，三个月 VIX ${formatReading(p.vix3m, '点')}，两者之比为 ${times(p.value)}。` +
      (p.value >= 1.05 ? '短期波动预期显著高于三个月预期。' : ''),
    rule: '历史不足 25 年，只展示。比值达到 1.05 倍表示近端波动预期显著高于三个月预期。',
    thresholds: [{ value: 1.05, label: '近端偏高 1.05', kind: 'reference' }],
  },
  realizedVol: {
    dimension: 'trading', group: '趋势与波动', core: false,
    label: '标普 20 日已实现波动率', frequency: 'daily', direction: 'cold', unit: '%',
    valueText: p => percent(p.value),
    display: p => `标普近 20 个交易日已实现年化波动率为 ${percent(p.value)}。`,
    rule: `标普 500 近 20 个交易日日收益的年化波动率，1973 年起。它是已经发生的波动，可与 VIX（预期波动）对照。${displayOnly}`,
  },
  vvix: {
    dimension: 'trading', group: '趋势与波动', core: false,
    label: 'VVIX', frequency: 'daily', direction: 'cold', unit: '点',
    valueText: p => pts(p.value),
    display: p => `VVIX（VIX 的波动率）为 ${pts(p.value)}。`,
    rule: `Cboe 用 VIX 期权价格算出的「VIX 的波动率」，2006 年起。数值高表示市场预期波动率本身会大幅变动，常见于急跌阶段。${displayOnly}`,
  },
  impliedCorr: {
    dimension: 'trading', group: '趋势与波动', core: false,
    label: '隐含相关性（1 个月）', frequency: 'daily', direction: 'cold', unit: '',
    valueText: p => formatReading(p.value, '', 2),
    display: p => `标普 500 一个月隐含相关性 ${formatReading(p.value, '', 2)}` +
      (p.change == null ? '' : `，较 5 个交易日前 ${signed(p.change, n => formatReading(n, '', 2))}`) +
      (p.cor3m == null ? '' : `；三个月隐含相关性 ${formatReading(p.cor3m, '', 2)}`) + '。',
    rule: 'Cboe 隐含相关性指数自 2006 年起，不足 25 年，只展示。数值越高，期权市场越预期成分股同涨同跌；短期急升常见于离散度交易（卖指数期权、买个股期权）平仓、指数波动被放大的阶段。',
  },
  gex: {
    dimension: 'trading', group: '趋势与波动', core: false,
    label: '做市商 Gamma 敞口（GEX）', frequency: 'daily', direction: 'none', unit: '亿美元',
    valueText: p => signed(p.value, n => formatReading(n, '', 1)) + ' 亿美元',
    display: p => `SqueezeMetrics 估算的做市商 Gamma 敞口 ${signed(p.value, n => formatReading(n, '', 1))} 亿美元，` +
      (p.value < 0 ? '为负，做市商对冲顺势而行，容易放大涨跌' : '为正，做市商对冲逆势而行，倾向于平抑波动') +
      `；近 5 个交易日有 ${p.negativeDays} 天为负。`,
    rule: 'SqueezeMetrics 按期权未平仓量和做市商持仓方向的假设估算，不是官方数据，不同机构口径差异较大，宜看正负与相对高低。自 2011 年 5 月起，不足 25 年，只展示。',
  },
  breadth: {
    dimension: 'trading', group: '宽度·行业（长历史）', core: true,
    label: '行业宽度（10 个月均线）', frequency: 'monthly', direction: 'hot', unit: '%',
    valueText: p => percent(p.value),
    display: p => `${percent(p.value)} 的可用行业站上各自的 10 个月均线。`,
    rule: '宽度不高于 40% 扣 1 分，达到 60% 加 1 分，其余 0 分。',
    score: p => scoreMarket('breadth', 'b', { breadth: p }),
    staleDays: 100,
    thresholds: [
      { value: 40, label: '扣分线 40%', kind: 'minus' },
      { value: 60, label: '加分线 60%', kind: 'plus' },
    ],
  },
  industry200: {
    dimension: 'trading', group: '宽度·行业（长历史）', core: false,
    label: '行业站上 200 日线比例（49 行业）', frequency: 'daily', direction: 'hot', unit: '%',
    valueText: p => percent(p.value),
    staleDays: 100,
    display: p => `${percent(p.value)} 的可用行业站上各自的 200 日均线。`,
    rule: 'Ken French 49 个市值加权行业（CRSP，按当时的行业成分，没有幸存者偏差）日收益自 1926 年 7 月起累积成指数，统计站上各自 200 日均线的行业占比，是成分股 200 日线比例的长历史对照。French 数据约滞后 1–2 个月更新。事后新增，只展示。',
  },
  industryMomentum: {
    dimension: 'trading', group: '宽度·行业（长历史）', core: false,
    label: '行业 12 个月正收益占比', frequency: 'monthly', direction: 'hot', unit: '%',
    valueText: p => percent(p.value),
    staleDays: 100,
    display: p => `${percent(p.value)} 的可用行业近 12 个月累计收益为正。`,
    rule: '同一份 Ken French 49 行业数据的另一种宽度口径，自 1927 年起。事后新增，不进入事先固定的计分与回测，只展示。',
  },
  industryHighs: {
    dimension: 'trading', group: '宽度·行业（长历史）', core: false,
    label: '行业处于 12 个月新高占比', frequency: 'monthly', direction: 'hot', unit: '%',
    valueText: p => percent(p.value),
    staleDays: 100,
    display: p => `${percent(p.value)} 的可用行业月末点位处于近 12 个月新高。`,
    rule: '同一份 Ken French 49 行业数据，自 1927 年起。事后新增，不进入事先固定的计分与回测，只展示。',
  },
  industryNetHighs: {
    dimension: 'trading', group: '宽度·行业（长历史）', core: false,
    label: '行业 52 周新高减新低（49 行业）', frequency: 'daily', direction: 'hot', unit: '%',
    valueText: p => signed(p.value, percent),
    staleDays: 100,
    display: p => `处于 252 个交易日新高的行业减去处于新低的，占可比行业的 ${signed(p.value, percent)}。`,
    rule: 'Ken French 49 个市值加权行业（CRSP，按当时的行业成分，没有幸存者偏差）日收益自 1926 年 7 月起累积成指数，按收盘指数计 252 个交易日新高与新低，是成分股新高减新低的长历史对照。French 数据约滞后 1–2 个月更新。事后新增，只展示。',
  },
  industryAdvDec: {
    dimension: 'trading', group: '宽度·行业（长历史）', core: false,
    label: '行业 10 日涨跌比（49 行业）', frequency: 'daily', direction: 'hot', unit: '倍',
    valueText: p => times(p.value),
    staleDays: 100,
    display: p => `近 10 个交易日上涨行业次数是下跌行业次数的 ${times(p.value)}。`,
    rule: 'Ken French 49 个市值加权行业（CRSP，按当时的行业成分，没有幸存者偏差）日收益自 1926 年 7 月起累积成指数，按日统计上涨与下跌的行业数，取近 10 个交易日合计之比，是成分股涨跌比的长历史对照。French 数据约滞后 1–2 个月更新。事后新增，只展示。',
  },
  breadth200: {
    dimension: 'trading', group: '宽度·成分股', core: true,
    label: '成分股站上 200 日线比例', frequency: 'daily', direction: 'hot', unit: '%',
    valueText: p => percent(p.value),
    display: p => `${percent(p.value)} 的可用标普成分股站上自己的 200 日均线。`,
    rule: '站内历史约一年，按当前成分名单回算的部分存在幸存者偏差，只展示。长历史见下一项「行业站上 200 日线比例」。',
  },
  above50: {
    dimension: 'trading', group: '宽度·成分股', core: false,
    label: '成分股站上 50 日线比例', frequency: 'daily', direction: 'hot', unit: '%',
    valueText: p => percent(p.value),
    display: p => `${percent(p.value)} 的可用标普成分股站上自己的 50 日均线。`,
    rule: '站内只保存最新读数，没有历史，只展示。',
  },
  sectorBreadth: {
    dimension: 'trading', group: '宽度·成分股', core: false,
    label: '板块宽度（过半站上 200 日线的板块数）', frequency: 'daily', direction: 'hot', unit: '个',
    valueText: p => `${p.value} 个`,
    display: p => `11 个 GICS 板块中，有 ${p.value} 个板块过半成分股站上 200 日均线。`,
    rule: '按当前成分名单回算，历史约一年且存在幸存者偏差，只展示。',
  },
  netHighs: {
    dimension: 'trading', group: '宽度·成分股', core: false,
    label: '成分股 52 周新高减新低', frequency: 'daily', direction: 'hot', unit: '%',
    valueText: p => signed(p.value, percent),
    display: p => `创 52 周新高的标普成分股减去创新低的，占可用成分股的 ${signed(p.value, percent)}。`,
    rule: '按当前成分名单回算，历史约一年且存在幸存者偏差，只展示。长历史见下一项「行业 52 周新高减新低」。',
  },
  advDec: {
    dimension: 'trading', group: '宽度·成分股', core: false,
    label: '10 日涨跌比', frequency: 'daily', direction: 'hot', unit: '倍',
    valueText: p => times(p.value),
    display: p => `近 10 个交易日标普成分股上涨 ${p.up} 家次、下跌 ${p.down} 家次，涨跌比 ${times(p.value)}。`,
    rule: '按当前成分名单统计，历史约一年，只展示。',
  },
  equalWeight: {
    dimension: 'trading', group: '宽度·成分股', core: false,
    label: '等权相对市值加权（12 个月）', frequency: 'monthly', direction: 'none', unit: '%',
    valueText: p => signed(p.value, percent),
    display: p => `标普 500 等权指数近 12 个月相对市值加权标普 500 ${p.value >= 0 ? '跑赢' : '跑输'} ${percent(Math.abs(p.value))}。`,
    rule: '两者均为价格指数，自 2007 年起，不足 25 年，只展示。为正说明涨幅更分散，为负说明集中在大市值股票。',
  },
  volume: {
    dimension: 'trading', group: '成交', core: true,
    label: '量价（3 月 / 12 月均量）', frequency: 'monthly', direction: 'none', unit: '倍',
    valueText: p => times(p.value),
    display: p => `近 3 个月日均量是近 12 个月的 ${times(p.value)}，标普月均价${p.below ? '低于' : '不低于'} 10 个月均线。`,
    rule: '量比达到 1.10 倍时，标普月均价低于 10 个月均线扣 1 分，不低于均线加 1 分，其余 0 分。',
    score: p => scoreMarket('volume', 'a', { volume: p }),
    thresholds: [{ value: 1.10, label: '量比 1.10', kind: 'reference' }],
  },
  volumeRatio: {
    dimension: 'trading', group: '成交', core: false,
    label: '美股 20 日量比', frequency: 'daily', direction: 'none', unit: '倍',
    valueText: p => times(p.value),
    display: p => `全美股票当日成交量为前 20 个完整交易日均量的 ${times(p.value)}。`,
    rule: '2010 年 8 月起为 Cboe 全美股票成交（核心交易场所齐全后，涵盖全美交易所及场外申报成交）；此前回补为 Yahoo 标普 500 指数日成交量（1950 年起），量比不受成交量口径影响，但早年按周六、12 月 24 日、7 月 3 日和感恩节次日近似剔除半日市，并剔除与前后各 2 日中位数之比超过 4 倍或低于 0.3 倍的孤立错值。事后回补，只展示。',
  },
  epsYoy: {
    dimension: 'earnings', group: '盈利', core: true,
    label: '标普过去 12 个月每股盈利同比', frequency: 'quarterly', direction: 'hot', unit: '%',
    valueText: p => signed(p.value, percent),
    display: p => `过去 12 个月每股盈利较去年同期变化 ${signed(p.value, percent)}。`,
    rule: '同比降幅达到 10% 扣 1 分，升幅达到 10% 加 1 分，其余 0 分。回测与历史序列只用季末盈利（季末后第 3 个月末可得）。',
    score: p => band(p.value, -10, 10),
    staleDays: 200,
    thresholds: [
      { value: -10, label: '扣分线 −10%', kind: 'minus' },
      { value: 10, label: '加分线 +10%', kind: 'plus' },
    ],
  },
  forwardEps: {
    dimension: 'earnings', group: '盈利', core: true,
    label: '前瞻每股盈利修正', frequency: 'weekly', direction: 'hot', unit: '%',
    valueText: p => signed(p.value, percent),
    display: p => `未来 12 个月预期每股盈利（标普收盘 ÷ FactSet 前瞻市盈率推算）较 ${formatDate(p.priorOn, 'daily')}变化 ${signed(p.value, percent)}。`,
    rule: factset.replace('只展示。', '只展示。按约 3 个月前的同口径读数计算；前瞻市盈率只有一位小数，变化值误差约 ±0.5 个百分点。'),
  },
  profitGdp: {
    dimension: 'earnings', group: '盈利', core: false,
    label: '企业利润 ÷ GDP', frequency: 'quarterly', direction: 'hot', unit: '%',
    valueText: p => percent(p.value),
    display: p => `企业利润占 GDP 的 ${percent(p.value)}。`,
    rule: `税后企业利润（国民收入账户）÷ 名义 GDP，1947 年起，按季更新，季末后约三个月可得。比值越高，利润率越处于高位。${displayOnly}`,
  },
}

/** 输出顺序 = design 1.7 表顺序。 */
export const INDICATOR_ORDER = Object.keys(DEFINITIONS)

export function rankAt(series, date, { sample = null } = {}) {
  const point = valueAt(series, date)
  if (!point) return null
  const known = series.filter(row => row.availableOn <= date)
  const sampleRows = sample ? sample.filter(row => row.availableOn <= date) : known
  return {
    point, known,
    percentile: sampleRows.length < 2 ? null : percentile(point.value, sampleRows.map(row => row.value)),
  }
}

/** 日频 / 周频：按周取每周最后一个观测，并始终加上最新观测。 */
export function weeklyLastSample(rows) {
  if (!rows.length) return []
  const last = new Map()
  for (const row of rows) {
    const date = new Date(row.observedOn + 'T00:00:00Z')
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7))
    last.set(date.toISOString().slice(0, 10), row)
  }
  const sampled = [...last.values()].sort((a, b) => a.observedOn.localeCompare(b.observedOn))
  const latest = rows.at(-1)
  if (latest && sampled.at(-1)?.observedOn !== latest.observedOn) sampled.push(latest)
  return sampled
}

/** 金银比等：只用月度行（无 change 字段的）作百分位样本。 */
export function monthlySample(rows) {
  return rows.filter(row => row.change === undefined)
}

export function percentileSample(rows, def) {
  if (def.percentileMode === 'monthly') return monthlySample(rows)
  if (def.frequency === 'daily' || def.frequency === 'weekly') return weeklyLastSample(rows)
  return rows
}

export function percentileBasisLabel(def) {
  if (def.percentileMode === 'monthly') return '月度样本'
  if (def.frequency === 'daily' || def.frequency === 'weekly') return '每周最后一个观测'
  if (def.frequency === 'quarterly') return '季度样本'
  if (def.frequency === 'monthly') return '月度样本'
  return null
}

export function scoreIndicator(id, point, rank) {
  return Number.isFinite(point?.value) ? DEFINITIONS[id].score?.(point, rank) ?? null : null
}

function heatFromRank(heatRank) {
  if (heatRank == null) return 'na'
  if (heatRank >= 80) return 'hot'
  if (heatRank >= 60) return 'warm'
  if (heatRank <= 20) return 'cold'
  if (heatRank <= 40) return 'cool'
  return 'neutral'
}

function statusOf(def, known, point, date) {
  if (def.discontinued) return 'discontinued'
  if (known.length < 3) return 'sparse'
  if (!point) return 'sparse'
  const limit = def.staleDays ?? STALE_BY_FREQ[def.frequency] ?? 45
  return ageDays(date, point.observedOn) > limit ? 'stale' : 'fresh'
}

function changeWindows(frequency) {
  if (frequency === 'daily' || frequency === 'weekly') {
    return [['较 1 个月前', 30], ['较 3 个月前', 91]]
  }
  if (frequency === 'monthly') return [['较 3 个月前', 91], ['较 1 年前', 365]]
  if (frequency === 'quarterly') return [['较上一季', 91], ['较 1 年前', 365]]
  return []
}

function changeText(delta, unit) {
  if (unit === '%' || unit === '个百分点') {
    return signed(delta, n => formatReading(n, '百分点', 2))
  }
  if (unit === '个基点') return signed(delta, bp)
  if (unit === '倍') return signed(delta, times)
  if (unit === '点') return signed(delta, pts)
  if (unit === '个') return signed(Math.round(delta), n => `${String(n).replace('-', '−')} 个`)
  if (unit === '亿美元') return signed(delta, n => formatReading(n, '', 1)) + ' 亿美元'
  // unit === ''：纯数值，不带「点」等后缀
  return signed(delta, n => formatReading(n, '', 2))
}

function towardOf(delta, direction) {
  if (delta === 0 || direction === 'none') return 'flat'
  if (direction === 'hot') return delta > 0 ? 'hot' : 'cold'
  return delta > 0 ? 'cold' : 'hot'
}

export function buildChanges(known, point, frequency, direction, unit) {
  if (!point || frequency === 'irregular') return []
  const out = []
  for (const [label, days] of changeWindows(frequency)) {
    const targetMs = Date.parse(point.observedOn + 'T00:00:00Z') - days * 86_400_000
    const target = new Date(targetMs).toISOString().slice(0, 10)
    const prior = known.findLast(row => row.observedOn <= target)
    if (!prior) continue
    if (ageDays(target, prior.observedOn) > days / 2) continue
    const delta = clean(point.value - prior.value)
    out.push({
      label, since: prior.observedOn, delta,
      text: changeText(delta, unit),
      toward: towardOf(delta, direction),
    })
    if (out.length === 2) break
  }
  return out
}

function quantile(values, q) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

export function buildThresholds(def, sampleRows) {
  if (def.thresholds) return def.thresholds.map(row => ({ ...row }))
  if (def.percentileThresholds && sampleRows?.length >= 2) {
    const values = sampleRows.map(row => row.value)
    const p20 = quantile(values, 0.2)
    const p80 = quantile(values, 0.8)
    const expensive = def.score?.({}, 80) === -1 || def.score?.({}, 20) === 1
    // pe / equityShare: high → minus; erp / cashShare: high → plus
    const highIsMinus = expensive
    return [
      {
        value: clean(p20),
        label: '当前第 20 百分位',
        kind: highIsMinus ? 'plus' : 'minus',
      },
      {
        value: clean(p80),
        label: '当前第 80 百分位',
        kind: highIsMinus ? 'minus' : 'plus',
      },
    ].filter(row => Number.isFinite(row.value))
  }
  return []
}

/**
 * 全部历史：月度及更稀原样保留；日频、周频跨度 ≤ 30 年按周取最后一个观测，更长按月取；始终保留最新。
 */
export function chartHistory(known, def) {
  return chartRows(known, def).map(row => [row.observedOn, row.value])
}

export function chartRows(known, _def = {}) {
  const rows = known
  if (rows.length < 2) return rows
  const years = ageDays(rows.at(-1).observedOn, rows[0].observedOn) / 365.2425
  if (years <= 3 || rows.length / years <= 13) return rows
  const bucket = years > 30 ? d => d.slice(0, 7) : d => {
    const date = new Date(d + 'T00:00:00Z')
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7))
    return date.toISOString().slice(0, 10)
  }
  const last = new Map()
  for (const row of rows) last.set(bucket(row.observedOn), row)
  return [...last.values()]
}

export function buildIndicators(series, sources, date) {
  return INDICATOR_ORDER.map(id => {
    const def = DEFINITIONS[id]
    const rows = series[id] ?? []
    const sampleAll = percentileSample(rows, def)
    const reading = rankAt(rows, date, { sample: sampleAll })
    const { point, known, percentile: rawRank } = reading ?? { known: [], percentile: null }
    const first = known[0]?.observedOn ?? null
    const years = first && point ? ageDays(point.observedOn, first) / 365.2425 : 0
    const rank = years >= 3 ? rawRank : null
    const direction = def.direction ?? 'hot'
    const frequency = def.frequency ?? 'daily'
    const status = statusOf(def, known, point, date)
    const age = point ? ageDays(date, point.observedOn) : null
    const heatRank = rank == null || direction === 'none' ? null
      : direction === 'cold' ? clean(100 - rank) : rank
    const heat = status !== 'fresh' || heatRank == null ? 'na' : heatFromRank(heatRank)
    const sampleKnown = sampleAll.filter(row => row.availableOn <= date)
    const notes = [
      rawRank != null && rank == null ? '历史不足 3 年，不给百分位' : '',
      rank != null && years < 25 ? `百分位只基于约 ${Math.round(years)} 年历史` : '',
      status === 'stale' ? '读数较旧' : '',
    ].filter(Boolean)
    const sparse = status === 'sparse'
    return {
      id,
      dimension: def.dimension,
      group: def.group,
      core: Boolean(def.core),
      label: def.label,
      display: point ? `${def.display(point).replace(/。$/, '')}（${formatDate(point.observedOn, frequency)}）。` : '读数暂缺。',
      value: point && Number.isFinite(point.value) ? point.value : null,
      valueText: point && Number.isFinite(point.value) ? def.valueText(point) : '—',
      unit: def.unit ?? '',
      observedOn: point?.observedOn ?? null,
      frequency,
      status,
      ageDays: age,
      direction,
      percentile: sparse ? null : rank,
      percentileSince: rawRank == null || sparse ? null : first,
      percentileBasis: rank == null || sparse ? null : percentileBasisLabel(def),
      heatRank: sparse ? null : heatRank,
      heat,
      score: scoreIndicator(id, point, rawRank),
      rule: def.rule,
      historyYears: first && point ? clean(ageDays(point.observedOn, first) / 365.2425) : null,
      inScore: Boolean(def.score),
      source: sources[id] ?? '站内市场快照',
      changes: sparse ? [] : buildChanges(known, point, frequency, direction, def.unit ?? ''),
      thresholds: sparse ? [] : buildThresholds(def, sampleKnown),
      history: sparse ? (point ? [[point.observedOn, point.value]] : []) : chartHistory(known, def),
      ...(def.overlays && !sparse && {
        overlays: def.overlays.map(({ id: overlayId, key, label, unit }) => ({
          id: overlayId, label, unit,
          history: chartRows(known, def).flatMap(row => Number.isFinite(row[key]) ? [[row.observedOn, row[key]]] : []),
        })),
      }),
      ...(notes.length ? { note: notes.join('；') } : {}),
    }
  })
}

/** 与 scoreAt 同一套计分：维度分 + 综合分。 */
export function scoresAt(series, date) {
  return aggregateScores(scoredIndicatorsAt(series, date))
}

export function dimensionScoresAt(series, date) {
  return scoresAt(series, date).dimensions
}

export function scoreAt(series, date) {
  return scoresAt(series, date).score
}

function scoredIndicatorsAt(series, date) {
  return Object.entries(DEFINITIONS).flatMap(([id, def]) => {
    if (!def.score) return []
    const rows = series[id] ?? []
    const sample = percentileSample(rows, def)
    const reading = ['erp', 'pe', 'equityShare', 'cashShare'].includes(id)
      ? rankAt(rows, date, { sample })
      : null
    const point = reading?.point ?? valueAt(rows, date)
    return [{
      id, label: def.label, dimension: def.dimension, inScore: true,
      score: scoreIndicator(id, point, reading?.percentile ?? null),
    }]
  })
}

export function aggregateScores(indicators) {
  const dimensions = DIMENSIONS.map(([id, title]) => {
    const scored = indicators.filter(row => row.dimension === id && row.inScore && Number.isFinite(row.score))
    const score = average(scored.map(row => row.score))
    const summary = score == null ? '暂无可计分读数。' :
      `${scored.length} 项计分，${scored.filter(row => row.score > 0).length} 项加分、${scored.filter(row => row.score < 0).length} 项扣分。`
    const drivers = indicators
      .filter(row => row.dimension === id && row.inScore)
      .map(row => ({ id: row.id, label: row.label, score: row.score ?? null }))
    return { id, title, score, summary, drivers }
  })
  const mean = average(dimensions.flatMap(row => row.score == null ? [] : [row.score]))
  const score = mean == null ? null : clean(mean)
  return { dimensions, score, tier: baseTier(score) }
}

function nearHeatBoundary(score) {
  return score != null && (Math.abs(score + 0.5) < 0.05 || Math.abs(score - 0.5) < 0.05)
}

/** 分数固定两位小数，与页面上的维度分写法一致 */
const score2 = n => n.toFixed(2).replace('-', '−')

function householdMergeCaveat(indicators, heatScore, heat) {
  const equity = indicators.find(row => row.id === 'equityShare')
  const cash = indicators.find(row => row.id === 'cashShare')
  if (!Number.isFinite(equity?.score) || !Number.isFinite(cash?.score)) return null
  const crowding = indicators.filter(row =>
    row.dimension === 'crowding' && row.inScore && Number.isFinite(row.score))
  const others = crowding.filter(row => row.id !== 'equityShare' && row.id !== 'cashShare')
  const mergedCrowding = average([average([equity.score, cash.score]), ...others.map(row => row.score)])
  const valuation = indicators.filter(row =>
    row.dimension === 'valuation' && row.inScore && Number.isFinite(row.score))
  const valuationScore = average(valuation.map(row => row.score))
  const mergedHeatScore = heatScoreFromScores(valuationScore, mergedCrowding)
  const mergedHeat = classifyHeat(mergedHeatScore)
  const todayOnBoundary = nearHeatBoundary(heatScore)
  const mergedOnBoundary = nearHeatBoundary(mergedHeatScore)
  if (mergedHeat === heat && !todayOnBoundary && !mergedOnBoundary) return null
  let boundary = ''
  if (mergedOnBoundary) {
    boundary = Math.abs(mergedHeatScore + 0.5) < 0.05 ? '，恰在偏热的边界上' : '，恰在偏冷的边界上'
  }
  return `两项家庭配置（股票占比、现金占比）历史上几乎同步（见回测披露）。` +
    `若把它们合并算一票，拥挤度分为 ${score2(mergedCrowding)}，` +
    `热度分为 ${score2(mergedHeatScore)}${boundary}。`
}

export function buildCurrent(indicators) {
  const current = aggregateScores(indicators)
  const byId = Object.fromEntries(current.dimensions.map(row => [row.id, row.score]))
  const heatScore = heatScoreFromScores(byId.valuation, byId.crowding)
  const heat = classifyHeat(heatScore)
  const headline = heat != null
    ? `股市${HEAT_LABEL[heat]}：估值与持股拥挤度两个维度平均 ${formatReading(heatScore, '', 2)}。`
    : '估值与持股拥挤度读数暂缺，冷热待定。'
  const counts = {
    total: indicators.length,
    scored: indicators.filter(row => row.inScore).length,
    core: indicators.filter(row => row.core).length,
    heat: { hot: 0, warm: 0, neutral: 0, cool: 0, cold: 0, na: 0 },
    status: { fresh: 0, stale: 0, discontinued: 0, sparse: 0 },
  }
  for (const row of indicators) {
    counts.heat[row.heat] = (counts.heat[row.heat] ?? 0) + 1
    counts.status[row.status] = (counts.status[row.status] ?? 0) + 1
  }
  const caveats = []
  const household = householdMergeCaveat(indicators, heatScore, heat)
  if (household) caveats.push(household)
  for (const row of indicators.filter(item => item.inScore && item.status === 'stale')) {
    caveats.push(`计分指标「${row.label}」读数滞后 ${row.ageDays} 天，仍按冻结规则计分。`)
  }
  return { ...current, heatScore, heat, headline, counts, caveats }
}

export { DEFINITIONS }
