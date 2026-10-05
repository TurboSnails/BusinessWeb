// 风险信号与阶段：2026 投资计划与宏观温度共用同一套规则，避免两处判断不一致。
// 阈值是经验默认值，不是预测；用来检查“风险预算是否还撑得住”。

export type Tone = 'green' | 'yellow' | 'red' | 'blue' | 'gray'

const num = (s: string | number) => (typeof s === 'number' ? s : s.trim() === '' ? NaN : parseFloat(s))

export interface Signal {
  id: string
  name: string
  unit: string
  hint: string
  yellow: number
  red: number
  source: string
}

export const SIGNALS: Signal[] = [
  { id: 'sahm', name: '萨姆规则读数', unit: 'pp', hint: '失业率3个月均值较过去12个月低点的上升幅度', yellow: 0.3, red: 0.5, source: 'FRED: SAHMREALTIME' },
  { id: 'claims', name: '初请失业金（4周均值）', unit: '万人/周', hint: '裁员的最早信号', yellow: 25, red: 30, source: 'FRED: IC4WSA' },
  // HY 利差长期大致在 300–600bp 之间波动：320bp 附近反而说明市场乐观，突破 400 才开始定价信用风险，600 以上历史上多对应衰退或信用事件
  { id: 'hy', name: '高收益债利差 HY OAS', unit: 'bp', hint: '信用市场对违约的定价', yellow: 400, red: 600, source: 'FRED: BAMLH0A0HYM2' },
  { id: 'vix', name: 'VIX', unit: '', hint: '>20 紧张，>30 恐慌', yellow: 20, red: 30, source: 'CBOE' },
  { id: 'kre', name: '区域银行 KRE 连续跑输标普', unit: '周', hint: '银行体系压力的先行信号', yellow: 2, red: 4, source: 'Yahoo Finance' },
  { id: 'dd', name: '标普500 距高点回撤', unit: '%', hint: '填正数，如 12 表示回撤12%', yellow: 10, red: 20, source: '行情软件' }
]

export const signalTone = (s: Signal, v: number): Tone => (!Number.isFinite(v) ? 'gray' : v >= s.red ? 'red' : v >= s.yellow ? 'yellow' : 'green')

export interface Stage {
  level: 0 | 1 | 2 | 3
  name: string
  tone: Tone
  summary: string
  does: string[]
  doesNot: string[]
}

export const STAGES: Stage[] = [
  {
    level: 0,
    name: '常态',
    tone: 'green',
    summary: '信号大多正常，按平时的规则运行。',
    does: ['按目标权重运行，到检查日才看偏离', '主动额度按研究进度使用，找不到合格机会就留空', '每月更新一次本页信号'],
    doesNot: ['不因为信号全绿而加杠杆或把备用金投进去']
  },
  {
    level: 1,
    name: '预警',
    tone: 'yellow',
    summary: '有几项信号走坏，但不构成趋势。目标是检查预算，不是改方向。',
    does: ['暂停新增主动持仓', '复核主动部分的压力损失，是否仍在预算内', '核对备用金能撑几个月，必要时先补备用金'],
    doesNot: ['不改配置目标权重', '不因为担心而清仓']
  },
  {
    level: 2,
    name: '防御',
    tone: 'red',
    summary: '多项信号同时恶化。重点是保住现金流和不被迫卖出。',
    does: ['主动额度停止加仓，超限持仓按各自的卖出条件处理', '确认备用金覆盖压力期限（第7章）', '再平衡仍只在检查日、按阈值做'],
    doesNot: ['不做空、不用杠杆ETF对冲', '不动用备用金和已知近期支出']
  },
  {
    level: 3,
    name: '危机',
    tone: 'red',
    summary: '风险资产已经大幅下跌、信用收紧。此时最大的敌人是情绪和流动性。',
    does: ['备用金不动', '只在配置底仓内，按“回撤梯度”预先写好的规则分批补权益', '每批间隔1到2周，批次之间重新检查备用金'],
    doesNot: ['不抄主动额度之外的“反弹”', '不因为跌得多就一次性满仓']
  }
]

export function computeStage(values: Record<string, string | number>): { stage: Stage; score: number; entered: number } {
  let score = 0
  let entered = 0
  for (const s of SIGNALS) {
    const v = num(values[s.id] ?? '')
    if (!Number.isFinite(v)) continue
    entered++
    const t = signalTone(s, v)
    score += t === 'red' ? 2 : t === 'yellow' ? 1 : 0
  }
  const level = score >= 8 ? 3 : score >= 5 ? 2 : score >= 2 ? 1 : 0
  return { stage: STAGES[level], score, entered }
}
