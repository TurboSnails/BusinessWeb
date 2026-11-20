import type { Guide } from '../us-market/explain'

const pe = (subject: string): Guide => ({
  what: `${subject}的股价 ÷ 过去 12 个月盈利（滚动市盈率），和它自己近 10 年的历史比较。`,
  high: 'defense',
  highText: '比过去 10 年大部分时间都贵，继续上涨需要盈利跟上，追高要谨慎。',
  lowText: '比过去 10 年大部分时间都便宜，长期买入的性价比较好。',
})
const contrarianHeat = (what: string, bands: Guide['bands'], highText: string, lowText: string): Guide => ({ what, high: 'defense', contrarian: true, bands, preferBands: true, highText, lowText })
const nominal = (what: string): Guide => ({
  what: `${what}这是名义金额，会随市场规模长期增长，单看高低意义不大，主要看变化方向。`, high: 'neutral',
  highText: '规模处于历史高位。', lowText: '规模较小。',
})

export const CN_GUIDES: Record<string, Guide> = {
  csi300Pe: pe('沪深300'),
  csiAllPe: pe('中证全指（几乎全部 A 股）'),
  slicePe: pe('该指数'),
  cnErp: {
    what: '股债利差：沪深300 的盈利收益率（1 ÷ 市盈率）减去 10 年期国债收益率，比较买股票和买国债哪个更划算。2005 年以来逐日数据。', high: 'offense',
    highText: '股票相对国债非常便宜，历史上这种位置之后一两年的回报往往不错。', lowText: '股票相对国债偏贵，买国债的性价比更高。',
  },
  cnBuffett: {
    what: '巴菲特指标：A 股总市值 ÷ GDP，看整个股市相对经济规模是否过大。', high: 'defense',
    highText: '股市总市值相对经济规模偏高。', lowText: '股市总市值相对经济规模偏低。',
  },
  cnPbAll: {
    what: '沪深两市整体市净率（股价 ÷ 每股净资产），不受短期盈利波动影响，适合看底部。', high: 'defense',
    highText: '按净资产看偏贵。', lowText: '按净资产看便宜，接近历史底部区域。',
  },
  cnLimitUp: contrarianHeat('当天涨停的股票家数（不含 ST），反映短线资金的活跃程度。', [15, 30, 60, 90],
    '涨停家数很多，短线情绪火热，过热后往往需要降温。', '涨停家数很少，短线情绪冰冷，逆向看常是情绪底部附近。'),
  cnLimitDown: {
    what: '当天跌停的股票家数，反映恐慌抛售的程度。', high: 'offense', contrarian: true, bands: [5, 10, 30, 60], preferBands: true,
    highText: '跌停家数多，恐慌情绪重；短期风险高，但恐慌集中释放后常出现反弹。', lowText: '几乎没有跌停，市场没有恐慌。',
  },
  cnSealRate: contrarianHeat('封板率：涨停后能封住到收盘的比例 = 涨停 ÷（涨停 + 盘中涨停后打开的“炸板”）。', [50, 60, 75, 85],
    '涨停大多能封住，追涨资金很坚决，情绪偏热。', '涨停频繁被打开，追涨资金信心不足，情绪偏弱。'),
  cnBrokenBoards: { what: '当天盘中触及涨停但收盘没封住的股票家数。', high: 'neutral', highText: '炸板多，追涨资金分歧大。', lowText: '炸板少。' },
  cnMaxBoard: contrarianHeat('市场最高连续涨停天数（连板高度），反映短线投机的热度。', [2, 3, 5, 7],
    '连板高度高，投机情绪浓，要防情绪退潮。', '连板高度很低，短线资金很谨慎。'),
  cnAdvanceShare: contrarianHeat('当天上涨股票占全部 A 股的比例，衡量普涨还是普跌。', [20, 35, 65, 80],
    '绝大多数股票都在涨，短期情绪过热。', '绝大多数股票都在跌，短期超卖，逆向看可能接近反弹。'),
  cnOptionPcr: {
    what: '股指期权（沪深300、中证1000、上证50）看跌成交量 ÷ 看涨成交量，越高说明越多人买“下跌保险”。', high: 'offense', contrarian: true,
    bands: [0.7, 0.85, 1.0, 1.2], preferBands: true,
    highText: '避险需求强，大家在买保险；逆向看，过度悲观时常接近短期底部。', lowText: '很少人买保险，情绪偏乐观，需要防范回调。',
  },
  cnTurnover: {
    what: '两市换手率：当天成交额 ÷ 两市流通市值，比成交额更能跨年份比较交易热度。', high: 'defense', contrarian: true,
    highText: '交易非常活跃，资金在频繁进出，情绪偏热。', lowText: '交易清淡，市场被冷落，逆向看常是底部区域。',
  },
  cnAmount: nominal('沪深两市当天的总成交金额。'),
  cnVolumeRatio: {
    what: '当天两市成交额 ÷ 过去 20 个交易日的平均值，大于 1 表示比平时活跃。', high: 'neutral', bands: [0.8, 0.95, 1.1, 1.3], preferBands: true,
    highText: '成交明显放大：上涨时放量说明买盘积极，下跌时放量说明抛压重。', lowText: '成交萎缩，大家都在观望。',
  },
  cnAbove60: {
    what: '股价高于自身 60 日均线的股票占比，衡量有多少股票处在中期上升趋势。', high: 'offense', bands: [20, 35, 60, 75], preferBands: true,
    highText: '多数股票处在上升趋势，行情健康、参与面广。', lowText: '多数股票跌破中期均线，市场整体走弱。',
  },
  cnHighLow: {
    what: '创 20 日新高的股票占比减去创 20 日新低的股票占比。正数说明走强的股票更多。', high: 'offense', bands: [-20, -5, 5, 20], preferBands: true,
    highText: '创新高的股票明显多于新低，市场内部强势。', lowText: '创新低的股票明显多于新高，市场内部在走弱。',
  },
  cnM1M2: {
    comparableSince: '2025-01-01',
    what: 'M1 同比减 M2 同比，反映狭义与广义货币的增速差。2025 年 1 月启用新 M1 口径。', high: 'offense',
    bands: [-6, -3, 0, 2], preferBands: true,
    highText: '狭义货币增速相对较高。', lowText: '狭义货币增速相对较低。',
  },
  cnEtfFlow: {
    what: '近 20 个交易日宽基 ETF（如沪深300、中证500 ETF）的净申购金额，包括中央汇金等“国家队”的买入。', high: 'offense', bands: [-300, -50, 50, 300], preferBands: true,
    highText: '资金在大举买入宽基 ETF。注意：若主要来自国家队托底，说明有政策支撑，但不代表市场自发转强。', lowText: '宽基 ETF 被净赎回，有资金在离场或止盈。',
  },
  cnNewFunds: {
    what: '每月新成立的偏股型基金份额，代表新进入股市的公募资金。', high: 'offense',
    highText: '新基金发行火热，有增量资金入场；但“爆款基金扎堆”历史上常出现在阶段高点附近。', lowText: '新基金很难发，增量资金少，常见于熊市后期。',
  },
  cnAccounts: {
    what: '上交所每月新增投资者数量，反映散户入市的热情。', high: 'offense',
    highText: '新开户多，散户在入场；开户数暴增时往往情绪已经很热。', lowText: '新开户少，散户热情低，常见于市场冷清期。',
  },
  cnMarginRatio: {
    what: '融资余额 ÷ 两市流通市值，衡量借钱炒股的杠杆水平。2015 年牛市顶部约 4.5%。', high: 'defense', bands: [1.6, 1.9, 2.4, 2.8], preferBands: true,
    highText: '杠杆资金占比偏高，下跌时容易出现强制平仓的连锁反应。', lowText: '杠杆水平低，市场泡沫较少。',
  },
  cnMarginYoy: {
    what: '融资余额比去年同期增长了多少，增长过快说明大家在加杠杆追涨。', high: 'defense', bands: [-10, 0, 15, 30], preferBands: true,
    highText: '杠杆增长很快，市场偏热。', lowText: '杠杆在下降，市场情绪偏冷、泡沫较少。',
  },
  cnMarginBuyShare: {
    what: '当天融资买入额占两市成交额的比例，反映借钱买股的活跃程度。常态约 6%–12%。', high: 'defense', bands: [6, 7.5, 10.5, 12.5], preferBands: true,
    highText: '融资买入很活跃，杠杆资金在追涨。', lowText: '融资买入冷清，杠杆资金很谨慎。',
  },
  cnMarginBalance: nominal('沪深两市融资融券余额。'),
  cnIfBasis: {
    what: '沪深300 股指期货主力合约比现货指数高或低多少（年化）。负数叫“贴水”，说明机构在用期货对冲下跌风险。', high: 'defense', contrarian: true,
    bands: [-6, -3, 0, 2],
    highText: '期货升水，机构偏乐观。', lowText: '深度贴水，对冲需求强、机构很悲观；逆向看常接近阶段底部。',
  },
  cnImBasis: {
    what: '中证1000 股指期货主力合约比现货高或低多少（年化）。小盘股期货长期贴水是常态（对冲和雪球产品），要看是否异常深。', high: 'defense', contrarian: true,
    bands: [-20, -12, -5, 0],
    highText: '贴水很浅甚至升水，小盘股情绪乐观。', lowText: '贴水异常深，小盘股对冲需求强、情绪悲观。',
  },
  cnTenYear: {
    what: '中国 10 年期国债收益率，代表无风险利率。利率越低，存款和理财收益越低，股票的相对吸引力越高。', high: 'defense',
    highText: '利率偏高，对股票估值形成压力。', lowText: '利率很低，资金成本低，股票相对更有吸引力（但也反映经济偏弱）。',
  },
  cnShibor3m: {
    what: '3 个月上海银行间同业拆放利率，反映银行体系的资金松紧。', high: 'defense',
    highText: '银行间资金偏紧。', lowText: '银行间资金宽松。',
  },
  cnLpr1y: {
    what: '1 年期贷款市场报价利率（LPR），企业和个人贷款利率的基准。', high: 'defense',
    highText: '贷款利率偏高。', lowText: '贷款利率处于低位，融资成本低。',
  },
  cnM1Yoy: {
    comparableSince: '2025-01-01',
    what: '狭义货币同比增速。2025 年 1 月启用新口径，纳入个人活期存款和非银行支付机构客户备付金。', high: 'offense',
    highText: '活钱增长快，经济和企业活跃度在提升。', lowText: '活钱增长慢，企业投资意愿弱。',
  },
  cnM2Yoy: { what: 'M2（广义货币）同比增速，反映整体货币供应。', high: 'offense', highText: '货币供应宽松。', lowText: '货币供应偏紧。' },
  cnPmi: {
    what: '制造业采购经理指数，50 以上表示制造业在扩张，50 以下表示收缩。', high: 'offense', bands: [47, 49, 50.5, 52], preferBands: true,
    highText: '制造业明显扩张，企业盈利有望改善。', lowText: '制造业在收缩，企业盈利承压。',
  },
  cnPpi: {
    what: '工业生产者出厂价格同比，PPI 回升通常意味着工业企业利润改善。', high: 'offense', bands: [-3, -1, 1, 4], preferBands: true,
    highText: '出厂价格上涨，工业企业利润改善。', lowText: '出厂价格下跌（通缩），工业企业利润承压。',
  },
  cnNorthTurnover: nominal('北向资金（通过沪深股通买卖 A 股的境外资金）当天的成交额。2024 年 8 月起官方不再每日公布净买入，只能看成交活跃度。'),
  cnNationalTeam: nominal('中央汇金、证金公司等“国家队”持有 A 股的市值（季度，来自上市公司前十大股东披露）。'),
}

