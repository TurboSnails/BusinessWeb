import { SIGNALS, type Tone } from './stages'

export type SeriesKey = 'gdp' | 'unrate' | 'sahm' | 'claims' | 'corePce' | 'realRate' | 'curve' | 'hy' | 'nfci' | 'vix' | 'dd' | 'kre'

export interface Indicator<K extends string = SeriesKey> {
  key: K
  name: string
  module: ModuleId
  /** 'above'：越高越差；'below'：越低越差；undefined：只作背景，不打分 */
  worse?: 'above' | 'below'
  yellow?: number
  red?: number
  digits: number
  why: string
  limit: string
  freq: string
}

export type ModuleId = 'growth' | 'inflation' | 'credit' | 'market' | 'cn-growth' | 'cn-price' | 'cn-money'

export const MODULES: { id: ModuleId; name: string; question: string }[] = [
  { id: 'growth', name: '增长与就业', question: '经济在扩张还是开始失速？' },
  { id: 'inflation', name: '通胀与政策', question: '央行是在踩刹车还是松油门？' },
  { id: 'credit', name: '信用与金融条件', question: '借钱的成本和意愿有没有收紧？' },
  { id: 'market', name: '市场与情绪', question: '市场有没有开始恐慌？' },
]

// 与 2026 投资计划重合的指标直接沿用其阈值，两页结论一致
const signal = (id: string) => SIGNALS.find(s => s.id === id)!

export const INDICATORS: Indicator[] = [
  { key: 'gdp', name: '实际 GDP 增速（环比折年）', module: 'growth', worse: 'below', yellow: 1.5, red: 0, digits: 1, freq: '季度',
    why: '经济总量的直接读数。低于 1.5% 算明显放缓，转负说明产出在收缩。', limit: '滞后约一个季度公布，且常被大幅修正，只能确认、不能预警。' },
  { key: 'unrate', name: '失业率', module: 'growth', digits: 1, freq: '月度',
    why: '就业是消费的底座。绝对水平本身说明不了太多，要看它从低点抬升了多少（见萨姆规则）。', limit: '受劳动参与率变化影响，单月波动大。' },
  { key: 'sahm', name: '萨姆规则读数', module: 'growth', worse: 'above', yellow: signal('sahm').yellow, red: signal('sahm').red, digits: 2, freq: '月度',
    why: '失业率 3 个月均值较过去 12 个月低点的上升幅度。达到 0.5 时，历史上美国通常已处于衰退早期。', limit: '它确认衰退而非预测衰退；劳动力供给突增时可能误报。' },
  { key: 'claims', name: '初请失业金（4 周均值）', module: 'growth', worse: 'above', yellow: signal('claims').yellow, red: signal('claims').red, digits: 1, freq: '每周',
    why: '企业裁员最早出现在这里，比失业率领先。', limit: '节假日与季节调整会造成噪音，所以看 4 周均值。' },
  { key: 'corePce', name: '核心 PCE 通胀（同比）', module: 'inflation', worse: 'above', yellow: 2.5, red: 3.5, digits: 2, freq: '月度',
    why: '美联储盯的通胀口径。通胀越高，降息救市的空间越小。', limit: '滞后一个月公布；同比读数受基数影响。' },
  { key: 'realRate', name: '实际政策利率', module: 'inflation', worse: 'above', yellow: 1.5, red: 2.5, digits: 2, freq: '月度',
    why: '联邦基金利率减核心通胀。数值越高，货币政策越紧，经济承压越大。', limit: '“中性利率”本身不可观测，阈值只是经验范围。' },
  { key: 'curve', name: '10 年 − 2 年美债利差', module: 'credit', worse: 'below', yellow: 0, red: -0.5, digits: 2, freq: '每日',
    why: '倒挂（负值）说明市场预期未来要降息，历史上常出现在衰退前。', limit: '倒挂到衰退的时滞从几个月到两年不等，单独使用不能择时。' },
  { key: 'hy', name: '高收益债利差 HY OAS', module: 'credit', worse: 'above', yellow: signal('hy').yellow, red: signal('hy').red, digits: 0, freq: '每日',
    why: '信用市场对违约的定价，往往比股市更早反映企业融资困难。', limit: '利差处在低位时说明市场乐观，也意味着对坏消息缺乏缓冲。' },
  { key: 'nfci', name: '芝加哥联储金融条件指数', module: 'credit', worse: 'above', yellow: 0, red: 0.5, digits: 2, freq: '每周',
    why: '综合 100 多项利率、信用、杠杆指标。正值表示金融条件比历史平均更紧。', limit: '综合指数会掩盖结构问题（例如某一类贷款单独恶化）。' },
  { key: 'kre', name: '区域银行 KRE 连续跑输标普', module: 'credit', worse: 'above', yellow: signal('kre').yellow, red: signal('kre').red, digits: 0, freq: '每周',
    why: '区域银行是美国信用链条里最脆弱的一环。连续多周跑输大盘，往往是存款流失或坏账担忧的早期迹象（2023 年硅谷银行事件前即如此）。', limit: '受个别银行消息与利率预期影响大，需要和信用利差一起看。' },
  { key: 'vix', name: 'VIX 波动率', module: 'market', worse: 'above', yellow: signal('vix').yellow, red: signal('vix').red, digits: 1, freq: '每日',
    why: '期权市场隐含的未来 30 天波动。超过 20 偏紧张，超过 30 进入恐慌。', limit: '同步指标，只描述当下情绪，不预示方向。' },
  { key: 'dd', name: '标普 500 距高点回撤', module: 'market', worse: 'above', yellow: signal('dd').yellow, red: signal('dd').red, digits: 1, freq: '每日',
    why: '用来对照“回撤梯度”：回撤越深，越需要按事先写好的规则行动，而不是凭感觉。', limit: '价格指数，不含分红；高点取 FRED 可得的约十年窗口。' },
]

export function toneOf(ind: Indicator<string>, v: number | undefined): Tone {
  if (v === undefined || !Number.isFinite(v) || !ind.worse || ind.yellow === undefined || ind.red === undefined) return 'gray'
  if (ind.worse === 'above') return v >= ind.red ? 'red' : v >= ind.yellow ? 'yellow' : 'green'
  return v <= ind.red ? 'red' : v <= ind.yellow ? 'yellow' : 'green'
}

export const thresholdText = (ind: Indicator<string>, unit: string): string => {
  if (!ind.worse || ind.yellow === undefined || ind.red === undefined) return '背景指标，不打分'
  const op = ind.worse === 'above' ? '≥' : '≤'
  return `黄灯 ${op} ${ind.yellow}${unit} · 红灯 ${op} ${ind.red}${unit}`
}

export interface SeriesData {
  fred?: string
  source?: string
  unit: string
  note?: string
  latest: { date: string; value: number }
  history: [string, number][]
}

export interface MacroSnapshot<K extends string = SeriesKey> {
  generatedAt: string
  /** 实时刷新时才有：精确到秒的拉取时间 */
  fetchedAt?: string
  source: string
  series: Record<K, SeriesData>
}

/** 距今多少天：用来提示数据是否过期 */
export const ageInDays = (date: string, today = new Date()): number => Math.floor((today.getTime() - new Date(date).getTime()) / 86_400_000)