/** Readings from the same source or the same underlying series: one vote per question. */
export const CN_FAMILY: Record<string, string> = {
  csi300Pe: 'csi', csiAllPe: 'csi', slicePe: 'csi', cnErp: 'erp', cnBuffett: 'buffett', cnPbAll: 'pb',
  cnLimitUp: 'pool', cnLimitDown: 'pool', cnSealRate: 'pool', cnBrokenBoards: 'pool', cnMaxBoard: 'pool',
  cnAdvanceShare: 'scan', cnAbove60: 'scan', cnHighLow: 'scan', cnOptionPcr: 'cffex-opt', cnTurnover: 'turnover', cnAmount: 'turnover', cnVolumeRatio: 'turnover',
  cnM1M2: 'money', cnM1Yoy: 'money', cnM2Yoy: 'money', cnEtfFlow: 'etf', cnNewFunds: 'funds', cnAccounts: 'accounts',
  cnMarginRatio: 'margin', cnMarginYoy: 'margin', cnMarginBuyShare: 'margin', cnMarginBalance: 'margin',
  cnIfBasis: 'cffex-fut', cnImBasis: 'cffex-fut', cnTenYear: 'bond', cnShibor3m: 'rates', cnLpr1y: 'rates',
  cnPmi: 'activity', cnPpi: 'prices', cnNorthTurnover: 'north', cnNationalTeam: 'national',
}
